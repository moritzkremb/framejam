import { api, panelUrl, videoUrl, type Review, type ReviewComment, type ShareInfo, type Transcript, type TranscriptionStatus } from "@/lib/api";

export type NewComment = Partial<ReviewComment> & { text: string; time: number; thumbnailDataUrl?: string };

/** Everything the review screens read and write, so they can run against something other than the local server. */
export interface ReviewDataSource {
  review(id: string): Promise<Review>;
  /** Calls `onChange` whenever the review changes elsewhere; returns the unsubscribe. */
  subscribe(id: string, onChange: () => void): () => void;
  addComment(id: string, body: NewComment): Promise<ReviewComment>;
  updateComment(id: string, commentId: string, body: { text: string }): Promise<unknown>;
  deleteComment(id: string, commentId: string): Promise<unknown>;
  submit(id: string): Promise<{ batch: { id: string; commentIds: string[] }; agentListening: boolean }>;
  reopen(id: string): Promise<{ wasDelivered: boolean; review: Review }>;
  /** Only called for versions that have one (`version.transcript`). */
  transcript(id: string, version: number): Promise<Transcript>;
  /** Transcribing on this computer, for versions without one. Optional: without it there's no local transcription. */
  transcription?(id: string, version: number): Promise<TranscriptionStatus>;
  transcribe?(id: string, version: number): Promise<TranscriptionStatus>;
  /** The version's comments as text to paste into an agent chat. */
  prompt(id: string, version?: number): Promise<string>;
  /** Saves the video when the browser can't: `chosen` is false when it went to Downloads without asking. */
  downloadVideo(id: string, version: number): Promise<{ path: string; chosen: boolean } | { cancelled: true }>;
  /** A short-lived download of a version's source zip. Optional: only cloud projects have source files. */
  sourceDownload?(id: string, version: number): Promise<{ url: string; filename: string; bytes: number }>;
  /** The project's share link and its settings. Optional: only the local server has one to show the creator. */
  share?(id: string): Promise<ShareInfo>;
  /** `expiresAt` (ms since the epoch, or null for no expiry) and un-revoking are only offered where the source takes them (`shareSettings`). */
  setShare?(id: string, change: { allowDownload?: boolean; revoked?: boolean; expiresAt?: number | null; showNotes?: boolean }): Promise<ShareInfo>;
  /** The creator page: put a version (the latest by default) on the project's link, creating the link the first time. */
  publishShare?(id: string, version?: number): Promise<ShareInfo>;
  /** The creator page can set link expiry and turn a turned-off link back on. */
  shareSettings?: boolean;
  /** Two versions side by side. Offered where every version's video is on hand. */
  compare?: boolean;
  /** A still of the version while its video is still uploading. */
  poster?(id: string, version: number): string | undefined;
  videoUrl(id: string, version: number): string;
  panelUrl(id: string, version: number, panel: number): string;
}

/** The local FrameJam server. */
export const localDataSource: ReviewDataSource = {
  review: api.review,
  subscribe(id, onChange) {
    const es = new EventSource(`/api/reviews/${id}/events`);
    es.addEventListener("changed", onChange);
    return () => es.close();
  },
  addComment: api.addComment,
  updateComment: api.updateComment,
  deleteComment: api.deleteComment,
  submit: (id) => api.submit(id),
  reopen: api.reopen,
  transcript: api.transcript,
  transcription: api.transcription,
  transcribe: api.transcribe,
  prompt: api.prompt,
  downloadVideo: api.downloadVideo,
  sourceDownload: api.sourceDownload,
  share: api.share,
  setShare: api.setShare,
  videoUrl,
  panelUrl,
};
