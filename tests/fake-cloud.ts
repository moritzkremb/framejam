import { randomBytes } from "node:crypto";
import type { AssetKind, RegisterInput, UploadTicket } from "../src/server/cloud.ts";
import { CloudError } from "../src/server/cloud.ts";
import type {
  CloudApi,
  CloudComment,
  CloudLink,
  SyncBatch,
  SyncComment,
  SyncIndexItem,
  SyncProject,
  VersionInput,
  WireBatch,
  WireComment,
  WireMeta,
  WireReview,
  WireVersion,
} from "../src/server/cloud-api.ts";

const round = (n: number) => Math.round(n * 1000) / 1000;
const clamp01 = (n: number | undefined) => (n === undefined || Number.isNaN(n) ? undefined : round(Math.min(1, Math.max(0, n))));
const iso = (ms: number) => new Date(ms).toISOString();
const id = (prefix: string) => `${prefix}${randomBytes(6).toString("hex")}`;
const fail = (message: string, status: 400 | 404 | 409 = 400) => new CloudError(message, false, status);

interface V {
  number: number;
  input: VersionInput;
  createdAt: number;
  upload: { state: "uploading" | "ready" | "failed"; bytes: number; total: number; error?: string };
  videoAssetId?: string;
  panelAssetIds?: string[];
  sourceAssetId?: string;
  sentAt?: number;
  batchId?: string;
  reopenedFrom?: string;
  transcript?: { json: string; sourcePath?: string; words: number };
}

interface C {
  id: string;
  version: number;
  kind: WireComment["kind"];
  time: number;
  endTime?: number;
  x?: number;
  y?: number;
  panel?: number;
  wholeVideo?: boolean;
  text: string;
  frameAssetId?: string;
  status: "draft" | "sent" | "resolved";
  createdAt: number;
  sentAt?: number;
  batchId?: string;
  resolvedAt?: number;
  resolution?: { note?: string; version: number };
  author?: string;
  externalId?: string;
  fromVersion?: number;
  voice?: WireComment["voice"];
}

interface B {
  id: string;
  createdAt: number;
  commentIds: string[];
  message?: string;
  deliveredAt?: number;
  retractedAt?: number;
  replaces?: string;
  externalId?: string;
}

interface P {
  id: string;
  title: string;
  kind: "video" | "storyboard";
  projectKey: string;
  createdAt: number;
  updatedAt: number;
  playbookId?: string;
  styleId?: string;
  listeningAt?: number;
  versions: V[];
  comments: C[];
  batches: B[];
  link?: { token: string; sharedVersion: number; expiresAt?: number; revokedAt?: number; allowDownload?: boolean; showNotes?: boolean; createdAt: number };
}

export const R2 = "https://r2.test";

/** A fake FrameJam Cloud with the same rules as `convex/cloud.ts`, in memory, plus a fake R2 behind `fetch`. */
export class FakeCloud implements CloudApi {
  readonly url = "https://fake.convex.cloud";
  readonly projects = new Map<string, P>();
  readonly objects = new Map<string, { mime: string; bytes: Buffer }>();
  readonly assets = new Map<string, { storageKey: string; posterKey?: string }>();
  readonly calls: string[] = [];
  readonly footage = new Map<string, { filename: string; storageKey: string }[]>();
  /** Makes the next PUT to R2 fail with this status (once), for the failed-upload path. */
  failNextPut?: number;
  /** Fails this many PUTs to R2 in a row with `failStatus`, to look at retries. */
  failPuts = 0;
  failStatus = 500;
  /** How many projects sync may keep, or unlimited. */
  syncLimit = Infinity;
  /** False for a plan without sync (Free): every sync call is refused, as in convex/sync.ts. */
  syncIncluded = true;
  /** Holds PUTs until released, so a test can look at the "uploading" state. */
  gate?: Promise<void>;
  tick = 0;

  private now() {
    // Strictly increasing, so "newest first" and change markers behave even within one millisecond.
    return Date.now() * 1000 + ++this.tick;
  }

  private ms(): number {
    return Math.floor(this.now() / 1000);
  }

