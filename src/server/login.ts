import { deleteAuth, readAuth, writeAuth } from "./auth.ts";
import { type CloudClient, type CloudWhoami, cloudUrl, createCloudClient, isTransientCloudError } from "./cloud.ts";
import { dataDir, env } from "./paths.ts";

export interface CommandResult {
  ok: boolean;
  text: string;
}

export interface AuthCommandOpts {
  client?: CloudClient;
  root?: string;
  /** Prints the user code and verification URL while login waits. */
  write?: (msg: string) => void;
  openUrl?: (url: string) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const DEFAULT_INTERVAL_S = 5;
const DEFAULT_EXPIRES_S = 900;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Skip opening a browser in CI or on a headless Linux box. */
export function shouldOpenBrowser(environ: NodeJS.ProcessEnv = process.env, platform: string = process.platform): boolean {
  if (environ.CI) return false;
  if (platform === "linux" && !environ.DISPLAY && !environ.WAYLAND_DISPLAY) return false;
  return true;
}

export function formatAccount(user: CloudWhoami): string {
  const name = typeof user.name === "string" ? user.name.trim() : "";
  return name ? `${name} <${user.email}>` : user.email;
}

/** Env override wins; otherwise reuse the URL saved at login. */
export function resolveCloudUrl(stored?: string): string {
  const override = env("CLOUD_URL") ?? env("CONVEX_URL");
  return (override || stored || cloudUrl()).replace(/\/$/, "");
}

function resolveClient(opts: AuthCommandOpts, storedCloudUrl?: string): CloudClient {
  if (opts.client) return opts.client;
  return createCloudClient(resolveCloudUrl(storedCloudUrl));
}

export async function login(opts: AuthCommandOpts = {}): Promise<CommandResult> {
  const root = opts.root ?? dataDir();
  const write = opts.write ?? (() => {});
  const wait = opts.sleep ?? delay;
  const now = opts.now ?? Date.now;
  const client = resolveClient(opts);
  let started;
  try {
    started = await client.start();
  } catch (err) {
    return { ok: false, text: err instanceof Error ? err.message : "Couldn't reach FrameJam Cloud." };
  }
  const url = started.verificationUriComplete || started.verificationUri;
  write(`Your code: ${started.userCode}`);
  write(`Open ${url}`);
  if (url) opts.openUrl?.(url);

  const intervalMs = Math.max(0, (started.interval ?? DEFAULT_INTERVAL_S) * 1000);
  const deadline = now() + (started.expiresIn ?? DEFAULT_EXPIRES_S) * 1000;
  let unreachable = false;
  while (now() < deadline) {
    await wait(intervalMs);
    if (now() >= deadline) break;
    let poll;
    try {
      poll = await client.poll(started.deviceCode);
    } catch (err) {
      // A dropped connection or a 5xx mid-login shouldn't end it: keep polling until the code expires.
      if (isTransientCloudError(err)) {
        unreachable = true;
        continue;
      }
      return { ok: false, text: err instanceof Error ? err.message : "Couldn't reach FrameJam Cloud." };
    }
    unreachable = false;
    if (poll.status === "approved") {
      const savedUrl = resolveCloudUrl();
      writeAuth({ token: poll.token, cloudUrl: savedUrl }, root);
      try {
        const user = await resolveClient(opts, savedUrl).whoami(poll.token);
        return { ok: true, text: `Logged in as ${formatAccount(user)}` };
      } catch {
        return { ok: true, text: "Logged in." };
      }
    }
    if (poll.status === "expired") return { ok: false, text: "The code expired. Run framejam login again." };
    if (poll.status === "unknown") return { ok: false, text: "This login code isn't valid. Run framejam login again." };
  }
  if (unreachable) return { ok: false, text: "Couldn't reach FrameJam Cloud before the code expired. Run framejam login again." };
  return { ok: false, text: "The code expired. Run framejam login again." };
}

export async function logout(opts: AuthCommandOpts = {}): Promise<CommandResult> {
  const root = opts.root ?? dataDir();
  const auth = readAuth(root);
  if (!auth) return { ok: true, text: "Already logged out." };
  try {
    await resolveClient(opts, auth.cloudUrl).revoke(auth.token);
  } catch {
    // Unknown or unreachable token: still drop the local file.
  }
  deleteAuth(root);
  return { ok: true, text: "Logged out." };
}

export async function whoami(opts: AuthCommandOpts = {}): Promise<CommandResult> {
  const root = opts.root ?? dataDir();
  const auth = readAuth(root);
  if (!auth) return { ok: false, text: "Not logged in." };
  try {
    const user = await resolveClient(opts, auth.cloudUrl).whoami(auth.token);
    return { ok: true, text: formatAccount(user) };
  } catch (err) {
    return { ok: false, text: err instanceof Error ? err.message : "Couldn't reach FrameJam Cloud." };
  }
}
