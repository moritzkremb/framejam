/**
 * Builds the signed catalog from `playbooks/` and `presets/`: collect and validate, hash, write the index, sign it,
 * write `public/catalog/v1/` for the website, and check the result. `scripts/catalog.ts` is the command line.
 * Signing is injected, so tests sign with a throwaway key and only the command reads the Keychain.
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign as edSign } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { SEMVER, validatePlaybook } from "../../src/core/playbooks.ts";
import { validateStyle } from "../../src/core/presets.ts";
import type { Playbook, PresetStyle } from "../../src/core/types.ts";
import {
  CatalogError,
  checkFileBytes,
  parseIndex,
  sha256Hex,
  verifyIndex,
  type CatalogFile,
  type CatalogIndex,
  type CatalogItem,
  type CatalogKind,
  type CatalogWithdrawn,
  KIND_LIST,
  isCatalogKind,
  manifestOf,
} from "../../src/server/catalog-format.ts";
import { keyIdOf } from "../../src/server/catalog-keys.ts";

export const KEYCHAIN_SERVICE = "framejam-catalog-signing";

export interface Signer {
  keyId: string;
  /** Base64 Ed25519 signature of exactly these bytes. */
  sign(bytes: Uint8Array): string;
}

/** An item and the bytes of its files, by sha256. */
export interface BuiltCatalog {
  index: CatalogIndex;
  /** sha256 -> absolute path of a file with those bytes. */
  sources: Map<string, string>;
}

const SKIP_DIRS = new Set(["node_modules", "__pycache__"]);
const SKIP_FILES = new Set([".DS_Store", "preview.mp4"]);

/** Files that ship with an item: everything except previews (they live on the website), caches and OS litter. */
export function itemFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
      } else if (entry.isFile()) {
        if (!SKIP_FILES.has(entry.name) && !entry.name.endsWith(".pyc")) out.push(path.relative(dir, full).split(path.sep).join("/"));
      } else {
        throw new Error(`${full} is not a plain file or folder`);
      }
    }
  };
  walk(dir);
  return out.sort();
}

/** Same bits on every machine: the executable bit is kept, everything else is normalised. */
const modeOf = (file: string) => ((fs.statSync(file).mode & 0o111) !== 0 ? 0o755 : 0o644);

/** The withdrawn list: `{ "playbook": ["id"], "style": ["id"] }`. A plain list means playbook ids. */
export function readWithdrawn(file: string): CatalogWithdrawn[] {
  if (!fs.existsSync(file)) return [];
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  const byKind = Array.isArray(raw) ? { playbook: raw } : raw;
  const shape = `${file} must map a kind (${KIND_LIST.join(", ")}) to a list of ids`;
  if (typeof byKind !== "object" || byKind === null) throw new Error(shape);
  const out: CatalogWithdrawn[] = [];
  for (const [kind, ids] of Object.entries(byKind)) {
    if (!isCatalogKind(kind) || !Array.isArray(ids) || ids.some((id) => typeof id !== "string")) throw new Error(shape);
    for (const id of ids as string[]) out.push({ kind, id });
  }
  return out;
}

/** The kind's own checks of one manifest, as plain messages. The checks every kind shares run after it. */
type Validator = (manifest: Record<string, unknown>, dir: string) => string[];

const VALIDATORS: Record<CatalogKind, Validator> = {
  playbook(raw, dir) {
    const playbook = raw as unknown as Playbook;
    const errors = validatePlaybook(playbook);
    if (playbook.skill && !fs.existsSync(path.join(dir, playbook.skill))) errors.push(`${playbook.skill} is missing`);
    return errors;
  },
  style(raw) {
    return validateStyle(raw as unknown as PresetStyle);
  },
};

export interface BuildInput {
  /** Per kind, the folder holding one folder per item. Kinds left out aren't published. */
  sources: Partial<Record<CatalogKind, string>>;
  keyId: string;
  sourceCommit: string;
  generatedAt: string;
  withdrawn?: CatalogWithdrawn[];
}

const byKindThenId = (a: { kind: string; id: string }, b: { kind: string; id: string }) =>
  KIND_LIST.indexOf(a.kind as CatalogKind) - KIND_LIST.indexOf(b.kind as CatalogKind) || a.id.localeCompare(b.id);