  private count(name: string) {
    this.calls.push(name);
  }

  private project(reviewId: string): P {
    const p = this.projects.get(reviewId);
    if (!p) throw fail(`Review not found: ${reviewId}`, 404);
    return p;
  }

  private touch(p: P) {
    p.updatedAt = Math.max(p.updatedAt + 1, this.ms());
  }

  private urlOf(storageKey: string | undefined) {
    return storageKey ? `${R2}/${storageKey}` : undefined;
  }

  private wire(p: P): WireReview {
    const versions: WireVersion[] = p.versions.map((v) => {
      const asset = v.videoAssetId ? this.assets.get(v.videoAssetId) : undefined;
      return {
        number: v.number,
        videoPath: v.input.videoPath,
        panelsDir: v.input.panelsDir,
        panels: v.input.panelMeta?.map((m, i) => ({ ...m, url: this.urlOf(this.assets.get(v.panelAssetIds?.[i] ?? "")?.storageKey) })),
        note: v.input.note,
        notes: v.input.notes,
        source: v.input.source ? { ...v.input.source, ready: Boolean(v.sourceAssetId) } : undefined,
        createdAt: iso(v.createdAt),
        sentAt: v.sentAt === undefined ? undefined : iso(v.sentAt),
        batchId: v.batchId,
        reopenedFrom: v.reopenedFrom,
        contentKey: v.input.contentKey,
        upload: { ...v.upload },
        hasVideo: Boolean(v.input.videoPath),
        videoUrl: this.urlOf(asset?.storageKey),
        posterUrl: this.urlOf(asset?.posterKey),
        transcript: v.transcript ? { sourcePath: v.transcript.sourcePath, words: v.transcript.words } : undefined,
      };
    });
    const comments: WireComment[] = p.comments.map((c) => ({
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
      thumbnail: c.frameAssetId ? `${c.id}.jpg` : undefined,
      frameUrl: this.urlOf(this.assets.get(c.frameAssetId ?? "")?.storageKey),
      status: c.status,
      createdAt: iso(c.createdAt),
      sentAt: c.sentAt === undefined ? undefined : iso(c.sentAt),
      batchId: c.batchId,
      resolvedAt: c.resolvedAt === undefined ? undefined : iso(c.resolvedAt),
      resolution: c.resolution,
      author: c.author,
      cloudId: c.externalId ?? (c.author ? c.id : undefined),
      fromVersion: c.fromVersion,
      voice: c.voice,
    }));
    const batches: WireBatch[] = p.batches.map((b) => ({
      id: b.id,
      createdAt: iso(b.createdAt),
      commentIds: b.commentIds,
      message: b.message,
      deliveredAt: b.deliveredAt === undefined ? undefined : iso(b.deliveredAt),
      retractedAt: b.retractedAt === undefined ? undefined : iso(b.retractedAt),
      replaces: b.replaces,
    }));
    return {
      id: p.id,
      title: p.title,
      kind: p.kind,
      projectKey: p.projectKey,
      createdAt: iso(p.createdAt),
      updatedAt: iso(p.updatedAt),
      playbookId: p.playbookId,
      styleId: p.styleId,
      listeningAt: p.listeningAt ?? null,
      versions,
      comments,
      batches,
    };
  }

  private wireComment(p: P, c: C): WireComment {
    return this.wire({ ...p, comments: [c] }).comments[0]!;
  }

  async list(): Promise<WireReview[]> {
    this.count("list");
    return [...this.projects.values()].sort((a, b) => b.updatedAt - a.updatedAt).map((p) => this.wire(p));
  }

  async get(reviewId: string): Promise<WireReview | null> {
    this.count("get");
    const p = this.projects.get(reviewId);
    return p ? this.wire(p) : null;
  }

  async meta(reviewId: string): Promise<WireMeta | null> {
    this.count("meta");
    const p = this.projects.get(reviewId);
    return p ? { updatedAt: p.updatedAt, listeningAt: p.listeningAt ?? null, now: Date.now() } : null;
  }

