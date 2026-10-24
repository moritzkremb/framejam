/**
 * Downloads the signed playbook catalog in the background and keeps it in `<data dir>/catalog/`.
 *
 * Nothing is used before it's verified: the index must carry a valid signature from a built-in key, and every file
 * must match the sha256 and size the index names. An item's folder only appears once it is complete (built in a temp
 * folder, then renamed), so a path handed to an agent never changes while it works. Several FrameJam processes can
 * share one data dir: each step is atomic and a lost race is not an error.
 */
import fs from "node:fs";
import path from "node:path";
import {
  CatalogError,
  MAX_FILE_BYTES,
  MAX_INDEX_BYTES,
  checkFileBytes,
  isCompatible,
  sha256Hex,
  verifyIndex,
  type CatalogFile,
  type CatalogIndex,
  type CatalogItem,
} from "./catalog-format.ts";
import { trustedKeys } from "./catalog-keys.ts";
import { DEFAULT_CATALOG_URL, builtinPlaybooksDir, env, isInstalledCopy } from "./paths.ts";
import { VERSION } from "./version.ts";

const OK_TTL_MS = 6 * 60 * 60 * 1000;
const FAIL_TTL_MS = 30 * 60 * 1000;
/** Skip the refresh at start when another process refreshed this recently. */
const FRESH_MS = 60 * 1000;
/** An item folder that nothing refers to any more is kept this long, so a path an agent already has keeps working. */
export const RETIRE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_TEMP_MS = 24 * 60 * 60 * 1000;
const INDEX_TIMEOUT_MS = 10_000;
const BLOB_TIMEOUT_MS = 30_000;

export interface CatalogConfig {
  enabled: boolean;
  /** Base URL of the catalog, without a trailing slash. */
  url: string;
  /** Extra public keys (base64 SPKI) from FRAMEJAM_CATALOG_PUBLIC_KEY. Only ever set in a source checkout. */
  extraKeys: string[];
  /** Why it's off, for the UI and the logs. */
  reason?: "env-off" | "no-update-check" | "source-checkout" | "invalid-url";
}

/**
 * Whether the catalog is used, from the environment:
 * - `FRAMEJAM_CATALOG_URL=off` turns it off; any other value replaces the default URL.
 * - `FRAMEJAM_NO_UPDATE_CHECK` turns it off.
 * - A source checkout has every playbook in `playbooks/`, so it's off there unless FRAMEJAM_CATALOG_URL is set.
 * - `FRAMEJAM_CATALOG_PUBLIC_KEY` trusts one more key, only in a source checkout. Nothing skips verification.
 */
export function catalogConfig(read: (name: string) => string | undefined = env, installed: boolean = isInstalledCopy()): CatalogConfig {
  const configured = read("CATALOG_URL")?.trim();
  const extraKey = read("CATALOG_PUBLIC_KEY")?.trim();
  const base = { url: (configured || DEFAULT_CATALOG_URL).replace(/\/+$/, ""), extraKeys: !installed && extraKey ? [extraKey] : [] };
  if (configured?.toLowerCase() === "off") return { ...base, enabled: false, reason: "env-off" };
  if (read("NO_UPDATE_CHECK")) return { ...base, enabled: false, reason: "no-update-check" };
  if (!installed && !configured) return { ...base, enabled: false, reason: "source-checkout" };
  try {
    const { protocol } = new URL(base.url);
    if (protocol !== "https:" && protocol !== "http:") throw new Error("not http");
  } catch {
    return { ...base, enabled: false, reason: "invalid-url" };
  }
  return { ...base, enabled: true };
}

/** What's saved in `state.json`: the last good index exactly as downloaded, so it can be verified again on every read. */
interface StateFile {
  schema: 1;
  indexText: string;
  signature: string;
  checkedAt: string;
  /** Folders (relative to `items/`) nothing refers to, and since when. */
  retired: Record<string, string>;
}

const stateFile = (root: string) => path.join(root, "state.json");
const itemsDir = (root: string) => path.join(root, "items");

/** `<version>-<8 hex of the file list's hash>`: a new folder whenever a file changes, the same name for the same files. */
export function itemFolderName(item: CatalogItem): string {
  return `${item.version}-${sha256Hex(Buffer.from(JSON.stringify(item.files))).slice(0, 8)}`;
}

