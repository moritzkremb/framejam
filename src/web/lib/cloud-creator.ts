import { ConvexClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { feedbackPrompt, latestComments, versionComments } from "../../core/feedback";
import type { Store } from "../../core/store";
import { parseTranscript } from "../../core/transcript";
import type { CommentKind, Review, ReviewComment, ReviewVersion, ShareInfo, Transcript } from "@/lib/api";
import { cloudMessage } from "@/lib/cloud-share";
import type { NewComment, ReviewDataSource } from "@/lib/data-source";

/**
 * The creator's review page (`app.framejam.ai/p/<id>`): a cloud project read and written straight in Convex, signed
 * in with the creator's Clerk session. The shapes and function names mirror `convex/cloud.ts` in the private
 * framejam-cloud repo, whose `WireReview` is the local `Review` with file URLs instead of file paths.
 */

export interface WirePanel {
  sourcePath: string;
  title?: string;
  caption?: string;
  url?: string;
}

export interface WireVersion {
  number: number;
  panels?: WirePanel[];
  note?: string;
  createdAt: string;
  sentAt?: string;
  batchId?: string;
  reopenedFrom?: string;
  upload: { state: "uploading" | "ready" | "failed"; bytes: number; total: number; error?: string };
  hasVideo: boolean;
  videoUrl?: string;
  posterUrl?: string;
  transcript?: { sourcePath?: string; words: number };
}

export interface WireComment {
  id: string;
  version: number;
  kind: CommentKind;
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
  listeningAt: number | null;
  versions: WireVersion[];
  comments: WireComment[];
  batches: WireBatch[];
}

export interface CloudLink {
  token: string;
  createdAt: number;
  sharedVersion: number | null;
  expiresAt: number | null;
  revokedAt: number | null;
  approved: { version: number; by: string; at: number } | null;
  allowDownload: boolean;
  opens: number;
  lastOpenedAt: number | null;
  approvals: { version: number; guestName: string; at: number }[];
  guestCommentsWaiting: number;
}

export interface CreatorBackend {
  /** Calls `onReview` with every new result of `cloud.get`; returns the unsubscribe. */
  watch(id: string, onReview: (review: WireReview | null) => void, onError: (e: Error) => void): () => void;
  get(id: string): Promise<WireReview | null>;
  addComment(id: string, comment: { version?: number; time: number; endTime?: number; x?: number; y?: number; panel?: number; wholeVideo?: boolean; kind?: CommentKind; text: string }): Promise<WireComment>;
  updateComment(id: string, commentId: string, text: string): Promise<void>;
  deleteComment(id: string, commentId: string): Promise<void>;
  submit(id: string): Promise<{ batch: WireBatch }>;
  reopen(id: string): Promise<{ wasDelivered: boolean }>;
  transcript(id: string, version: number): Promise<string | null>;
  frameTicket(filename: string): Promise<{ uploadUrl: string; storageKey: string }>;
  registerFrame(args: { storageKey: string; bytes: number }): Promise<{ assetId: string }>;
  setCommentFrame(id: string, commentId: string, assetId: string): Promise<void>;
  /** The project's link, or null before the first share. */
  link(id: string): Promise<CloudLink | null>;
  /** Calls `onLink` with every new result of `cloud.link`; returns the unsubscribe. */
  watchLink(id: string, onLink: (link: CloudLink | null) => void, onError: (e: Error) => void): () => void;
  share(id: string, version?: number): Promise<CloudLink>;
  configure(id: string, change: { expiresAt?: number | null; revoked?: boolean; allowDownload?: boolean }): Promise<void>;
}

const ref = <A extends Record<string, unknown>, R>(kind: "query" | "mutation" | "action", name: string) => makeFunctionReference<typeof kind, A, R>(name);

/** A Convex client signed in with a Clerk token fetched on demand (`GET /api/convex-token`). */
export function convexCreatorBackend(url: string, getToken: (forceRefresh: boolean) => Promise<string | null>): CreatorBackend {
  const client = new ConvexClient(url);
  client.setAuth(async ({ forceRefreshToken }) => getToken(forceRefreshToken));
  const q = <A extends Record<string, unknown>, R>(name: string, args: A) => client.query(ref<A, R>("query", `cloud:${name}`) as never, args as never) as Promise<R>;
  const m = <A extends Record<string, unknown>, R>(name: string, args: A, module = "cloud") => client.mutation(ref<A, R>("mutation", `${module}:${name}`) as never, args as never) as Promise<R>;
  const wrap = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (e) {
      throw new Error(cloudMessage(e));
    }
  };
  return {
    watch: (id, onReview, onError) => client.onUpdate(ref<{ reviewId: string }, WireReview | null>("query", "cloud:get") as never, { reviewId: id } as never, onReview as never, onError),
    get: (id) => q<{ reviewId: string }, WireReview | null>("get", { reviewId: id }),
    addComment: (id, comment) => wrap(() => m("addComment", { reviewId: id, comment })),
    updateComment: (id, commentId, text) => wrap(() => m("updateComment", { reviewId: id, commentId, text })),
    deleteComment: (id, commentId) => wrap(() => m("deleteComment", { reviewId: id, commentId })),
    submit: (id) => wrap(() => m("submit", { reviewId: id })),
    reopen: (id) => wrap(() => m("reopen", { reviewId: id })),
    transcript: (id, version) => q<{ reviewId: string; version: number }, string | null>("transcript", { reviewId: id, version }),
    frameTicket: (filename) => wrap(() => client.action(ref<{ filename: string; mime: string; kind: string }, { uploadUrl: string; storageKey: string }>("action", "uploads:request") as never, { filename, mime: "image/jpeg", kind: "frame" } as never) as Promise<{ uploadUrl: string; storageKey: string }>),
    registerFrame: (args) => wrap(() => m("register", { ...args, mime: "image/jpeg" }, "uploads")),
    setCommentFrame: (id, commentId, assetId) => wrap(() => m("setCommentFrame", { reviewId: id, commentId, assetId })),
    link: (id) => q<{ reviewId: string }, CloudLink | null>("link", { reviewId: id }),
    watchLink: (id, onLink, onError) => client.onUpdate(ref<{ reviewId: string }, CloudLink | null>("query", "cloud:link") as never, { reviewId: id } as never, onLink as never, onError),
    share: (id, version) => wrap(() => m("share", { reviewId: id, ...(version ? { version } : {}) })),
    configure: (id, change) => wrap(() => m("configure", { localId: id, ...change }, "shares")),
  };
}