  private check(kind: "video" | "storyboard", input: VersionInput) {
    const storyboard = Boolean(input.panelMeta?.length);
    if (storyboard !== (kind === "storyboard")) {
      throw fail(kind === "storyboard" ? "A storyboard project takes panels, not a video" : "A video project takes a video, not panels");
    }
    if (input.transcript && storyboard) throw fail("Transcripts are for videos, not storyboards");
  }

  private append(p: P, input: VersionInput): number {
    const prev = p.versions.at(-1);
    const number = (prev?.number ?? 0) + 1;
    p.versions.push({
      number,
      input: { ...input, note: input.note?.trim() || undefined },
      createdAt: this.ms(),
      upload: { state: "uploading", bytes: 0, total: input.total },
      transcript: input.transcript,
    });
    if (prev) {
      for (const c of p.comments) {
        if (c.status !== "draft" || c.version !== prev.number) continue;
        if (c.author && c.fromVersion === undefined) c.fromVersion = c.version;
        c.version = number;
      }
    }
    return number;
  }

  async open(input: Parameters<CloudApi["open"]>[0]) {
    this.count("open");
    const title = input.title.trim();
    if (!title) throw fail("Missing title");
    this.check(input.kind, input.version);
    let existing: P | undefined;
    if (input.reviewId) existing = this.project(input.reviewId);
    else if (input.projectKey) existing = [...this.projects.values()].find((p) => p.projectKey === input.projectKey);
    if (existing) {
      const latest = existing.versions.at(-1);
      if (latest && latest.input.contentKey === input.version.contentKey && latest.sentAt === undefined) {
        if (input.version.transcript) {
          latest.transcript = input.version.transcript;
          this.touch(existing);
        }
        const retry = latest.upload.state === "failed";
        if (retry) latest.upload = { state: "uploading", bytes: 0, total: input.version.total };
        return { review: this.wire(existing), version: latest.number, created: false, upload: retry ? latest.number : null };
      }
      this.check(existing.kind, input.version);
      const number = this.append(existing, input.version);
      if (title !== existing.title) existing.title = title;
      this.touch(existing);
      return { review: this.wire(existing), version: number, created: false, upload: number };
    }
    if (this.projects.has(input.newId)) throw fail(`Review already exists: ${input.newId}`, 409);
    const p: P = {
      id: input.newId,
      title,
      kind: input.kind,
      projectKey: input.projectKey ?? `project:${input.newId}`,
      createdAt: this.ms(),
      updatedAt: this.ms(),
      versions: [],
      comments: [],
      batches: [],
    };
    this.projects.set(p.id, p);
    const number = this.append(p, input.version);
    return { review: this.wire(p), version: number, created: true, upload: number };
  }

  async addVersion(reviewId: string, version: VersionInput) {
    this.count("addVersion");
    const p = this.project(reviewId);
    this.check(p.kind, version);
    const number = this.append(p, version);
    this.touch(p);
    return { review: this.wire(p), version: number };
  }

  private version(p: P, number: number): V {
    const v = p.versions.find((x) => x.number === number);
    if (!v) throw fail(`Unknown version ${number}`, 404);
    return v;
  }

  async uploadProgress(reviewId: string, version: number, bytes: number) {
    this.count("uploadProgress");
    const p = this.project(reviewId);
    const v = this.version(p, version);
    if (v.upload.state !== "uploading") return null;
    v.upload.bytes = Math.min(v.upload.total, Math.max(v.upload.bytes, Math.floor(bytes)));
    this.touch(p);
    return null;
  }

  async versionReady(reviewId: string, version: number, assets: { videoAssetId?: string; panelAssetIds?: string[]; sourceAssetId?: string }) {
    this.count("versionReady");
    const p = this.project(reviewId);
    const v = this.version(p, version);
    if (p.kind === "video" && (!assets.videoAssetId || assets.panelAssetIds)) throw fail("A video version needs one render");
    if (p.kind === "storyboard" && (assets.panelAssetIds?.length !== v.input.panelMeta?.length || assets.videoAssetId)) throw fail("A storyboard version needs every panel");
    if (Boolean(v.input.source) !== Boolean(assets.sourceAssetId)) throw fail(v.input.source ? "This version needs its source files" : "This version has no source files");
    v.sourceAssetId = assets.sourceAssetId;
    v.videoAssetId = assets.videoAssetId;
    v.panelAssetIds = assets.panelAssetIds;
    v.upload = { state: "ready", bytes: v.upload.total, total: v.upload.total };
    this.touch(p);
    return null;
  }

