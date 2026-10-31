/**
 * What cloud mode needs from FrameJam Cloud (H2.1): the `cloud.*` functions that keep a creator's projects, versions,
 * comments and rounds, plus the upload and link calls the same signed-in user already has. `CloudStore` is the only
 * caller; tests give it an in-memory one.
 */
import {
  type FetchLike,
  type LinkSettings,
  type RegisterInput,
  type UploadTicket,
  type AssetKind,
  cloudUrl,
  convexCall,
} from "./cloud.ts";

export type UploadState = { state: "uploading" | "ready" | "failed"; bytes: number; total: number; error?: string };

export interface WireVersion {
  number: number;
  videoPath?: string;
  panelsDir?: string;
  panels?: { sourcePath: string; title?: string; caption?: string; url?: string }[];
  note?: string;
  notes?: string;
  source?: { filename: string; bytes: number; ready: boolean };
  createdAt: string;
  sentAt?: string;
  batchId?: string;
  reopenedFrom?: string;
  contentKey?: string;
  upload: UploadState;
  hasVideo: boolean;
  videoUrl?: string;
  posterUrl?: string;
  transcript?: { sourcePath?: string; words: number };
}

export interface WireComment {
  id: string;
  version: number;
  kind: "pin" | "range" | "panel" | "general";
  time: number;
  endTime?: number;
  x?: number;
  y?: number;
  panel?: number;
  wholeVideo?: boolean;
  text: string;
  thumbnail?: string;
  frameUrl?: string;
  status: "draft" | "sent" | "resolved";
  createdAt: string;
  sentAt?: string;
  batchId?: string;
  resolvedAt?: string;
  resolution?: { note?: string; version: number };
  author?: string;
  cloudId?: string;
  fromVersion?: number;
}

export interface WireBatch {
  id: string;
  createdAt: string;
  commentIds: string[];
  message?: string;
  deliveredAt?: string;
  retractedAt?: string;
  replaces?: string;
}

export interface WireReview {
  id: string;
  title: string;
  kind: "video" | "storyboard";
  projectKey: string;
  createdAt: string;
  updatedAt: string;
  playbookId?: string;
  styleId?: string;
  /** Milliseconds since the epoch of the agent's last heartbeat, or null. */
  listeningAt: number | null;
  versions: WireVersion[];
  comments: WireComment[];
  batches: WireBatch[];
}

export interface WireMeta {
  updatedAt: number;
  listeningAt: number | null;
  /** The cloud's clock, so a skewed computer clock doesn't make a live agent look gone. */
  now: number;
}

export interface VersionInput {
  note?: string;
  notes?: string;
  /** The source zip that goes up with the version: its name and size. */
  source?: { filename: string; bytes: number };
  /** Decides whether re-opening with this brings anything new. */
  contentKey: string;
  videoPath?: string;
  panelsDir?: string;
  panelMeta?: { sourcePath: string; title?: string; caption?: string }[];
  /** Bytes of every file the version uploads, for the progress bar. */
  total: number;
  transcript?: { json: string; sourcePath?: string; words: number };
}

export interface CloudComment {
  version?: number;
  kind?: "pin" | "range" | "panel" | "general";
  time: number;
  endTime?: number;
  x?: number;
  y?: number;
  panel?: number;
  wholeVideo?: boolean;
  text: string;
  author?: string;
  cloudId?: string;
  fromVersion?: number;
}

export interface CloudLink {
  token: string;
  createdAt: number;
  sharedVersion: number | null;
  expiresAt: number | null;
  revokedAt: number | null;
  approved: { version: number; by: string; at: number } | null;
  approvalSeenAt: number | null;
  allowDownload: boolean;
  /** Guests see each version's handoff notes. Missing on older deployments, which means off. */
  showNotes?: boolean;
  opens: number;
  lastOpenedAt: number | null;
  approvals: { version: number; guestName: string; at: number }[];
  guestCommentsWaiting: number;
}

