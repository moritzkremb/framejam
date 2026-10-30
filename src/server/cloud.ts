/**
 * FrameJam Cloud (Convex) HTTP client. Login talks to `deviceAuth.*`; sharing is a later batch.
 *
 * Uses Convex's public HTTP API (`/api/mutation`, `/api/query`) so we don't take on the `convex` package
 * for four calls. Tests inject a fake client or `fetch`.
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

type ConvexKind = "query" | "mutation";

interface ConvexSuccess<T> {
  status: "success";
  value: T;
}

interface ConvexFailure {
  status: "error";
  errorMessage?: string;
}

type FetchLike = typeof fetch;

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

async function convexCall<T>(
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
  throw new Error(body.errorMessage || `FrameJam Cloud returned ${res.status}.`);
}