  async sourceUrl(reviewId: string, version: number) {
    this.count("sourceUrl");
    const v = this.version(this.project(reviewId), version);
    const asset = v.sourceAssetId ? this.assets.get(v.sourceAssetId) : undefined;
    if (!v.input.source || !asset) throw fail(`Version ${version} has no source files`, 404);
    return { url: `${R2}/${asset.storageKey}?dl=1`, filename: v.input.source.filename, bytes: v.input.source.bytes };
  }

  async versionFailed(reviewId: string, version: number, error: string) {
    this.count("versionFailed");
    const p = this.project(reviewId);
    const v = this.version(p, version);
    if (v.upload.state === "ready") return null;
    v.upload = { state: "failed", bytes: v.upload.bytes, total: v.upload.total, error };
    this.touch(p);
    return null;
  }

  async setTranscript(reviewId: string, version: number, t: { json: string; sourcePath?: string; words: number }) {
    this.count("setTranscript");
    const p = this.project(reviewId);
    const v = this.version(p, version);
    if (p.kind === "storyboard") throw fail("Transcripts are for videos, not storyboards");
    v.transcript = t;
    this.touch(p);
    return this.wire(p);
  }

  async transcript(reviewId: string, version: number) {
    this.count("transcript");
    return this.version(this.project(reviewId), version).transcript?.json ?? null;
  }

  async setPicks(reviewId: string, picks: { playbookId?: string | null; styleId?: string | null }) {
    this.count("setPicks");
    const p = this.project(reviewId);
    if (picks.playbookId !== undefined) p.playbookId = picks.playbookId ?? undefined;
    if (picks.styleId !== undefined) p.styleId = picks.styleId ?? undefined;
    this.touch(p);
    return this.wire(p);
  }

  async setWaiting(reviewId: string, waiting: boolean) {
    this.count("setWaiting");
    const p = this.projects.get(reviewId);
    if (p) p.listeningAt = waiting ? Date.now() : undefined;
    return null;
  }

  async addComment(reviewId: string, input: CloudComment) {
    this.count("addComment");
    const p = this.project(reviewId);
    const text = input.text.trim();
    if (!text) throw fail("Comment text is required");
    if (input.cloudId) {
      const same = p.comments.find((c) => c.id === input.cloudId || c.externalId === input.cloudId);
      if (same) return this.wireComment(p, same);
    }
    const latest = p.versions.at(-1);
    if (!latest) throw fail("This project has no versions", 404);
    const number = input.version ?? latest.number;
    if (!p.versions.some((x) => x.number === number)) throw fail(`Unknown version ${number}`);
    if (number !== latest.number) throw fail(`Version ${number} is not the latest; comment on version ${latest.number}`);
    if (latest.sentAt !== undefined) throw fail(`Version ${number} was already sent; comment on the next version`);
    const panels = latest.input.panelMeta?.length ?? 0;
    if (panels && !input.wholeVideo) {
      if (!Number.isInteger(input.panel) || input.panel! < 1 || input.panel! > panels) {
        throw fail(`Pick a panel between 1 and ${panels}, or comment on the whole storyboard`);
      }
    }
    const hasPin = input.x !== undefined && input.y !== undefined;
    const hasRange = !panels && input.endTime !== undefined && input.endTime > (input.time ?? 0);
    const c: C = {
      id: id("c"),
      version: number,
      kind: input.wholeVideo ? "general" : panels ? (hasPin ? "pin" : "panel") : hasRange ? "range" : (input.kind ?? "pin"),
      time: round(input.wholeVideo || panels ? 0 : Math.max(0, input.time ?? 0)),
      endTime: hasRange && !input.wholeVideo ? round(input.endTime!) : undefined,
      x: input.wholeVideo ? undefined : clamp01(input.x),
      y: input.wholeVideo ? undefined : clamp01(input.y),
      panel: panels && !input.wholeVideo ? input.panel : undefined,
      wholeVideo: input.wholeVideo || undefined,
      text,
      status: "draft",
      createdAt: this.ms(),
      author: input.author?.trim() || undefined,
      externalId: input.cloudId || undefined,
      fromVersion: input.fromVersion !== undefined && input.fromVersion !== number ? input.fromVersion : undefined,
      voice: input.voice,
    };
    p.comments.push(c);
    this.touch(p);
    return this.wireComment(p, c);
  }

