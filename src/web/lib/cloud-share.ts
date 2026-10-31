import { ConvexClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import type { SpokenWord } from "../../core/voice";
import type { CommentKind, Review, ReviewComment, ReviewVersion } from "@/lib/api";
import type { NewComment, ReviewDataSource } from "@/lib/data-source";

/**
 * The share page's data: a link on FrameJam Cloud (`www.framejam.ai/v/<token>`) instead of the local server. The
 * review id is the link token. Sent comments and approvals come live from Convex (`guest.view`); a guest's own
 * comments stay in this browser as drafts until they press Send, like a local review before Finish.
 *
 * `ShareView` and the function names mirror `convex/guest.ts` in the private framejam-cloud repo.
 */

export interface ShareView {
  title: string;
  kind: "video" | "storyboard";
  versions: Array<{
    number: number;
    note?: string;
    /** Handoff notes, only when the creator turned them on for this link. */
    notes?: string;
    at: number;
    video?: { url?: string; posterUrl?: string; duration?: number; width?: number; height?: number };
    panels?: Array<{ url?: string; title?: string; caption?: string }>;
  }>;
  comments: Array<{
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
    guestName: string;
    frameUrl?: string;
    /** The version that fixed this comment, once the creator shipped it. */
    resolvedIn?: number;
    drawing?: number[][];
    at: number;
    /** A spoken comment: `text` is the transcript, or empty when there isn't one. */
    voice?: {
      status: "transcribed" | "pending" | "failed";
      text?: string;
      duration?: number;
      audioUrl?: string;
      note?: string;
      points: Array<{ phrase: string; at: number; time: number; x?: number; y?: number; frameUrl?: string; drawing?: number[][] }>;
    };
  }>;
  approvals: Array<{ version: number; guestName: string; at: number }>;
  /** A guest approved the latest version: the link carries only that version, no comments, and maybe a download. */
  approved?: { version: number; by: string; at: number; download: boolean };
}

export interface Guest {
  name: string;
  email: string;
}

/** A comment as `guest.send` takes it. */
export interface SentComment {
  kind: CommentKind;
  time: number;
  endTime?: number;
  x?: number;
  y?: number;
  panel?: number;
  wholeVideo?: boolean;
  text: string;
  drawing?: number[][];
  frame?: { key: string; bytes: number };
  voice?: { id: string; points: Array<{ phrase: string; at: number; time: number; x?: number; y?: number; drawing?: number[][]; frame?: { key: string; bytes: number } }> };
}

/** What `voice.transcribe` returns for an uploaded recording. */
export interface VoiceResult {
  voiceId: string;
  status: "transcribed" | "pending" | "failed";
  text?: string;
  words: SpokenWord[];
  duration?: number;
  note?: string;
}

/** The cloud calls the share page makes; `convexShareBackend` is the real one, tests pass a fake. */
export interface ShareBackend {
  /** Calls `onView` with every new result of `guest.view`; returns the unsubscribe. */
  watch(link: string, onView: (view: ShareView | null) => void, onError: (e: Error) => void): () => void;
  view(link: string): Promise<ShareView | null>;
  frameUpload(link: string): Promise<{ uploadUrl: string; storageKey: string }>;
  voiceUpload(link: string, mime: string): Promise<{ uploadUrl: string; storageKey: string; mime: string }>;
  voiceTranscribe(args: { link: string; storageKey: string; bytes: number; mime: string; duration?: number }): Promise<VoiceResult>;
  send(args: { link: string; version: number; name: string; email: string; comments: SentComment[] }): Promise<{ ids: string[] }>;
  approve(args: { link: string; version: number; name: string; email: string }): Promise<{ at: number }>;
  /** A short-lived link that saves the approved video's original file. */
  downloadUrl(link: string): Promise<{ url: string; filename: string }>;
}

const viewRef = makeFunctionReference<"query", { link: string }, ShareView | null>("guest:view");
const frameUploadRef = makeFunctionReference<"action", { link: string }, { uploadUrl: string; storageKey: string }>("guest:frameUpload");
const voiceUploadRef = makeFunctionReference<"action", { link: string; mime: string }, { uploadUrl: string; storageKey: string; mime: string }>("voice:upload");
const voiceTranscribeRef = makeFunctionReference<"action", Parameters<ShareBackend["voiceTranscribe"]>[0], VoiceResult>("voice:transcribe");
const sendRef = makeFunctionReference<"mutation", Parameters<ShareBackend["send"]>[0], { ids: string[] }>("guest:send");
const approveRef = makeFunctionReference<"mutation", Parameters<ShareBackend["approve"]>[0], { at: number }>("guest:approve");
const downloadRef = makeFunctionReference<"action", { link: string }, { url: string; filename: string }>("guest:downloadUrl");

/** Convex's message without the request id and stack it adds in development. */
export function cloudMessage(e: unknown): string {
  const data = (e as { data?: unknown }).data;
  if (typeof data === "string") return data;
  const message = e instanceof Error ? e.message : String(e);
  const uncaught = message.match(/Uncaught (?:ConvexError|Error): ([^\n]+)/);
  return uncaught ? uncaught[1]! : message.replace(/^\[CONVEX [^\]]+\]\s*(\[Request ID: [^\]]+\]\s*)?/, "");
}

