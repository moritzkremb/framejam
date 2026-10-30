/**
 * FrameJam Cloud (Convex) HTTP client. Login talks to `deviceAuth.*`; sharing to `uploads.*` and `shares.*`.
 *
 * Uses Convex's public HTTP API (`/api/query`, `/api/mutation`, `/api/action`) so we don't take on the `convex`
 * package for a handful of calls. Tests inject a fake client or `fetch`.
 */
import { env } from "./paths.ts";

/** Production Convex deployment. Override with FRAMEJAM_CLOUD_URL or FRAMEJAM_CONVEX_URL. */
export const DEFAULT_CLOUD_URL = "https://mellow-dalmatian-42.convex.cloud";

export function cloudUrl(): string {
  return (env("CLOUD_URL") ?? env("CONVEX_URL") ?? DEFAULT_CLOUD_URL).replace(/\/$/, "");
}

export interface DeviceStart {
  userCode: string;
  deviceCode: string;
  expiresIn: number;
  interval: number;
  verificationUri: string;
  verificationUriComplete?: string;
}

export type DevicePoll =
  | { status: "pending" | "expired" | "unknown" }
  | { status: "approved"; token: string; tokenType: "bearer" };

export interface CloudWhoami {
  name: string;
  email: string;
}

export interface CloudClient {
  start(): Promise<DeviceStart>;
  poll(deviceCode: string): Promise<DevicePoll>;
  whoami(token: string): Promise<CloudWhoami>;
  revoke(token: string): Promise<{ ok: true }>;
}

type ConvexKind = "query" | "mutation" | "action";

interface ConvexSuccess<T> {
  status: "success";
  value: T;
}

interface ConvexFailure {
  status: "error";
  errorMessage?: string;
  /** What a function passed to `ConvexError`; production deployments hide `errorMessage` but keep this. */
  errorData?: unknown;
}

export type FetchLike = typeof fetch;

const CALL_TIMEOUT_MS = 15_000;

export function createCloudClient(url: string = cloudUrl(), fetchFn: FetchLike = fetch): CloudClient {
  const base = url.replace(/\/$/, "");
  const call = <T>(kind: ConvexKind, path: string, args: Record<string, unknown>) =>
    convexCall<T>(base, kind, path, args, fetchFn);
  return {
    start: () => call<DeviceStart>("mutation", "deviceAuth:start", {}),
    poll: (deviceCode) => call<DevicePoll>("mutation", "deviceAuth:poll", { deviceCode }),
    whoami: (token) => call<CloudWhoami>("query", "deviceAuth:whoami", { token }),
    revoke: (token) => call<{ ok: true }>("mutation", "deviceAuth:revoke", { token }),
  };
}

export async function convexCall<T>(
  url: string,
  kind: ConvexKind,
  path: string,
  args: Record<string, unknown>,
  fetchFn: FetchLike,
): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(`${url}/api/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, args, format: "json" }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch {
    throw new Error("Couldn't reach FrameJam Cloud.");
  }
  let body: ConvexSuccess<T> | ConvexFailure | undefined;
  try {
    body = (await res.json()) as ConvexSuccess<T> | ConvexFailure;
  } catch {
    throw new Error(res.ok ? "FrameJam Cloud returned a bad response." : `FrameJam Cloud returned ${res.status}.`);
  }
  if (body.status === "success") return body.value;
  const thrown = typeof body.errorData === "string" && body.errorData.trim() ? body.errorData.trim() : undefined;
  throw new Error(thrown ?? cloudMessage(body.errorMessage) ?? `FrameJam Cloud returned ${res.status}.`);
}

/**
 * Convex wraps a function's error as "[Request ID: …] Server Error" plus the stack, and a production deployment drops
 * everything after "Server Error". Keep the part a person can use.
 */
export function cloudMessage(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const uncaught = raw.match(/Uncaught \w*Error: ([^\n]+)/);
  if (uncaught) return uncaught[1]!.trim();
  const plain = raw.replace(/^\[Request ID: [^\]]+\]\s*/, "").trim();
  if (!plain || plain === "Server Error") return "FrameJam Cloud had a problem. Try again in a minute.";
  return plain;
}

export type AssetKind = "render" | "panel" | "poster" | "frame";

export interface UploadTicket {
  uploadUrl: string;
  storageKey: string;
  publicUrl: string;
}

export interface RegisterInput {
  storageKey: string;
  bytes: number;
  mime: string;
  duration?: number;
  width?: number;
  height?: number;
  posterKey?: string;
}

export interface PublishInput {
  localId: string;
  title: string;
  kind: "video" | "storyboard";
  version: {
    number: number;
    note?: string;
    videoAssetId?: string;
    panels?: { assetId: string; title?: string; caption?: string }[];
  };
}

export interface Published {
  projectId: string;
  /** The link token; the share page is `https://www.framejam.ai/v/<token>`. */
  token: string;
  version: number;
  created: boolean;
  expiresAt: number | null;
  revokedAt: number | null;
}

