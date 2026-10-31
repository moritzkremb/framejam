/**
 * Whether a cross-origin video failed because its storage doesn't allow this site (CORS), not because it's missing:
 * a CORS request is refused while a no-cors one goes through.
 */
export async function blockedByCors(src: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
  try {
    await fetchFn(src, { method: "HEAD", mode: "cors", cache: "no-store" });
    return false;
  } catch {
    try {
      await fetchFn(src, { method: "HEAD", mode: "no-cors", cache: "no-store" });
      return true;
    } catch {
      return false;
    }
  }
}

/** What a guest reads: nothing they can fix, so who to tell. */
export const GUEST_VIDEO_ERROR = "This video can't play right now. Tell whoever sent the link.";

/** What the creator reads when the storage turns this page away: their file is fine, the setup isn't. */
export function blockedMessage(host = window.location.host): string {
  return `This video can't play on ${host} yet. The file is fine, but FrameJam's storage doesn't allow this address. Try again later.`;
}