export type CreatorSource = ReviewDataSource & {
  /** The creator page can compare two versions side by side. */
  compare: true;
  shareSettings: true;
  publishShare(id: string, version?: number): Promise<ShareInfo>;
  poster(id: string, version: number): string | undefined;
};

/** How long after its last heartbeat the agent still counts as listening. Same as the local store. */
const LISTEN_GRACE_MS = 15_000;

const noStore = {
  thumbnailFile: async () => undefined,
  panelFileFor: async () => undefined,
  transcriptFor: async () => undefined,
} as unknown as Store;

function shareInfo(link: CloudLink | null, origin: string): ShareInfo {
  if (!link) return { shared: false };
  const closed = link.revokedAt !== null || (link.expiresAt !== null && link.expiresAt <= Date.now());
  return {
    shared: true,
    url: `${origin}/v/${link.token}`,
    versions: link.sharedVersion ? Array.from({ length: link.sharedVersion }, (_, i) => i + 1) : [],
    approvals: link.approvals,
    approved: link.approved,
    allowDownload: link.allowDownload,
    closed,
    expiresAt: link.expiresAt,
    revokedAt: link.revokedAt,
    opens: link.opens,
    lastOpenedAt: link.lastOpenedAt,
  };
}

async function dataUrlBytes(dataUrl: string): Promise<Blob> {
  return await (await fetch(dataUrl)).blob();
}

