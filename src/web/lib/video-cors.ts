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

export function corsMessage(host = window.location.host): string {
  return `This video can't play on ${host}: the storage it's in doesn't allow this site yet (R2 CORS). Previews can't play videos until the bucket's CORS rules list this address.`;
}