  private comment(p: P, commentId: string): C {
    const c = p.comments.find((x) => x.id === commentId);
    if (!c) throw fail(`Comment not found: ${commentId}`, 404);
    return c;
  }

  async updateComment(reviewId: string, commentId: string, text: string) {
    this.count("updateComment");
    const p = this.project(reviewId);
    const c = this.comment(p, commentId);
    if (c.status !== "draft") throw fail("This comment was already sent and can't be edited");
    if (!text.trim()) throw fail("Comment text is required");
    c.text = text.trim();
    this.touch(p);
    return null;
  }

  async deleteComment(reviewId: string, commentId: string) {
    this.count("deleteComment");
    const p = this.project(reviewId);
    const c = this.comment(p, commentId);
    if (c.status !== "draft") throw fail("This comment was already sent and can't be deleted");
    p.comments = p.comments.filter((x) => x !== c);
    this.touch(p);
    return null;
  }

  async setCommentFrame(reviewId: string, commentId: string, assetId: string) {
    this.count("setCommentFrame");
    const p = this.project(reviewId);
    this.comment(p, commentId).frameAssetId = assetId;
    this.touch(p);
    return null;
  }

  async submit(reviewId: string, message?: string) {
    this.count("submit");
    const p = this.project(reviewId);
    const latest = p.versions.at(-1)!;
    if (latest.sentAt !== undefined) throw fail(`Version ${latest.number} was already sent`);
    const drafts = p.comments.filter((c) => c.status === "draft" && c.version === latest.number);
    if (!drafts.length) throw fail("Nothing to send: add a comment first");
    const now = this.ms();
    const b: B = { id: id("b"), createdAt: now, commentIds: drafts.map((c) => c.id), message: message?.trim() || undefined, replaces: latest.reopenedFrom };
    p.batches.push(b);
    for (const c of drafts) Object.assign(c, { status: "sent", sentAt: now, batchId: b.id });
    latest.sentAt = now;
    latest.batchId = b.id;
    latest.reopenedFrom = undefined;
    this.touch(p);
    return { batch: { id: b.id, createdAt: iso(b.createdAt), commentIds: b.commentIds, message: b.message, replaces: b.replaces } };
  }

  async reopen(reviewId: string) {
    this.count("reopen");
    const p = this.project(reviewId);
    const latest = p.versions.at(-1)!;
    if (latest.sentAt === undefined || !latest.batchId) throw fail(`Version ${latest.number} isn't finished, so there's nothing to reopen`);
    const batch = p.batches.find((b) => b.id === latest.batchId);
    for (const c of p.comments) {
      if (c.batchId !== latest.batchId || c.status !== "sent") continue;
      Object.assign(c, { status: "draft", sentAt: undefined, batchId: undefined });
    }
    let wasDelivered = false;
    latest.sentAt = undefined;
    const batchId = latest.batchId;
    latest.batchId = undefined;
    if (batch?.deliveredAt !== undefined) {
      wasDelivered = true;
      batch.retractedAt = this.ms();
      latest.reopenedFrom = batch.id;
    } else {
      p.batches = p.batches.filter((b) => b.id !== batchId);
      if (batch?.replaces) latest.reopenedFrom = batch.replaces;
    }
    this.touch(p);
    return { wasDelivered };
  }

  async markDelivered(reviewId: string, batchIds: string[]) {
    this.count("markDelivered");
    const p = this.project(reviewId);
    for (const b of p.batches) if (batchIds.includes(b.id) && b.deliveredAt === undefined) b.deliveredAt = this.ms();
    this.touch(p);
    return null;
  }

