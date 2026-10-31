/**
 * Cloud mode's store (H2.1): a creator's projects live in FrameJam Cloud instead of `~/.framejam`, and this class is
 * the local app's view of them. It implements the same `Store` as `JsonStore`, with the same rules; the project, its
 * versions, comments, rounds and resolve state are kept by the cloud (`convex/cloud.ts`), and everything that isn't a
 * project (picks, app state, the style and playbook libraries) stays on this computer.
 *
 * Files stay local too, as a cache: a version's render is copied into `<data dir>/cloud/<project>/` when the version
 * is made (so earlier versions survive the agent overwriting the mp4, exactly like the local store), then uploaded to
 * R2 in the background while the version shows an upload state. Another computer, or a cleared cache, downloads the
 * file from the cloud the first time it's asked for.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Transcript } from "../core/transcript.ts";
import type { FeedbackBatch, PickKind, Review, ReviewComment, ReviewVersion, VideoPick } from "../core/types.ts";
import {
  type AppState,
  LISTEN_GRACE_MS,
  type MediaInput,
  type NewCommentInput,
  type OpenReviewInput,
  type PicksChoice,
  type SourceDownload,
  type Store,
  StoreError,
} from "../core/store.ts";
import {
  type CloudApi,
  type CloudLink,
  type WireBatch,
  type WireComment,
  type WireMeta,
  type WireReview,
  type WireVersion,
  type VersionInput,
} from "./cloud-api.ts";
import { CloudError, type FetchLike } from "./cloud.ts";
import { mimeFor, safeJoin } from "./files.ts";
import type { JsonStore } from "./json-store.ts";
import { loadTranscript, panelsKey, resolveMedia, defaultTitle, type ResolvedMedia, type LoadedTranscript } from "./media.ts";
import { extractFrame } from "./thumbs.ts";
import { MAX_UPLOAD_BYTES, putFile } from "./upload.ts";
import { checkZip, zipFolder, MAX_SOURCE_BYTES, type PackedSource } from "./zip.ts";
import { newId } from "./json-store.ts";

/** How long a read of the cloud is reused, so a page polling every second doesn't become a query every second. */
export const CLOUD_CACHE_MS = 3_000;
/** A version still "uploading" with no progress for this long was left by a process that stopped. */
export const STALLED_UPLOAD_MS = 90_000;
const PROGRESS_EVERY_MS = 1_000;

const ID = /^[\w-]+$/;

/** A source zip made for a version that the cloud hasn't numbered yet. */
interface StagedSource {
  file: string;
  filename: string;
  bytes: number;
  files: number;
  left: string[];
}
const MAX_FRAME_BYTES = 5 * 1024 * 1024;

export interface CloudStoreOptions {
  api: CloudApi;
  /** Holds picks, app state and the libraries, and its folder holds the file cache. */
  local: JsonStore;
  fetch?: FetchLike;
  /** Turns the background uploads off (tests that look at the "uploading" state). */
  autoUpload?: boolean;
  /** How long a read of the cloud is reused. */
  cacheMs?: number;
  /** Pause before an upload is tried again (tests make it 0). */
  retryDelayMs?: number;
  /** Replaces ffmpeg's poster frame (tests). */
  posterFrame?: (video: string) => Promise<Uint8Array | undefined>;
}

interface Entry {
  wire: WireReview;
  review: Review;
  updatedAt: number;
}

interface MetaEntry {
  meta: WireMeta;
  at: number;
}

/** Maps a failure from the cloud to the error a local store would have thrown. */
function storeError(err: unknown): never {
  if (err instanceof CloudError && !err.transient) throw new StoreError(err.message, err.status ?? 400);
  throw err;
}

async function guard<T>(call: Promise<T>): Promise<T> {
  try {
    return await call;
  } catch (err) {
    return storeError(err);
  }
}

function mapBatch(b: WireBatch): FeedbackBatch {
  return { id: b.id, createdAt: b.createdAt, commentIds: b.commentIds, message: b.message, deliveredAt: b.deliveredAt, retractedAt: b.retractedAt, replaces: b.replaces };
}

function mapVersion(v: WireVersion): ReviewVersion {
  const pad = Math.max(2, String(v.panels?.length ?? 0).length);
  return {
    number: v.number,
    videoPath: v.videoPath,
    panelsDir: v.panelsDir,
    panels: v.panels?.map((p, i) => ({
      image: `v${v.number}-panels/${String(i + 1).padStart(pad, "0")}${path.extname(p.sourcePath).toLowerCase()}`,
      sourcePath: p.sourcePath,
      title: p.title,
      caption: p.caption,
    })),
    transcript: v.transcript ? { file: `v${v.number}-transcript.json`, sourcePath: v.transcript.sourcePath, words: v.transcript.words } : undefined,
    note: v.note,
    notes: v.notes,
    source: v.source,
    createdAt: v.createdAt,
    sentAt: v.sentAt,
    batchId: v.batchId,
    reopenedFrom: v.reopenedFrom,
    upload: v.upload.state === "ready" ? undefined : { state: v.upload.state, bytes: v.upload.bytes, total: v.upload.total, error: v.upload.error },
  };
}

