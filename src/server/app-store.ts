import type { Transcript } from "../core/transcript.ts";
import type { FeedbackBatch, PickKind, Review, ReviewComment, ReviewVersion, VideoPick } from "../core/types.ts";
import {
  type AppState,
  type MediaInput,
  type NewCommentInput,
  type OpenReviewInput,
  type PicksChoice,
  type SourceDownload,
  type Store,
} from "../core/store.ts";
import type { CloudStore } from "./cloud-store.ts";
import { CloudSession, type CloudSessionOptions } from "./cloud-mode.ts";
import type { JsonStore } from "./json-store.ts";

/**
 * The store the app and the agent's MCP server use. Without cloud mode it is the local store, call for call. With
 * cloud mode on (`framejam cloud on`), new projects are made in FrameJam Cloud and every project is found where it
 * lives: a project that exists in `~/.framejam` stays local, any other id belongs to the cloud. Turning cloud mode
 * off hides the cloud ones again (they stay in the cloud) and everything goes back to the local store.
 */
export class AppStore implements Store {
  readonly root: string;
  readonly presets: Store["presets"];
  readonly playbooks: Store["playbooks"];
  private readonly session: CloudSession;

  constructor(
    readonly local: JsonStore,
    options: CloudSessionOptions = {},
  ) {
    this.root = local.root;
    this.presets = local.presets;
    this.playbooks = local.playbooks;
    this.session = new CloudSession(local, options);
  }

  /** The cloud store, while cloud mode is on and signed in. */
  cloud(): CloudStore | undefined {
    return this.session.get();
  }

  /** Cloud mode is on but nobody is signed in, so projects are going to the local store. */
  get cloudSignedOut(): boolean {
    return this.session.signedOut;
  }

  /** The cloud store, when `id` is a project that lives in the cloud. */
  async cloudFor(id: string): Promise<CloudStore | undefined> {
    const cloud = this.cloud();
    if (!cloud) return undefined;
    return (await this.local.findReview(id)) ? undefined : cloud;
  }

  private async route(id: string): Promise<Store> {
    return (await this.cloudFor(id)) ?? this.local;
  }

  async isCloud(id: string): Promise<boolean> {
    return Boolean(await this.cloudFor(id));
  }

  // --- Projects ---------------------------------------------------------------------------------------------------

