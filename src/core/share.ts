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
  /** Guests' comments the user hasn't sent to the agent yet. */
  guestCommentsWaiting: number;
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

export interface ShareHooks {
  /** Puts a version (default: the latest) on the project's link, creating it the first time. Throws a message fit to show the user. */
  share(reviewId: string, opts?: { version?: number }): Promise<ShareOutcome>;
  /** Sets or clears the link's expiry and revokes or reopens it. */
  configure(reviewId: string, change: { expiresInDays?: number | null; revoked?: boolean }): Promise<ShareLinkSummary>;
  /** Every project that has a link. */
  list(): Promise<ShareLinkSummary[]>;
  /** One project's link, if it has one. */
  link(reviewId: string): Promise<ShareLinkSummary | undefined>;
  /** Whether `framejam login` has been run. */
  signedIn(): boolean;
}
