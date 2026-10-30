import type {
  AgentInfo,
  CommentKind,
  FeedbackBatch,
  LoadedPlaybook,
  LoadedPreset,
  PickKind,
  PlaybookSummary,
  PresetFilter,
  PresetSummary,
  Review,
  ReviewComment,
  ReviewVersion,
  VideoPick,
} from "./types.ts";
import type { Transcript } from "./transcript.ts";

export class StoreError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

export const LISTEN_HEARTBEAT_MS = 4_000;
export const LISTEN_GRACE_MS = 15_000;
/** How long a pick counts as waiting after the agent last listened (it touches it every few seconds while it does). */
export const PICK_IDLE_MS = 30_000;
export const PICK_HEARTBEAT_MS = 5_000;

/** A panel image path (absolute, or relative to panelsDir), optionally with a title and caption. */
export type PanelInput = string | { path: string; title?: string; caption?: string };

export interface MediaInput {
  videoPath?: string;
  panels?: PanelInput[];
  panelsDir?: string;
  /** A transcript of the video (.srt, .vtt or word-timings JSON). Videos only. */
  transcriptPath?: string;
}

export interface OpenReviewInput extends MediaInput {
  title?: string;
  reviewId?: string;
  note?: string;
}

export interface NewCommentInput {
  version?: number;
  kind?: CommentKind;
  time: number;
  endTime?: number;
  x?: number;
  y?: number;
  panel?: number;
  wholeVideo?: boolean;
  text: string;
  /** Set for a guest's comment pulled from a share link. */
  author?: string;
  /** The comment's id in the cloud. A comment with this id that is already in the project is returned as it is. */
  cloudId?: string;
  /** The version the guest was looking at, when the comment is added to a later one. */
  fromVersion?: number;
}

export interface AppState {
  agent?: AgentInfo;
}

export interface PicksChoice {
  playbookId?: string | null;
  styleId?: string | null;
}

/** Stores may answer synchronously (files) or asynchronously (a database); callers always await. */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Whether an agent is still waiting on a pick: it was opened or listened to within `idleMs`. An agent that stopped
 * waiting (its turn ended, the user interrupted it) stops counting after that.
 */
export function isPickListening(pick: VideoPick, idleMs = PICK_IDLE_MS): boolean {
  return pick.status === "waiting" && Date.now() - Date.parse(pick.listenedAt ?? pick.createdAt) < idleMs;
}

/** The style presets: built-in ones plus the user's own. */
export interface PresetCatalog {
  get(id: string): LoadedPreset | undefined;
  list(filter?: PresetFilter): LoadedPreset[];
  summary(p: LoadedPreset): PresetSummary;
  /** Text files of the example composition, as paths relative to its folder. */
  templateFiles(p: LoadedPreset): string[];
  templateSource(p: LoadedPreset): { path: string; content: string }[];
  /** The example composition's folder, when the preset lives on this computer. */
  templateDir(p: LoadedPreset): string | undefined;
  /** The example video, when the preset ships one locally. */
  previewFile(p: LoadedPreset): string | undefined;
  /** A file inside the preset's folder; undefined when `rel` points outside it. The file may not exist. */
  file(p: LoadedPreset, rel: string): string | undefined;
}

/** The playbooks: built-in ones plus the user's own. */
export interface PlaybookCatalog {
  get(id: string): LoadedPlaybook | undefined;
  list(query?: string): LoadedPlaybook[];
  summary(p: LoadedPlaybook): PlaybookSummary;
  skillText(p: LoadedPlaybook): string;
  /** Paths relative to the playbook folder, for the agent to read or copy. */
  files(p: LoadedPlaybook): string[];
  /** A file inside the playbook's folder; undefined when `rel` points outside it. The file may not exist. */
  file(p: LoadedPlaybook, rel: string): string | undefined;
}

/**
 * Everything FrameJam keeps: projects (reviews) with their versions, comments, frame images and feedback batches,
 * the agent's listening heartbeat, picks, app state, and the preset and playbook libraries. The HTTP routes and MCP
 * tools only talk to this. `JsonStore` (files in ~/.framejam) is the implementation today.
 *
 * Media paths (videoPath, panels) are files on this computer; methods that return a file give a local path.
 */
export interface Store {
  /** Where the data lives (the data folder for JsonStore), shown by /api/health and the CLI. */
  readonly root: string;
  readonly presets: PresetCatalog;
  readonly playbooks: PlaybookCatalog;

