import { createHash, createPrivateKey, createPublicKey, sign, type KeyObject } from "node:crypto";
import { keyIdOf } from "../src/server/catalog-keys.ts";
import { sha256Hex, type CatalogIndex } from "../src/server/catalog-format.ts";

/**
 * A key pair for tests and CI only. It comes from a seed written in this file, so it protects nothing and is
 * never the real catalog key (that one only lives in Moritz's Keychain).
 */
function keyFromSeed(label: string) {
  const seed = createHash("sha256").update(label).digest();
  const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
  const privateKey = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
  const publicKey = createPublicKey(privateKey).export({ format: "der", type: "spki" }).toString("base64");
  return { privateKey, publicKey, keyId: keyIdOf(publicKey) };
}

export const TEST_KEY = keyFromSeed("framejam catalog TEST key: public seed, not a secret");
export const OTHER_TEST_KEY = keyFromSeed("framejam catalog second TEST key: public seed, not a secret");

export interface TestFile {
  content: string | Buffer;
  mode?: number;
}

export interface TestItem {
  id: string;
  version?: string;
  minAppVersion?: string;
  /** path -> content. `playbook.json` is added when missing. */
  files?: Record<string, string | Buffer | TestFile>;
}

export interface TestCatalog {
  index: CatalogIndex;
  indexBytes: Buffer;
  signature: string;
  /** sha256 -> bytes */
  blobs: Map<string, Buffer>;
}

export function signBytes(bytes: Uint8Array, key: KeyObject = TEST_KEY.privateKey): string {
  return sign(null, bytes, key).toString("base64");
}

/** Builds a signed catalog in memory. `overrides` can break the index on purpose. */
export function makeCatalog(
  items: TestItem[],
  options: { withdrawn?: string[]; generatedAt?: string; key?: typeof TEST_KEY; keyId?: string; overrides?: Record<string, unknown> } = {},
): TestCatalog {
  const key = options.key ?? TEST_KEY;
  const blobs = new Map<string, Buffer>();
  const index: CatalogIndex = {
    schema: 1,
    keyId: options.keyId ?? key.keyId,
    generatedAt: options.generatedAt ?? "2026-11-02T17:00:00.000Z",
    sourceCommit: "0".repeat(40),
    items: items.map((item) => {
      const version = item.version ?? "1.0.0";
      const entries: Record<string, string | Buffer | TestFile> = {
        "playbook.json": JSON.stringify({ id: item.id, version }),
        ...item.files,
      };
      return {
        kind: "playbook" as const,
        id: item.id,
        version,
        minAppVersion: item.minAppVersion ?? "0.6.0",
        files: Object.entries(entries).map(([path, value]) => {
          const file: TestFile = typeof value === "string" || Buffer.isBuffer(value) ? { content: value } : value;
          const bytes = Buffer.from(file.content);
          const sha256 = sha256Hex(bytes);
          blobs.set(sha256, bytes);
          return { path, sha256, size: bytes.length, mode: file.mode ?? 0o644 };
        }),
      };
    }),
    withdrawn: (options.withdrawn ?? []).map((id) => ({ kind: "playbook" as const, id })),
  };
  const indexBytes = Buffer.from(JSON.stringify({ ...index, ...options.overrides }, null, 2));
  return { index, indexBytes, signature: signBytes(indexBytes, key.privateKey), blobs };
}