export const itemDir = (root: string, item: Pick<CatalogItem, "kind" | "id" | "version" | "files">) =>
  path.join(itemsDir(root), item.kind, item.id, itemFolderName(item as CatalogItem));

function writeAtomic(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

interface ReadOptions {
  appVersion: string;
  /** Extra public keys, for tests and source checkouts. */
  extraKeys?: string[];
}

function readState(root: string, options: ReadOptions): { state: StateFile; index: CatalogIndex } | undefined {
  try {
    const state = JSON.parse(fs.readFileSync(stateFile(root), "utf8")) as StateFile;
    if (state.schema !== 1 || typeof state.indexText !== "string" || typeof state.signature !== "string") return undefined;
    const index = verifyIndex(Buffer.from(state.indexText), state.signature, { keys: trustedKeys(options.extraKeys) });
    return { state: { ...state, retired: state.retired ?? {} }, index };
  } catch {
    return undefined;
  }
}

export interface CatalogEntry {
  item: CatalogItem;
  /** Complete folder with the item's files. */
  dir: string;
}

export interface CatalogSnapshot {
  generatedAt: string;
  sourceCommit: string;
  checkedAt: string;
  /** Playbooks this app can use: compatible, not withdrawn, and fully downloaded. By id. */
  playbooks: Map<string, CatalogEntry>;
  /** Ids the catalog hides. The bundled copy still shows. */
  withdrawn: Set<string>;
}

/**
 * The last good catalog on disk, verified again now. Undefined when there is none or it no longer verifies (for
 * example after the keys changed), so callers fall back to the bundled playbooks.
 */
export function readSnapshot(root: string, options: ReadOptions): CatalogSnapshot | undefined {
  const read = readState(root, options);
  if (!read) return undefined;
  const { state, index } = read;
  const withdrawn = new Set(index.withdrawn.filter((w) => w.kind === "playbook").map((w) => w.id));
  const playbooks = new Map<string, CatalogEntry>();
  for (const item of index.items) {
    if (item.kind !== "playbook" || withdrawn.has(item.id) || !isCompatible(item, options.appVersion)) continue;
    const dir = itemDir(root, item);
    if (fs.existsSync(path.join(dir, "playbook.json"))) playbooks.set(item.id, { item, dir });
  }
  return { generatedAt: index.generatedAt, sourceCommit: index.sourceCommit, checkedAt: state.checkedAt, playbooks, withdrawn };
}

export type RefreshResult =
  | { ok: true; changed: boolean; generatedAt: string; downloaded: number; seeded: number }
  | { ok: false; error: string; code: string };

export interface CatalogStatus {
  enabled: boolean;
  url: string;
  reason?: CatalogConfig["reason"];
  /** Last successful refresh, from any FrameJam process sharing this data dir. */
  checkedAt?: string;
  generatedAt?: string;
  sourceCommit?: string;
  /** The last failed refresh in this process, cleared by the next success. */
  lastError?: { at: string; message: string };
}

export interface CatalogClientOptions {
  root: string;
  url: string;
  appVersion: string;
  /** The bundled playbooks folder, to copy unchanged files from instead of downloading them. */
  bundledDir?: string;
  extraKeys?: string[];
  fetch?: typeof fetch;
  now?: () => number;
  log?: (message: string) => void;
}

async function readBody(res: Response, limit: number): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length"));
  if (declared > limit) throw new CatalogError("bad-file", `the response is larger than ${limit} bytes`);
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new CatalogError("bad-file", `the response is larger than ${limit} bytes`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function plainFile(file: string): Buffer | undefined {
  try {
    const stat = fs.lstatSync(file);
    return stat.isFile() ? fs.readFileSync(file) : undefined;
  } catch {
    return undefined;
  }
}

export class CatalogClient {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private inFlight: Promise<RefreshResult> | undefined;
  private timer: NodeJS.Timeout | undefined;
  private lastError: CatalogStatus["lastError"];
  private stopped = false;

  constructor(private readonly options: CatalogClientOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }

  private readOptions(): ReadOptions {
    return { appVersion: this.options.appVersion, extraKeys: this.options.extraKeys };
  }

  status(): Omit<CatalogStatus, "enabled" | "url" | "reason"> {
    const snapshot = readSnapshot(this.options.root, this.readOptions());
    return {
      checkedAt: snapshot?.checkedAt,
      generatedAt: snapshot?.generatedAt,
      sourceCommit: snapshot?.sourceCommit,
      lastError: this.lastError,
    };
  }

  /** Refreshes now and then every 6 hours, or 30 minutes after a failure. Never blocks the caller. */
  start(): void {
    this.stopped = false;
    const prior = readState(this.options.root, this.readOptions());
    const recent = prior && this.now() - Date.parse(prior.state.checkedAt) < FRESH_MS;
    if (recent) this.schedule(OK_TTL_MS);
    else void this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async tick(): Promise<void> {
    const result = await this.refresh();
    this.schedule(result.ok ? OK_TTL_MS : FAIL_TTL_MS);
  }

  private schedule(ms: number): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), ms);
    this.timer.unref();
  }

  /** One refresh. Concurrent calls share a run. Never throws; failures are returned and remembered. */
  refresh(): Promise<RefreshResult> {
    this.inFlight ??= this.run().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async run(): Promise<RefreshResult> {
    try {
      const result = await this.refreshOnce();
      this.lastError = undefined;
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = err instanceof CatalogError ? err.code : "network";
      // One line per run of failures, so being offline doesn't fill a log.
      if (!this.lastError) this.options.log?.(`framejam: couldn't update playbooks from ${this.options.url}: ${message}`);
      this.lastError = { at: new Date(this.now()).toISOString(), message };
      return { ok: false, error: message, code };
    }
  }

  private async get(rel: string, limit: number, timeoutMs: number): Promise<Buffer> {
    const res = await this.fetchImpl(`${this.options.url}/${rel}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
    return readBody(res, limit);
  }

  private async refreshOnce(): Promise<RefreshResult> {
    const { root, appVersion } = this.options;
    const indexBytes = await this.get("index.json", MAX_INDEX_BYTES, INDEX_TIMEOUT_MS);
    const signature = (await this.get("index.json.sig", 4096, INDEX_TIMEOUT_MS)).toString("utf8");
    const index = verifyIndex(indexBytes, signature, { keys: trustedKeys(this.options.extraKeys) });

    const prior = readState(root, this.readOptions());
    if (prior && Date.parse(index.generatedAt) < Date.parse(prior.index.generatedAt)) {
      throw new CatalogError("bad-index", `the catalog (${index.generatedAt}) is older than the one already saved (${prior.index.generatedAt})`);
    }

    const withdrawn = new Set(index.withdrawn.map((w) => w.id));
    const wanted = index.items.filter((i) => !withdrawn.has(i.id) && isCompatible(i, appVersion));
    let downloaded = 0;
    let seeded = 0;
    for (const item of wanted) {
      const counts = await this.install(item);
      downloaded += counts.downloaded;
      seeded += counts.seeded;
    }

    const indexText = indexBytes.toString("utf8");
    const changed = !prior || prior.state.indexText !== indexText;
    const retired = this.retire(root, wanted, prior?.state.retired ?? {});
    const state: StateFile = { schema: 1, indexText, signature: signature.trim(), checkedAt: new Date(this.now()).toISOString(), retired };
    writeAtomic(stateFile(root), `${JSON.stringify(state)}\n`);
    return { ok: true, changed, generatedAt: index.generatedAt, downloaded, seeded };
  }

  /** Builds the item's folder if it isn't there yet. Complete or absent, never half done. */
  private async install(item: CatalogItem): Promise<{ downloaded: number; seeded: number }> {
    const { root } = this.options;
    const finalDir = itemDir(root, item);
    if (fs.existsSync(path.join(finalDir, "playbook.json"))) return { downloaded: 0, seeded: 0 };

    const parent = path.dirname(finalDir);
    fs.mkdirSync(parent, { recursive: true });
    const tmp = path.join(parent, `.tmp-${process.pid}-${this.now()}-${Math.random().toString(36).slice(2, 8)}`);
    fs.mkdirSync(tmp);
    const counts = { downloaded: 0, seeded: 0 };
    try {
      const fetched = new Map<string, Buffer>();
      for (const file of item.files) {
        const target = path.resolve(tmp, file.path);
        if (!target.startsWith(`${tmp}${path.sep}`)) throw new CatalogError("bad-index", `${file.path} leaves the item folder`);
        let bytes = this.seed(item, file);
        if (bytes) counts.seeded++;
        else {
          bytes = fetched.get(file.sha256);
          if (!bytes) {
            bytes = await this.get(`blobs/${file.sha256}`, Math.min(file.size, MAX_FILE_BYTES) + 1, BLOB_TIMEOUT_MS);
            checkFileBytes(file, bytes);
            fetched.set(file.sha256, bytes);
            counts.downloaded++;
          }
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, bytes);
        fs.chmodSync(target, file.mode);
      }
      try {
        fs.renameSync(tmp, finalDir);
      } catch (err) {
        // Another FrameJam process finished the same folder first: that one is just as good.
        if (!fs.existsSync(path.join(finalDir, "playbook.json"))) throw err;
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    } catch (err) {
      fs.rmSync(tmp, { recursive: true, force: true });
      throw err;
    }
    return counts;
  }

  /** The same file from the bundled copy, or from an earlier version of this item, if its bytes match exactly. */
  private seed(item: CatalogItem, file: CatalogFile): Buffer | undefined {
    const candidates: string[] = [];
    if (this.options.bundledDir) candidates.push(path.join(this.options.bundledDir, item.id, file.path));
    const versions = path.join(itemsDir(this.options.root), item.kind, item.id);
    try {
      for (const entry of fs.readdirSync(versions, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith(".")) candidates.push(path.join(versions, entry.name, file.path));
      }
    } catch {
      // No earlier versions.
    }
    for (const candidate of candidates) {
      const bytes = plainFile(candidate);
      if (bytes && bytes.length === file.size && sha256Hex(bytes) === file.sha256) return bytes;
    }
    return undefined;
  }

  /**
   * Remembers when each folder stopped being referenced, and deletes the ones that have been unused for 7 days.
   * Returns the updated list. Also clears out temp folders left by a crash.
   */
  private retire(root: string, wanted: CatalogItem[], before: Record<string, string>): Record<string, string> {
    const now = this.now();
    const keep = new Set(wanted.map((i) => path.join(i.kind, i.id, itemFolderName(i))));
    const retired: Record<string, string> = {};
    const base = itemsDir(root);
    const entries = (dir: string) => {
      try {
        return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
      } catch {
        return [];
      }
    };
    for (const kind of entries(base)) {
      for (const id of entries(path.join(base, kind.name))) {
        for (const version of entries(path.join(base, kind.name, id.name))) {
          const rel = path.join(kind.name, id.name, version.name);
          const full = path.join(base, rel);
          if (version.name.startsWith(".tmp-")) {
            if (now - fs.statSync(full).mtimeMs > STALE_TEMP_MS) fs.rmSync(full, { recursive: true, force: true });
            continue;
          }
          if (keep.has(rel)) continue;
          const since = Date.parse(before[rel] ?? "") || now;
          if (now - since > RETIRE_AFTER_MS) fs.rmSync(full, { recursive: true, force: true });
          else retired[rel] = new Date(since).toISOString();
        }
        try {
          fs.rmdirSync(path.join(base, kind.name, id.name));
        } catch {
          // Not empty.
        }
      }
    }
    return retired;
  }
}

/** What `/api/catalog` returns: whether the catalog is on, and when it last refreshed. */
export function catalogStatus(root: string, config: CatalogConfig, client?: CatalogClient, appVersion: string = VERSION): CatalogStatus {
  const base = { enabled: config.enabled, url: config.url, ...(config.reason ? { reason: config.reason } : {}) };
  if (!config.enabled) return base;
  if (client) return { ...base, ...client.status() };
  const snapshot = readSnapshot(root, { appVersion, extraKeys: config.extraKeys });
  return { ...base, checkedAt: snapshot?.checkedAt, generatedAt: snapshot?.generatedAt, sourceCommit: snapshot?.sourceCommit };
}

/** Starts the background refresh for this process when the catalog is on. */
export function startCatalog(root: string, log: (message: string) => void, config: CatalogConfig = catalogConfig()): CatalogClient | undefined {
  if (!config.enabled) return undefined;
  const client = new CatalogClient({
    root,
    url: config.url,
    appVersion: VERSION,
    bundledDir: builtinPlaybooksDir,
    extraKeys: config.extraKeys,
    log,
  });
  client.start();
  return client;
}
