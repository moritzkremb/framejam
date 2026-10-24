import { createHash, verify, type KeyObject } from "node:crypto";
import { SEMVER } from "../core/playbooks.ts";
import { trustedKeys } from "./catalog-keys.ts";
import { compareVersions } from "./version.ts";

/** Newest index `schema` this app understands. A newer one is ignored whole. */
export const CATALOG_SCHEMA = 1;

export const MAX_INDEX_BYTES = 2 * 1024 * 1024;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_ITEM_FILES = 400;
export const MAX_ITEM_BYTES = 50 * 1024 * 1024;
const MAX_ITEMS = 500;
const MAX_PATH_LENGTH = 200;

export interface CatalogFile {
  /** Relative path inside the item, with `/` separators. */
  path: string;
  /** sha256 of the file's bytes, lowercase hex. Also the name of its blob. */
  sha256: string;
  size: number;
  /** Unix permission bits, for example 420 (0o644) or 493 (0o755). */
  mode: number;
}

export interface CatalogItem {
  kind: "playbook";
  id: string;
  version: string;
  minAppVersion: string;
  files: CatalogFile[];
}

export interface CatalogWithdrawn {
  kind: "playbook";
  id: string;
}

export interface CatalogIndex {
  schema: number;
  keyId: string;
  generatedAt: string;
  sourceCommit: string;
  /** Only the kinds this app knows. Others are dropped while reading, so a newer catalog can add kinds. */
  items: CatalogItem[];
  withdrawn: CatalogWithdrawn[];
}

export type CatalogErrorCode = "bad-index" | "schema-too-new" | "unknown-key" | "bad-signature" | "bad-file";

export class CatalogError extends Error {
  readonly code: CatalogErrorCode;
  constructor(code: CatalogErrorCode, message: string) {
    super(message);
    this.name = "CatalogError";
    this.code = code;
  }
}

const KINDS = new Set(["playbook"]);
const ID = /^[a-z0-9][a-z0-9-]*$/;
const SHA256 = /^[0-9a-f]{64}$/;
const KEY_ID = /^[0-9a-f]{8}$/;

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** A plain relative path: no empty, `.` or `..` parts, no leading slash, backslash, drive letter or control characters. */
export function isSafeRelativePath(p: unknown): p is string {
  if (typeof p !== "string" || !p || p.length > MAX_PATH_LENGTH) return false;
  if (p.startsWith("/") || p.includes("\\") || /^[a-zA-Z]:/.test(p)) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(p)) return false;
  return p.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

