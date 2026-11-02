/**
 * Two-way sync between this computer's projects (`~/.framejam`) and FrameJam Cloud (H2.1). The local store stays the
 * one the app and the agent use; this keeps a copy of every synced project in the cloud, and brings back what changed
 * there (comments and rounds from the phone or a share link, versions from another computer or a web chat).
 *
 * Each project keeps the state both sides last agreed on in `<data dir>/sync/<project>.json`. Comparing each side
 * with it says which one changed: an edit wins over no edit, and a comment deleted on one side goes on the other.
 * Versions are never merged: the cloud and this computer number them the same, and each side only adds the ones the
 * other is missing. Only the process that serves the app runs the loop.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { FeedbackBatch, Review, ReviewComment, ReviewVersion } from "../core/types.ts";
import { readAuth } from "./auth.ts";
import { type CloudApi, createCloudApi, type SyncComment, type VersionInput, type WireComment, type WireReview, type WireVersion } from "./cloud-api.ts";
import { CloudError, type FetchLike } from "./cloud.ts";
import { mimeFor } from "./files.ts";
import { type JsonStore, newId } from "./json-store.ts";
import { SYNC_PLANS_URL, resolveCloudUrl } from "./login.ts";
import { PANEL_EXTENSIONS, panelsKey } from "./media.ts";
import { isProjectSynced, readSync, setProjectSync } from "./sync-settings.ts";
import { extractFrame } from "./thumbs.ts";
import { MAX_UPLOAD_BYTES, putFile } from "./upload.ts";
import { checkZip, MAX_SOURCE_BYTES, zipFolder } from "./zip.ts";

/** How often the loop looks for local changes. */
export const LOCAL_CHECK_MS = 2_000;
/** How often it asks the cloud what changed there. */
export const CLOUD_CHECK_MS = 15_000;
/** A version still "uploading" with no progress for this long was left by a process that stopped. */
export const STALLED_UPLOAD_MS = 90_000;
/** A project the cloud refused (over the plan's limit) is tried again after this long, or when it changes here. */
const PAUSED_RETRY_MS = 5 * 60_000;
const PROGRESS_EVERY_MS = 1_000;

export type SyncState = "off" | "signed-out" | "left-out" | "syncing" | "synced" | "paused" | "offline";

export interface SyncStatus {
  state: SyncState;
  /** Why a project is paused (the plan's limit) or what failed. */
  error?: string;
  syncedAt?: string;
  /** A version on its way up. */
  upload?: { version: number; bytes: number; total: number };
}

interface Base {
  /** Which login this state belongs to: another account or deployment starts over. */
  account: string;
  title: string;
  playbookId?: string;
  styleId?: string;
  /** Version numbers both sides have. */
  versions: number[];
  /** By local comment id. */
  comments: Record<string, { row: string; text: string; resolved: boolean; frame: boolean }>;
  /** By local batch id. */
  batches: Record<string, { row: string; delivered: boolean; retracted: boolean }>;
  syncedAt?: string;
}

export interface SyncOptions {
  local: JsonStore;
  /** Tests give the cloud (and its file transfers) instead of the signed-in user's. */
  api?: CloudApi;
  fetch?: FetchLike;
  retryDelayMs?: number;
  /** Replaces ffmpeg's poster frame (tests). */
  posterFrame?: (video: string) => Promise<Uint8Array | undefined>;
}

const ms = (iso: string | undefined) => (iso ? Date.parse(iso) : undefined);

