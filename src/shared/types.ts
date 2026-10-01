export type CommentStatus = "draft" | "sent" | "resolved";
export type CommentKind = "pin" | "range" | "general";
export type PlayerSource = "video" | "live";

export interface TweenInfo {
  targets: string[];
  start: number;
  end: number;
  ease?: string;
  props: Record<string, string | number | boolean>;
  relation: "active" | "previous" | "next";
}

export interface ElementInfo {
  selector: string;
  tagName: string;
  text?: string;
  /** Normalized (0-1) bounding box of the element inside the frame. */
  rect?: { x: number; y: number; width: number; height: number };
  /** Nearest Hyperframes clip (`[data-start]`) containing the element. */
  clip?: { selector: string; start?: string; duration?: string; trackIndex?: string };
  tweens: TweenInfo[];
}

export interface ReviewComment {
  id: string;
  version: number;
  kind: CommentKind;
  time: number;
  endTime?: number;
  /** Normalized (0-1) pin position on the frame. */
  x?: number;
  y?: number;
  wholeVideo?: boolean;
  text: string;
  source?: PlayerSource;
  element?: ElementInfo;
  thumbnail?: string;
  status: CommentStatus;
  createdAt: string;
  sentAt?: string;
  batchId?: string;
  resolvedAt?: string;
  resolution?: { note?: string; version: number };
}

export interface ReviewVersion {
  number: number;
  videoPath?: string;
  /** Copy of the render taken when the version was created (file name inside the review folder). */
  videoSnapshot?: string;
  compositionDir?: string;
  compositionEntry?: string;
  note?: string;
  createdAt: string;
  /** Set when the user pressed Send on this version. A sent version is locked: no new or edited comments. */
  sentAt?: string;
  /** The batch that carried this version's comments to the agent. */
  batchId?: string;
}

export interface FeedbackBatch {
  id: string;
  createdAt: string;
  commentIds: string[];
  message?: string;
  deliveredAt?: string;
}

export interface Review {
  id: string;
  title: string;
  projectKey: string;
  createdAt: string;
  updatedAt: string;
  versions: ReviewVersion[];
  comments: ReviewComment[];
  batches: FeedbackBatch[];
  /** Set when an agent is currently blocked in wait_for_feedback. */
  agentWaitingAt?: string;
}

/** The agent harness that last connected over MCP (from the MCP `initialize` client info). */
export interface AgentInfo {
  name: string;
  version?: string;
  at: string;
}

export interface PresetFont {
  family: string;
  weights?: number[];
  source?: string;
  usage?: string;
}

export interface PresetStyle {
  id: string;
  name: string;
  tagline: string;
  description: string;
  mood: string[];
  pacing: "slow" | "medium" | "fast";
  format: "16:9" | "9:16" | "1:1";
  width: number;
  height: number;
  durationSeconds: number;
  palette: Record<string, string>;
  fonts: Record<string, PresetFont>;
  easing: Record<string, string>;
  transitions: string[];
  textAnimations: string[];
  rhythm: { averageShotSeconds: number; holdAfterTextSeconds?: number; notes?: string };
  guide: string;
  tags?: string[];
}

export interface PresetSummary extends PresetStyle {
  hasPreview: boolean;
  hasPoster: boolean;
  previewUrl?: string;
  posterUrl?: string;
  compositionUrl: string;
}
