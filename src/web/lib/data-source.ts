import { api, panelUrl, videoUrl, type Review, type ReviewComment, type Transcript, type TranscriptionStatus } from "@/lib/api";

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
  videoUrl,
  panelUrl,
};
