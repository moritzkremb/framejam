export type CommentStatus = "draft" | "sent" | "resolved";
/** `panel`: about one storyboard panel as a whole, without a pinned spot. */
export type CommentKind = "pin" | "range" | "panel" | "general";
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
  /** Storyboards: the 1-based panel the comment is on. */
  panel?: number;
  /** The whole video, or the whole storyboard. */
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

/** One storyboard panel: a still image plus optional words about the shot. */
export interface StoryboardPanel {
  /** Copy of the image taken when the version was created (path inside the review folder). */
  image: string;
  sourcePath: string;
  sourceMtime?: number;
  title?: string;
  /** Shot description, camera move, voiceover line, duration… */
  caption?: string;
}

export interface ReviewVersion {
  number: number;
  videoPath?: string;
  /** Copy of the render taken when the version was created (file name inside the review folder). */
  videoSnapshot?: string;
  compositionDir?: string;
  compositionEntry?: string;
  /** Storyboard versions have panels instead of a video. */
  panels?: StoryboardPanel[];
  /** Folder the panels came from; add_version re-reads it when given nothing new. */
  panelsDir?: string;
  note?: string;
  createdAt: string;
  /** Set when the user pressed Send on this version. A sent version is locked: no new or edited comments. */
  sentAt?: string;
  /** The batch that carried this version's comments to the agent. */
  batchId?: string;
  /** Set when the user reopened this version after the agent already received its comments. */
  reopenedFrom?: string;
}

export interface FeedbackBatch {
  id: string;
  createdAt: string;
  commentIds: string[];
  message?: string;
  deliveredAt?: string;
  /** The user reopened the version after this batch reached the agent; a later batch replaces it. */
  retractedAt?: string;
  /** The retracted batch this one replaces. */
  replaces?: string;
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
  /** Computed by the API, not stored: an agent is in (or between) wait_for_feedback calls for this review. */
  agentListening?: boolean;
  /** The agent's FrameJam process started before the current build, so it may lack newer features (like the listening heartbeat). */
  agentOutdated?: boolean;
}

/** The agent harness that last connected over MCP (from the MCP `initialize` client info). */
export interface AgentInfo {
  name: string;
  version?: string;
  at: string;
  /** The script that MCP process was started from, and its content hash at the time. */
  entry?: string;
  build?: string;
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