export function creatorSource(backend: CreatorBackend, opts: { shareOrigin?: string; fetchFn?: typeof fetch; now?: () => number } = {}): CreatorSource {
  const shareOrigin = opts.shareOrigin ?? "https://www.framejam.ai";
  const fetchFn = opts.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const now = opts.now ?? Date.now;
  const views = new Map<string, WireReview | null>();
  const links = new Map<string, CloudLink | null>();

  const toReview = (wire: WireReview): Review => ({
    id: wire.id,
    title: wire.title,
    projectKey: wire.projectKey,
    createdAt: wire.createdAt,
    updatedAt: wire.updatedAt,
    playbookId: wire.playbookId,
    styleId: wire.styleId,
    versions: wire.versions.map(
      (v): ReviewVersion => ({
        number: v.number,
        // The page only asks "is there a video"; the file's address is `videoUrl`.
        videoPath: v.hasVideo ? v.videoUrl : undefined,
        panels: v.panels?.map((p) => ({ image: p.url ?? "", sourcePath: p.sourcePath, title: p.title, caption: p.caption })),
        transcript: v.transcript ? { file: "", sourcePath: v.transcript.sourcePath, words: v.transcript.words } : undefined,
        note: v.note,
        createdAt: v.createdAt,
        sentAt: v.sentAt,
        batchId: v.batchId,
        reopenedFrom: v.reopenedFrom,
        upload: v.upload.state === "ready" ? undefined : { state: v.upload.state, bytes: v.upload.bytes, total: v.upload.total, error: v.upload.error },
      }),
    ),
    comments: wire.comments.map(
      (c): ReviewComment => ({
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
        thumbnail: c.frameUrl,
        status: c.status,
        createdAt: c.createdAt,
        sentAt: c.sentAt,
        batchId: c.batchId,
        resolvedAt: c.resolvedAt,
        resolution: c.resolution,
        author: c.author,
        cloudId: c.cloudId,
        fromVersion: c.fromVersion,
      }),
    ),
    batches: wire.batches,
    agentListening: wire.listeningAt !== null && now() - wire.listeningAt < LISTEN_GRACE_MS,
    cloud: true,
  });

  const require = async (id: string): Promise<WireReview> => {
    let wire = views.get(id);
    if (wire === undefined) {
      wire = await backend.get(id);
      views.set(id, wire);
    }
    if (!wire) throw new Error("This project isn't here");
    return wire;
  };

  const urlOf = (id: string, version: number) => views.get(id)?.versions.find((v) => v.number === version)?.videoUrl ?? "";

  const uploadFrame = async (id: string, commentId: string, dataUrl: string) => {
    // The frame helps you see what you meant; the comment stands without it.
    try {
      const blob = await dataUrlBytes(dataUrl);
      const ticket = await backend.frameTicket(`${commentId}.jpg`);
      const res = await fetchFn(ticket.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob });
      if (!res.ok) return;
      const { assetId } = await backend.registerFrame({ storageKey: ticket.storageKey, bytes: blob.size });
      await backend.setCommentFrame(id, commentId, assetId);
    } catch {
      // Keep the comment.
    }
  };

  const linkOf = async (id: string) => {
    if (!links.has(id)) links.set(id, await backend.link(id));
    return links.get(id) ?? null;
  };

  return {
    compare: true,
    shareSettings: true,

    poster: (id, version) => views.get(id)?.versions.find((v) => v.number === version)?.posterUrl,

    async review(id) {
      return toReview(await require(id));
    },

    subscribe(id, onChange) {
      const unwatch = backend.watch(
        id,
        (wire) => {
          views.set(id, wire);
          onChange();
        },
        () => onChange(),
      );
      const unwatchLink = backend.watchLink(
        id,
        (link) => {
          links.set(id, link);
          onChange();
        },
        () => {},
      );
      // The agent's "listening" badge expires without anything changing in the cloud.
      const tick = setInterval(onChange, 5_000);
      return () => {
        unwatch();
        unwatchLink();
        clearInterval(tick);
      };
    },

    async addComment(id, body: NewComment) {
      const comment = await backend.addComment(id, {
        version: body.version,
        kind: body.kind,
        time: body.time,
        endTime: body.endTime,
        x: body.x,
        y: body.y,
        panel: body.panel,
        wholeVideo: body.wholeVideo,
        text: body.text,
      });
      if (body.thumbnailDataUrl) await uploadFrame(id, comment.id, body.thumbnailDataUrl);
      return { ...comment } as ReviewComment;
    },

    async updateComment(id, commentId, body) {
      await backend.updateComment(id, commentId, body.text);
      return {};
    },

    async deleteComment(id, commentId) {
      await backend.deleteComment(id, commentId);
      return {};
    },

    async submit(id) {
      const { batch } = await backend.submit(id);
      const wire = views.get(id) ?? (await backend.get(id));
      const listening = wire?.listeningAt !== null && wire?.listeningAt !== undefined && now() - wire.listeningAt < LISTEN_GRACE_MS;
      return { batch: { id: batch.id, commentIds: batch.commentIds }, agentListening: listening };
    },

    async reopen(id) {
      const { wasDelivered } = await backend.reopen(id);
      const wire = await backend.get(id);
      views.set(id, wire);
      if (!wire) throw new Error("This project isn't here");
      return { wasDelivered, review: toReview(wire) };
    },

    async transcript(id, version): Promise<Transcript> {
      const json = await backend.transcript(id, version);
      if (!json) throw new Error("This version has no transcript");
      return parseTranscript(json, "transcript.json");
    },

    async prompt(id, version) {
      const review = toReview(await require(id));
      const comments = version ? versionComments(review, version) : latestComments(review);
      return await feedbackPrompt(noStore, window.location.origin, review, comments, { url: `${window.location.origin}/p/${id}` });
    },

    async downloadVideo(id, version) {
      const url = urlOf(id, version);
      if (!url) throw new Error("This version has no video yet");
      window.open(url, "_blank", "noopener");
      return { path: url, chosen: true };
    },

    async share(id) {
      return shareInfo(await linkOf(id), shareOrigin);
    },

    async setShare(id, change) {
      await backend.configure(id, change);
      links.delete(id);
      return shareInfo(await linkOf(id), shareOrigin);
    },

    async publishShare(id, version) {
      const link = await backend.share(id, version);
      links.set(id, link);
      return shareInfo(link, shareOrigin);
    },

    videoUrl: (id, version) => urlOf(id, version),
    panelUrl: (id, version, panel) => views.get(id)?.versions.find((v) => v.number === version)?.panels?.[panel - 1]?.url ?? "",
  };
}
