export type CommentStatus = "draft" | "sent" | "resolved";
/** `panel`: about one storyboard panel as a whole, without a pinned spot. */
export type CommentKind = "pin" | "range" | "panel" | "general";

/** A pointing phrase in a spoken comment ("this", "over here") and the frame the reviewer was showing when they said it. */
export interface VoicePoint {
  phrase: string;
  /** Seconds into the recording when it was said. */
  at: number;
  /** Seconds into the video. */
  time: number;
  /** Normalized (0-1) pin position on the frame, when the reviewer had pinned one. */
  x?: number;
  y?: number;
  /** The frame image, with any pin and drawing on it: a file name in the review's thumbs folder, or a URL on a shared link. */
  frame?: string;
  /** The reviewer drew on the frame. */
  drawn?: boolean;
}

/** What a spoken comment adds to its `text` (the verbatim transcript, or a note that there isn't one). */
export interface VoiceComment {
  /** `pending`: no transcription service was set up when it was sent. `failed`: the service couldn't read it. */
  status: "transcribed" | "pending" | "failed";
  /** Seconds. */
  duration?: number;
  /** The recording, on the share link. */
  audioUrl?: string;
  /** Why there's no transcript, in words fit to show. */
  note?: string;
  /** Pointing phrases in the order they were said. */
  points: VoicePoint[];
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
  thumbnail?: string;
  status: CommentStatus;
  createdAt: string;
  sentAt?: string;
  batchId?: string;
  resolvedAt?: string;
  resolution?: { note?: string; version: number };
  /** A guest who commented on a shared link (FrameJam Cloud); comments the creator wrote have none. */
  author?: string;
  /** The comment's id in the cloud, so pulling it twice adds it once. */
  cloudId?: string;
  /** A guest's comment was written on this earlier version; it sits on the latest one. */
  fromVersion?: number;
  /** Spoken, not typed: `text` is the transcript. */
  voice?: VoiceComment;
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

/** Local transcription of one version (see `src/server/transcribe.ts`). */
export type TranscriptionStatus =
  | { state: "done"; local: boolean }
  /** Storyboards, or a version that doesn't exist. */
  | { state: "unavailable" }
  | { state: "ready" }
  /** whisper.cpp (or ffmpeg) isn't installed. */
  | { state: "no-tool"; ffmpeg: boolean }
  /** whisper.cpp is there but no model: starting downloads one this size. */
  | { state: "no-model"; modelSize: string }
  /** `downloading` is the model download's progress (0–1) while it runs first. */
  | { state: "queued" | "running"; progress?: number; downloading?: number }
  | { state: "failed"; error?: string };

export interface ReviewVersion {
  number: number;
  videoPath?: string;
  /** Copy of the render taken when the version was created (file name inside the review folder). */
  videoSnapshot?: string;
  /** Storyboard versions have panels instead of a video. */
  panels?: StoryboardPanel[];
  /** Folder the panels came from; add_version re-reads it when given nothing new. */
  panelsDir?: string;
  /** What's said in the video, parsed into timed words and kept as a file inside the review folder. */
  /** Without `sourcePath`, FrameJam transcribed the render itself. */
  transcript?: { file: string; sourcePath?: string; words: number };
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
  /** The playbook and style picked for this video, if any; later versions keep them. */
  playbookId?: string;
  styleId?: string;
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

export type PickKind = "playbook" | "style";

/** The agent asked the user to pick a playbook and/or style for one video, and is waiting for the answer. */
export interface VideoPick {
  id: string;
  kinds: PickKind[];
  /** What the video is about, shown on the pick page. */
  title?: string;
  createdAt: string;
  /** cancelled: a newer pick replaced it. dismissed: the user closed it without choosing. */
  status: "waiting" | "picked" | "cancelled" | "dismissed";
  /** null: the user chose none. */
  playbookId?: string | null;
  styleId?: string | null;
  pickedAt?: string;
  /** Last time an agent was in wait_for_pick for it. */
  listenedAt?: string;
  /** Sent by the HTTP API: whether an agent is still waiting on it. */
  listening?: boolean;
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
  /** Raised on every change, so the catalog's copy can replace an older bundled one. */
  version?: string;
  /** The first app version that can use this style; required for styles in the catalog. */
  minAppVersion?: string;
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
  /** Look rules that work for any subject. */
  guide: string;
  /** What the preview video shows; agents don't copy this scene unless asked. */
  example?: string;
  tags?: string[];
}

export interface PresetSummary extends PresetStyle {
  /** Where this copy came from. "catalog" means it was updated from framejam.ai. */
  source?: "bundled" | "catalog" | "user";
  hasPreview: boolean;
  hasPoster: boolean;
  previewUrl?: string;
  posterUrl?: string;
}

export interface PlaybookCreator {
  id: string;
  name: string;
  url?: string;
}

export interface PlaybookNeed {
  name: string;
  /** included: ships with the playbook. computer: installed locally, free. service: an outside account. */
  where: "included" | "computer" | "service";
  cost?: "free" | "free tier" | "paid";
  examples?: string[];
  optional?: boolean;
}

/** A library style made for one playbook: how it's applied there, shown with its own example video. */
export interface PlaybookStyle {
  /** A style id from the library. */
  id: string;
  /** For the agent: how this style is applied in this playbook. */
  note?: string;
  /** Ready values for the playbook's own settings (e.g. a template's theme); the playbook's SKILL.md says where they go. */
  settings?: Record<string, unknown>;
}

/** Another finished video made with a playbook, shown next to its main example (a different look or route). */
export interface PlaybookExample {
  id: string;
  /** Short name in the example switcher, e.g. "Cartoon". */
  label: string;
  /** For the agent: what's different about this one and how it was made. */
  note?: string;
}

export interface Playbook {
  id: string;
  name: string;
  tagline: string;
  description: string;
  version: string;
  /** Oldest FrameJam (major.minor.patch) that can use this playbook. Apps older than this skip a downloaded copy. */
  minAppVersion?: string;
  creator: PlaybookCreator;
  inspiredBy?: { name: string; url?: string }[];
  license?: string;
  source?: string;
  bring: string[];
  get: string;
  format: "16:9" | "9:16" | "1:1" | "any";
  /** new: starts its own project. any: works in the project's existing tool. */
  project: "new" | "any";
  needs: PlaybookNeed[];
  /** How a selected style combines with this playbook. */
  styles: "all" | "parts" | "inspiration" | "none";
  stylesNote?: string;
  /** Styles made for this playbook, first one first. Any other style still works as `styles` says. */
  featuredStyles?: PlaybookStyle[];
  /** More finished videos made with it, each with its own example in previews/<id>/. */
  examples?: PlaybookExample[];
  steps: string[];
  tags?: string[];
  skill: string;
}

export interface PlaybookStyleSummary extends PlaybookStyle {
  /** This playbook made in this style; without one, show the style's own example. */
  previewUrl?: string;
  posterUrl?: string;
}

export interface PlaybookExampleSummary extends PlaybookExample {
  previewUrl?: string;
  posterUrl?: string;
}

export interface PlaybookSummary extends Omit<Playbook, "featuredStyles" | "examples"> {
  builtin: boolean;
  /** Where this copy came from. "catalog" means it was updated from framejam.ai. */
  source?: "bundled" | "catalog" | "user";
  /** Set when this is the user's own copy and the app has a higher version of it. */
  newerVersion?: string;
  /** The example video's shape, read from its poster. */
  previewShape: "wide" | "tall" | "square";
  hasPreview: boolean;
  previewUrl?: string;
  posterUrl?: string;
  featuredStyles: PlaybookStyleSummary[];
  examples: PlaybookExampleSummary[];
}

export interface PresetFilter {
  mood?: string;
  pacing?: string;
  format?: string;
  query?: string;
}

/** A style preset as a store loads it. `dir` is its folder when it lives on this computer. */
export interface LoadedPreset {
  style: PresetStyle;
  dir?: string;
  builtin: boolean;
}

/** A playbook as a store loads it. `dir` is its folder when it lives on this computer. */
export interface LoadedPlaybook {
  playbook: Playbook;
  dir?: string;
  builtin: boolean;
  /** Where this copy came from. Catalog copies count as built in. */
  source?: "bundled" | "catalog" | "user";
  /** Set on a user's own copy when the app has a higher version of the same playbook. */
  newerVersion?: string;
}
