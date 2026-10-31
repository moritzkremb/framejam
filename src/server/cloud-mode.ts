import fs from "node:fs";
import path from "node:path";
import { readAuth } from "./auth.ts";
import { type CloudApi, createCloudApi } from "./cloud-api.ts";
import { CloudStore } from "./cloud-store.ts";
import { resolveCloudUrl } from "./login.ts";
import { dataDir } from "./paths.ts";
import type { FetchLike } from "./cloud.ts";
import type { JsonStore } from "./json-store.ts";

/** `framejam cloud on` leaves this file in the data dir; it holds whether new projects go to FrameJam Cloud. */
export function cloudModeFile(root: string = dataDir()): string {
  return path.join(root, "cloud.json");
}

let cached: { file: string; mtimeMs: number; on: boolean } | undefined;

/** Whether cloud mode is on. Read on every call (a stat when nothing changed), so `framejam cloud on` works without a restart. */
export function cloudModeOn(root: string = dataDir()): boolean {
  const file = cloudModeFile(root);
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    return false;
  }
  if (cached?.file === file && cached.mtimeMs === mtimeMs) return cached.on;
  let on = false;
  try {
    on = (JSON.parse(fs.readFileSync(file, "utf8")) as { enabled?: unknown }).enabled === true;
  } catch {
    on = false;
  }
  cached = { file, mtimeMs, on };
  return on;
}

export function setCloudMode(on: boolean, root: string = dataDir()): void {
  fs.mkdirSync(root, { recursive: true });
  const file = cloudModeFile(root);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ enabled: on }, null, 2)}\n`);
  fs.renameSync(tmp, file);
  cached = undefined;
}

export interface CloudSessionOptions {
  /** Tests give the cloud (and its file transfers) instead of the signed-in user's. */
  api?: CloudApi;
  fetch?: FetchLike;
  autoUpload?: boolean;
  cacheMs?: number;
  retryDelayMs?: number;
  posterFrame?: (video: string) => Promise<Uint8Array | undefined>;
}

/**
 * The cloud store for the signed-in user, when cloud mode is on and there's a login. A new one is made when the login
 * changes (another account or deployment), so the old account's cache is never shown.
 */
export class CloudSession {
  private current: { key: string; store: CloudStore } | undefined;

  constructor(
    private readonly local: JsonStore,
    private readonly options: CloudSessionOptions = {},
  ) {}

  /** Why cloud mode isn't in effect even though it's on: signed out. */
  get signedOut(): boolean {
    return cloudModeOn(this.local.root) && !this.options.api && !readAuth(this.local.root);
  }

  get(): CloudStore | undefined {
    if (!cloudModeOn(this.local.root)) return undefined;
    let api = this.options.api;
    let key = "api";
    if (!api) {
      const auth = readAuth(this.local.root);
      if (!auth) return undefined;
      const url = resolveCloudUrl(auth.cloudUrl);
      key = `${auth.token}@${url}`;
      if (this.current?.key === key) return this.current.store;
      api = createCloudApi(auth.token, url, this.options.fetch);
    } else if (this.current) {
      return this.current.store;
    }
    const store = new CloudStore({
      api,
      local: this.local,
      fetch: this.options.fetch,
      autoUpload: this.options.autoUpload,
      cacheMs: this.options.cacheMs,
      retryDelayMs: this.options.retryDelayMs,
      posterFrame: this.options.posterFrame,
    });
    this.current = { key, store };
    return store;
  }
}