export function convexShareBackend(url: string): ShareBackend {
  const client = new ConvexClient(url);
  return {
    watch: (link, onView, onError) => client.onUpdate(viewRef, { link }, onView, onError),
    view: (link) => client.query(viewRef, { link }),
    frameUpload: (link) => client.action(frameUploadRef, { link }),
    voiceUpload: (link, mime) => client.action(voiceUploadRef, { link, mime }),
    voiceTranscribe: (args) => client.action(voiceTranscribeRef, args),
    send: (args) => client.mutation(sendRef, args),
    approve: (args) => client.mutation(approveRef, args),
    downloadUrl: (link) => client.action(downloadRef, { link }),
  };
}

/** A comment on the share page: what the review screens show, plus what the guest drew. */
export type SharedComment = ReviewComment & { drawing?: number[][] };
export type SharedReview = Review & {
  comments: SharedComment[];
  kind: ShareView["kind"];
  approvals: ShareView["approvals"];
  approved?: ShareView["approved"];
  /** Poster image of each video version, by version number. */
  posters: Record<number, string>;
};
/** A spoken comment before it is sent: the transcript, and the frame each pointing phrase shows. */
export interface DraftVoice {
  id: string;
  status: "transcribed" | "pending" | "failed";
  note?: string;
  duration?: number;
  points: Array<{ phrase: string; at: number; time: number; x?: number; y?: number; drawing?: number[][]; frame?: string }>;
}
export type NewSharedComment = NewComment & { drawing?: number[][]; voice?: DraftVoice };

interface Draft {
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
  drawing?: number[][];
  /** JPEG data URL of the frame, with the pin and drawing burned in. */
  frame?: string;
  voice?: DraftVoice;
  createdAt: string;
}

export class LinkClosedError extends Error {
  constructor() {
    super("This link doesn't work anymore. Ask whoever sent it for a new one.");
  }
}

export interface CloudShareSource extends ReviewDataSource {
  review(id: string): Promise<SharedReview>;
  addComment(id: string, body: NewSharedComment): Promise<SharedComment>;
  /** Uploads a recording and has it transcribed. The audio is kept even when transcription isn't available. */
  transcribeVoice(id: string, blob: Blob, mime: string, duration: number): Promise<VoiceResult>;
  guest(): Guest | null;
  setGuest(guest: Guest): void;
  approve(id: string, version: number): Promise<void>;
  /** Versions this browser approved. */
  approvedHere(id: string): number[];
  /** Starts the approved video's download: resolves with the file name once the browser has been handed the file. */
  download(id: string): Promise<string>;
}

const GUEST_KEY = "framejam:guest";
const draftsKey = (link: string) => `framejam:drafts:${link}`;
const approvedKey = (link: string) => `framejam:approved:${link}`;

function readJson<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function iso(ms: number) {
  return new Date(ms).toISOString();
}

function kindOf(body: NewComment): CommentKind {
  if (body.kind) return body.kind;
  if (body.panel !== undefined && !body.wholeVideo) return "panel";
  if (body.x !== undefined && body.y !== undefined) return "pin";
  if (body.endTime !== undefined) return "range";
  return "general";
}

async function dataUrlBlob(dataUrl: string): Promise<Blob> {
  return await (await fetch(dataUrl)).blob();
}