  async resolveComments(reviewId: string, ids: string[], note?: string) {
    this.count("resolveComments");
    const p = this.project(reviewId);
    const latest = p.versions.at(-1)!;
    const all = ids.length === 1 && ids[0] === "all";
    const targets = all ? p.comments.filter((c) => c.status === "sent").map((c) => c.id) : ids;
    const resolved: string[] = [];
    const missing: string[] = [];
    for (const target of targets) {
      const c = p.comments.find((x) => x.id === target);
      if (!c) {
        missing.push(target);
        continue;
      }
      Object.assign(c, { status: "resolved", resolvedAt: this.ms(), resolution: { note: note?.trim() || undefined, version: latest.number } });
      resolved.push(c.id);
    }
    this.touch(p);
    return { resolved, missing };
  }

  async requestUpload(input: { filename: string; mime: string; kind: AssetKind }): Promise<UploadTicket> {
    this.count("requestUpload");
    const prefix = { render: "renders", panel: "panels", poster: "posters", frame: "frames", source: "sources" }[input.kind];
    const ext = input.filename.match(/\.\w+$/)?.[0] ?? "";
    const storageKey = `${prefix}/user_1/${randomBytes(8).toString("hex")}${ext}`;
    return { uploadUrl: `${R2}/${storageKey}?sig=1`, storageKey, publicUrl: `${R2}/${storageKey}` };
  }

  async registerUpload(input: RegisterInput) {
    this.count("registerUpload");
    if (!this.objects.has(input.storageKey)) throw fail("Nothing was uploaded there");
    const assetId = `asset_${this.assets.size + 1}`;
    this.assets.set(assetId, { storageKey: input.storageKey, posterKey: input.posterKey });
    return { assetId };
  }

  /** Footage someone added to a project elsewhere (a phone, a web chat). */
  addFootage(reviewId: string, filename: string, bytes: Buffer, mime = "video/mp4") {
    this.project(reviewId);
    const storageKey = `footage/u/${this.now()}-${filename.replace(/[^\w.-]/g, "_")}`;
    this.objects.set(storageKey, { mime, bytes });
    this.footage.set(reviewId, [...(this.footage.get(reviewId) ?? []), { filename, storageKey }]);
  }

  async footageList(reviewId: string) {
    this.count("footageList");
    this.project(reviewId);
    return (this.footage.get(reviewId) ?? []).map((f, i) => {
      const object = this.objects.get(f.storageKey)!;
      return { id: `ft_${i}`, filename: f.filename, bytes: object.bytes.length, mime: object.mime, addedAt: 0, downloadUrl: `${R2}/${f.storageKey}` };
    });
  }

