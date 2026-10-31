/**
 * What `wait_for_feedback` hands back with `status: "waiting"` and the agent hands in on its next call: which project,
 * when the wait began, how many times it has come back, and which guest comments the agent was already told about.
 * The same format as the hosted server, which is stateless and has nowhere else to remember it. Opaque to the agent.
 */
export type WaitCursor = { r: string; s: number; n: number; a: string[] };

const PREFIX = "wf1.";
const MAX_ANNOUNCED = 200;

export function encodeWaitCursor(cursor: WaitCursor): string {
  const bytes = new TextEncoder().encode(JSON.stringify({ ...cursor, a: cursor.a.slice(-MAX_ANNOUNCED) }));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return PREFIX + btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

/** The cursor a previous `waiting` result gave, or undefined when it is missing, for another project or unreadable. */
export function decodeWaitCursor(raw: string | undefined, reviewId: string): WaitCursor | undefined {
  if (!raw?.startsWith(PREFIX)) return undefined;
  try {
    const body = raw.slice(PREFIX.length).replaceAll("-", "+").replaceAll("_", "/");
    const bin = atob(body.padEnd(Math.ceil(body.length / 4) * 4, "="));
    const parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as Partial<WaitCursor>;
    if (parsed.r !== reviewId || typeof parsed.s !== "number" || typeof parsed.n !== "number" || !Array.isArray(parsed.a)) return undefined;
    return { r: parsed.r, s: parsed.s, n: parsed.n, a: parsed.a.filter((x): x is string => typeof x === "string") };
  } catch {
    return undefined;
  }
}
