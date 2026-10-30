import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { FeedbackBatch, PickKind, Review, ReviewComment, ReviewVersion, VideoPick } from "../core/types.ts";
import type { Transcript } from "../core/transcript.ts";
import { safeJoin } from "./files.ts";
import { type CatalogConfig, type CatalogSnapshot, catalogConfig, readSnapshot } from "./catalog.ts";
import { catalogDir, dataDir, setupInfo } from "./paths.ts";
import { PlaybookLibrary } from "./playbooks.ts";
import { type LoadedTranscript, loadTranscript, panelsKey, defaultTitle, resolveMedia, type ResolvedMedia } from "./media.ts";
import { PresetLibrary } from "./presets.ts";
import { VERSION } from "./version.ts";
import {
  type AppState,
  isPickListening,
  LISTEN_GRACE_MS,
  type MediaInput,
  type NewCommentInput,
  type OpenReviewInput,
  PICK_IDLE_MS,
  type PicksChoice,
  type Store,
  StoreError,
} from "../core/store.ts";

const now = () => new Date().toISOString();

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(5).toString("hex")}`;
}

const hashCache = new Map<string, { mtimeMs: number; hash: string }>();

/** Content hash of a file, cached until its mtime changes (rebuilds rewrite files even when nothing changed). */
function fileHash(file: string): string {
  const { mtimeMs } = fs.statSync(file);
  const cached = hashCache.get(file);
  if (cached?.mtimeMs === mtimeMs) return cached.hash;
  const hash = createHash("sha1").update(fs.readFileSync(file)).digest("hex");
  hashCache.set(file, { mtimeMs, hash });
  return hash;
}

/** The script this process was started from, hashed at startup: the code it is actually running. */
const LOADED_ENTRY = (() => {
  if (!process.argv[1]) return undefined;
  const file = path.resolve(process.argv[1]);
  try {
    return { file, hash: fileHash(file) };
  } catch {
    return undefined;
  }
})();

function writeJsonAtomic(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(3).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

/**
 * JSON-file store. Every call re-reads from disk so several FrameJam processes
 * (e.g. one stdio MCP server per harness plus the web server) stay consistent.
 */
export class JsonStore implements Store {
  readonly root: string;
  readonly presets: PresetLibrary;
  readonly playbooks: PlaybookLibrary;

  constructor(root = dataDir(), options: { catalog?: CatalogConfig } = {}) {
    this.root = root;
    fs.mkdirSync(this.reviewsDir, { recursive: true });
    this.presets = PresetLibrary.forStore(this.userPresetsDir, this.catalogReader(options.catalog));
    this.playbooks = PlaybookLibrary.forStore(this.userPlaybooksDir, this.catalogReader(options.catalog));
  }

  /** Reads the downloaded catalog, or nothing when it's switched off (so the bundled playbooks show alone). */
  private catalogReader(config: CatalogConfig = catalogConfig()): (() => CatalogSnapshot | undefined) | undefined {
    if (!config.enabled) return undefined;
    return () => readSnapshot(catalogDir(this.root), { appVersion: VERSION, extraKeys: config.extraKeys });
  }

  get reviewsDir() {
    return path.join(this.root, "reviews");
  }

  get userPresetsDir() {
    return path.join(this.root, "presets");
  }

  get userPlaybooksDir() {
    return path.join(this.root, "playbooks");
  }

  private reviewFile(id: string) {
    if (!/^[\w-]+$/.test(id)) throw new StoreError(`Invalid review id: ${id}`);
    return path.join(this.reviewsDir, `${id}.json`);
  }

  thumbsDir(reviewId: string) {
    return path.join(this.reviewsDir, reviewId, "thumbs");
  }

  listReviews(): Review[] {
    if (!fs.existsSync(this.reviewsDir)) return [];
    return fs
      .readdirSync(this.reviewsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => readJson<Review>(path.join(this.reviewsDir, f)))
      .filter((r): r is Review => Boolean(r))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  findReview(id: string): Review | undefined {
    return readJson<Review>(this.reviewFile(id));
  }

  getReview(id: string): Review {
    const review = this.findReview(id);
    if (!review) throw new StoreError(`Review not found: ${id}`, 404);
    return review;
  }

  /** Changes whenever the review or its listening heartbeat changes. */
  reviewMtime(id: string): number {
    const mtime = (file: string) => {
      try {
        return fs.statSync(file).mtimeMs;
      } catch {
        return 0;
      }
    };
    return mtime(this.reviewFile(id)) + mtime(this.listeningFile(id));
  }

  private save(review: Review): Review {
    review.updatedAt = now();
    writeJsonAtomic(this.reviewFile(review.id), review);
    return review;
  }

  private update(id: string, fn: (review: Review) => void): Review {
    const review = this.getReview(id);
    fn(review);
    return this.save(review);
  }

  /**
   * Opens a review. Re-opening the same project (same panelsDir for a storyboard, otherwise the same title)
   * appends a new version instead.
   */
  openReview(input: OpenReviewInput): { review: Review; version: ReviewVersion; created: boolean } {
    const media = resolveMedia(input);
    const transcript = loadTranscript(input.transcriptPath, media);
    const title = (input.title ?? "").trim().toLowerCase();
    const projectKey = media.panelsDir ? `panels:${media.panelsDir}` : `title:${title}`;
    const keyed = Boolean(media.panelsDir || title);
    let existing = input.reviewId ? this.getReview(input.reviewId) : undefined;
    if (!existing && keyed) {
      const reviews = this.listReviews();
      // Projects from before videos were mp4-only are keyed by their composition folder: match those by title.
      existing =
        reviews.find((r) => r.projectKey === projectKey) ??
        (title && !media.panelsDir ? reviews.find((r) => path.isAbsolute(r.projectKey) && r.title.trim().toLowerCase() === title) : undefined);
    }
    if (existing) {
      const latest = existing.versions.at(-1);
      const unchanged =
        latest &&
        latest.videoPath === media.videoPath &&
        panelsKey(latest.panels) === panelsKey(media.panels) &&
        !latest.sentAt;
      if (unchanged && latest) {
        // Re-opening with identical media is idempotent until feedback has been sent on it.
        if (!transcript) return { review: existing, version: latest, created: false };
        const review = this.setTranscript(existing.id, latest.number, transcript.transcript, transcript.sourcePath);
        return { review, version: review.versions.at(-1)!, created: false };
      }
      const review = this.addResolvedVersion(existing.id, media, input.note, transcript);
      if (input.title && input.title !== review.title) {
        review.title = input.title;
        this.save(review);
      }
      return { review, version: review.versions.at(-1)!, created: false };
    }
    const version: ReviewVersion = { number: 1, ...media, note: input.note, createdAt: now() };
    const id = newId("rev");
    this.snapshotVideo(id, version);
    this.snapshotPanels(id, version);
    if (transcript) this.writeTranscript(id, version, transcript.transcript, transcript.sourcePath);
    const review: Review = {
      id,
      title: input.title?.trim() || defaultTitle(media),
      projectKey: keyed ? projectKey : newId("project"),
      createdAt: now(),
      updatedAt: now(),
      versions: [version],
      comments: [],
      batches: [],
    };
    this.save(review);
    return { review, version, created: true };
  }

  /**
   * Adds the next version. With no media at all, a storyboard re-reads its panelsDir (keeping titles and
   * captions for files that are still there); a video needs its new render.
   */
  addVersion(reviewId: string, input: MediaInput & { note?: string }): Review {
    const prev = this.getReview(reviewId).versions.at(-1);
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
    return this.addResolvedVersion(reviewId, media, input.note, loadTranscript(input.transcriptPath, media));
  }

  private addResolvedVersion(reviewId: string, media: ResolvedMedia, note?: string, transcript?: LoadedTranscript): Review {
    return this.update(reviewId, (review) => {
      const prev = review.versions.at(-1);
      const version: ReviewVersion = {
        number: (prev?.number ?? 0) + 1,
        ...media,
        note,
        createdAt: now(),
      };
      this.snapshotVideo(reviewId, version);
      this.snapshotPanels(reviewId, version);
      if (transcript) this.writeTranscript(reviewId, version, transcript.transcript, transcript.sourcePath);
      // Comments belong to the version they were written on. Unsent ones (the agent shipped a new
      // version before the user pressed Send) move forward so they aren't stranded on an old version.
      for (const c of review.comments) {
        if (c.status !== "draft" || !prev || c.version !== prev.number) continue;
        if (c.cloudId && c.fromVersion === undefined) c.fromVersion = c.version;
        c.version = version.number;
      }
      review.versions.push(version);
    });
  }

  /** Copies the render so v1 stays watchable after the agent overwrites the mp4 for v2. Clones where the disk supports it (APFS, Btrfs), so an unchanged render takes no extra space. */
  private snapshotVideo(reviewId: string, version: ReviewVersion) {
    if (!version.videoPath) return;
    const dir = path.join(this.reviewsDir, reviewId, "versions");
    fs.mkdirSync(dir, { recursive: true });
    const file = `v${version.number}${path.extname(version.videoPath) || ".mp4"}`;
    fs.copyFileSync(version.videoPath, path.join(dir, file), fs.constants.COPYFILE_FICLONE);
    version.videoSnapshot = file;
  }

  /** Copies each panel image so earlier storyboard versions keep their pictures when the agent overwrites files. */
  private snapshotPanels(reviewId: string, version: ReviewVersion) {
    if (!version.panels?.length) return;
    const rel = `v${version.number}-panels`;
    const dir = path.join(this.reviewsDir, reviewId, "versions", rel);
    fs.mkdirSync(dir, { recursive: true });
    const pad = String(version.panels.length).length;
    version.panels.forEach((p, i) => {
      const file = `${String(i + 1).padStart(Math.max(2, pad), "0")}${path.extname(p.sourcePath).toLowerCase()}`;
      fs.copyFileSync(p.sourcePath, path.join(dir, file), fs.constants.COPYFILE_FICLONE);
      p.image = `${rel}/${file}`;
    });
  }

  panelFileFor(reviewId: string, version: ReviewVersion, panel: number): string | undefined {
    const p = version.panels?.[panel - 1];
    if (!p) return undefined;
    const snap = p.image ? path.join(this.reviewsDir, reviewId, "versions", p.image) : undefined;
    if (snap && fs.existsSync(snap)) return snap;
    return fs.existsSync(p.sourcePath) ? p.sourcePath : undefined;
  }

  videoFileFor(reviewId: string, version: ReviewVersion): string | undefined {
    if (version.videoSnapshot) {
      const snap = path.join(this.reviewsDir, reviewId, "versions", version.videoSnapshot);
      if (fs.existsSync(snap)) return snap;
    }
    return version.videoPath && fs.existsSync(version.videoPath) ? version.videoPath : undefined;
  }

  private writeTranscript(reviewId: string, version: ReviewVersion, transcript: Transcript, sourcePath?: string) {
    const file = `v${version.number}-transcript.json`;
    writeJsonAtomic(path.join(this.reviewsDir, reviewId, "versions", file), transcript);
    version.transcript = { file, sourcePath, words: transcript.words.length };
  }

  transcriptFor(reviewId: string, version: ReviewVersion): Transcript | undefined {
    if (!version.transcript) return undefined;
    const file = safeJoin(path.join(this.reviewsDir, reviewId, "versions"), version.transcript.file);
    return file ? readJson<Transcript>(file) : undefined;
  }

  setTranscript(reviewId: string, versionNumber: number, transcript: Transcript, sourcePath?: string): Review {
    return this.update(reviewId, (review) => {
      const version = review.versions.find((v) => v.number === versionNumber);
      if (!version) throw new StoreError(`Unknown version ${versionNumber}`, 404);
      if (version.panels?.length) throw new StoreError("Transcripts are for videos, not storyboards");
      this.writeTranscript(reviewId, version, transcript, sourcePath);
    });
  }

  private posterPath(reviewId: string, version: number) {
    this.reviewFile(reviewId);
    return path.join(this.reviewsDir, reviewId, `poster-v${version}.jpg`);
  }

  posterFile(reviewId: string, version: number): string | undefined {
    const file = this.posterPath(reviewId, version);
    return fs.existsSync(file) ? file : undefined;
  }

  savePoster(reviewId: string, version: number, jpeg: Uint8Array): string {
    const file = this.posterPath(reviewId, version);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, jpeg);
    return file;
  }

  addComment(reviewId: string, input: NewCommentInput): ReviewComment {
    const text = input.text?.trim();
    if (!text) throw new StoreError("Comment text is required");
    let comment!: ReviewComment;
    this.update(reviewId, (review) => {
      const already = input.cloudId ? review.comments.find((c) => c.cloudId === input.cloudId) : undefined;
      if (already) {
        comment = already;
        return;
      }
      const latest = review.versions.at(-1)!;
      const version = input.version ?? latest.number;
      if (!review.versions.some((v) => v.number === version)) {
        throw new StoreError(`Unknown version ${version}`);
      }
      if (version !== latest.number) {
        throw new StoreError(`Version ${version} is not the latest; comment on version ${latest.number}`);
      }
      if (latest.sentAt) {
        throw new StoreError(`Version ${version} was already sent; comment on the next version`);
      }
      const panels = latest.panels?.length ?? 0;
      if (panels && !input.wholeVideo) {
        if (!Number.isInteger(input.panel) || input.panel! < 1 || input.panel! > panels) {
          throw new StoreError(`Pick a panel between 1 and ${panels}, or comment on the whole storyboard`);
        }
      }
      const panel = panels && !input.wholeVideo ? input.panel : undefined;
      const hasPin = input.x !== undefined && input.y !== undefined;
      const hasRange = !panels && input.endTime !== undefined && input.endTime > (input.time ?? 0);
      comment = {
        id: newId("c"),
        version,
        kind: input.wholeVideo ? "general" : panels ? (hasPin ? "pin" : "panel") : hasRange ? "range" : (input.kind ?? "pin"),
        time: round(input.wholeVideo || panels ? 0 : Math.max(0, input.time ?? 0)),
        endTime: hasRange && !input.wholeVideo ? round(input.endTime!) : undefined,
        x: input.wholeVideo ? undefined : clamp01(input.x),
        y: input.wholeVideo ? undefined : clamp01(input.y),
        panel,
        wholeVideo: input.wholeVideo || undefined,
        text,
        status: "draft",
        createdAt: now(),
        author: input.author?.trim() || undefined,
        cloudId: input.cloudId || undefined,
        fromVersion: input.fromVersion !== undefined && input.fromVersion !== version ? input.fromVersion : undefined,
      };
      review.comments.push(comment);
    });
    return comment;
  }

  updateComment(reviewId: string, commentId: string, patch: { text?: string; thumbnail?: string }): ReviewComment {
    let updated!: ReviewComment;
    this.update(reviewId, (review) => {
      const c = review.comments.find((x) => x.id === commentId);
      if (!c) throw new StoreError(`Comment not found: ${commentId}`, 404);
      if (patch.text !== undefined) {
        if (c.status !== "draft") throw new StoreError("This comment was already sent and can't be edited");
        if (!patch.text.trim()) throw new StoreError("Comment text is required");
        c.text = patch.text.trim();
      }
      if (patch.thumbnail !== undefined) c.thumbnail = patch.thumbnail;
      updated = c;
    });
    return updated;
  }

  deleteComment(reviewId: string, commentId: string) {
    this.update(reviewId, (review) => {
      const c = review.comments.find((x) => x.id === commentId);
      if (!c) throw new StoreError(`Comment not found: ${commentId}`, 404);
      if (c.status !== "draft") throw new StoreError("This comment was already sent and can't be deleted");
      review.comments = review.comments.filter((x) => x.id !== commentId);
    });
    fs.rmSync(path.join(this.thumbsDir(reviewId), `${commentId}.jpg`), { force: true });
  }

  saveThumbnail(reviewId: string, commentId: string, jpeg: Uint8Array): string {
    const file = `${commentId}.jpg`;
    fs.mkdirSync(this.thumbsDir(reviewId), { recursive: true });
    fs.writeFileSync(path.join(this.thumbsDir(reviewId), file), jpeg);
    this.updateComment(reviewId, commentId, { thumbnail: file });
    return file;
  }

  thumbnailFile(reviewId: string, file: string): string | null | undefined {
    const full = safeJoin(this.thumbsDir(reviewId), file);
    if (!full) return null;
    return fs.existsSync(full) && fs.statSync(full).isFile() ? full : undefined;
  }

  readThumbnail(reviewId: string, file: string): Buffer | undefined {
    const full = this.thumbnailFile(reviewId, file);
    return full ? fs.readFileSync(full) : undefined;
  }

  /**
   * "Finish review": the latest version's comments go to the agent as one batch, and the version
   * is locked. The next round of comments happens on the agent's next version.
   */
  submit(reviewId: string, message?: string): FeedbackBatch {
    let batch!: FeedbackBatch;
    this.update(reviewId, (review) => {
      const latest = review.versions.at(-1)!;
      if (latest.sentAt) throw new StoreError(`Version ${latest.number} was already sent`);
      const drafts = review.comments.filter((c) => c.status === "draft" && c.version === latest.number);
      if (!drafts.length) throw new StoreError("Nothing to send: add a comment first");
      batch = {
        id: newId("b"),
        createdAt: now(),
        commentIds: drafts.map((c) => c.id),
        message: message?.trim() || undefined,
        replaces: latest.reopenedFrom,
      };
      for (const c of drafts) {
        c.status = "sent";
        c.sentAt = batch.createdAt;
        c.batchId = batch.id;
      }
      latest.sentAt = batch.createdAt;
      latest.batchId = batch.id;
      delete latest.reopenedFrom;
      review.batches.push(batch);
    });
    return batch;
  }

  /**
   * Undoes "Finish review" on the latest version so its comments can be edited again. A batch the agent
   * hasn't picked up yet is simply withdrawn; one it already has is marked retracted, and the next
   * finish sends a batch that replaces it.
   */
  reopen(reviewId: string): { wasDelivered: boolean } {
    let wasDelivered = false;
    this.update(reviewId, (review) => {
      const latest = review.versions.at(-1)!;
      if (!latest.sentAt || !latest.batchId) throw new StoreError(`Version ${latest.number} isn't finished, so there's nothing to reopen`);
      const batchId = latest.batchId;
      const batch = review.batches.find((b) => b.id === batchId);
      for (const c of review.comments) {
        if (c.batchId !== batchId || c.status !== "sent") continue;
        c.status = "draft";
        delete c.sentAt;
        delete c.batchId;
      }
      delete latest.sentAt;
      delete latest.batchId;
      if (batch?.deliveredAt) {
        wasDelivered = true;
        batch.retractedAt = now();
        latest.reopenedFrom = batch.id;
      } else {
        review.batches = review.batches.filter((b) => b.id !== batchId);
        if (batch?.replaces) latest.reopenedFrom = batch.replaces;
      }
    });
    return { wasDelivered };
  }

  undeliveredBatches(reviewId: string): FeedbackBatch[] {
    return this.getReview(reviewId).batches.filter((b) => !b.deliveredAt);
  }

  markDelivered(reviewId: string, batchIds: string[]) {
    if (!batchIds.length) return;
    this.update(reviewId, (review) => {
      for (const b of review.batches) if (batchIds.includes(b.id) && !b.deliveredAt) b.deliveredAt = now();
    });
  }

  private listeningFile(reviewId: string) {
    return path.join(this.reviewsDir, reviewId, "listening.json");
  }

  /**
   * Heartbeat from wait_for_feedback, kept in its own file so it never races with comment writes.
   * The agent counts as listening for LISTEN_GRACE_MS after the last beat, which covers the gap
   * between one `pending` result and the agent's next call.
   */
  setAgentWaiting(reviewId: string, waiting: boolean) {
    if (!this.findReview(reviewId)) return;
    if (waiting) writeJsonAtomic(this.listeningFile(reviewId), { at: now(), pid: process.pid });
    else fs.rmSync(this.listeningFile(reviewId), { force: true });
  }

  agentListening(reviewId: string): boolean {
    try {
      const at = readJson<{ at: string }>(this.listeningFile(reviewId))?.at;
      return Boolean(at) && Date.now() - Date.parse(at!) < LISTEN_GRACE_MS;
    } catch {
      return false;
    }
  }

  resolveComments(reviewId: string, ids: string[], note?: string): { resolved: string[]; missing: string[] } {
    const resolved: string[] = [];
    const missing: string[] = [];
    this.update(reviewId, (review) => {
      const version = review.versions.at(-1)!.number;
      const all = ids.length === 1 && ids[0] === "all";
      const targets = all ? review.comments.filter((c) => c.status === "sent").map((c) => c.id) : ids;
      for (const id of targets) {
        const c = review.comments.find((x) => x.id === id);
        if (!c) {
          missing.push(id);
          continue;
        }
        c.status = "resolved";
        c.resolvedAt = now();
        c.resolution = { note: note?.trim() || undefined, version };
        resolved.push(id);
      }
    });
    return { resolved, missing };
  }

  private get stateFile() {
    return path.join(this.root, "state.json");
  }

  getState(): AppState {
    return readJson<AppState>(this.stateFile) ?? {};
  }

  /** Remembers which harness connected last, for the "Connected to Claude Code" line in the UI. */
  recordAgent(name: string | undefined, version?: string) {
    if (!name) return;
    const state = this.getState();
    state.agent = { name, version, at: now(), ...(LOADED_ENTRY && { entry: LOADED_ENTRY.file, build: LOADED_ENTRY.hash }) };
    writeJsonAtomic(this.stateFile, state);
  }

  /**
   * True when the agent's MCP process runs different code than is now on disk. Harnesses keep that
   * process alive across rebuilds, so it keeps running old code until the user restarts it.
   */
  agentOutdated(): boolean {
    const agent = this.getState().agent;
    if (!agent) return false;
    const file = agent.entry ?? setupInfo().cliPath;
    try {
      if (agent.build) return fileHash(file) !== agent.build;
      // Recorded before builds were hashed: fall back to "rebuilt after it connected".
      return fs.statSync(file).mtimeMs > Date.parse(agent.at);
    } catch {
      return false;
    }
  }

  // --- Picks: the agent asks the user to choose a playbook and/or style for one video ---

  get picksDir() {
    return path.join(this.root, "picks");
  }

  private pickFile(id: string) {
    if (!/^[\w-]+$/.test(id)) throw new StoreError(`Invalid pick id: ${id}`);
    return path.join(this.picksDir, `${id}.json`);
  }

  /** Starts a pick. Any older pick still waiting is cancelled, so the page only ever shows one. */
  createPick(kinds: PickKind[], title?: string): VideoPick {
    for (const p of this.listPicks()) if (p.status === "waiting") this.savePick({ ...p, status: "cancelled" });
    const pick: VideoPick = { id: newId("pick"), kinds, title: title?.trim() || undefined, createdAt: now(), status: "waiting" };
    this.savePick(pick);
    return pick;
  }

  getPick(id: string): VideoPick {
    const pick = readJson<VideoPick>(this.pickFile(id));
    if (!pick) throw new StoreError(`No pick ${id}`, 404);
    return pick;
  }

  listPicks(): VideoPick[] {
    if (!fs.existsSync(this.picksDir)) return [];
    return fs
      .readdirSync(this.picksDir)
      .filter((f) => f.endsWith(".json"))
      .flatMap((f) => readJson<VideoPick>(path.join(this.picksDir, f)) ?? [])
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  isListening(pick: VideoPick, idleMs = PICK_IDLE_MS): boolean {
    return isPickListening(pick, idleMs);
  }

  /** The newest pick an agent is still waiting on. */
  activePick(): VideoPick | null {
    const pick = this.listPicks().find((p) => p.status === "waiting");
    return pick && this.isListening(pick) ? pick : null;
  }

  /** Called while an agent waits on a pick, so the app knows someone is still listening. */
  touchPick(id: string) {
    const pick = this.getPick(id);
    if (pick.status === "waiting") this.savePick({ ...pick, listenedAt: now() });
  }

  /** The user closed the pick without choosing; the waiting agent is told so. */
  dismissPick(id: string): VideoPick {
    const pick = this.getPick(id);
    if (pick.status !== "waiting") return pick;
    const done: VideoPick = { ...pick, status: "dismissed" };
    this.savePick(done);
    return done;
  }

  resolvePick(id: string, choice: PicksChoice): VideoPick {
    const pick = this.getPick(id);
    if (pick.status !== "waiting")
      throw new StoreError(
        pick.status === "picked" ? "This pick was already sent" : pick.status === "dismissed" ? "This pick was closed" : "This pick was cancelled",
        409,
      );
    const done: VideoPick = {
      ...pick,
      status: "picked",
      pickedAt: now(),
      ...(pick.kinds.includes("playbook") ? { playbookId: choice.playbookId ?? null } : {}),
      ...(pick.kinds.includes("style") ? { styleId: choice.styleId ?? null } : {}),
    };
    this.savePick(done);
    return done;
  }

  private savePick(pick: VideoPick) {
    writeJsonAtomic(this.pickFile(pick.id), pick);
  }

  /** Remembers the playbook and style picked for a project, so later versions and new chats keep them. */
  setReviewPicks(reviewId: string, picks: PicksChoice): Review {
    const review = this.getReview(reviewId);
    if (picks.playbookId !== undefined) review.playbookId = picks.playbookId ?? undefined;
    if (picks.styleId !== undefined) review.styleId = picks.styleId ?? undefined;
    this.save(review);
    return review;
  }
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

function clamp01(n: number | undefined) {
  if (n === undefined || Number.isNaN(n)) return undefined;
  return round(Math.min(1, Math.max(0, n)));
}