export function cloudShareSource(backend: ShareBackend, storage: Storage = window.localStorage, fetchFn: typeof fetch = fetch): CloudShareSource {
  const views = new Map<string, ShareView | null>();
  const listeners = new Map<string, Set<() => void>>();
  const notify = (link: string) => listeners.get(link)?.forEach((l) => l());
  /** Playback for recordings made in this tab; a reloaded draft keeps its transcript but not its audio. */
  const audioUrls = new Map<string, string>();

  /** The frame helps whoever reads the comment, but the words matter most: a failed upload sends without it. */
  const uploadFrame = async (link: string, dataUrl: string | undefined): Promise<{ key: string; bytes: number } | undefined> => {
    if (!dataUrl) return undefined;
    try {
      const blob = await dataUrlBlob(dataUrl);
      const { uploadUrl, storageKey } = await backend.frameUpload(link);
      const res = await fetchFn(uploadUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob });
      return res.ok ? { key: storageKey, bytes: blob.size } : undefined;
    } catch {
      return undefined;
    }
  };

  const drafts = (link: string) => readJson<Draft[]>(storage, draftsKey(link), []);
  const saveDrafts = (link: string, list: Draft[]) => {
    try {
      storage.setItem(draftsKey(link), JSON.stringify(list));
    } catch {
      // Storage full (frame images are the big part): keep the words, drop the newest frames.
      const lean = list.map((d, i) => (i === list.length - 1 ? { ...d, frame: undefined } : d));
      storage.setItem(draftsKey(link), JSON.stringify(lean));
    }
    notify(link);
  };

  const guest = () => {
    const g = readJson<Guest | null>(storage, GUEST_KEY, null);
    return g?.name && g.email ? g : null;
  };

  const requireView = async (link: string) => {
    let view = views.get(link);
    if (view === undefined) {
      view = await backend.view(link);
      views.set(link, view);
    }
    if (!view) throw new LinkClosedError();
    return view;
  };

  const toReview = (link: string, view: ShareView): SharedReview => {
    const versions: ReviewVersion[] = view.versions.map((v) => ({
      number: v.number,
      note: v.note,
      notes: v.notes,
      createdAt: iso(v.at),
      videoPath: view.kind === "video" ? v.video?.url : undefined,
      panels: v.panels?.map((p, i) => ({ image: p.url ?? "", sourcePath: `panel-${i + 1}`, title: p.title, caption: p.caption })),
    }));
    const me = guest()?.name;
    const sent: SharedComment[] = view.comments.map((c) => ({
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
      status: c.resolvedIn ? "resolved" : "sent",
      resolution: c.resolvedIn ? { version: c.resolvedIn } : undefined,
      createdAt: iso(c.at),
      author: c.guestName,
      drawing: c.drawing,
      voice: c.voice && {
        status: c.voice.status,
        duration: c.voice.duration,
        audioUrl: c.voice.audioUrl,
        note: c.voice.note,
        points: c.voice.points.map((p) => ({ phrase: p.phrase, at: p.at, time: p.time, x: p.x, y: p.y, frame: p.frameUrl, drawn: p.drawing?.length ? true : undefined })),
      },
    }));
    const mine: SharedComment[] = drafts(link).map((d) => ({
      id: d.id,
      version: d.version,
      kind: d.kind,
      time: d.time,
      endTime: d.endTime,
      x: d.x,
      y: d.y,
      panel: d.panel,
      wholeVideo: d.wholeVideo,
      text: d.text,
      thumbnail: d.frame,
      status: "draft",
      createdAt: d.createdAt,
      author: me,
      drawing: d.drawing,
      voice: d.voice && {
        status: d.voice.status,
        duration: d.voice.duration,
        audioUrl: audioUrls.get(d.voice.id),
        note: d.voice.note,
        points: d.voice.points.map((p) => ({ phrase: p.phrase, at: p.at, time: p.time, x: p.x, y: p.y, frame: p.frame, drawn: p.drawing?.length ? true : undefined })),
      },
    }));
    const first = view.versions[0]?.at ?? 0;
    const last = view.versions.at(-1)?.at ?? first;
    return {
      id: link,
      title: view.title,
      projectKey: link,
      createdAt: iso(first),
      updatedAt: iso(last),
      versions,
      comments: [...sent, ...mine],
      batches: [],
      kind: view.kind,
      approvals: view.approvals,
      approved: view.approved,
      posters: Object.fromEntries(view.versions.flatMap((v) => (v.video?.posterUrl ? [[v.number, v.video.posterUrl]] : []))),
    };
  };

  const versionOf = (link: string, n: number) => views.get(link)?.versions.find((v) => v.number === n);

  return {
    async review(id) {
      return toReview(id, await requireView(id));
    },

    subscribe(id, onChange) {
      const set = listeners.get(id) ?? new Set();
      set.add(onChange);
      listeners.set(id, set);
      const unwatch = backend.watch(
        id,
        (view) => {
          views.set(id, view);
          onChange();
        },
        () => onChange(),
      );
      const onStorage = (e: StorageEvent) => {
        if (e.key === draftsKey(id) || e.key === GUEST_KEY) onChange();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        set.delete(onChange);
        unwatch();
        window.removeEventListener("storage", onStorage);
      };
    },

    async addComment(id, body) {
      const view = await requireView(id);
      const draft: Draft = {
        id: `draft_${crypto.randomUUID()}`,
        version: body.version ?? view.versions.at(-1)!.number,
        kind: kindOf(body),
        time: body.time,
        endTime: body.endTime,
        x: body.x,
        y: body.y,
        panel: body.panel,
        wholeVideo: body.wholeVideo,
        text: body.text.trim(),
        drawing: body.drawing?.length ? body.drawing : undefined,
        frame: body.thumbnailDataUrl,
        voice: body.voice,
        createdAt: new Date().toISOString(),
      };
      saveDrafts(id, [...drafts(id), draft]);
      return toReview(id, view).comments.find((c) => c.id === draft.id)!;
    },

    async transcribeVoice(id, blob, mime, duration) {
      await requireView(id);
      try {
        const up = await backend.voiceUpload(id, mime);
        const put = await fetchFn(up.uploadUrl, { method: "PUT", headers: { "Content-Type": up.mime }, body: blob });
        if (!put.ok) throw new Error("The recording couldn't be uploaded. Try again.");
        const result = await backend.voiceTranscribe({ link: id, storageKey: up.storageKey, bytes: blob.size, mime: up.mime, duration });
        audioUrls.set(result.voiceId, URL.createObjectURL(blob));
        return result;
      } catch (e) {
        throw new Error(cloudMessage(e));
      }
    },

    async updateComment(id, commentId, body) {
      const list = drafts(id);
      const draft = list.find((d) => d.id === commentId);
      if (!draft) throw new Error("Sent comments can't be changed");
      if (draft.voice) throw new Error("Voice comments can't be edited");
      draft.text = body.text.trim();
      saveDrafts(id, list);
      return draft;
    },

    async deleteComment(id, commentId) {
      const list = drafts(id);
      if (!list.some((d) => d.id === commentId)) throw new Error("Sent comments can't be deleted");
      saveDrafts(
        id,
        list.filter((d) => d.id !== commentId),
      );
      return {};
    },

    async submit(id) {
      const who = guest();
      if (!who) throw new Error("Add your name and email first");
      const list = drafts(id);
      if (!list.length) throw new Error("Add a comment first");
      const byVersion = new Map<number, Draft[]>();
      for (const d of list) byVersion.set(d.version, [...(byVersion.get(d.version) ?? []), d]);

      const ids: string[] = [];
      for (const [version, group] of byVersion) {
        const comments: SentComment[] = [];
        for (const d of group) {
          const frame = await uploadFrame(id, d.frame);
          const voice: SentComment["voice"] = d.voice && {
            id: d.voice.id,
            points: await Promise.all(
              d.voice.points.map(async (p) => ({ phrase: p.phrase, at: p.at, time: p.time, x: p.x, y: p.y, drawing: p.drawing, frame: await uploadFrame(id, p.frame) })),
            ),
          };
          comments.push({
            kind: d.kind,
            time: d.time,
            endTime: d.endTime,
            x: d.x,
            y: d.y,
            panel: d.panel,
            wholeVideo: d.wholeVideo,
            text: d.voice ? "" : d.text,
            drawing: d.drawing,
            frame,
            voice,
          });
        }
        try {
          const res = await backend.send({ link: id, version, name: who.name, email: who.email, comments });
          ids.push(...res.ids);
        } catch (e) {
          throw new Error(cloudMessage(e));
        }
        const sentIds = new Set(group.map((d) => d.id));
        saveDrafts(
          id,
          drafts(id).filter((d) => !sentIds.has(d.id)),
        );
      }
      return { batch: { id: "", commentIds: ids }, agentListening: false };
    },

    async reopen() {
      throw new Error("Sent comments can't be reopened on a shared link");
    },

    async transcript() {
      throw new Error("No transcript on a shared link");
    },

    async prompt() {
      return "";
    },

    async downloadVideo() {
      return { cancelled: true };
    },

    videoUrl(id, version) {
      return versionOf(id, version)?.video?.url ?? "";
    },

    panelUrl(id, version, panel) {
      return versionOf(id, version)?.panels?.[panel - 1]?.url ?? "";
    },

    guest,

    setGuest(g) {
      storage.setItem(GUEST_KEY, JSON.stringify({ name: g.name.trim(), email: g.email.trim() }));
    },

    async approve(id, version) {
      const who = guest();
      if (!who) throw new Error("Add your name and email first");
      try {
        await backend.approve({ link: id, version, name: who.name, email: who.email });
      } catch (e) {
        throw new Error(cloudMessage(e));
      }
      const approved = readJson<number[]>(storage, approvedKey(id), []);
      if (!approved.includes(version)) storage.setItem(approvedKey(id), JSON.stringify([...approved, version]));
      notify(id);
    },

    approvedHere(id) {
      return readJson<number[]>(storage, approvedKey(id), []);
    },

    async download(id) {
      try {
        const { url, filename } = await backend.downloadUrl(id);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.rel = "noreferrer";
        document.body.append(a);
        a.click();
        a.remove();
        return filename;
      } catch (e) {
        throw new Error(cloudMessage(e));
      }
    },
  };
}