  /** The `fetch` the store uses for R2: PUT stores the body, GET returns it. */
  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    if (url.origin !== R2) return new Response("unexpected host", { status: 502 });
    const key = url.pathname.slice(1);
    if ((init?.method ?? "GET") === "PUT") {
      if (this.gate) await this.gate;
      if (this.failPuts > 0) {
        this.failPuts--;
        return new Response("no", { status: this.failStatus });
      }
      if (this.failNextPut) {
        const status = this.failNextPut;
        this.failNextPut = undefined;
        return new Response("no", { status });
      }
      const chunks: Buffer[] = [];
      const body = init!.body as unknown;
      if (body instanceof Uint8Array) chunks.push(Buffer.from(body));
      else if (body && typeof (body as ReadableStream).getReader === "function") {
        const reader = (body as ReadableStream<Uint8Array>).getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(Buffer.from(value));
        }
      }
      this.objects.set(key, { mime: String((init!.headers as Record<string, string>)?.["Content-Type"] ?? ""), bytes: Buffer.concat(chunks) });
      return new Response(null, { status: 200 });
    }
    const object = this.objects.get(key);
    return object ? new Response(new Uint8Array(object.bytes), { status: 200, headers: { "Content-Type": object.mime } }) : new Response("missing", { status: 404 });
  };

  private linkJson(p: P): CloudLink | null {
    const l = p.link;
    if (!l) return null;
    return {
      token: l.token,
      createdAt: l.createdAt,
      sharedVersion: l.sharedVersion,
      expiresAt: l.expiresAt ?? null,
      revokedAt: l.revokedAt ?? null,
      approved: null,
      approvalSeenAt: null,
      allowDownload: l.allowDownload !== false,
      showNotes: l.showNotes === true,
      opens: 0,
      lastOpenedAt: null,
      approvals: [],
      guestCommentsWaiting: p.comments.filter((c) => c.author && c.status === "draft").length,
    };
  }

  async share(reviewId: string, version?: number) {
    this.count("share");
    const p = this.project(reviewId);
    const number = version ?? p.versions.at(-1)?.number;
    const v = p.versions.find((x) => x.number === number);
    if (!v) throw fail(`${p.title} has no version ${number}.`, 404);
    if (v.upload.state === "uploading") throw fail(`Version ${v.number} is still uploading. Share it once the upload finishes.`, 409);
    if (v.upload.state === "failed") throw fail(`Version ${v.number} didn't finish uploading, so it can't be shared yet.`, 409);
    const link = (p.link ??= { token: `tok_${randomBytes(6).toString("hex")}`, sharedVersion: 0, createdAt: this.ms() });
    const newOnLink = v.number > link.sharedVersion;
    if (newOnLink) link.sharedVersion = v.number;
    this.touch(p);
    return { ...this.linkJson(p)!, version: v.number, newOnLink };
  }

  async link(reviewId: string) {
    this.count("link");
    return this.linkJson(this.project(reviewId));
  }

  async links() {
    this.count("links");
    return [...this.projects.values()]
      .filter((p) => p.link)
      .map((p) => ({ reviewId: p.id, title: p.title, latestVersion: p.versions.at(-1)?.number ?? 0, link: this.linkJson(p)! }));
  }

  async approvalSeen(reviewId: string) {
    this.count("approvalSeen");
    this.project(reviewId);
    return null;
  }

  async configure(reviewId: string, settings: { expiresAt?: number | null; revoked?: boolean; allowDownload?: boolean; showNotes?: boolean }) {
    this.count("configure");
    const p = this.project(reviewId);
    if (!p.link) throw fail("This project isn't shared yet");
    if (settings.expiresAt !== undefined) p.link.expiresAt = settings.expiresAt ?? undefined;
    if (settings.revoked !== undefined) p.link.revokedAt = settings.revoked ? Date.now() : undefined;
    if (settings.allowDownload !== undefined) p.link.allowDownload = settings.allowDownload;
    if (settings.showNotes !== undefined) p.link.showNotes = settings.showNotes;
    return { token: p.link.token, expiresAt: p.link.expiresAt ?? null, revokedAt: p.link.revokedAt ?? null, allowDownload: p.link.allowDownload !== false, showNotes: p.link.showNotes === true };
  }

  // --- Sync, with the rules of convex/sync.ts ---------------------------------------------------------------------

  async syncIndex(): Promise<SyncIndexItem[]> {
    this.count("syncIndex");
    if (!this.syncIncluded) throw fail("Sync isn't included on this account. Manage your account at app.framejam.ai/account.");
    return [...this.projects.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((p) => ({ id: p.id, title: p.title, kind: p.kind, updatedAt: p.updatedAt, versions: p.versions.at(-1)?.number ?? 0 }));
  }

  async syncEnsure(project: SyncProject, update?: { title?: string; playbookId?: string | null; styleId?: string | null }) {
    this.count("syncEnsure");
    let p = this.projects.get(project.id);
    const created = !p;
    if (!p) {
      if (this.projects.size >= this.syncLimit) throw fail(`This account can sync ${this.syncLimit} projects and has reached that.`, 409);
      p = {
        id: project.id,
        title: project.title.trim(),
        kind: project.kind,
        projectKey: project.projectKey ?? `project:${project.id}`,
        createdAt: this.ms(),
        updatedAt: this.ms(),
        playbookId: project.playbookId,
        styleId: project.styleId,
        versions: [],
        comments: [],
        batches: [],
      };
      this.projects.set(p.id, p);
    }
    if (update?.title?.trim()) p.title = update.title.trim();
    if (update?.playbookId !== undefined) p.playbookId = update.playbookId ?? undefined;
    if (update?.styleId !== undefined) p.styleId = update.styleId ?? undefined;
    if (update) this.touch(p);
    return { created };
  }

  async syncAddVersions(reviewId: string, versions: { number: number; version: VersionInput }[]) {
    this.count("syncAddVersions");
    const p = this.project(reviewId);
    const upload: number[] = [];
    for (const { number, version } of [...versions].sort((a, b) => a.number - b.number)) {
      const have = p.versions.find((v) => v.number === number);
      if (have) {
        if (have.upload.state !== "ready") {
          have.upload = { state: "uploading", bytes: 0, total: version.total };
          upload.push(number);
        }
        continue;
      }
      this.check(p.kind, version);
      p.versions.push({ number, input: { ...version }, createdAt: this.ms(), upload: { state: "uploading", bytes: 0, total: version.total }, transcript: version.transcript });
      p.versions.sort((a, b) => a.number - b.number);
      upload.push(number);
    }
    this.touch(p);
    return { upload };
  }

  async syncPutComments(reviewId: string, comments: SyncComment[]) {
    this.count("syncPutComments");
    const p = this.project(reviewId);
    const ids: Record<string, string> = {};
    for (const input of comments) {
      const found = (input.row ? p.comments.find((c) => c.id === input.row) : undefined) ?? p.comments.find((c) => c.externalId === input.id);
      if (found) {
        ids[input.id] = found.id;
        if (found.status === "draft") {
          found.text = input.text.trim();
          if (p.versions.some((v) => v.number === input.version)) found.version = input.version;
        }
        if (input.status === "resolved" && found.status !== "resolved") {
          Object.assign(found, { status: "resolved", resolvedAt: input.resolvedAt ?? this.ms(), resolution: input.resolution });
        }
        continue;
      }
      if (!p.versions.some((v) => v.number === input.version)) throw fail(`Unknown version ${input.version}`);
      const c: C = {
        id: id("c"),
        version: input.version,
        kind: input.kind,
        time: input.time,
        endTime: input.endTime,
        x: input.x,
        y: input.y,
        panel: input.panel,
        wholeVideo: input.wholeVideo,
        text: input.text.trim(),
        status: input.status,
        createdAt: this.ms(),
        sentAt: input.status === "draft" ? undefined : input.sentAt,
        resolvedAt: input.status === "resolved" ? (input.resolvedAt ?? this.ms()) : undefined,
        resolution: input.status === "resolved" ? input.resolution : undefined,
        author: input.author,
        externalId: input.id,
        fromVersion: input.fromVersion,
      };
      p.comments.push(c);
      ids[input.id] = c.id;
    }
    this.touch(p);
    return { ids };
  }

  async syncPutBatch(reviewId: string, input: SyncBatch) {
    this.count("syncPutBatch");
    const p = this.project(reviewId);
    const existing = p.batches.find((b) => b.externalId === input.id || b.id === input.id);
    if (existing) {
      if (input.deliveredAt !== undefined && existing.deliveredAt === undefined) existing.deliveredAt = input.deliveredAt;
      return { id: existing.id };
    }
    const v = this.version(p, input.version);
    const sentAt = input.sentAt ?? this.ms();
    const b: B = { id: id("b"), createdAt: sentAt, commentIds: input.comments, message: input.message, deliveredAt: input.deliveredAt, replaces: v.reopenedFrom, externalId: input.id };
    p.batches.push(b);
    for (const c of p.comments) {
      if (!input.comments.includes(c.id)) continue;
      Object.assign(c, { status: c.status === "resolved" ? "resolved" : "sent", sentAt: c.sentAt ?? sentAt, batchId: b.id });
    }
    if (v.sentAt === undefined) Object.assign(v, { sentAt, batchId: b.id, reopenedFrom: undefined });
    this.touch(p);
    return { id: b.id };
  }

  async syncForget(reviewId: string) {
    this.count("syncForget");
    this.projects.delete(reviewId);
    return null;
  }
}