export interface CloudApi {
  /** Where the cloud lives, so a project's cache isn't mixed up between deployments. */
  readonly url: string;
  list(): Promise<WireReview[]>;
  get(reviewId: string): Promise<WireReview | null>;
  meta(reviewId: string): Promise<WireMeta | null>;
  open(input: {
    newId: string;
    title: string;
    kind: "video" | "storyboard";
    projectKey?: string;
    reviewId?: string;
    version: VersionInput;
  }): Promise<{ review: WireReview; version: number; created: boolean; upload: number | null }>;
  addVersion(reviewId: string, version: VersionInput): Promise<{ review: WireReview; version: number }>;
  uploadProgress(reviewId: string, version: number, bytes: number): Promise<null>;
  versionReady(reviewId: string, version: number, assets: { videoAssetId?: string; panelAssetIds?: string[]; sourceAssetId?: string }): Promise<null>;
  /** A short-lived download of a version's source zip. */
  sourceUrl(reviewId: string, version: number): Promise<{ url: string; filename: string; bytes: number }>;
  versionFailed(reviewId: string, version: number, error: string): Promise<null>;
  setTranscript(reviewId: string, version: number, t: { json: string; sourcePath?: string; words: number }): Promise<WireReview>;
  transcript(reviewId: string, version: number): Promise<string | null>;
  setPicks(reviewId: string, picks: { playbookId?: string | null; styleId?: string | null }): Promise<WireReview>;
  setWaiting(reviewId: string, waiting: boolean): Promise<null>;
  addComment(reviewId: string, comment: CloudComment): Promise<WireComment>;
  updateComment(reviewId: string, commentId: string, text: string): Promise<null>;
  deleteComment(reviewId: string, commentId: string): Promise<null>;
  setCommentFrame(reviewId: string, commentId: string, assetId: string): Promise<null>;
  submit(reviewId: string, message?: string): Promise<{ batch: WireBatch }>;
  reopen(reviewId: string): Promise<{ wasDelivered: boolean }>;
  markDelivered(reviewId: string, batchIds: string[]): Promise<null>;
  resolveComments(reviewId: string, ids: string[], note?: string): Promise<{ resolved: string[]; missing: string[] }>;

  requestUpload(input: { filename: string; mime: string; kind: AssetKind }): Promise<UploadTicket>;
  registerUpload(input: RegisterInput): Promise<{ assetId: string }>;

  share(reviewId: string, version?: number): Promise<CloudLink & { version: number; newOnLink: boolean }>;
  link(reviewId: string): Promise<CloudLink | null>;
  links(): Promise<{ reviewId: string; title: string; latestVersion: number; link: CloudLink }[]>;
  approvalSeen(reviewId: string): Promise<null>;
  configure(reviewId: string, settings: { expiresAt?: number | null; revoked?: boolean; allowDownload?: boolean; showNotes?: boolean }): Promise<LinkSettings>;
}

export function createCloudApi(token: string, url: string = cloudUrl(), fetchFn: FetchLike = fetch): CloudApi {
  const base = url.replace(/\/$/, "");
  const call = <T>(kind: "query" | "mutation" | "action", path: string, args: Record<string, unknown> = {}) =>
    convexCall<T>(base, kind, path, { ...args, token }, fetchFn);
  return {
    url: base,
    list: () => call("query", "cloud:list"),
    get: (reviewId) => call("query", "cloud:get", { reviewId }),
    meta: (reviewId) => call("query", "cloud:meta", { reviewId }),
    open: (input) => call("mutation", "cloud:open", input),
    addVersion: (reviewId, version) => call("mutation", "cloud:addVersion", { reviewId, version }),
    uploadProgress: (reviewId, version, bytes) => call("mutation", "cloud:uploadProgress", { reviewId, version, bytes }),
    versionReady: (reviewId, version, assets) => call("mutation", "cloud:versionReady", { reviewId, version, ...assets }),
    sourceUrl: (reviewId, version) => call("action", "cloud:sourceUrl", { reviewId, version }),
    versionFailed: (reviewId, version, error) => call("mutation", "cloud:versionFailed", { reviewId, version, error }),
    setTranscript: (reviewId, version, t) => call("mutation", "cloud:setTranscript", { reviewId, version, ...t }),
    transcript: (reviewId, version) => call("query", "cloud:transcript", { reviewId, version }),
    setPicks: (reviewId, picks) => call("mutation", "cloud:setPicks", { reviewId, ...picks }),
    setWaiting: (reviewId, waiting) => call("mutation", "cloud:setWaiting", { reviewId, waiting }),
    addComment: (reviewId, comment) => call("mutation", "cloud:addComment", { reviewId, comment }),
    updateComment: (reviewId, commentId, text) => call("mutation", "cloud:updateComment", { reviewId, commentId, text }),
    deleteComment: (reviewId, commentId) => call("mutation", "cloud:deleteComment", { reviewId, commentId }),
    setCommentFrame: (reviewId, commentId, assetId) => call("mutation", "cloud:setCommentFrame", { reviewId, commentId, assetId }),
    submit: (reviewId, message) => call("mutation", "cloud:submit", { reviewId, message }),
    reopen: (reviewId) => call("mutation", "cloud:reopen", { reviewId }),
    markDelivered: (reviewId, batchIds) => call("mutation", "cloud:markDelivered", { reviewId, batchIds }),
    resolveComments: (reviewId, ids, note) => call("mutation", "cloud:resolveComments", { reviewId, ids, note }),
    requestUpload: (input) => call("action", "uploads:request", input),
    registerUpload: (input) => call("mutation", "uploads:register", { ...input }),
    share: (reviewId, version) => call("mutation", "cloud:share", { reviewId, version }),
    link: (reviewId) => call("query", "cloud:link", { reviewId }),
    links: () => call("query", "cloud:links"),
    approvalSeen: (reviewId) => call("mutation", "cloud:approvalSeen", { reviewId }),
    configure: (reviewId, settings) => call("mutation", "shares:configure", { localId: reviewId, ...settings }),
  };
}