  async listReviews(): Promise<Review[]> {
    const local = this.local.listReviews();
    const cloud = this.cloud();
    if (!cloud) return local;
    let remote: Review[] = [];
    try {
      remote = await cloud.listReviews();
    } catch {
      // Offline: the projects on this computer still list.
    }
    return [...local, ...remote].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async findReview(id: string): Promise<Review | undefined> {
    return (await this.route(id)).findReview(id);
  }

  async getReview(id: string): Promise<Review> {
    return (await this.route(id)).getReview(id);
  }

  async reviewMtime(id: string): Promise<number> {
    return (await this.route(id)).reviewMtime(id);
  }

  async openReview(input: OpenReviewInput): Promise<{ review: Review; version: ReviewVersion; created: boolean }> {
    const cloud = this.cloud();
    if (!cloud) return this.local.openReview(input);
    if (input.reviewId && (await this.local.findReview(input.reviewId))) return this.local.openReview(input);
    return cloud.openReview(input);
  }

  async addVersion(reviewId: string, input: MediaInput & { note?: string }): Promise<Review> {
    return (await this.route(reviewId)).addVersion(reviewId, input);
  }

  async sourceFor(reviewId: string, version: number): Promise<SourceDownload | undefined> {
    return (await this.route(reviewId)).sourceFor(reviewId, version);
  }

  async setReviewPicks(reviewId: string, picks: PicksChoice): Promise<Review> {
    return (await this.route(reviewId)).setReviewPicks(reviewId, picks);
  }

  // --- Files ------------------------------------------------------------------------------------------------------

  async videoFileFor(reviewId: string, version: ReviewVersion): Promise<string | undefined> {
    return (await this.route(reviewId)).videoFileFor(reviewId, version);
  }

  async panelFileFor(reviewId: string, version: ReviewVersion, panel: number): Promise<string | undefined> {
    return (await this.route(reviewId)).panelFileFor(reviewId, version, panel);
  }

  async posterFile(reviewId: string, version: number): Promise<string | undefined> {
    return (await this.route(reviewId)).posterFile(reviewId, version);
  }

  async savePoster(reviewId: string, version: number, jpeg: Uint8Array): Promise<string> {
    return (await this.route(reviewId)).savePoster(reviewId, version, jpeg);
  }

  async transcriptFor(reviewId: string, version: ReviewVersion): Promise<Transcript | undefined> {
    return (await this.route(reviewId)).transcriptFor(reviewId, version);
  }

  async setTranscript(reviewId: string, version: number, transcript: Transcript, sourcePath?: string): Promise<Review> {
    return (await this.route(reviewId)).setTranscript(reviewId, version, transcript, sourcePath);
  }

  // --- Comments ---------------------------------------------------------------------------------------------------

  async addComment(reviewId: string, input: NewCommentInput): Promise<ReviewComment> {
    return (await this.route(reviewId)).addComment(reviewId, input);
  }

  async updateComment(reviewId: string, commentId: string, patch: { text?: string; thumbnail?: string }): Promise<ReviewComment> {
    return (await this.route(reviewId)).updateComment(reviewId, commentId, patch);
  }

  async deleteComment(reviewId: string, commentId: string): Promise<void> {
    return (await this.route(reviewId)).deleteComment(reviewId, commentId);
  }

  async saveThumbnail(reviewId: string, commentId: string, jpeg: Uint8Array): Promise<string> {
    return (await this.route(reviewId)).saveThumbnail(reviewId, commentId, jpeg);
  }

  async thumbnailFile(reviewId: string, file: string): Promise<string | null | undefined> {
    return (await this.route(reviewId)).thumbnailFile(reviewId, file);
  }

  async readThumbnail(reviewId: string, file: string): Promise<Uint8Array | undefined> {
    return (await this.route(reviewId)).readThumbnail(reviewId, file);
  }

  async resolveComments(reviewId: string, ids: string[], note?: string): Promise<{ resolved: string[]; missing: string[] }> {
    return (await this.route(reviewId)).resolveComments(reviewId, ids, note);
  }

  // --- Rounds -----------------------------------------------------------------------------------------------------

  async submit(reviewId: string, message?: string): Promise<FeedbackBatch> {
    return (await this.route(reviewId)).submit(reviewId, message);
  }

  async reopen(reviewId: string): Promise<{ wasDelivered: boolean }> {
    return (await this.route(reviewId)).reopen(reviewId);
  }

  async undeliveredBatches(reviewId: string): Promise<FeedbackBatch[]> {
    return (await this.route(reviewId)).undeliveredBatches(reviewId);
  }

  async markDelivered(reviewId: string, batchIds: string[]): Promise<void> {
    return (await this.route(reviewId)).markDelivered(reviewId, batchIds);
  }

  // --- The agent --------------------------------------------------------------------------------------------------

  async setAgentWaiting(reviewId: string, waiting: boolean): Promise<void> {
    return (await this.route(reviewId)).setAgentWaiting(reviewId, waiting);
  }

  async agentListening(reviewId: string): Promise<boolean> {
    return (await this.route(reviewId)).agentListening(reviewId);
  }

  getState(): AppState {
    return this.local.getState();
  }
  recordAgent(name: string | undefined, version?: string): void {
    this.local.recordAgent(name, version);
  }
  agentOutdated(): boolean {
    return this.local.agentOutdated();
  }

  createPick(kinds: PickKind[], title?: string): VideoPick {
    return this.local.createPick(kinds, title);
  }
  getPick(id: string): VideoPick {
    return this.local.getPick(id);
  }
  listPicks(): VideoPick[] {
    return this.local.listPicks();
  }
  activePick(): VideoPick | null {
    return this.local.activePick();
  }
  touchPick(id: string): void {
    this.local.touchPick(id);
  }
  dismissPick(id: string): VideoPick {
    return this.local.dismissPick(id);
  }
  resolvePick(id: string, choice: PicksChoice): VideoPick {
    return this.local.resolvePick(id, choice);
  }
}
