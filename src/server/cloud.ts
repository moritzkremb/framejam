/**
 * FrameJam Cloud (Convex) HTTP client. Login talks to `deviceAuth.*`; sharing to `uploads.*` and `shares.*`.
 *
 * Uses Convex's public HTTP API (`/api/query`, `/api/mutation`, `/api/action`) so we don't take on the `convex`
 * package for a handful of calls. Tests inject a fake client or `fetch`.
 */
import { env } from "./paths.ts";

/** Production Convex deployment. Override with FRAMEJAM_CLOUD_URL or FRAMEJAM_CONVEX_URL. */
export const DEFAULT_CLOUD_URL = "https://mellow-dalmatian-42.convex.cloud";

/** The web app where a cloud project's review page lives. Override with FRAMEJAM_APP_URL. */
export const DEFAULT_APP_URL = "https://app.framejam.ai";

export function cloudReviewUrl(id: string): string {
  return `${(env("APP_URL") ?? DEFAULT_APP_URL).replace(/\/$/, "")}/p/${id}`;
}

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
  /** Null for accounts that signed up with just an email address. */
  name: string | null;
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

/** Waits between attempts when a call fails on the network or a 5xx. Its length is the number of retries. */
export const RETRY_DELAYS_MS = [500, 1500];

export interface RetryOptions {
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}

/**
 * A failed cloud call. `transient` means the network or a 5xx, where trying again later can work. `status` is set when
 * the cloud refused a rule with the status a local store would give (404 not found, 409 conflict).
 */
export class CloudError extends Error {
  constructor(
    message: string,
    readonly transient: boolean,
    readonly status?: 400 | 404 | 409,
  ) {
    super(message);
    this.name = "CloudError";
  }
}

export function isTransientCloudError(err: unknown): boolean {
  return err instanceof CloudError && err.transient;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createCloudClient(url: string = cloudUrl(), fetchFn: FetchLike = fetch, retry: RetryOptions = {}): CloudClient {
  const base = url.replace(/\/$/, "");
  const call = <T>(kind: ConvexKind, path: string, args: Record<string, unknown>) =>
    convexCall<T>(base, kind, path, args, fetchFn, retry);
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
  retry: RetryOptions = {},
): Promise<T> {
  const delays = retry.retryDelaysMs ?? RETRY_DELAYS_MS;
  const wait = retry.sleep ?? delay;
  for (let attempt = 0; ; attempt++) {
    try {
      return await convexCallOnce<T>(url, kind, path, args, fetchFn);
    } catch (err) {
      if (!isTransientCloudError(err) || attempt >= delays.length) throw err;
      await wait(delays[attempt]!);
    }
  }
}

async function convexCallOnce<T>(
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
    throw new CloudError("Couldn't reach FrameJam Cloud.", true);
  }
  // Function errors come back as JSON and won't change on a retry; a gateway 5xx or 429 has no Convex body.
  const busy = res.status >= 500 || res.status === 429;
  let body: ConvexSuccess<T> | ConvexFailure | undefined;
  try {
    body = (await res.json()) as ConvexSuccess<T> | ConvexFailure;
  } catch {
    throw new CloudError(res.ok ? "FrameJam Cloud returned a bad response." : `FrameJam Cloud returned ${res.status}.`, busy);
  }
  if (body?.status === "success") return body.value;
  if (body?.status !== "error") throw new CloudError(`FrameJam Cloud returned ${res.status}.`, busy);
  const data = body.errorData;
  if (data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string") {
    const { message, status } = data as { message: string; status?: unknown };
    throw new CloudError(message, false, status === 404 || status === 409 || status === 400 ? status : undefined);
  }
  const thrown = typeof data === "string" && data.trim() ? data.trim() : undefined;
  throw new CloudError(thrown ?? cloudMessage(body.errorMessage) ?? `FrameJam Cloud returned ${res.status}.`, false);
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
  /** A spoken comment: `text` is the transcript, and each pointing phrase has the frame it showed. */
  voice?: GuestVoice;
}

export interface GuestVoice {
  status: "transcribed" | "pending" | "failed";
  duration?: number;
  audioUrl?: string;
  note?: string;
  points: Array<{ phrase: string; at: number; time: number; x?: number; y?: number; frameUrl?: string; drawing?: number[][] }>;
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
  /** Set while a guest's approval has made the link final: which version, who, when. */
  approved?: { version: number; by: string; at: number } | null;
  /** The creator's download switch for the approved link. Missing on older deployments, which means on. */
  allowDownload?: boolean;
  /** Distinct visitor-days that opened the link, yours included. Missing on older deployments. */
  opens?: number;
  /** When a guest last opened it (ms), or null if none has. Missing on older deployments. */
  lastOpenedAt?: number | null;
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
  allowDownload?: boolean;
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
  /** Sets or clears the link's expiry (`expiresAt: null` clears it), revokes or reopens it, and switches the download. */
  configure(localId: string, settings: { expiresAt?: number | null; revoked?: boolean; allowDownload?: boolean }): Promise<LinkSettings>;
}

export function createShareClient(
  token: string,
  url: string = cloudUrl(),
  fetchFn: FetchLike = fetch,
  retry: RetryOptions = {},
): ShareClient {
  const base = url.replace(/\/$/, "");
  const call = <T>(kind: ConvexKind, path: string, args: Record<string, unknown>) =>
    convexCall<T>(base, kind, path, { ...args, token }, fetchFn, retry);
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