/** Validates every item folder of every kind and describes it. Throws one error listing every problem. */
export function buildCatalog(input: BuildInput): BuiltCatalog {
  const problems: string[] = [];
  const sources = new Map<string, string>();
  const items: CatalogItem[] = [];

  for (const kind of KIND_LIST) {
    const root = input.sources[kind];
    if (!root) continue;
    const manifest = manifestOf(kind);
    const folders = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(root, e.name, manifest)))
      .map((e) => e.name)
      .sort();

    for (const name of folders) {
      const dir = path.join(root, name);
      const where = `${kind} ${name}`;
      let raw: Record<string, unknown>;
      try {
        raw = JSON.parse(fs.readFileSync(path.join(dir, manifest), "utf8")) as Record<string, unknown>;
      } catch (err) {
        problems.push(`${where}: ${manifest} isn't valid JSON (${(err as Error).message})`);
        continue;
      }
      const errors = VALIDATORS[kind](raw, dir);
      if (raw.id !== name) errors.push(`id ${String(raw.id)} doesn't match the folder name`);
      if (!raw.minAppVersion) errors.push("minAppVersion is required in the catalog");
      if (typeof raw.version !== "string" || !SEMVER.test(raw.version)) errors.push("version must look like 1.0.0");
      if (errors.length) {
        problems.push(...[...new Set(errors)].map((e) => `${where}: ${e}`));
        continue;
      }
      const files: CatalogFile[] = itemFiles(dir).map((rel) => {
        const full = path.join(dir, rel);
        const bytes = fs.readFileSync(full);
        const sha256 = sha256Hex(bytes);
        sources.set(sha256, full);
        return { path: rel, sha256, size: bytes.length, mode: modeOf(full) };
      });
      items.push({ kind, id: name, version: raw.version as string, minAppVersion: raw.minAppVersion as string, files });
    }
  }

  const withdrawn = [...(input.withdrawn ?? [])].sort(byKindThenId);
  for (const w of withdrawn) {
    if (items.some((i) => i.kind === w.kind && i.id === w.id)) problems.push(`${w.kind} ${w.id} is withdrawn but still in its folder`);
  }
  if (problems.length) throw new Error(`Some items aren't ready for the catalog:\n- ${problems.join("\n- ")}`);

  const index: CatalogIndex = {
    schema: 1,
    keyId: input.keyId,
    generatedAt: input.generatedAt,
    sourceCommit: input.sourceCommit,
    items,
    withdrawn,
  };
  // The same checks every app runs on a download, so a limit or path problem fails here and not on users' computers.
  parseIndex(Buffer.from(indexText(index)));
  return { index, sources };
}

export const indexText = (index: CatalogIndex) => `${JSON.stringify(index, null, 2)}\n`;

/** The part of an index that says what's published, without when and from which commit. */
export const contentOf = (index: CatalogIndex) => JSON.stringify({ items: index.items, withdrawn: index.withdrawn });

function writeAtomic(file: string, bytes: Uint8Array | string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, file);
}

/** Writes new blobs first, then the index and its signature. Old blobs stay, since older indexes may still name them. */
export function writeCatalog(outDir: string, built: BuiltCatalog, signer: Signer): { blobsWritten: number } {
  if (built.index.keyId !== signer.keyId) throw new Error("The index names a different key than the signer");
  const text = indexText(built.index);
  const signature = signer.sign(Buffer.from(text));
  let blobsWritten = 0;
  for (const [sha, source] of built.sources) {
    const target = path.join(outDir, "blobs", sha);
    if (fs.existsSync(target)) continue;
    writeAtomic(target, fs.readFileSync(source));
    blobsWritten++;
  }
  writeAtomic(path.join(outDir, "index.json"), text);
  writeAtomic(path.join(outDir, "index.json.sig"), `${signature}\n`);
  return { blobsWritten };
}

/** Reads one file of a published catalog, from a folder or over HTTP. */
export interface CatalogSource {
  read(rel: string): Promise<Buffer>;
}

export const folderSource = (dir: string): CatalogSource => ({ read: async (rel) => fs.readFileSync(path.join(dir, rel)) });

