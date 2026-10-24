/**
 * Builds the signed playbook catalog from `playbooks/`: collect and validate, hash, write the index, sign it,
 * write `public/catalog/v1/` for the website, and check the result. `scripts/catalog.ts` is the command line.
 * Signing is injected, so tests sign with a throwaway key and only the command reads the Keychain.
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign as edSign } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { SEMVER, validatePlaybook } from "../../src/core/playbooks.ts";
import type { Playbook } from "../../src/core/types.ts";
import {
  CatalogError,
  checkFileBytes,
  parseIndex,
  sha256Hex,
  verifyIndex,
  type CatalogFile,
  type CatalogIndex,
  type CatalogItem,
  type CatalogWithdrawn,
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

/** Files that ship with a playbook: everything except previews (they live on the website), caches and OS litter. */
export function playbookFiles(dir: string): string[] {
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

export function readWithdrawn(file: string): CatalogWithdrawn[] {
  if (!fs.existsSync(file)) return [];
  const ids = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) throw new Error(`${file} must be a list of playbook ids`);
  return (ids as string[]).map((id) => ({ kind: "playbook" as const, id }));
}

export interface BuildInput {
  playbooksDir: string;
  keyId: string;
  sourceCommit: string;
  generatedAt: string;
  withdrawn?: CatalogWithdrawn[];
}

/** Validates every playbook folder and describes it. Throws one error listing every problem. */
export function buildCatalog(input: BuildInput): BuiltCatalog {
  const problems: string[] = [];
  const sources = new Map<string, string>();
  const items: CatalogItem[] = [];
  const folders = fs
    .readdirSync(input.playbooksDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(input.playbooksDir, e.name, "playbook.json")))
    .map((e) => e.name)
    .sort();

  for (const name of folders) {
    const dir = path.join(input.playbooksDir, name);
    let playbook: Playbook;
    try {
      playbook = JSON.parse(fs.readFileSync(path.join(dir, "playbook.json"), "utf8")) as Playbook;
    } catch (err) {
      problems.push(`${name}: playbook.json isn't valid JSON (${(err as Error).message})`);
      continue;
    }
    const errors = validatePlaybook(playbook);
    if (playbook.id !== name) errors.push(`id ${String(playbook.id)} doesn't match the folder name`);
    if (!playbook.minAppVersion) errors.push("minAppVersion is required in the catalog");
    if (!SEMVER.test(playbook.version ?? "")) errors.push("version must look like 1.0.0");
    if (playbook.skill && !fs.existsSync(path.join(dir, playbook.skill))) errors.push(`${playbook.skill} is missing`);
    if (errors.length) {
      problems.push(...errors.map((e) => `${name}: ${e}`));
      continue;
    }
    const files: CatalogFile[] = playbookFiles(dir).map((rel) => {
      const full = path.join(dir, rel);
      const bytes = fs.readFileSync(full);
      const sha256 = sha256Hex(bytes);
      sources.set(sha256, full);
      return { path: rel, sha256, size: bytes.length, mode: modeOf(full) };
    });
    items.push({ kind: "playbook", id: playbook.id, version: playbook.version, minAppVersion: playbook.minAppVersion!, files });
  }

  const withdrawn = [...(input.withdrawn ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  for (const w of withdrawn) if (items.some((i) => i.id === w.id)) problems.push(`${w.id} is withdrawn but still in playbooks/`);
  if (problems.length) throw new Error(`The playbooks aren't ready for the catalog:\n- ${problems.join("\n- ")}`);

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
  const now = new Map(built.index.items.map((i) => [i.id, i]));
  const then = new Map(published.items.map((i) => [i.id, i]));
  for (const [id, item] of now) {
    const old = then.get(id);
    if (!old) reasons.push(`${id} isn't in the catalog yet`);
    else if (JSON.stringify(old) !== JSON.stringify(item)) reasons.push(`${id} changed since the catalog was built`);
  }
  for (const id of then.keys()) if (!now.has(id)) reasons.push(`${id} is in the catalog but no longer in playbooks/`);
  if (JSON.stringify(published.withdrawn) !== JSON.stringify(built.index.withdrawn)) reasons.push("the withdrawn list changed");
  return reasons.length ? { ok: false, reasons } : { ok: true };
}

/**
 * Copies each `playbook.json` to the website's `public/playbooks/<id>/`, only where that folder exists, so the
 * website's cards always match the catalog. Returns the ids it rewrote (or would, when `check` is set).
 */
export function syncSiteCopies(playbooksDir: string, siteDir: string, items: CatalogItem[], check = false): string[] {
  const changed: string[] = [];
  for (const item of items) {
    const target = path.join(siteDir, item.id, "playbook.json");
    if (!fs.existsSync(path.dirname(target))) continue;
    const source = fs.readFileSync(path.join(playbooksDir, item.id, "playbook.json"));
    if (fs.existsSync(target) && fs.readFileSync(target).equals(source)) continue;
    changed.push(item.id);
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
