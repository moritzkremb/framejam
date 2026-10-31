/**
 * What the MCP share tools need from the local app (H1.7). The tools live in `core/mcp.ts`, which can't touch the
 * network or the filesystem, so this computer's implementation (`server/share.ts`) is passed in as `ShareHooks`.
 */

export interface ShareLinkSummary {
  reviewId: string;
  title: string;
  /** What guests open. */
  url: string;
  versionsOnLink: number[];
  /** The project's newest version on this computer, which may not be on the link yet. */
  latestVersion: number;
  /** Revoked or expired: guests can't open it. */
  closed: boolean;
  expiresAt?: string;
  revokedAt?: string;
  approvals: { version: number; by: string; at: string }[];
  /**
   * A guest approved this version and the link is in its final state: guests see only that file. Sharing a newer
   * version reopens the link.
   */
  approved?: { version: number; by: string; at: string };
  /** The approval hasn't been reported to an agent yet. */
  approvalNew?: boolean;
  /** Whether the approved link offers a download (the creator's switch; videos only). */
  allowDownload: boolean;
  /** Whether guests can read each version's handoff notes (cloud projects; off unless the creator turns it on). */
  showNotes: boolean;
  /** Guests' comments the user hasn't sent to the agent yet. */
  guestCommentsWaiting: number;
  /** Opens of the link: each visitor counts once a day, you included. Left out until the cloud has reported it (older clouds never do). */
  opens?: number;
  /** The last time a guest opened it; left out when none has or the cloud doesn't say. */
  lastOpenedAt?: string;
  lastPulledAt?: string;
}

export interface ShareOutcome {
  url: string;
  version: number;
  /** False when that version was already on the link and nothing was uploaded. */
  uploaded: boolean;
  closed: boolean;
  /** Guest comments added to the project by the pull that follows a share. */
  newGuestComments: number;
  waitingForNextVersion: number;
  /** Guest comments newly marked "resolved in vN" on the link. */
  markedResolved: number;
  resolveError?: string;
  link: ShareLinkSummary;
}

/** Shown while FrameJam Cloud doesn't take `reopen` yet: its validator rejects the field. */
export const REOPEN_UNAVAILABLE = "Reopening isn't available yet. Put a new version on the link to open comments again.";

export function reopenRejected(e: unknown): boolean {
  return /extra field\W+reopen/i.test(e instanceof Error ? e.message : String(e));
}

export interface ShareHooks {
  /** Puts a version (default: the latest) on the project's link, creating it the first time. Throws a message fit to show the user. */
  share(reviewId: string, opts?: { version?: number }): Promise<ShareOutcome>;
  /** Sets or clears the link's expiry, revokes or reopens it, and switches the approved link's download. */
  configure(reviewId: string, change: { expiresInDays?: number | null; revoked?: boolean; allowDownload?: boolean; showNotes?: boolean }): Promise<ShareLinkSummary>;
  /** Records that an agent has been told about the link's current approval, so it doesn't wake again. */
  approvalSeen(reviewId: string): Promise<void>;
  /** Every project that has a link. */
  list(): Promise<ShareLinkSummary[]>;
  /** One project's link, if it has one. */
  link(reviewId: string): Promise<ShareLinkSummary | undefined>;
  /** Whether `framejam login` has been run. */
  signedIn(): boolean;
}