const bad = (message: string): never => {
  throw new CatalogError("bad-index", message);
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function readFile(raw: unknown, where: string): CatalogFile {
  if (!isObject(raw)) return bad(`${where} is not an object`);
  const { path: p, sha256, size, mode } = raw;
  if (!isSafeRelativePath(p)) return bad(`${where} has an unsafe path`);
  if (typeof sha256 !== "string" || !SHA256.test(sha256)) return bad(`${where} has no valid sha256`);
  if (typeof size !== "number" || !Number.isInteger(size) || size < 0 || size > MAX_FILE_BYTES) return bad(`${where} has an invalid size`);
  if (typeof mode !== "number" || !Number.isInteger(mode) || mode < 0 || mode > 0o777) return bad(`${where} has an invalid mode`);
  return { path: p, sha256, size, mode };
}

function readItem(raw: Record<string, unknown>): CatalogItem {
  const { id, version, minAppVersion, files } = raw;
  const where = `item ${String(id)}`;
  if (typeof id !== "string" || !ID.test(id)) return bad("an item has an invalid id");
  if (typeof version !== "string" || !SEMVER.test(version)) return bad(`${where} has an invalid version`);
  if (typeof minAppVersion !== "string" || !SEMVER.test(minAppVersion)) return bad(`${where} has an invalid minAppVersion`);
  if (!Array.isArray(files) || !files.length || files.length > MAX_ITEM_FILES) return bad(`${where} has an invalid file list`);
  const list = files.map((f, i) => readFile(f, `${where} file ${i}`));
  const seen = new Set<string>();
  let total = 0;
  for (const f of list) {
    if (seen.has(f.path)) return bad(`${where} lists ${f.path} twice`);
    seen.add(f.path);
    total += f.size;
  }
  if (total > MAX_ITEM_BYTES) return bad(`${where} is too large`);
  if (!seen.has("playbook.json")) return bad(`${where} has no playbook.json`);
  return { kind: "playbook", id, version, minAppVersion, files: list };
}

/**
 * Reads an index that has already passed signature verification. Throws `CatalogError` when it's malformed or
 * its schema is newer than this app. Items of unknown kinds are left out.
 */
export function parseIndex(bytes: Uint8Array): CatalogIndex {
  if (bytes.length > MAX_INDEX_BYTES) return bad("the index is too large");
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    return bad("the index is not JSON");
  }
  if (!isObject(raw)) return bad("the index is not an object");
  const { schema, keyId, generatedAt, sourceCommit, items, withdrawn } = raw;
  if (typeof schema !== "number" || !Number.isInteger(schema) || schema < 1) return bad("the index has no valid schema");
  if (schema > CATALOG_SCHEMA) throw new CatalogError("schema-too-new", `the index uses schema ${schema}, this app reads ${CATALOG_SCHEMA}`);
  if (typeof keyId !== "string" || !KEY_ID.test(keyId)) return bad("the index has no valid keyId");
  if (typeof generatedAt !== "string" || Number.isNaN(Date.parse(generatedAt))) return bad("the index has no valid generatedAt");
  if (typeof sourceCommit !== "string") return bad("the index has no sourceCommit");
  if (!Array.isArray(items) || items.length > MAX_ITEMS) return bad("the index has an invalid item list");
  if (withdrawn !== undefined && (!Array.isArray(withdrawn) || withdrawn.length > MAX_ITEMS)) return bad("the index has an invalid withdrawn list");

  const known: CatalogItem[] = [];
  const seen = new Set<string>();
  for (const entry of items) {
    if (!isObject(entry) || typeof entry.kind !== "string") return bad("an item has no kind");
    if (!KINDS.has(entry.kind)) continue;
    const item = readItem(entry);
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) return bad(`${item.id} is listed twice`);
    seen.add(key);
    known.push(item);
  }

  const gone: CatalogWithdrawn[] = [];
  for (const entry of withdrawn ?? []) {
    if (!isObject(entry) || typeof entry.kind !== "string" || typeof entry.id !== "string") return bad("a withdrawn entry is invalid");
    if (!KINDS.has(entry.kind)) continue;
    if (!ID.test(entry.id)) return bad("a withdrawn entry has an invalid id");
    gone.push({ kind: "playbook", id: entry.id });
  }

  return { schema, keyId, generatedAt, sourceCommit, items: known, withdrawn: gone };
}

/** The `keyId` field of an index that hasn't been verified yet, only to pick the key to verify it with. */
function claimedKeyId(bytes: Uint8Array): string {
  try {
    const raw = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
    if (isObject(raw) && typeof raw.keyId === "string") return raw.keyId;
  } catch {
    // reported below as a bad index
  }
  return bad("the index is not valid JSON with a keyId");
}

export interface VerifyOptions {
  /** Keys to trust. Defaults to the built-in table plus `extraKeys`. */
  keys?: Map<string, KeyObject>;
  /** Extra public keys (base64 SPKI) for tests. */
  extraKeys?: string[];
}

/**
 * Checks `signature` (base64, Ed25519) over the exact bytes of `index.json` with the built-in key named by its
 * `keyId`, then reads it. Nothing in the index is used before the signature checks out. There is no way to skip this.
 */
export function verifyIndex(indexBytes: Uint8Array, signatureBase64: string, options: VerifyOptions = {}): CatalogIndex {
  if (indexBytes.length > MAX_INDEX_BYTES) return bad("the index is too large");
  const keyId = claimedKeyId(indexBytes);
  const key = (options.keys ?? trustedKeys(options.extraKeys)).get(keyId);
  if (!key) throw new CatalogError("unknown-key", `the index is signed with key ${keyId}, which this app doesn't trust`);
  const text = signatureBase64.trim();
  const signature = Buffer.from(text, "base64");
  if (signature.length !== 64 || signature.toString("base64") !== text) throw new CatalogError("bad-signature", "the signature isn't valid base64 Ed25519");
  if (!verify(null, indexBytes, key, signature)) throw new CatalogError("bad-signature", "the signature doesn't match the index");
  return parseIndex(indexBytes);
}

/** Throws unless `bytes` is exactly the file the index describes. */
export function checkFileBytes(file: CatalogFile, bytes: Uint8Array): void {
  if (bytes.length !== file.size) throw new CatalogError("bad-file", `${file.path} has ${bytes.length} bytes, expected ${file.size}`);
  if (sha256Hex(bytes) !== file.sha256) throw new CatalogError("bad-file", `${file.path} doesn't match its sha256`);
}

/** Whether an app at `appVersion` may use the item. */
export function isCompatible(item: Pick<CatalogItem, "minAppVersion">, appVersion: string): boolean {
  return compareVersions(appVersion, item.minAppVersion) >= 0;
}
