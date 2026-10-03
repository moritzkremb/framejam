import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  AgentInfo,
  CommentKind,
  ElementInfo,
  FeedbackBatch,
  PlayerSource,
  Review,
  ReviewComment,
  ReviewVersion,
  StoryboardPanel,
} from "../shared/types.ts";
import { dataDir, setupInfo } from "./paths.ts";

export class StoreError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 = 400,
  ) {
    super(message);
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(5).toString("hex")}`;
}

const now = () => new Date().toISOString();

export const LISTEN_HEARTBEAT_MS = 4_000;
const LISTEN_GRACE_MS = 15_000;

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

/** A panel image path (absolute, or relative to panelsDir), optionally with a title and caption. */
export type PanelInput = string | { path: string; title?: string; caption?: string };

export interface MediaInput {
  videoPath?: string;
  compositionDir?: string;
  panels?: PanelInput[];
  panelsDir?: string;
}

export interface OpenReviewInput extends MediaInput {
  title?: string;
  reviewId?: string;
  note?: string;
}

const PANEL_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

export interface NewCommentInput {
  version?: number;
  kind?: CommentKind;
  time: number;
  endTime?: number;
  x?: number;
  y?: number;
  panel?: number;
  wholeVideo?: boolean;
  text: string;
  source?: PlayerSource;
  element?: ElementInfo;
}

interface AppState {
  selectedPreset?: { id: string; selectedAt: string };
  agent?: AgentInfo;
}

/**
 * JSON-file store. Every call re-reads from disk so several FrameJam processes
 * (e.g. one stdio MCP server per harness plus the web server) stay consistent.
 */
export class Store {
  readonly root: string;

  constructor(root = dataDir()) {
    this.root = root;
    fs.mkdirSync(this.reviewsDir, { recursive: true });
  }

  get reviewsDir() {
    return path.join(this.root, "reviews");
  }

  get userPresetsDir() {
    return path.join(this.root, "presets");
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
   * Opens a review. Re-opening the same project (same compositionDir, or same
   * title when there is no composition) appends a new version instead.
   */
  openReview(input: OpenReviewInput): { review: Review; version: ReviewVersion; created: boolean } {
    const media = resolveMedia(input);
    const projectKey =
      media.compositionDir ?? (media.panelsDir ? `panels:${media.panelsDir}` : `title:${(input.title ?? "").trim().toLowerCase()}`);
    const keyed = Boolean(media.compositionDir || media.panelsDir || input.title);
    let existing = input.reviewId ? this.getReview(input.reviewId) : undefined;
    if (!existing && keyed) {
      existing = this.listReviews().find((r) => r.projectKey === projectKey);
    }
    if (existing) {
      const latest = existing.versions.at(-1);
      const unchanged =
        latest &&
        latest.videoPath === media.videoPath &&
        latest.compositionDir === media.compositionDir &&
        panelsKey(latest.panels) === panelsKey(media.panels) &&
        !latest.sentAt;
      if (unchanged && latest) {
        // Re-opening with identical media is idempotent until feedback has been sent on it.
        return { review: existing, version: latest, created: false };
      }
      const review = this.addResolvedVersion(existing.id, media, input.note);
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
   * captions for files that are still there) and a video falls back to the previous composition.
   */
  addVersion(reviewId: string, input: MediaInput & { note?: string }): Review {
    const prev = this.getReview(reviewId).versions.at(-1);
    const nothingNew = !input.videoPath && !input.compositionDir && !input.panels?.length && !input.panelsDir;
    let media: ResolvedMedia;
    if (nothingNew && prev?.panelsDir) {
      media = resolveMedia({ panelsDir: prev.panelsDir });
      const old = new Map((prev.panels ?? []).map((p) => [p.sourcePath, p]));
      for (const p of media.panels ?? []) {
        p.title ??= old.get(p.sourcePath)?.title;
        p.caption ??= old.get(p.sourcePath)?.caption;
      }
    } else {
      media = resolveMedia({
        ...input,
        compositionDir: input.compositionDir ?? (input.videoPath || nothingNew ? prev?.compositionDir : undefined),
      });
    }
    return this.addResolvedVersion(reviewId, media, input.note);
  }

  private addResolvedVersion(reviewId: string, media: ResolvedMedia, note?: string): Review {
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
      // Comments belong to the version they were written on. Unsent ones (the agent shipped a new
      // version before the user pressed Send) move forward so they aren't stranded on an old version.
      for (const c of review.comments) {
        if (c.status === "draft" && prev && c.version === prev.number) c.version = version.number;
      }
      review.versions.push(version);
    });
  }

  /** Copies the render so v1 stays watchable after the agent overwrites the mp4 for v2. */
  private snapshotVideo(reviewId: string, version: ReviewVersion) {
    if (!version.videoPath) return;
    const dir = path.join(this.reviewsDir, reviewId, "versions");
    fs.mkdirSync(dir, { recursive: true });
    const file = `v${version.number}${path.extname(version.videoPath) || ".mp4"}`;
    fs.copyFileSync(version.videoPath, path.join(dir, file));
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
      fs.copyFileSync(p.sourcePath, path.join(dir, file));
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

  addComment(reviewId: string, input: NewCommentInput): ReviewComment {
    const text = input.text?.trim();
    if (!text) throw new StoreError("Comment text is required");
    let comment!: ReviewComment;
    this.update(reviewId, (review) => {
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
        source: input.source,
        element: input.element,
        status: "draft",
        createdAt: now(),
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

  saveThumbnail(reviewId: string, commentId: string, jpeg: Buffer): string {
    const file = `${commentId}.jpg`;
    fs.mkdirSync(this.thumbsDir(reviewId), { recursive: true });
    fs.writeFileSync(path.join(this.thumbsDir(reviewId), file), jpeg);
    this.updateComment(reviewId, commentId, { thumbnail: file });
    return file;
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

  setSelectedPreset(id: string | null) {
    const state = this.getState();
    if (id) state.selectedPreset = { id, selectedAt: now() };
    else delete state.selectedPreset;
    writeJsonAtomic(this.stateFile, state);
    return state;
  }
}

type ResolvedMedia = Pick<ReviewVersion, "videoPath" | "compositionDir" | "compositionEntry" | "panels" | "panelsDir">;

function resolveMedia(input: MediaInput): ResolvedMedia {
  const out: ResolvedMedia = {};
  if (input.panels?.length || input.panelsDir) {
    if (input.videoPath || input.compositionDir) {
      throw new StoreError("A storyboard version takes panels (or panelsDir), not a video or composition");
    }
    return resolvePanels(input.panels, input.panelsDir);
  }
  if (input.videoPath) {
    const p = path.resolve(input.videoPath);
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) throw new StoreError(`videoPath does not exist: ${p}`);
    out.videoPath = p;
  }
  if (input.compositionDir) {
    let p = path.resolve(input.compositionDir);
    let entry = "index.html";
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      entry = path.basename(p);
      p = path.dirname(p);
    }
    if (!fs.existsSync(path.join(p, entry))) {
      throw new StoreError(`compositionDir has no ${entry}: ${p}`);
    }
    out.compositionDir = p;
    out.compositionEntry = entry;
  }
  if (!out.videoPath && !out.compositionDir) {
    throw new StoreError("Provide videoPath (rendered mp4), compositionDir (Hyperframes project), or panels/panelsDir (storyboard)");
  }
  return out;
}

/** Panels in the given order, or every image in panelsDir sorted by file name (01.png, 02.png, … 10.png). */
function resolvePanels(panels: PanelInput[] | undefined, panelsDir: string | undefined): ResolvedMedia {
  const dir = panelsDir ? path.resolve(panelsDir) : undefined;
  if (dir && (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory())) throw new StoreError(`panelsDir is not a folder: ${dir}`);
  const entries: { path: string; title?: string; caption?: string }[] = panels?.length
    ? panels.map((p) => (typeof p === "string" ? { path: p } : p))
    : fs
        .readdirSync(dir!)
        .filter((f) => PANEL_EXTENSIONS.has(path.extname(f).toLowerCase()) && !f.startsWith("."))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((f) => ({ path: f }));
  if (!entries.length) throw new StoreError(`No panel images (png, jpg, webp, gif, svg) in ${dir}`);
  const resolved: StoryboardPanel[] = entries.map((e) => {
    const file = path.isAbsolute(e.path) ? e.path : path.resolve(dir ?? process.cwd(), e.path);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new StoreError(`Panel image does not exist: ${file}`);
    if (!PANEL_EXTENSIONS.has(path.extname(file).toLowerCase())) throw new StoreError(`Panel isn't an image (png, jpg, webp, gif, svg): ${file}`);
    return {
      image: "",
      sourcePath: file,
      sourceMtime: Math.round(fs.statSync(file).mtimeMs),
      title: e.title?.trim() || undefined,
      caption: e.caption?.trim() || undefined,
    };
  });
  return { panels: resolved, panelsDir: dir };
}

function panelsKey(panels: StoryboardPanel[] | undefined) {
  return JSON.stringify((panels ?? []).map((p) => [p.sourcePath, p.sourceMtime, p.title, p.caption]));
}

function defaultTitle(media: ResolvedMedia) {
  return path.basename(media.compositionDir ?? media.panelsDir ?? media.videoPath ?? (media.panels ? "Untitled storyboard" : "Untitled video"));
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

function clamp01(n: number | undefined) {
  if (n === undefined || Number.isNaN(n)) return undefined;
  return round(Math.min(1, Math.max(0, n)));
}
