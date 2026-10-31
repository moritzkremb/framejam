import type { ReviewComment } from "@/lib/api";

/** Who is looking at a review: the local app, the creator's cloud page, or a guest on the share link. */
export type ReviewRole = "local" | "owner" | "guest";

/**
 * Whether a comment is on the share link, so owner and guest both see it. The owner's copy of a guest comment has the
 * guest's name; on the link a guest's own unsent drafts have it too, so there only sent ones count.
 */
export function isShared(c: ReviewComment, role: ReviewRole): boolean {
  if (!c.author) return false;
  return role !== "guest" || c.status !== "draft";
}

/**
 * The comments in the order they're numbered, 1 to n: the ones on the share link first, so a comment has the same
 * number for the owner and every guest, then the private ones (the owner's own, or a guest's unsent drafts).
 */
export function numberComments<T extends ReviewComment>(comments: T[], role: ReviewRole, compare: (a: T, b: T) => number): { ordered: T[]; number: Map<string, number> } {
  const shared = comments.filter((c) => isShared(c, role)).sort(compare);
  const own = comments.filter((c) => !isShared(c, role)).sort(compare);
  const ordered = [...shared, ...own];
  return { ordered, number: new Map(ordered.map((c, i) => [c.id, i + 1])) };
}

export const byTime = (a: ReviewComment, b: ReviewComment) => a.time - b.time || a.createdAt.localeCompare(b.createdAt);

export const byPanel = (a: ReviewComment, b: ReviewComment) =>
  Number(!!b.wholeVideo) - Number(!!a.wholeVideo) || (a.panel ?? 0) - (b.panel ?? 0) || a.createdAt.localeCompare(b.createdAt);