export const httpSource = (baseUrl: string, fetcher: typeof fetch = fetch): CatalogSource => ({
  async read(rel) {
    const res = await fetcher(`${baseUrl.replace(/\/+$/, "")}/${rel}`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  },
});

/** Verifies a published catalog the way an app would: the signature with built-in keys, then every blob. */
export async function verifyCatalog(source: CatalogSource, extraKeys: string[] = []): Promise<{ index: CatalogIndex; files: number; bytes: number }> {
  const indexBytes = await source.read("index.json");
  const signature = (await source.read("index.json.sig")).toString("utf8");
  const index = verifyIndex(indexBytes, signature, { extraKeys });
  let files = 0;
  let bytes = 0;
  const checked = new Set<string>();
  for (const item of index.items) {
    for (const file of item.files) {
      if (checked.has(file.sha256)) continue;
      checked.add(file.sha256);
      let blob: Buffer;
      try {
        blob = await source.read(`blobs/${file.sha256}`);
      } catch (err) {
        throw new CatalogError("bad-file", `${item.id}/${file.path}: ${(err as Error).message}`);
      }
      checkFileBytes(file, blob);
      files++;
      bytes += blob.length;
    }
  }
  return { index, files, bytes };
}

export type Drift = { ok: true } | { ok: false; reasons: string[] };

/** Compares a published catalog with the playbooks as they are now. */
export async function checkDrift(outDir: string, built: BuiltCatalog, extraKeys: string[] = []): Promise<Drift> {
  if (!fs.existsSync(path.join(outDir, "index.json"))) return { ok: false, reasons: [`${outDir} has no index.json yet`] };
  let published: CatalogIndex;
  try {
    published = (await verifyCatalog(folderSource(outDir), extraKeys)).index;
  } catch (err) {
    return { ok: false, reasons: [`the published catalog doesn't verify: ${(err as Error).message}`] };
  }
  const reasons: string[] = [];
  const label = (i: CatalogItem) => `${i.kind} ${i.id}`;
  const now = new Map(built.index.items.map((i) => [label(i), i]));
  const then = new Map(published.items.map((i) => [label(i), i]));
  for (const [key, item] of now) {
    const old = then.get(key);
    if (!old) reasons.push(`${key} isn't in the catalog yet`);
    else if (JSON.stringify(old) !== JSON.stringify(item)) reasons.push(`${key} changed since the catalog was built`);
  }
  for (const key of then.keys()) if (!now.has(key)) reasons.push(`${key} is in the catalog but no longer in its folder`);
  if (JSON.stringify(published.withdrawn) !== JSON.stringify(built.index.withdrawn)) reasons.push("the withdrawn list changed");
  return reasons.length ? { ok: false, reasons } : { ok: true };
}

/**
 * Copies each item's manifest (`playbook.json`, `style.json`) to the website's folder for its kind, only where the
 * item's folder exists there, so the website's cards always match the catalog. Returns `<kind> <id>` for each copy it
 * rewrote (or would, when `check` is set).
 */
export function syncSiteCopies(
  sources: Partial<Record<CatalogKind, string>>,
  siteDirs: Partial<Record<CatalogKind, string>>,
  items: CatalogItem[],
  check = false,
): string[] {
  const changed: string[] = [];
  for (const item of items) {
    const from = sources[item.kind];
    const to = siteDirs[item.kind];
    if (!from || !to) continue;
    const manifest = manifestOf(item.kind);
    const target = path.join(to, item.id, manifest);
    if (!fs.existsSync(path.dirname(target))) continue;
    const source = fs.readFileSync(path.join(from, item.id, manifest));
    if (fs.existsSync(target) && fs.readFileSync(target).equals(source)) continue;
    changed.push(`${item.kind} ${item.id}`);
    if (!check) fs.writeFileSync(target, source);
  }
  return changed;
}

/** A signer with a fresh key that exists only in memory, for trying the catalog locally and in tests. */
export function ephemeralSigner(): Signer & { publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  return { keyId: keyIdOf(spki), publicKey: spki, sign: (bytes) => edSign(null, bytes, privateKey).toString("base64") };
}

export type Run = (command: string, args: string[]) => string;

/**
 * Signs with the private key in the macOS login Keychain. Reading it makes macOS ask for approval: click Allow,
 * never Always Allow. The key is used in memory and never printed or written; errors don't include what the
 * Keychain returned.
 */
export function keychainSigner(keyId: string, run: Run): Signer {
  return {
    keyId,
    sign(bytes) {
      let stored: string;
      try {
        stored = run("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", keyId, "-w"]).trim();
      } catch {
        throw new Error(`Couldn't read key ${keyId} from the Keychain (not found, or access was denied).`);
      }
      let key;
      try {
        key = createPrivateKey({ key: Buffer.from(stored, "base64"), format: "der", type: "pkcs8" });
      } catch {
        throw new Error(`The Keychain entry for ${keyId} isn't an Ed25519 private key.`);
      }
      const spki = createPublicKey(key).export({ format: "der", type: "spki" }).toString("base64");
      if (key.asymmetricKeyType !== "ed25519" || keyIdOf(spki) !== keyId) throw new Error(`The Keychain entry for ${keyId} holds a different key.`);
      return edSign(null, bytes, key).toString("base64");
    },
  };
}
