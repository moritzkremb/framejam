import type { ReactNode } from "react";
import { burnFrame } from "@/components/review/drawing";
import type { DockPrimary } from "@/components/review/dock";
import type { CommentRules } from "@/components/review/review-shell";
import type { VoiceSample, VoiceTake } from "@/components/review/voice";
import type { ReviewComment } from "@/lib/api";
import type { CloudShareSource, DraftVoice, NewSharedComment } from "@/lib/cloud-share";
import { findPointingPhrases } from "../../../core/voice";

/** Builds the comment to add from what's on screen; null when there's nothing to add. */
export type MakeComment = () => Promise<NewSharedComment | null>;

/**
 * What the share page hands the review screens for a guest: who they are, Send, Approve, voice, and the rules for
 * their comments. Everything else on the page is the same screen the creator sees.
 */
export interface GuestKit {
  /** "Commenting as …", beside Send. */
  status: ReactNode;
  primary: DockPrimary;
  /** Drafts Send would send. */
  draftCount: number;
  /** Sending, or retrying a voice upload: Send waits. */
  busy: boolean;
  adding: boolean;
  /** Adds a comment once the guest has given a name, asking first if needed; `after` runs once it's added. */
  add(make: MakeComment, after: (c: ReviewComment) => void): void;
  /** Sends every draft, adding `pending` (the comment being typed) first. */
  send(pending?: { make: MakeComment; after: (c: ReviewComment) => void }): void;
  /** Starts a recording once the guest has a name. */
  startVoice(start: () => void): void;
  addTake(take: VoiceTake, make: MakeVoiceDraft, after: () => void): Promise<void>;
  rules: CommentRules;
  /** Above the comments: who approved the version on screen. */
  before?: ReactNode;
  /** In the header: Approve. */
  actions?: ReactNode;
}

/** The words of a take, and which of them point: what a draft voice comment is made of. */
export async function transcribeTake(data: CloudShareSource, link: string, take: VoiceTake) {
  const result = await data.transcribeVoice(link, take.blob, take.mime, take.duration);
  const phrases = result.status === "transcribed" ? findPointingPhrases(result.words) : [];
  const text = result.status === "transcribed" && result.text?.trim() ? result.text.trim() : "";
  return { result, phrases, text };
}

export type Heard = Awaited<ReturnType<typeof transcribeTake>>;
/** Builds a take's draft from what was heard, or from nothing when the upload failed; made when recording stops, so a retry points where the guest did. */
export type MakeVoiceDraft = (heard: Heard | null) => Promise<NewSharedComment>;

export function draftVoice(result: Heard["result"], points: DraftVoice["points"]): DraftVoice {
  return { id: result.voiceId, status: result.status, note: result.note, duration: result.duration, points };
}

/** What a recording shows for one sample: the pin and drawing apply only when the sample has them. */
export async function frameOf(sample: VoiceSample | undefined) {
  if (!sample) return undefined;
  const pin = sample.x !== undefined && sample.y !== undefined ? { x: sample.x, y: sample.y } : undefined;
  return await burnFrame(sample.frame, { pin, strokes: sample.strokes });
}
