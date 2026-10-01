import { randomBytes } from "node:crypto";
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
} from "../shared/types.ts";
import { dataDir } from "./paths.ts";

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

export interface OpenReviewInput {
  title?: string;
  videoPath?: string;
  compositionDir?: string;
  reviewId?: string;
  note?: string;
}

export interface NewCommentInput {
  version?: number;
  kind?: CommentKind;
  time: number;
  endTime?: number;
  x?: number;
  y?: number;
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
 * JSON-file store. Every call re-reads from disk so several Frame Jam processes
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

  reviewMtime(id: string): number {
    try {
      return fs.statSync(this.reviewFile(id)).mtimeMs;
    } catch {
      return 0;
    }
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
    const projectKey = media.compositionDir ?? `title:${(input.title ?? "").trim().toLowerCase()}`;
    let existing = input.reviewId ? this.getReview(input.reviewId) : undefined;
    if (!existing && (media.compositionDir || input.title)) {
      existing = this.listReviews().find((r) => r.projectKey === projectKey);
    }
    if (existing) {
      const latest = existing.versions.at(-1);
      const unchanged =
        latest &&
        latest.videoPath === media.videoPath &&
        latest.compositionDir === media.compositionDir &&
        !latest.sentAt;
      if (unchanged && latest) {
        // Re-opening with identical media is idempotent until feedback has been sent on it.
        return { review: existing, version: latest, created: false };
      }
      const review = this.addVersion(existing.id, { ...media, note: input.note });
      if (input.title && input.title !== review.title) {
        review.title = input.title;
        this.save(review);
      }
      return { review, version: review.versions.at(-1)!, created: false };
    }
    const version: ReviewVersion = { number: 1, ...media, note: input.note, createdAt: now() };
    const id = newId("rev");
    this.snapshotVideo(id, version);
    const review: Review = {
      id,
      title: input.title?.trim() || defaultTitle(media),
      projectKey: media.compositionDir || input.title ? projectKey : newId("project"),
      createdAt: now(),
      updatedAt: now(),
      versions: [version],
      comments: [],
      batches: [],
    };
    this.save(review);
    return { review, version, created: true };
  }

  addVersion(
    reviewId: string,
    input: { videoPath?: string; compositionDir?: string; note?: string },
  ): Review {
    const current = this.getReview(reviewId);
    const prev = current.versions.at(-1);
    const media = resolveMedia({
      videoPath: input.videoPath,
      compositionDir: input.compositionDir ?? (input.videoPath ? prev?.compositionDir : undefined),
    });
    return this.update(reviewId, (review) => {
      const version: ReviewVersion = {
        number: (review.versions.at(-1)?.number ?? 0) + 1,
        ...media,
        note: input.note,
        createdAt: now(),
      };
      this.snapshotVideo(reviewId, version);
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
      const hasRange = input.endTime !== undefined && input.endTime > input.time;
      comment = {
        id: newId("c"),
        version,
        kind: input.wholeVideo ? "general" : hasRange ? "range" : (input.kind ?? "pin"),
        time: round(input.wholeVideo ? 0 : Math.max(0, input.time)),
        endTime: hasRange && !input.wholeVideo ? round(input.endTime!) : undefined,
        x: clamp01(input.x),
        y: clamp01(input.y),
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
   * "Send to agent": the latest version's comments go to the agent as one batch, and the version
   * is locked. The next round of comments happens on the agent's next version.
   */
  submit(reviewId: string, message?: string): FeedbackBatch {
    let batch!: FeedbackBatch;
    this.update(reviewId, (review) => {
      const latest = review.versions.at(-1)!;
      if (latest.sentAt) throw new StoreError(`Version ${latest.number} was already sent`);
      const drafts = review.comments.filter((c) => c.status === "draft" && c.version === latest.number);
      if (!drafts.length) throw new StoreError("Nothing to send: add a comment first");
      batch = { id: newId("b"), createdAt: now(), commentIds: drafts.map((c) => c.id), message: message?.trim() || undefined };
      for (const c of drafts) {
        c.status = "sent";
        c.sentAt = batch.createdAt;
        c.batchId = batch.id;
      }
      latest.sentAt = batch.createdAt;
      latest.batchId = batch.id;
      review.batches.push(batch);
    });
    return batch;
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

  setAgentWaiting(reviewId: string, waiting: boolean) {
    const review = this.findReview(reviewId);
    if (!review) return;
    if (waiting) review.agentWaitingAt = now();
    else delete review.agentWaitingAt;
    writeJsonAtomic(this.reviewFile(reviewId), review);
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
    state.agent = { name, version, at: now() };
    writeJsonAtomic(this.stateFile, state);
  }

  setSelectedPreset(id: string | null) {
    const state = this.getState();
    if (id) state.selectedPreset = { id, selectedAt: now() };
    else delete state.selectedPreset;
    writeJsonAtomic(this.stateFile, state);
    return state;
  }
}

function resolveMedia(input: { videoPath?: string; compositionDir?: string }) {
  const out: Pick<ReviewVersion, "videoPath" | "compositionDir" | "compositionEntry"> = {};
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
    throw new StoreError("Provide videoPath (rendered mp4), compositionDir (Hyperframes project), or both");
  }
  return out;
}

function defaultTitle(media: { videoPath?: string; compositionDir?: string }) {
  return path.basename(media.compositionDir ?? media.videoPath ?? "Untitled video");
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

function clamp01(n: number | undefined) {
  if (n === undefined || Number.isNaN(n)) return undefined;
  return round(Math.min(1, Math.max(0, n)));
}