export interface GuestComment {
  id: string;
  version: number;
  kind: "pin" | "range" | "panel" | "general";
  time: number;
  endTime?: number;
  x?: number;
  y?: number;
  panel?: number;
  wholeVideo?: boolean;
  text: string;
  guestName: string;
  frameUrl?: string;
}

export interface GuestApproval {
  version: number;
  guestName: string;
  /** Milliseconds since the epoch. */
  at: number;
}

export interface PendingShare {
  token: string;
  latestVersion: number;
  comments: GuestComment[];
  approvals: GuestApproval[];
  /** The link's current state, when the cloud says; older deployments leave these out. */
  expiresAt?: number | null;
  revokedAt?: number | null;
}

/** One guest comment fixed in a later version. */
export interface Resolution {
  commentId: string;
  version: number;
}

export interface LinkSettings {
  token: string;
  expiresAt: number | null;
  revokedAt: number | null;
}

/** What sharing needs from FrameJam Cloud, for the signed-in user's API token. */
export interface ShareClient {
  requestUpload(input: { filename: string; mime: string; kind: AssetKind }): Promise<UploadTicket>;
  registerUpload(input: RegisterInput): Promise<{ assetId: string }>;
  publish(input: PublishInput): Promise<Published>;
  pending(localId: string): Promise<PendingShare | null>;
  markPulled(localId: string, commentIds: string[]): Promise<{ marked: number }>;
  /** Marks guest comments "resolved in vN" on the link. The version has to be on the link already. */
  resolve(localId: string, resolutions: Resolution[]): Promise<{ marked: number }>;
  /** Sets or clears the link's expiry (`expiresAt: null` clears it) and revokes or reopens it. */
  configure(localId: string, settings: { expiresAt?: number | null; revoked?: boolean }): Promise<LinkSettings>;
}

export function createShareClient(token: string, url: string = cloudUrl(), fetchFn: FetchLike = fetch): ShareClient {
  const base = url.replace(/\/$/, "");
  const call = <T>(kind: ConvexKind, path: string, args: Record<string, unknown>) =>
    convexCall<T>(base, kind, path, { ...args, token }, fetchFn);
  return {
    requestUpload: (input) => call<UploadTicket>("action", "uploads:request", input),
    registerUpload: (input) => call<{ assetId: string }>("mutation", "uploads:register", { ...input }),
    publish: (input) => call<Published>("mutation", "shares:publish", { ...input }),
    pending: (localId) => call<PendingShare | null>("query", "shares:pending", { localId }),
    markPulled: (localId, commentIds) => call<{ marked: number }>("mutation", "shares:markPulled", { localId, commentIds }),
    resolve: (localId, resolutions) => call<{ marked: number }>("mutation", "shares:resolve", { localId, resolutions }),
    configure: (localId, settings) => call<LinkSettings>("mutation", "shares:configure", { localId, ...settings }),
  };
}