function fileExists(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/** What decides whether a cloud version is this one: the same render path, or the same panels. */
export function contentKey(v: Pick<ReviewVersion, "videoPath" | "panels">): string {
  return v.panels?.length ? `panels:${createHash("sha1").update(panelsKey(v.panels)).digest("hex")}` : `video:${v.videoPath}`;
}

/** A cloud failure that won't go away by trying again (a limit, a refused write). */
const refused = (err: unknown) => err instanceof CloudError && !err.transient;

export class SyncEngine {
  private readonly local: JsonStore;
  private readonly options: SyncOptions;
  private readonly fetchFn: FetchLike;
  private readonly retryDelayMs: number;
  private readonly posterFrame: (video: string) => Promise<Uint8Array | undefined>;
  private current: { key: string; api: CloudApi } | undefined;
  /** One pass per project at a time; a change during a pass runs one more after it. */
  private readonly running = new Map<string, Promise<void>>();
  private readonly importing = new Set<string>();
  private readonly again = new Set<string>();
  private readonly uploads = new Map<string, Promise<void>>();
  private readonly progress = new Map<string, { version: number; bytes: number; total: number }>();
  private readonly errors = new Map<string, { message: string; at: number; offline: boolean }>();
  private readonly seenLocal = new Map<string, number>();
  private readonly seenCloud = new Map<string, number>();
  private readonly waiting = new Map<string, number>();
  private timers: NodeJS.Timeout[] = [];
  private checking = false;
  private cloudCount?: number;

  constructor(options: SyncOptions) {
    this.local = options.local;
    this.options = options;
    this.fetchFn = options.fetch ?? fetch;
    this.retryDelayMs = options.retryDelayMs ?? 1_000;
    this.posterFrame = options.posterFrame ?? ((video) => extractFrame(video, 1));
  }

  // --- Who we sync as -------------------------------------------------------------------------------------------

  /** The signed-in user's cloud, or undefined while signed out. */
  api(): { api: CloudApi; account: string } | undefined {
    if (this.options.api) return { api: this.options.api, account: `test@${this.options.api.url}` };
    const auth = readAuth(this.local.root);
    if (!auth) return undefined;
    const url = resolveCloudUrl(auth.cloudUrl);
    const key = createHash("sha1").update(`${url} ${auth.token}`).digest("hex").slice(0, 16);
    if (this.current?.key !== key) this.current = { key, api: createCloudApi(auth.token, url, this.fetchFn) };
    return { api: this.current.api, account: key };
  }

  enabled(): boolean {
    return readSync(this.local.root).enabled === true;
  }

  /** Why the signed-in account can't sync (its plan doesn't include it), or undefined when it can or we're offline. */
  async refusal(): Promise<string | undefined> {
    const session = this.api();
    if (!session) return undefined;
    try {
      await session.api.syncIndex();
      return undefined;
    } catch (err) {
      return refused(err) ? `Sync comes with Pro. Plans: ${SYNC_PLANS_URL}` : undefined;
    }
  }

  isSynced(reviewId: string): boolean {
    return isProjectSynced(reviewId, this.local.root);
  }

  status(reviewId: string): SyncStatus {
    const settings = readSync(this.local.root);
    if (settings.enabled !== true) return { state: "off" };
    if (settings.optOut.includes(reviewId)) return { state: "left-out" };
    if (!this.api()) return { state: "signed-out" };
    const base = this.readBase(reviewId);
    const err = this.errors.get(reviewId);
    const upload = this.progress.get(reviewId);
    if (err) return { state: err.offline ? "offline" : "paused", error: err.message, syncedAt: base?.syncedAt, upload };
    if (this.running.has(reviewId) || upload || !base) return { state: "syncing", syncedAt: base?.syncedAt, upload };
    return { state: "synced", syncedAt: base.syncedAt };
  }

  // --- The loop -------------------------------------------------------------------------------------------------

  start(): void {
    if (this.timers.length) return;
    this.timers.push(setInterval(() => void this.checkLocal(), LOCAL_CHECK_MS));
    this.timers.push(setInterval(() => void this.checkCloud(), CLOUD_CHECK_MS));
    for (const t of this.timers) t.unref?.();
    void this.syncAll().catch(() => {});
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  /** Waits for every pass and upload this engine started (tests, `framejam sync now`). */
  async idle(): Promise<void> {
    for (;;) {
      const pending = [...this.running.values(), ...this.uploads.values()];
      if (!pending.length) return;
      await Promise.allSettled(pending);
    }
  }

  /** One pass over everything: every synced project here, then the cloud projects this computer doesn't have yet. */
  async syncAll(): Promise<void> {
    const session = this.api();
    if (!session || !this.enabled()) return;
    for (const review of this.local.listReviews()) {
      if (this.isSynced(review.id)) await this.sync(review.id);
    }
    await this.importNew(session.api);
  }

  private async checkLocal(): Promise<void> {
    if (!this.enabled() || !this.api()) return;
    let ids: string[];
    try {
      ids = fs
        .readdirSync(this.local.reviewsDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.slice(0, -5));
    } catch {
      return;
    }
    for (const id of ids) {
      if (!this.isSynced(id)) continue;
      const mtime = this.local.reviewMtime(id);
      const err = this.errors.get(id);
      const retry = err && Date.now() - err.at > (err.offline ? CLOUD_CHECK_MS : PAUSED_RETRY_MS);
      if (this.seenLocal.get(id) !== mtime || retry) void this.sync(id);
    }
  }

  private async checkCloud(): Promise<void> {
    const session = this.api();
    if (!session || !this.enabled() || this.checking) return;
    this.checking = true;
    try {
      const index = await session.api.syncIndex();
      for (const item of index) {
        if (!this.local.findReview(item.id)) continue;
        if (!this.isSynced(item.id)) continue;
        if (this.seenCloud.get(item.id) !== item.updatedAt) void this.sync(item.id);
      }
      // A project left the account, so one held back by the plan's limit may fit now.
      if (this.cloudCount !== undefined && index.length < this.cloudCount) {
        for (const [id, err] of this.errors) if (!err.offline && this.isSynced(id)) void this.sync(id);
      }
      this.cloudCount = index.length;
      await this.importNew(session.api, index);
    } catch {
      // Offline: the next check tries again.
    } finally {
      this.checking = false;
    }
  }

  /** Syncs one project now (or right after the pass already running). */
  sync(reviewId: string): Promise<void> {
    const running = this.running.get(reviewId);
    if (running) {
      this.again.add(reviewId);
      return running;
    }
    const job = (async () => {
      try {
        do {
          this.again.delete(reviewId);
          await this.pass(reviewId);
        } while (this.again.has(reviewId));
      } finally {
        this.running.delete(reviewId);
      }
    })();
    this.running.set(reviewId, job);
    return job;
  }

  /** Stops syncing a project and removes its copy from the cloud (a share link keeps working). */
  async forget(reviewId: string): Promise<void> {
    const session = this.api();
    await this.running.get(reviewId);
    if (session && this.readBase(reviewId)) await session.api.syncForget(reviewId);
    this.dropBase(reviewId);
    this.errors.delete(reviewId);
  }

  /**
   * Brings a synced project up to date now, importing it first when it's only in the cloud (`framejam pull`). False
   * while its first version is still uploading. Throws what stopped the pass.
   */
  async bring(reviewId: string): Promise<boolean> {
    const session = this.api();
    if (!session) throw new Error("Sign in first: framejam login");
    if (!this.local.findReview(reviewId) && !(await this.importProject(session.api, reviewId))) return false;
    await this.sync(reviewId);
    const err = this.errors.get(reviewId);
    if (err) throw new Error(err.message);
    return true;
  }

  // --- One project ----------------------------------------------------------------------------------------------

  private async pass(reviewId: string): Promise<void> {
    const session = this.api();
    if (!session || !this.isSynced(reviewId)) return;
    const review = this.local.findReview(reviewId);
    if (!review) return;
    const mtime = this.local.reviewMtime(reviewId);
    try {
      await this.syncProject(session.api, session.account, review);
      this.errors.delete(reviewId);
      this.seenLocal.set(reviewId, this.local.reviewMtime(reviewId));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.errors.set(reviewId, { message, at: Date.now(), offline: !refused(err) });
      this.seenLocal.set(reviewId, mtime);
    }
  }

  private async syncProject(api: CloudApi, account: string, start: Review): Promise<void> {
    const id = start.id;
    let base = this.readBase(id);
    if (base && base.account !== account) base = undefined;
    let wire = await api.get(id).catch((err) => {
      // A project another account has, or one not synced yet, reads as missing.
      if (refused(err)) return null;
      throw err;
    });
    if (!wire && base) {
      // Synced before and gone from the cloud now: removed there (another computer, the web app). Keep it here only.
      this.dropBase(id);
      setProjectSync(id, false, this.local.root);
      return;
    }
    if (!wire) {
      await api.syncEnsure(this.projectOf(start));
      wire = await api.get(id);
      if (!wire) throw new Error("FrameJam Cloud didn't keep the project.");
    }
    const next: Base = base ?? { account, title: wire.title, playbookId: wire.playbookId, styleId: wire.styleId, versions: [], comments: {}, batches: {} };

    await this.syncMeta(api, id, wire, next);
    await this.pullVersions(api, id, wire, next);
    await this.pushVersions(api, id, wire, next);
    wire = (await api.get(id)) ?? wire;
    await this.syncComments(api, id, wire, next);
    wire = (await api.get(id)) ?? wire;
    await this.syncBatches(api, id, wire, next);
    await this.forwardListening(api, id);

    next.syncedAt = new Date().toISOString();
    this.writeBase(id, next);
    this.seenCloud.set(id, Date.parse(((await api.get(id)) ?? wire).updatedAt));
  }

  private projectOf(review: Review) {
    return {
      id: review.id,
      title: review.title,
      kind: review.versions.at(-1)?.panels?.length ? ("storyboard" as const) : ("video" as const),
      projectKey: review.projectKey,
      playbookId: review.playbookId,
      styleId: review.styleId,
    };
  }

  /** Title and picks: whichever side changed since the last pass wins. */
  private async syncMeta(api: CloudApi, id: string, wire: WireReview, base: Base): Promise<void> {
    const review = this.local.getReview(id);
    const update: { title?: string; playbookId?: string | null; styleId?: string | null } = {};
    const local: Partial<Review> = {};
    if (review.title !== base.title) update.title = review.title;
    else if (wire.title !== base.title) local.title = wire.title;
    if (review.playbookId !== base.playbookId) update.playbookId = review.playbookId ?? null;
    else if (wire.playbookId !== base.playbookId) local.playbookId = wire.playbookId;
    if (review.styleId !== base.styleId) update.styleId = review.styleId ?? null;
    else if (wire.styleId !== base.styleId) local.styleId = wire.styleId;
    if (Object.keys(update).length) await api.syncEnsure(this.projectOf(review), update);
    if (Object.keys(local).length) {
      this.local.change(id, (r) => {
        if ("title" in local) r.title = local.title!;
        if ("playbookId" in local) r.playbookId = local.playbookId;
        if ("styleId" in local) r.styleId = local.styleId;
      });
    }
    const now = this.local.getReview(id);
    base.title = now.title;
    base.playbookId = now.playbookId;
    base.styleId = now.styleId;
  }

  // --- Versions -------------------------------------------------------------------------------------------------

  private syncDir(id: string): string {
    return path.join(this.local.root, "sync", id);
  }

  /** Versions made somewhere else, once their files are in the cloud: downloaded and added here with the same number. */
  private async pullVersions(api: CloudApi, id: string, wire: WireReview, base: Base): Promise<void> {
    for (const w of wire.versions) {
      const review = this.local.getReview(id);
      const last = review.versions.at(-1)?.number ?? 0;
      if (w.number <= last) continue;
      if (w.number !== last + 1) throw new Error(`Version ${last + 1} is missing in FrameJam Cloud.`);
      if (w.upload.state !== "ready") return;
      const media = await this.download(id, w);
      try {
        this.local.addVersion(id, { ...media, note: w.note, notes: w.notes });
      } finally {
        this.cleanIncoming(id);
      }
      await this.adoptPulled(api, id, w);
      base.versions.push(w.number);
    }
  }

  private async adoptPulled(api: CloudApi, id: string, w: WireVersion): Promise<void> {
    this.local.change(id, (r) => {
      const v = r.versions.find((x) => x.number === w.number);
      if (!v) return;
      v.createdAt = w.createdAt;
      if (w.videoPath) v.videoPath = w.videoPath;
      if (w.source) v.source = { ...w.source };
      v.panels?.forEach((p, i) => {
        const from = w.panels?.[i];
        if (from?.sourcePath) p.sourcePath = from.sourcePath;
      });
    });
    if (w.posterUrl) {
      const jpeg = await this.fetchBytes(w.posterUrl);
      if (jpeg) this.local.savePoster(id, w.number, jpeg);
    }
    if (w.transcript) {
      const json = await api.transcript(id, w.number).catch(() => null);
      if (json) this.local.setTranscript(id, w.number, JSON.parse(json), w.transcript.sourcePath);
    }
  }

  private cleanIncoming(id: string): void {
    fs.rmSync(path.join(this.syncDir(id), "incoming"), { recursive: true, force: true });
  }

  private async download(id: string, w: WireVersion): Promise<{ videoPath?: string; panels?: { path: string; title?: string; caption?: string }[] }> {
    const dir = path.join(this.syncDir(id), "incoming");
    fs.mkdirSync(dir, { recursive: true });
    if (w.panels?.length) {
      const panels = [];
      for (const [i, p] of w.panels.entries()) {
        const ext = path.extname(p.sourcePath).toLowerCase();
        const file = path.join(dir, `${String(i + 1).padStart(3, "0")}${PANEL_EXTENSIONS.has(ext) ? ext : ".png"}`);
        if (!p.url || !(await this.fetchTo(p.url, file))) throw new Error(`Couldn't download panel ${i + 1} of version ${w.number}.`);
        panels.push({ path: file, title: p.title, caption: p.caption });
      }
      return { panels };
    }
    const file = path.join(dir, `v${w.number}${path.extname(w.videoPath ?? "") || ".mp4"}`);
    if (!w.videoUrl || !(await this.fetchTo(w.videoUrl, file))) throw new Error(`Couldn't download version ${w.number}.`);
    return { videoPath: file };
  }

  private async fetchTo(url: string, file: string): Promise<boolean> {
    const tmp = `${file}.${process.pid}.part`;
    try {
      const res = await this.fetchFn(url);
      if (!res.ok || !res.body) return false;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(tmp));
      fs.renameSync(tmp, file);
      return true;
    } catch {
      fs.rmSync(tmp, { force: true });
      return false;
    }
  }

  private async fetchBytes(url: string): Promise<Uint8Array | undefined> {
    try {
      const res = await this.fetchFn(url);
      return res.ok ? new Uint8Array(await res.arrayBuffer()) : undefined;
    } catch {
      return undefined;
    }
  }

  /** Versions made here that the cloud doesn't have yet: added there with the same number, then their files go up. */
  private async pushVersions(api: CloudApi, id: string, wire: WireReview, base: Base): Promise<void> {
    const review = this.local.getReview(id);
    const add: { number: number; version: VersionInput }[] = [];
    for (const v of review.versions) {
      const w = wire.versions.find((x) => x.number === v.number);
      if (!w) {
        add.push({ number: v.number, version: await this.versionInput(id, v) });
        continue;
      }
      if (base.versions.includes(v.number)) {
        this.resumeUpload(api, id, w);
        continue;
      }
      // Not synced yet but there: a share link uploaded it, or this state was lost. Anything else is a clash.
      if (w.contentKey && /^(video|panels):/.test(w.contentKey) && w.contentKey !== contentKey(v)) {
        throw new CloudError(`Version ${v.number} was also made on another computer, so this project stopped syncing. Copy it to a new project to keep both.`, false, 409);
      }
      base.versions.push(v.number);
      if (w.upload.state !== "ready") add.push({ number: v.number, version: await this.versionInput(id, v) });
    }
    if (!add.length) return;
    const { upload } = await api.syncAddVersions(id, add);
    for (const n of add.map((a) => a.number)) if (!base.versions.includes(n)) base.versions.push(n);
    for (const n of upload) this.upload(api, id, n);
  }

  /** Picks up an upload that failed, or that a process left half done. */
  private resumeUpload(api: CloudApi, id: string, w: WireVersion): void {
    if (w.upload.state === "ready" || this.uploads.has(`${id}:${w.number}`)) return;
    const wire = w as WireVersion & { updatedAt?: string };
    const stalled = w.upload.state === "uploading" && (!wire.updatedAt || Date.now() - Date.parse(wire.updatedAt) > STALLED_UPLOAD_MS);
    if (w.upload.state === "failed" || stalled) this.upload(api, id, w.number);
  }

  private sourceZip(id: string, number: number): string {
    return path.join(this.syncDir(id), `v${number}-source.zip`);
  }

  /** What the cloud keeps about a version, and how many bytes go up with it. Packs its source folder when it has one. */
  private async versionInput(id: string, v: ReviewVersion): Promise<VersionInput> {
    let total = 0;
    const files = v.panels?.length
      ? v.panels.map((_, i) => this.local.panelFileFor(id, v, i + 1))
      : [this.local.videoFileFor(id, v)];
    for (const file of files) {
      if (!file) continue;
      const bytes = fs.statSync(file).size;
      if (bytes > MAX_UPLOAD_BYTES) throw new CloudError(`${path.basename(file)} is larger than 5 GB, which FrameJam Cloud doesn't take yet.`, false, 400);
      total += bytes;
    }
    const source = await this.packSource(id, v);
    if (source) total += source.bytes;
    const transcript = this.local.transcriptFor(id, v);
    return {
      note: v.note,
      notes: v.notes,
      source,
      contentKey: contentKey(v),
      videoPath: v.videoPath,
      panelsDir: v.panelsDir,
      panelMeta: v.panels?.map((p) => ({ sourcePath: p.sourcePath, title: p.title, caption: p.caption })),
      total,
      transcript: transcript ? { json: JSON.stringify(transcript), sourcePath: v.transcript?.sourcePath, words: transcript.words.length } : undefined,
    };
  }

  private async packSource(id: string, v: ReviewVersion): Promise<{ filename: string; bytes: number } | undefined> {
    if (!v.sourcePath) return undefined;
    const out = this.sourceZip(id, v.number);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    let filename: string;
    let bytes: number;
    try {
      const stat = fs.statSync(v.sourcePath);
      if (stat.isFile()) {
        bytes = checkZip(v.sourcePath).bytes;
        fs.copyFileSync(v.sourcePath, out, fs.constants.COPYFILE_FICLONE);
        filename = path.basename(v.sourcePath);
      } else {
        const packed = await zipFolder(v.sourcePath, out, { skip: [v.videoPath ?? ""].filter(Boolean), maxBytes: MAX_SOURCE_BYTES });
        bytes = packed.bytes;
        filename = `${path.basename(v.sourcePath) || "project"}-source.zip`;
      }
    } catch {
      // The folder is gone or too big: the version syncs without it.
      fs.rmSync(out, { force: true });
      return undefined;
    }
    this.local.change(id, (r) => {
      const at = r.versions.find((x) => x.number === v.number);
      if (at) at.source = { filename, bytes, ready: false };
    });
    return { filename, bytes };
  }

  private upload(api: CloudApi, id: string, number: number): void {
    const key = `${id}:${number}`;
    if (this.uploads.has(key)) return;
    const job = this.runUpload(api, id, number)
      .catch(async (err) => {
        const message = err instanceof Error ? err.message : String(err);
        await api.versionFailed(id, number, message).catch(() => {});
      })
      .finally(() => {
        this.uploads.delete(key);
        this.progress.delete(id);
      });
    this.uploads.set(key, job);
  }

  /** Resolves when a version's files are in the cloud. Throws when its upload failed. */
  async waitForUpload(reviewId: string, number: number, timeoutMs = 15 * 60_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    await this.sync(reviewId);
    for (;;) {
      await this.uploads.get(`${reviewId}:${number}`);
      const w = (await this.api()?.api.get(reviewId))?.versions.find((v) => v.number === number);
      if (!w) throw new Error(`Version ${number} isn't in FrameJam Cloud yet.`);
      if (w.upload.state === "ready") return;
      if (w.upload.state === "failed") throw new Error(`Version ${number} didn't finish uploading (${w.upload.error ?? "upload failed"}).`);
      if (Date.now() > deadline) throw new Error(`Version ${number} is still uploading. Try again in a minute.`);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  private async putOne(api: CloudApi, file: string, kind: "render" | "panel" | "poster" | "source", onBytes?: (sent: number) => void, extra: { posterKey?: string } = {}) {
    const mime = mimeFor(file);
    const ticket = await api.requestUpload({ filename: path.basename(file), mime, kind, bytes: fs.statSync(file).size });
    const bytes = await putFile(ticket.uploadUrl, file, mime, this.fetchFn, onBytes, { attempts: 3, retryDelayMs: this.retryDelayMs });
    const { assetId } = await api.registerUpload({ storageKey: ticket.storageKey, bytes, mime, ...extra });
    return { assetId, storageKey: ticket.storageKey };
  }

  private async runUpload(api: CloudApi, id: string, number: number): Promise<void> {
    const version = this.local.getReview(id).versions.find((v) => v.number === number);
    if (!version) return;
    const zip = this.sourceZip(id, number);
    const files = version.panels?.length
      ? version.panels.map((_, i) => this.local.panelFileFor(id, version, i + 1))
      : [this.local.videoFileFor(id, version)];
    const total = files.reduce((n, f) => n + (f ? fs.statSync(f).size : 0), 0) + (fileExists(zip) ? fs.statSync(zip).size : 0);

    let done = 0;
    let lastAt = 0;
    const report = (current: number, force = false) => {
      const bytes = Math.min(total, done + current);
      this.progress.set(id, { version: number, bytes, total });
      const now = Date.now();
      if (!force && now - lastAt < PROGRESS_EVERY_MS) return;
      lastAt = now;
      api.uploadProgress(id, number, bytes).catch(() => {});
    };
    report(0, true);

    let sourceAssetId: string | undefined;
    if (version.source && fileExists(zip)) {
      sourceAssetId = (await this.putOne(api, zip, "source", (sent) => report(sent))).assetId;
      done += fs.statSync(zip).size;
      report(0, true);
    }

    if (version.panels?.length) {
      const assetIds: string[] = [];
      for (const [i, file] of files.entries()) {
        if (!file) throw new Error(`Panel ${i + 1} of version ${number} isn't on this computer any more.`);
        const { assetId } = await this.putOne(api, file, "panel", (sent) => report(sent));
        done += fs.statSync(file).size;
        report(0, true);
        assetIds.push(assetId);
      }
      await api.versionReady(id, number, { panelAssetIds: assetIds, sourceAssetId });
    } else {
      const render = files[0];
      if (!render) throw new Error(`The render of version ${number} isn't on this computer any more.`);
      let posterKey: string | undefined;
      const poster = this.local.posterFile(id, number) ?? (await this.makePoster(id, number, render));
      if (poster) {
        try {
          posterKey = (await this.putOne(api, poster, "poster")).storageKey;
        } catch {
          // A poster is nice to have; the video is what the version needs.
        }
      }
      const { assetId } = await this.putOne(api, render, "render", (sent) => report(sent), { posterKey });
      await api.versionReady(id, number, { videoAssetId: assetId, sourceAssetId });
    }
    if (version.source) {
      this.local.change(id, (r) => {
        const at = r.versions.find((x) => x.number === number);
        if (at?.source) at.source.ready = true;
      });
      fs.rmSync(zip, { force: true });
    }
  }

  private async makePoster(id: string, number: number, render: string): Promise<string | undefined> {
    try {
      const jpeg = await this.posterFrame(render);
      return jpeg ? this.local.savePoster(id, number, jpeg) : undefined;
    } catch {
      return undefined;
    }
  }

  /** A version's source download: only synced projects have one. */
  async sourceFor(reviewId: string, number: number): Promise<{ url: string; filename: string; bytes: number } | undefined> {
    const version = this.local.findReview(reviewId)?.versions.find((v) => v.number === number);
    if (!version?.source) return undefined;
    const session = this.api();
    if (!session) throw new Error("Sign in to download the source files: framejam login");
    if (!version.source.ready) throw new Error(`The source files of version ${number} are still uploading. Try again in a minute.`);
    return session.api.sourceUrl(reviewId, number);
  }

  // --- Comments -------------------------------------------------------------------------------------------------

  private async syncComments(api: CloudApi, id: string, wire: WireReview, base: Base): Promise<void> {
    const review = this.local.getReview(id);
    const byRow = new Map(wire.comments.map((c) => [c.id, c]));
    const byCloudId = new Map(wire.comments.filter((c) => c.cloudId).map((c) => [c.cloudId!, c]));
    const matched = new Set<string>();
    const push: SyncComment[] = [];
    const frames: { local: ReviewComment; row?: string }[] = [];

    for (const lc of review.comments) {
      const was = base.comments[lc.id];
      const wc = was ? byRow.get(was.row) : (byCloudId.get(lc.id) ?? (lc.cloudId ? (byRow.get(lc.cloudId) ?? byCloudId.get(lc.cloudId)) : undefined));
      if (wc) matched.add(wc.id);
      if (was && !wc) {
        // Deleted in the cloud (only drafts can be).
        if (lc.status === "draft") this.local.deleteComment(id, lc.id);
        delete base.comments[lc.id];
        continue;
      }
      if (!wc) {
        push.push(this.syncComment(lc));
        if (lc.thumbnail) frames.push({ local: lc });
        continue;
      }
      const localEdit = was ? lc.text !== was.text : lc.text !== wc.text;
      const cloudEdit = was ? wc.text !== was.text : false;
      let text = lc.text;
      const moved = lc.status === "draft" && wc.status === "draft" && lc.version !== wc.version;
      const resolveUp = lc.status === "resolved" && wc.status !== "resolved";
      if ((localEdit && lc.status === "draft" && wc.status === "draft") || resolveUp || moved) {
        push.push({ ...this.syncComment(lc), row: wc.id });
      } else if (cloudEdit && lc.status === "draft") {
        this.local.updateComment(id, lc.id, { text: wc.text });
        text = wc.text;
      }
      if (wc.status === "resolved" && lc.status !== "resolved") {
        this.local.change(id, (r) => {
          const c = r.comments.find((x) => x.id === lc.id);
          if (!c) return;
          c.status = "resolved";
          c.resolvedAt = wc.resolvedAt;
          c.resolution = wc.resolution;
        });
      }
      if (lc.thumbnail && !wc.thumbnail && !wc.frameUrl && !was?.frame) frames.push({ local: lc, row: wc.id });
      if (!lc.thumbnail && wc.frameUrl) await this.pullFrame(id, lc.id, wc.frameUrl);
      base.comments[lc.id] = { row: wc.id, text, resolved: lc.status === "resolved" || wc.status === "resolved", frame: Boolean(lc.thumbnail || wc.frameUrl) || Boolean(was?.frame) };
    }

    // Deleted here: remove the cloud copy too while it's still a draft there.
    const local = new Set(review.comments.map((c) => c.id));
    for (const [localId, was] of Object.entries(base.comments)) {
      if (local.has(localId)) continue;
      const wc = byRow.get(was.row);
      if (wc?.status === "draft") await api.deleteComment(id, wc.id).catch(() => {});
      if (wc) matched.add(wc.id);
      delete base.comments[localId];
    }

    if (push.length) {
      const { ids } = await api.syncPutComments(id, push);
      for (const c of push) {
        const row = ids[c.id];
        if (!row) continue;
        const lc = review.comments.find((x) => x.id === c.id)!;
        matched.add(row);
        base.comments[c.id] = { row, text: lc.text, resolved: lc.status === "resolved", frame: base.comments[c.id]?.frame ?? false };
      }
    }
    for (const f of frames) {
      const row = f.row ?? base.comments[f.local.id]?.row;
      if (row && (await this.pushFrame(api, id, f.local, row))) base.comments[f.local.id].frame = true;
    }

    // New in the cloud: drafts from the phone, guest comments, a web chat's history.
    for (const wc of wire.comments) {
      if (matched.has(wc.id)) continue;
      const lc = this.importComment(id, wc);
      if (wc.frameUrl) await this.pullFrame(id, lc.id, wc.frameUrl);
      base.comments[lc.id] = { row: wc.id, text: wc.text, resolved: wc.status === "resolved", frame: Boolean(wc.frameUrl) };
    }
  }

  private syncComment(c: ReviewComment): SyncComment {
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
      status: c.status,
      sentAt: ms(c.sentAt),
      resolvedAt: ms(c.resolvedAt),
      resolution: c.resolution,
      author: c.author,
      fromVersion: c.fromVersion,
    };
  }

  private importComment(id: string, wc: WireComment): ReviewComment {
    const comment: ReviewComment = {
      id: newId("c"),
      version: wc.version,
      kind: wc.kind,
      time: wc.time,
      endTime: wc.endTime,
      x: wc.x,
      y: wc.y,
      panel: wc.panel,
      wholeVideo: wc.wholeVideo,
      text: wc.text,
      status: wc.status,
      createdAt: wc.createdAt,
      sentAt: wc.sentAt,
      resolvedAt: wc.resolvedAt,
      resolution: wc.resolution,
      author: wc.author,
      cloudId: wc.id,
      fromVersion: wc.fromVersion,
    };
    this.local.change(id, (r) => {
      r.comments.push(comment);
    });
    return comment;
  }

  private async pullFrame(id: string, commentId: string, url: string): Promise<void> {
    const jpeg = await this.fetchBytes(url);
    if (jpeg) this.local.saveThumbnail(id, commentId, jpeg);
  }

  private async pushFrame(api: CloudApi, id: string, c: ReviewComment, row: string): Promise<boolean> {
    try {
      const jpeg = c.thumbnail ? this.local.readThumbnail(id, c.thumbnail) : undefined;
      if (!jpeg) return false;
      const ticket = await api.requestUpload({ filename: `${c.id}.jpg`, mime: "image/jpeg", kind: "frame", bytes: jpeg.byteLength });
      const res = await this.fetchFn(ticket.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: jpeg as BodyInit });
      if (!res.ok) return false;
      const { assetId } = await api.registerUpload({ storageKey: ticket.storageKey, bytes: jpeg.byteLength, mime: "image/jpeg" });
      await api.setCommentFrame(id, row, assetId);
      return true;
    } catch {
      return false;
    }
  }

  // --- Rounds ---------------------------------------------------------------------------------------------------

  private async syncBatches(api: CloudApi, id: string, wire: WireReview, base: Base): Promise<void> {
    let review = this.local.getReview(id);
    const byRow = new Map(wire.batches.map((b) => [b.id, b]));
    const matched = new Set(Object.values(base.batches).map((b) => b.row));
    const rowOf = (localId: string) => base.comments[localId]?.row;
    const cloudLatest = wire.versions.at(-1);

    for (const lb of review.batches) {
      const was = base.batches[lb.id];
      const wb = was ? byRow.get(was.row) : undefined;
      if (was && !wb) {
        // Reopened in the cloud before the agent got it.
        if (review.versions.at(-1)?.batchId === lb.id && !lb.deliveredAt) this.local.reopen(id);
        delete base.batches[lb.id];
        continue;
      }
      if (!was) {
        if (lb.retractedAt) continue;
        const rows = lb.commentIds.map(rowOf);
        if (rows.some((r) => !r)) continue;
        const version = review.versions.find((v) => v.batchId === lb.id)?.number ?? review.comments.find((c) => c.id === lb.commentIds[0])?.version;
        if (version === undefined) continue;
        const { id: row } = await api.syncPutBatch(id, {
          id: lb.id,
          version,
          comments: rows as string[],
          message: lb.message,
          sentAt: ms(lb.createdAt),
          deliveredAt: ms(lb.deliveredAt),
        });
        matched.add(row);
        base.batches[lb.id] = { row, delivered: Boolean(lb.deliveredAt), retracted: false };
        continue;
      }
      if (lb.deliveredAt && !wb!.deliveredAt) await api.markDelivered(id, [wb!.id]);
      if (wb!.deliveredAt && !lb.deliveredAt) this.local.markDelivered(id, [lb.id]);
      if (lb.retractedAt && !wb!.retractedAt && cloudLatest?.batchId === wb!.id) await api.reopen(id);
      if (wb!.retractedAt && !lb.retractedAt && review.versions.at(-1)?.batchId === lb.id) this.local.reopen(id);
      base.batches[lb.id] = { row: wb!.id, delivered: Boolean(lb.deliveredAt || wb!.deliveredAt), retracted: Boolean(lb.retractedAt || wb!.retractedAt) };
    }

    // Reopened here before the agent got it: the batch is gone, so reopen the cloud's too.
    const local = new Set(review.batches.map((b) => b.id));
    for (const [localId, was] of Object.entries(base.batches)) {
      if (local.has(localId)) continue;
      const wb = byRow.get(was.row);
      if (wb && !wb.deliveredAt && cloudLatest?.batchId === wb.id) await api.reopen(id);
      delete base.batches[localId];
    }

    // Finished somewhere else (the phone, the web app): the same round here.
    review = this.local.getReview(id);
    const localOf = new Map(Object.entries(base.comments).map(([localId, c]) => [c.row, localId]));
    for (const wb of wire.batches) {
      if (matched.has(wb.id) || wb.retractedAt) continue;
      const commentIds = wb.commentIds.map((row) => localOf.get(row));
      if (commentIds.some((c) => !c)) continue;
      const version = wire.versions.find((v) => v.batchId === wb.id);
      const batch: FeedbackBatch = {
        id: newId("batch"),
        createdAt: wb.createdAt,
        commentIds: commentIds as string[],
        message: wb.message,
        deliveredAt: wb.deliveredAt,
        replaces: wb.replaces,
      };
      this.local.change(id, (r) => {
        r.batches.push(batch);
        for (const c of r.comments) {
          if (!batch.commentIds.includes(c.id)) continue;
          if (c.status === "draft") c.status = "sent";
          c.sentAt ??= wb.createdAt;
          c.batchId = batch.id;
        }
        const v = version && r.versions.find((x) => x.number === version.number);
        if (v && !v.sentAt) {
          v.sentAt = wb.createdAt;
          v.batchId = batch.id;
          delete v.reopenedFrom;
        }
      });
      base.batches[batch.id] = { row: wb.id, delivered: Boolean(wb.deliveredAt), retracted: false };
    }
  }

  /** The phone shows "Your agent is listening" while the agent here waits for feedback. */
  private async forwardListening(api: CloudApi, id: string): Promise<void> {
    const listening = this.local.agentListening(id);
    const last = this.waiting.get(id);
    if (listening) {
      if (last && Date.now() - last < 4_000) return;
      this.waiting.set(id, Date.now());
      await api.setWaiting(id, true).catch(() => {});
    } else if (last) {
      this.waiting.delete(id);
      await api.setWaiting(id, false).catch(() => {});
    }
  }

  // --- Projects only in the cloud -------------------------------------------------------------------------------

  /** Projects started somewhere else (the phone, a web chat, another computer) come to this computer too. */
  private async importNew(api: CloudApi, index?: Awaited<ReturnType<CloudApi["syncIndex"]>>): Promise<void> {
    const list = index ?? (await api.syncIndex());
    const settings = readSync(this.local.root);
    for (const item of list) {
      if (this.local.findReview(item.id) || settings.optOut.includes(item.id) || !item.versions) continue;
      if (this.running.has(item.id) || this.importing.has(item.id)) continue;
      this.importing.add(item.id);
      try {
        if (await this.importProject(api, item.id)) await this.sync(item.id);
      } catch (err) {
        this.errors.set(item.id, { message: err instanceof Error ? err.message : String(err), at: Date.now(), offline: !refused(err) });
      } finally {
        this.importing.delete(item.id);
      }
    }
  }

  /** Makes the project here with its first version; the next pass brings the rest. False while v1 is still uploading. */
  private async importProject(api: CloudApi, id: string): Promise<boolean> {
    const wire = await api.get(id);
    const first = wire?.versions[0];
    if (!wire || !first || first.upload.state !== "ready") return false;
    const media = await this.download(id, first);
    try {
      this.local.importReview(id, { title: wire.title, projectKey: wire.projectKey, playbookId: wire.playbookId, styleId: wire.styleId }, { ...media, note: first.note, notes: first.notes });
    } finally {
      this.cleanIncoming(id);
    }
    await this.adoptPulled(api, id, first);
    const session = this.api();
    const base: Base = {
      account: session?.account ?? "",
      title: wire.title,
      playbookId: wire.playbookId,
      styleId: wire.styleId,
      versions: [1],
      comments: {},
      batches: {},
    };
    this.writeBase(id, base);
    return true;
  }

  // --- State --------------------------------------------------------------------------------------------------------

  private baseFile(id: string): string {
    return path.join(this.local.root, "sync", `${id}.json`);
  }

  private readBase(id: string): Base | undefined {
    try {
      return JSON.parse(fs.readFileSync(this.baseFile(id), "utf8")) as Base;
    } catch {
      return undefined;
    }
  }

  private writeBase(id: string, base: Base): void {
    const file = this.baseFile(id);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(base, null, 2));
    fs.renameSync(tmp, file);
  }

  private dropBase(id: string): void {
    fs.rmSync(this.baseFile(id), { force: true });
    fs.rmSync(this.syncDir(id), { recursive: true, force: true });
  }
}