  // --- Reviews ---
  /** Newest first. */
  listReviews(): MaybePromise<Review[]>;
  findReview(id: string): MaybePromise<Review | undefined>;
  /** Throws a 404 StoreError when there's no such review. */
  getReview(id: string): MaybePromise<Review>;
  /** Changes whenever the review or its listening heartbeat changes. */
  reviewMtime(id: string): MaybePromise<number>;
  /**
   * Opens a review. Re-opening the same project (same panelsDir for a storyboard, otherwise the same title)
   * appends a new version instead; identical media on an unsent version is a no-op.
   */
  openReview(input: OpenReviewInput): MaybePromise<{ review: Review; version: ReviewVersion; created: boolean }>;
  /**
   * Adds the next version. With no media at all, a storyboard re-reads its panelsDir; a video needs its new render.
   * Unsent comments on the previous version move to the new one.
   */
  addVersion(reviewId: string, input: MediaInput & { note?: string }): MaybePromise<Review>;
  /** Remembers the playbook and style picked for a project. `null` clears one, `undefined` leaves it. */
  setReviewPicks(reviewId: string, picks: PicksChoice): MaybePromise<Review>;

  // --- Media of a version (kept as a copy, so earlier versions stay watchable after the agent overwrites files) ---
  videoFileFor(reviewId: string, version: ReviewVersion): MaybePromise<string | undefined>;
  panelFileFor(reviewId: string, version: ReviewVersion, panel: number): MaybePromise<string | undefined>;
  /** The cached poster frame of a version, if one was saved. */
  posterFile(reviewId: string, version: number): MaybePromise<string | undefined>;
  savePoster(reviewId: string, version: number, jpeg: Uint8Array): MaybePromise<string>;
  /** The version's transcript, if it has one. */
  transcriptFor(reviewId: string, version: ReviewVersion): MaybePromise<Transcript | undefined>;
  /** Gives a video version a transcript, replacing any it had. */
  setTranscript(reviewId: string, version: number, transcript: Transcript, sourcePath?: string): MaybePromise<Review>;

  // --- Comments ---
  addComment(reviewId: string, input: NewCommentInput): MaybePromise<ReviewComment>;
  updateComment(reviewId: string, commentId: string, patch: { text?: string; thumbnail?: string }): MaybePromise<ReviewComment>;
  /** Deletes a draft comment and its frame image. */
  deleteComment(reviewId: string, commentId: string): MaybePromise<void>;
  /** Saves a comment's frame image and links it to the comment. Returns the image's file name. */
  saveThumbnail(reviewId: string, commentId: string, jpeg: Uint8Array): MaybePromise<string>;
  /** A frame image by file name: its path, undefined when it doesn't exist, null when the name points outside the review. */
  thumbnailFile(reviewId: string, file: string): MaybePromise<string | null | undefined>;
  readThumbnail(reviewId: string, file: string): MaybePromise<Uint8Array | undefined>;
  resolveComments(reviewId: string, ids: string[], note?: string): MaybePromise<{ resolved: string[]; missing: string[] }>;

  // --- Rounds: "Finish review" and delivery to the agent ---
  /** Sends the latest version's drafts as one batch and locks the version. */
  submit(reviewId: string, message?: string): MaybePromise<FeedbackBatch>;
  /** Undoes submit on the latest version; a batch the agent already has is marked retracted. */
  reopen(reviewId: string): MaybePromise<{ wasDelivered: boolean }>;
  undeliveredBatches(reviewId: string): MaybePromise<FeedbackBatch[]>;
  markDelivered(reviewId: string, batchIds: string[]): MaybePromise<void>;

  // --- The agent ---
  /** Heartbeat from wait_for_feedback; the agent counts as listening for a grace period after the last beat. */
  setAgentWaiting(reviewId: string, waiting: boolean): MaybePromise<void>;
  agentListening(reviewId: string): MaybePromise<boolean>;
  getState(): MaybePromise<AppState>;
  /** Remembers which harness connected last. */
  recordAgent(name: string | undefined, version?: string): MaybePromise<void>;
  /** True when the agent's MCP process runs different code than is now on disk. */
  agentOutdated(): MaybePromise<boolean>;

  // --- Picks: the agent asks the user to choose a playbook and/or style for one video ---
  /** Starts a pick; any older pick still waiting is cancelled. */
  createPick(kinds: PickKind[], title?: string): MaybePromise<VideoPick>;
  /** Throws a 404 StoreError when there's no such pick. */
  getPick(id: string): MaybePromise<VideoPick>;
  /** Newest first. */
  listPicks(): MaybePromise<VideoPick[]>;
  /** The newest pick an agent is still waiting on. */
  activePick(): MaybePromise<VideoPick | null>;
  /** Called while an agent waits on a pick. */
  touchPick(id: string): MaybePromise<void>;
  dismissPick(id: string): MaybePromise<VideoPick>;
  /** Throws a 409 StoreError when the pick isn't waiting any more. */
  resolvePick(id: string, choice: PicksChoice): MaybePromise<VideoPick>;
}