function fileExists(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

export class CloudStore implements Store {
  readonly root: string;
  readonly presets: Store["presets"];
  readonly playbooks: Store["playbooks"];
  readonly api: CloudApi;
  private readonly local: JsonStore;
  private readonly fetchFn: FetchLike;
  private readonly autoUpload: boolean;
  private readonly cacheMs: number;
  private readonly retryDelayMs: number;
  private readonly posterFrame: (video: string) => Promise<Uint8Array | undefined>;
  private readonly entries = new Map<string, Entry>();
  private readonly metas = new Map<string, MetaEntry>();
  private listed: { at: number; reviews: Review[] } | undefined;
  private readonly jobs = new Map<string, Promise<void>>();
  private readonly downloads = new Map<string, Promise<string | undefined>>();
  private readonly transcripts = new Map<string, Transcript>();

  constructor(options: CloudStoreOptions) {
    this.api = options.api;
    this.local = options.local;
    this.root = options.local.root;
    this.presets = options.local.presets;
    this.playbooks = options.local.playbooks;
    this.fetchFn = options.fetch ?? fetch;
    this.autoUpload = options.autoUpload ?? true;
    this.cacheMs = options.cacheMs ?? CLOUD_CACHE_MS;
    this.retryDelayMs = options.retryDelayMs ?? 1_000;
    this.posterFrame = options.posterFrame ?? ((video) => extractFrame(video, 1));
  }

  // --- The cache of what the cloud said -------------------------------------------------------------------------

  private cacheDir(reviewId: string): string {
    return path.join(this.root, "cloud", reviewId);
  }

  private versionsDir(reviewId: string): string {
    return path.join(this.cacheDir(reviewId), "versions");
  }

  private thumbsDir(reviewId: string): string {
    return path.join(this.cacheDir(reviewId), "thumbs");
  }

  private checkId(id: string): string {
    if (!ID.test(id)) throw new StoreError(`Invalid review id: ${id}`);
    return id;
  }

  /** Forgets what we know of a project, so the next read asks the cloud. Called after every write. */
  private changed(reviewId: string): void {
    this.entries.delete(reviewId);
    this.metas.delete(reviewId);
    this.listed = undefined;
  }

  private toReview(wire: WireReview): Review {
    const review: Review = {
      id: wire.id,
      title: wire.title,
      projectKey: wire.projectKey,
      createdAt: wire.createdAt,
      updatedAt: wire.updatedAt,
      versions: wire.versions.map(mapVersion),
      comments: wire.comments.map((c) => this.mapComment(wire.id, c)),
      batches: wire.batches.map(mapBatch),
      playbookId: wire.playbookId,
      styleId: wire.styleId,
    };
    return review;
  }

  private mapComment(reviewId: string, c: WireComment): ReviewComment {
    const mine = fileExists(path.join(this.thumbsDir(reviewId), `${c.id}.jpg`));
    return {
      id: c.id,
      version: c.version,
      kind: c.kind,
      time: c.time,
      endTime: c.endTime,
      x: c.x,
      y: c.y,
      panel: c.panel,
      wholeVideo: c.wholeVideo,
      text: c.text,
      thumbnail: c.thumbnail ?? (mine ? `${c.id}.jpg` : undefined),
      status: c.status,
      createdAt: c.createdAt,
      sentAt: c.sentAt,
      batchId: c.batchId,
      resolvedAt: c.resolvedAt,
      resolution: c.resolution,
      author: c.author,
      cloudId: c.cloudId,
      fromVersion: c.fromVersion,
    };
  }

  private remember(wire: WireReview): Entry {
    const entry: Entry = { wire, review: this.toReview(wire), updatedAt: Date.parse(wire.updatedAt) };
    this.entries.set(wire.id, entry);
    this.metas.set(wire.id, { meta: { updatedAt: entry.updatedAt, listeningAt: wire.listeningAt, now: Date.now() }, at: Date.now() });
    return entry;
  }

  private async metaOf(reviewId: string): Promise<WireMeta | null> {
    const cached = this.metas.get(reviewId);
    if (cached && Date.now() - cached.at < this.cacheMs) return cached.meta;
    const meta = await guard(this.api.meta(reviewId));
    if (!meta) {
      this.metas.delete(reviewId);
      return null;
    }
    this.metas.set(reviewId, { meta, at: Date.now() });
    return meta;
  }

  private async entry(reviewId: string): Promise<Entry | undefined> {
    this.checkId(reviewId);
    const held = this.entries.get(reviewId);
    if (held) {
      const meta = await this.metaOf(reviewId);
      if (!meta) {
        this.entries.delete(reviewId);
        return undefined;
      }
      if (meta.updatedAt === held.updatedAt) return held;
    }
    const wire = await guard(this.api.get(reviewId));
    if (!wire) {
      this.entries.delete(reviewId);
      return undefined;
    }
    return this.remember(wire);
  }

  // --- Projects -------------------------------------------------------------------------------------------------

  async listReviews(): Promise<Review[]> {
    if (this.listed && Date.now() - this.listed.at < this.cacheMs) return this.listed.reviews;
    const wires = await guard(this.api.list());
    const reviews = wires.map((w) => this.remember(w).review);
    this.listed = { at: Date.now(), reviews };
    return reviews;
  }

  async findReview(id: string): Promise<Review | undefined> {
    return (await this.entry(id))?.review;
  }

  async getReview(id: string): Promise<Review> {
    const review = await this.findReview(id);
    if (!review) throw new StoreError(`Review not found: ${id}`, 404);
    return review;
  }

  async reviewMtime(id: string): Promise<number> {
    const meta = await this.metaOf(this.checkId(id));
    return meta ? meta.updatedAt + (meta.listeningAt ?? 0) : 0;
  }

  /**
   * Gets a version's source ready to upload (H2.6): packs a folder, or checks a zip the agent made. The file waits in a
   * staging folder until the cloud has said which version it belongs to.
   */
  private async stageSource(source: string | undefined, media: ResolvedMedia): Promise<StagedSource | undefined> {
    if (!source) return undefined;
    const target = path.resolve(source);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(target);
    } catch {
      throw new StoreError(`source does not exist: ${target}`);
    }
    if (stat.isFile()) {
      if (path.extname(target).toLowerCase() !== ".zip") throw new StoreError(`source has to be the project folder or a .zip file: ${target}`);
      const checked = checkZip(target);
      const file = path.join(this.stagingDir(), `${newId("src")}.zip`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.copyFileSync(target, file, fs.constants.COPYFILE_FICLONE);
      return { file, filename: path.basename(target), bytes: checked.bytes, files: checked.files, left: [] };
    }
    if (!stat.isDirectory()) throw new StoreError(`source has to be the project folder or a .zip file: ${target}`);
    const file = path.join(this.stagingDir(), `${newId("src")}.zip`);
    const packed: PackedSource = await zipFolder(target, file, { skip: [media.videoPath ?? ""].filter(Boolean), maxBytes: MAX_SOURCE_BYTES });
    return { file, filename: `${path.basename(target) || "project"}-source.zip`, bytes: packed.bytes, files: packed.files, left: packed.left };
  }

  private stagingDir(): string {
    return path.join(this.root, "cloud", "_staging");
  }

  private sourcePath(reviewId: string, number: number): string {
    return path.join(this.versionsDir(reviewId), `v${number}-source.zip`);
  }

  private adoptSource(reviewId: string, number: number, staged: StagedSource | undefined): void {
    if (!staged) return;
    fs.mkdirSync(this.versionsDir(reviewId), { recursive: true });
    fs.renameSync(staged.file, this.sourcePath(reviewId, number));
  }

  private dropSource(staged: StagedSource | undefined): void {
    if (staged) fs.rmSync(staged.file, { force: true });
  }

  /** What a version needs to upload: its size, for the progress bar, and the pieces the cloud keeps about it. */
  private versionInput(
    media: ResolvedMedia,
    note: string | undefined,
    transcript: LoadedTranscript | undefined,
    notes?: string,
    source?: StagedSource,
  ): VersionInput {
    const files = media.panels?.length ? media.panels.map((p) => p.sourcePath) : media.videoPath ? [media.videoPath] : [];
    let total = source?.bytes ?? 0;
    for (const file of files) {
      const bytes = fs.statSync(file).size;
      if (bytes > MAX_UPLOAD_BYTES) throw new StoreError(`${path.basename(file)} is larger than 5 GB, which FrameJam Cloud doesn't support yet.`);
      total += bytes;
    }
    const key = media.panels?.length ? `panels:${createHash("sha1").update(panelsKey(media.panels)).digest("hex")}` : `video:${media.videoPath}`;
    return {
      note,
      notes: notes?.trim() || undefined,
      source: source ? { filename: source.filename, bytes: source.bytes } : undefined,
      contentKey: key,
      videoPath: media.videoPath,
      panelsDir: media.panelsDir,
      panelMeta: media.panels?.map((p) => ({ sourcePath: p.sourcePath, title: p.title, caption: p.caption })),
      total,
      transcript: transcript ? { json: JSON.stringify(transcript.transcript), sourcePath: transcript.sourcePath, words: transcript.transcript.words.length } : undefined,
    };
  }

  async openReview(input: OpenReviewInput): Promise<{ review: Review; version: ReviewVersion; created: boolean }> {
    const media = resolveMedia(input);
    const transcript = loadTranscript(input.transcriptPath, media);
    const title = (input.title ?? "").trim().toLowerCase();
    const projectKey = media.panelsDir ? `panels:${media.panelsDir}` : `title:${title}`;
    const keyed = Boolean(media.panelsDir || title);
    if (input.reviewId) this.checkId(input.reviewId);
    const staged = await this.stageSource(input.source, media);
    const version = this.versionInput(media, input.note, transcript, input.notes, staged);
    let out: Awaited<ReturnType<CloudApi["open"]>>;
    try {
      out = await guard(
        this.api.open({
          newId: newId("rev"),
          title: input.title?.trim() || defaultTitle(media),
          kind: media.panels?.length ? "storyboard" : "video",
          projectKey: keyed ? projectKey : undefined,
          reviewId: input.reviewId,
          version,
        }),
      );
    } catch (err) {
      this.dropSource(staged);
      throw err;
    }
    this.changed(out.review.id);
    if (out.upload !== null) this.beginUpload(out.review.id, out.upload, media, staged);
    else this.dropSource(staged);
    const review = (await this.entry(out.review.id)) ?? this.remember(out.review);
    return { review: review.review, version: review.review.versions.find((v) => v.number === out.version)!, created: out.created };
  }

  async addVersion(reviewId: string, input: MediaInput & { note?: string }): Promise<Review> {
    this.checkId(reviewId);
    const prev = (await this.getReview(reviewId)).versions.at(-1);
    const nothingNew = !input.videoPath && !input.panels?.length && !input.panelsDir;
    let media: ResolvedMedia;
    if (nothingNew && prev?.panelsDir) {
      media = resolveMedia({ panelsDir: prev.panelsDir });
      const old = new Map((prev.panels ?? []).map((p) => [p.sourcePath, p]));
      for (const p of media.panels ?? []) {
        p.title ??= old.get(p.sourcePath)?.title;
        p.caption ??= old.get(p.sourcePath)?.caption;
      }
    } else {
      media = resolveMedia(input);
    }
    const transcript = loadTranscript(input.transcriptPath, media);
    const staged = await this.stageSource(input.source, media);
    let out: Awaited<ReturnType<CloudApi["addVersion"]>>;
    try {
      out = await guard(this.api.addVersion(reviewId, this.versionInput(media, input.note, transcript, input.notes, staged)));
    } catch (err) {
      this.dropSource(staged);
      throw err;
    }
    this.changed(reviewId);
    this.beginUpload(reviewId, out.version, media, staged);
    return (await this.getReview(reviewId)) ?? this.remember(out.review).review;
  }

  async sourceFor(reviewId: string, number: number): Promise<SourceDownload | undefined> {
    this.checkId(reviewId);
    const version = (await this.getReview(reviewId)).versions.find((v) => v.number === number);
    if (!version) throw new StoreError(`${reviewId} has no version ${number}.`, 404);
    if (!version.source) return undefined;
    if (!version.source.ready) {
      throw new StoreError(`The source files of version ${number} are still uploading${version.upload?.state === "failed" ? " and the upload failed" : ""}. Try again in a minute.`, 409);
    }
    return await guard(this.api.sourceUrl(reviewId, number));
  }

  async setReviewPicks(reviewId: string, picks: PicksChoice): Promise<Review> {
    this.checkId(reviewId);
    const wire = await guard(this.api.setPicks(reviewId, picks));
    this.changed(reviewId);
    return this.remember(wire).review;
  }

  // --- Files ---------------------------------------------------------------------------------------------------

  /** Copies a version's files into the cache and starts uploading them. */
  private beginUpload(reviewId: string, number: number, media: ResolvedMedia, staged?: StagedSource): void {
    try {
      this.snapshot(reviewId, number, media);
      this.adoptSource(reviewId, number, staged);
    } catch (err) {
      this.dropSource(staged);
      void this.failed(reviewId, number, err);
      return;
    }
    if (this.autoUpload) void this.upload(reviewId, number);
  }

  /** Copies the render (or each panel) so v1 stays watchable after the agent overwrites the file for v2. Clones where the disk supports it. */
  private snapshot(reviewId: string, number: number, media: ResolvedMedia): void {
    const dir = this.versionsDir(reviewId);
    fs.mkdirSync(dir, { recursive: true });
    if (media.videoPath) {
      fs.copyFileSync(media.videoPath, path.join(dir, `v${number}${path.extname(media.videoPath) || ".mp4"}`), fs.constants.COPYFILE_FICLONE);
    }
    if (media.panels?.length) {
      const rel = `v${number}-panels`;
      fs.mkdirSync(path.join(dir, rel), { recursive: true });
      const pad = Math.max(2, String(media.panels.length).length);
      media.panels.forEach((p, i) => {
        fs.copyFileSync(p.sourcePath, path.join(dir, rel, `${String(i + 1).padStart(pad, "0")}${path.extname(p.sourcePath).toLowerCase()}`), fs.constants.COPYFILE_FICLONE);
      });
    }
  }

  private cachedVideo(reviewId: string, number: number): string | undefined {
    const dir = this.versionsDir(reviewId);
    try {
      const name = fs.readdirSync(dir).find((f) => new RegExp(`^v${number}\\.\\w+$`).test(f));
      return name ? path.join(dir, name) : undefined;
    } catch {
      return undefined;
    }
  }

  private cachedPanel(reviewId: string, version: ReviewVersion, panel: number): string | undefined {
    const image = version.panels?.[panel - 1]?.image;
    const file = image ? safeJoin(this.versionsDir(reviewId), image) : undefined;
    return file && fileExists(file) ? file : undefined;
  }

  private async download(url: string, file: string): Promise<string | undefined> {
    const pending = this.downloads.get(file);
    if (pending) return pending;
    const job = (async () => {
      const tmp = `${file}.${process.pid}.part`;
      try {
        const res = await this.fetchFn(url);
        if (!res.ok || !res.body) return undefined;
        fs.mkdirSync(path.dirname(file), { recursive: true });
        await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(tmp));
        fs.renameSync(tmp, file);
        return file;
      } catch {
        fs.rmSync(tmp, { force: true });
        return undefined;
      } finally {
        this.downloads.delete(file);
      }
    })();
    this.downloads.set(file, job);
    return job;
  }

  async videoFileFor(reviewId: string, version: ReviewVersion): Promise<string | undefined> {
    const cached = this.cachedVideo(reviewId, version.number);
    if (cached) return cached;
    const url = (await this.entry(reviewId))?.wire.versions.find((v) => v.number === version.number)?.videoUrl;
    if (url) {
      const ext = path.extname(version.videoPath ?? "") || ".mp4";
      const got = await this.download(url, path.join(this.versionsDir(reviewId), `v${version.number}${ext}`));
      if (got) return got;
    }
    return version.videoPath && fileExists(version.videoPath) ? version.videoPath : undefined;
  }

  async panelFileFor(reviewId: string, version: ReviewVersion, panel: number): Promise<string | undefined> {
    const p = version.panels?.[panel - 1];
    if (!p) return undefined;
    const cached = this.cachedPanel(reviewId, version, panel);
    if (cached) return cached;
    const url = (await this.entry(reviewId))?.wire.versions.find((v) => v.number === version.number)?.panels?.[panel - 1]?.url;
    const target = safeJoin(this.versionsDir(reviewId), p.image);
    if (url && target) {
      const got = await this.download(url, target);
      if (got) return got;
    }
    return fileExists(p.sourcePath) ? p.sourcePath : undefined;
  }

  private posterPath(reviewId: string, version: number): string {
    return path.join(this.cacheDir(this.checkId(reviewId)), `poster-v${version}.jpg`);
  }

  async posterFile(reviewId: string, version: number): Promise<string | undefined> {
    const file = this.posterPath(reviewId, version);
    if (fileExists(file)) return file;
    const url = (await this.entry(reviewId))?.wire.versions.find((v) => v.number === version)?.posterUrl;
    return url ? await this.download(url, file) : undefined;
  }

  savePoster(reviewId: string, version: number, jpeg: Uint8Array): string {
    const file = this.posterPath(reviewId, version);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, jpeg);
    return file;
  }

  async transcriptFor(reviewId: string, version: ReviewVersion): Promise<Transcript | undefined> {
    if (!version.transcript) return undefined;
    const key = `${reviewId}:${version.number}:${version.transcript.words}:${version.transcript.sourcePath ?? ""}`;
    const held = this.transcripts.get(key);
    if (held) return held;
    const json = await guard(this.api.transcript(reviewId, version.number));
    if (!json) return undefined;
    const transcript = JSON.parse(json) as Transcript;
    this.transcripts.set(key, transcript);
    return transcript;
  }

  async setTranscript(reviewId: string, version: number, transcript: Transcript, sourcePath?: string): Promise<Review> {
    this.checkId(reviewId);
    const wire = await guard(this.api.setTranscript(reviewId, version, { json: JSON.stringify(transcript), sourcePath, words: transcript.words.length }));
    this.changed(reviewId);
    return this.remember(wire).review;
  }

  // --- Uploading a version's files ------------------------------------------------------------------------------

  /** Resolves when the version's upload job in this process ends. */
  uploadFinished(reviewId: string, number: number): Promise<void> {
    return this.jobs.get(`${reviewId}:${number}`) ?? Promise.resolve();
  }

  /** Waits until a version is in the cloud (it may be uploading from another process). Throws when it failed. */
  async waitForUpload(reviewId: string, number: number, timeoutMs = 15 * 60_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      await this.uploadFinished(reviewId, number);
      this.changed(reviewId);
      const version = (await this.getReview(reviewId)).versions.find((v) => v.number === number);
      if (!version) throw new StoreError(`${reviewId} has no version ${number}.`, 404);
      if (!version.upload) return;
      if (version.upload.state === "failed") {
        throw new StoreError(`Version ${number} didn't finish uploading (${version.upload.error ?? "upload failed"}). Open it again to retry.`, 409);
      }
      if (Date.now() > deadline) throw new StoreError(`Version ${number} is still uploading. Try again in a minute.`, 409);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  private upload(reviewId: string, number: number): Promise<void> {
    const key = `${reviewId}:${number}`;
    const running = this.jobs.get(key);
    if (running) return running;
    const job = this.runUpload(reviewId, number)
      .catch((err) => this.failed(reviewId, number, err))
      .finally(() => {
        this.jobs.delete(key);
        this.changed(reviewId);
      });
    this.jobs.set(key, job);
    return job;
  }

  private async failed(reviewId: string, number: number, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await this.api.versionFailed(reviewId, number, message);
    } catch {
      // The cloud is unreachable too; the version stays "uploading" there and reads as stalled until it's opened again.
    }
    this.changed(reviewId);
  }

  private async putOne(file: string, kind: "render" | "panel" | "poster" | "source", onBytes?: (sent: number) => void, extra: { posterKey?: string } = {}) {
    const mime = mimeFor(file);
    const ticket = await this.api.requestUpload({ filename: path.basename(file), mime, kind });
    const bytes = await putFile(ticket.uploadUrl, file, mime, this.fetchFn, onBytes, { attempts: 3, retryDelayMs: this.retryDelayMs });
    const { assetId } = await this.api.registerUpload({ storageKey: ticket.storageKey, bytes, mime, ...extra });
    return { assetId, storageKey: ticket.storageKey };
  }

  private async runUpload(reviewId: string, number: number): Promise<void> {
    const review = await this.getReview(reviewId);
    const version = review.versions.find((v) => v.number === number);
    if (!version) return;
    const total = version.upload?.total ?? 0;

    let done = 0;
    let lastBytes = -1;
    let lastAt = 0;
    const report = (current: number, force = false) => {
      const bytes = Math.min(total, done + current);
      const now = Date.now();
      if (!force && (now - lastAt < PROGRESS_EVERY_MS || bytes === lastBytes)) return;
      lastAt = now;
      lastBytes = bytes;
      this.api.uploadProgress(reviewId, number, bytes).catch(() => {});
    };

    let sourceAssetId: string | undefined;
    if (version.source) {
      const zip = this.sourcePath(reviewId, number);
      if (!fileExists(zip)) throw new Error(`The source files of version ${number} aren't on this computer any more.`);
      sourceAssetId = (await this.putOne(zip, "source", (sent) => report(sent))).assetId;
      done += fs.statSync(zip).size;
      report(0, true);
    }

    if (version.panels?.length) {
      const assetIds: string[] = [];
      for (const [i] of version.panels.entries()) {
        const file = this.cachedPanel(reviewId, version, i + 1);
        if (!file) throw new Error(`Panel ${i + 1} of version ${number} isn't on this computer any more.`);
        const { assetId } = await this.putOne(file, "panel", (sent) => report(sent));
        done += fs.statSync(file).size;
        report(0, true);
        assetIds.push(assetId);
      }
      await this.api.versionReady(reviewId, number, { panelAssetIds: assetIds, sourceAssetId });
      return;
    }

    const render = this.cachedVideo(reviewId, number);
    if (!render) throw new Error(`The render of version ${number} isn't on this computer any more.`);
    let posterKey: string | undefined;
    const posterFile = (await this.posterFile(reviewId, number).catch(() => undefined)) ?? (await this.makePoster(reviewId, number, render));
    if (posterFile) {
      try {
        posterKey = (await this.putOne(posterFile, "poster")).storageKey;
      } catch {
        // A poster is nice to have; the video is what the version needs.
      }
    }
    const { assetId } = await this.putOne(render, "render", (sent) => report(sent), { posterKey });
    await this.api.versionReady(reviewId, number, { videoAssetId: assetId, sourceAssetId });
  }

  private async makePoster(reviewId: string, number: number, render: string): Promise<string | undefined> {
    try {
      const jpeg = await this.posterFrame(render);
      return jpeg ? this.savePoster(reviewId, number, jpeg) : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Picks up versions whose upload failed, or was left half-done by a process that stopped (no progress for a
   * while), when their files are still in this computer's cache. Called when the app starts.
   */
  async resumeUploads(): Promise<number> {
    let resumed = 0;
    for (const wire of await guard(this.api.list())) {
      const stalled = Date.now() - Date.parse(wire.updatedAt) > STALLED_UPLOAD_MS;
      for (const v of wire.versions) {
        const left = v.upload.state === "failed" || (v.upload.state === "uploading" && stalled);
        if (!left || this.jobs.has(`${wire.id}:${v.number}`)) continue;
        const cached =
          wire.kind === "storyboard" ? fs.existsSync(path.join(this.versionsDir(wire.id), `v${v.number}-panels`)) : Boolean(this.cachedVideo(wire.id, v.number));
        if (!cached || (v.source && !fileExists(this.sourcePath(wire.id, v.number)))) continue;
        void this.upload(wire.id, v.number);
        resumed++;
      }
    }
    return resumed;
  }

  // --- Comments -------------------------------------------------------------------------------------------------

  async addComment(reviewId: string, input: NewCommentInput): Promise<ReviewComment> {
    this.checkId(reviewId);
    const text = input.text?.trim();
    if (!text) throw new StoreError("Comment text is required");
    const wire = await guard(
      this.api.addComment(reviewId, {
        version: input.version,
        kind: input.kind,
        time: input.time,
        endTime: input.endTime,
        x: input.x,
        y: input.y,
        panel: input.panel,
        wholeVideo: input.wholeVideo,
        text,
        author: input.author,
        cloudId: input.cloudId,
        fromVersion: input.fromVersion,
      }),
    );
    this.changed(reviewId);
    return this.mapComment(reviewId, wire);
  }

  async updateComment(reviewId: string, commentId: string, patch: { text?: string; thumbnail?: string }): Promise<ReviewComment> {
    this.checkId(reviewId);
    if (patch.text !== undefined) {
      if (!patch.text.trim()) throw new StoreError("Comment text is required");
      await guard(this.api.updateComment(reviewId, commentId, patch.text.trim()));
      this.changed(reviewId);
    }
    const comment = (await this.getReview(reviewId)).comments.find((c) => c.id === commentId);
    if (!comment) throw new StoreError(`Comment not found: ${commentId}`, 404);
    return comment;
  }

  async deleteComment(reviewId: string, commentId: string): Promise<void> {
    this.checkId(reviewId);
    await guard(this.api.deleteComment(reviewId, commentId));
    fs.rmSync(path.join(this.thumbsDir(reviewId), `${commentId}.jpg`), { force: true });
    this.changed(reviewId);
  }

  async saveThumbnail(reviewId: string, commentId: string, jpeg: Uint8Array): Promise<string> {
    this.checkId(reviewId);
    if (!ID.test(commentId)) throw new StoreError(`Comment not found: ${commentId}`, 404);
    const name = `${commentId}.jpg`;
    fs.mkdirSync(this.thumbsDir(reviewId), { recursive: true });
    fs.writeFileSync(path.join(this.thumbsDir(reviewId), name), jpeg);
    this.changed(reviewId);
    try {
      const ticket = await this.api.requestUpload({ filename: name, mime: "image/jpeg", kind: "frame" });
      const res = await this.fetchFn(ticket.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: jpeg as BodyInit });
      if (!res.ok) throw new Error(`Uploading to FrameJam Cloud failed (${res.status}).`);
      const { assetId } = await this.api.registerUpload({ storageKey: ticket.storageKey, bytes: jpeg.byteLength, mime: "image/jpeg" });
      await guard(this.api.setCommentFrame(reviewId, commentId, assetId));
    } catch (err) {
      // The frame is kept here either way, so this computer's agent still gets it; a missing comment is an error.
      if (err instanceof StoreError && err.status === 404) {
        fs.rmSync(path.join(this.thumbsDir(reviewId), name), { force: true });
        throw err;
      }
    }
    this.changed(reviewId);
    return name;
  }

  async thumbnailFile(reviewId: string, file: string): Promise<string | null | undefined> {
    this.checkId(reviewId);
    const full = safeJoin(this.thumbsDir(reviewId), file);
    if (!full) return null;
    if (fileExists(full)) return full;
    const id = file.replace(/\.jpg$/, "");
    const url = (await this.entry(reviewId))?.wire.comments.find((c) => c.id === id)?.frameUrl;
    return url ? await this.download(url, full) : undefined;
  }

  async readThumbnail(reviewId: string, file: string): Promise<Uint8Array | undefined> {
    const full = await this.thumbnailFile(reviewId, file);
    if (!full) return undefined;
    const bytes = fs.readFileSync(full);
    return bytes.byteLength <= MAX_FRAME_BYTES * 4 ? bytes : undefined;
  }

  async resolveComments(reviewId: string, ids: string[], note?: string): Promise<{ resolved: string[]; missing: string[] }> {
    this.checkId(reviewId);
    const out = await guard(this.api.resolveComments(reviewId, ids, note));
    this.changed(reviewId);
    return out;
  }

  // --- Rounds ---------------------------------------------------------------------------------------------------

  async submit(reviewId: string, message?: string): Promise<FeedbackBatch> {
    this.checkId(reviewId);
    const { batch } = await guard(this.api.submit(reviewId, message));
    this.changed(reviewId);
    return mapBatch(batch);
  }

  async reopen(reviewId: string): Promise<{ wasDelivered: boolean }> {
    this.checkId(reviewId);
    const out = await guard(this.api.reopen(reviewId));
    this.changed(reviewId);
    return out;
  }

  async undeliveredBatches(reviewId: string): Promise<FeedbackBatch[]> {
    return (await this.getReview(reviewId)).batches.filter((b) => !b.deliveredAt);
  }

  async markDelivered(reviewId: string, batchIds: string[]): Promise<void> {
    if (!batchIds.length) return;
    this.checkId(reviewId);
    await guard(this.api.markDelivered(reviewId, batchIds));
    this.changed(reviewId);
  }

  // --- The agent ------------------------------------------------------------------------------------------------

  async setAgentWaiting(reviewId: string, waiting: boolean): Promise<void> {
    this.checkId(reviewId);
    try {
      await this.api.setWaiting(reviewId, waiting);
    } catch {
      // A missed heartbeat only makes the page say the agent isn't listening for a few seconds.
    }
    this.metas.delete(reviewId);
  }

  async agentListening(reviewId: string): Promise<boolean> {
    try {
      const meta = await this.metaOf(this.checkId(reviewId));
      if (!meta || meta.listeningAt === null) return false;
      const held = this.metas.get(reviewId);
      // The cloud's clock for "now" when we asked, moved on by the time since.
      const now = meta.now + (held ? Date.now() - held.at : 0);
      return now - meta.listeningAt < LISTEN_GRACE_MS;
    } catch {
      return false;
    }
  }

  // --- Not projects: these stay on this computer ----------------------------------------------------------------

  getState(): AppState {
    return this.local.getState();
  }
  recordAgent(name: string | undefined, version?: string): void {
    this.local.recordAgent(name, version);
  }
  agentOutdated(): boolean {
    return this.local.agentOutdated();
  }
  createPick(kinds: PickKind[], title?: string): VideoPick {
    return this.local.createPick(kinds, title);
  }
  getPick(id: string): VideoPick {
    return this.local.getPick(id);
  }
  listPicks(): VideoPick[] {
    return this.local.listPicks();
  }
  activePick(): VideoPick | null {
    return this.local.activePick();
  }
  touchPick(id: string): void {
    this.local.touchPick(id);
  }
  dismissPick(id: string): VideoPick {
    return this.local.dismissPick(id);
  }
  resolvePick(id: string, choice: PicksChoice): VideoPick {
    return this.local.resolvePick(id, choice);
  }

  // --- Sharing: the files are already in the cloud, so a link only says which versions guests see --------------------

  /** The project's link, if it has one. */
  async linkOf(reviewId: string): Promise<CloudLink | null> {
    return await guard(this.api.link(this.checkId(reviewId)));
  }

  /** Forgets cached reads of a project after something outside this class (a share) changed it in the cloud. */
  refresh(reviewId: string): void {
    this.changed(reviewId);
  }
}
