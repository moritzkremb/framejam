import { createHash, createPublicKey, type KeyObject } from "node:crypto";

/**
 * Public keys that can sign the catalog, by key id (the first 8 hex characters of the sha256 of the SPKI DER).
 * Values are the SPKI DER in base64. Public keys are safe to commit.
 *
 * Made with `npm run catalog:keygen` (docs/catalog.md, steps A and B). A release must carry exactly two keys: the
 * active one and the spare (see `tests/catalog-keys.test.ts`).
 */
export const CATALOG_PUBLIC_KEYS: Readonly<Record<string, string>> = {
  "1c6a8f72": "MCowBQYDK2VwAyEA160KT0oRfaVT0Hu4pul4sEFp954NhJz5YuqHF+cSMaU=",
  afd98895: "MCowBQYDK2VwAyEA4X0UOYc50oa28TIengrSd0Vs5CyByz117pkEA+r3oPU=",
};

/** The key `npm run catalog` signs with. Set together with the table. */
export const ACTIVE_KEY_ID = "1c6a8f72";

export function keyIdOf(spkiBase64: string): string {
  return createHash("sha256").update(Buffer.from(spkiBase64, "base64")).digest("hex").slice(0, 8);
}

/** An Ed25519 public key from SPKI DER in base64, or null when it isn't one. */
export function parsePublicKey(spkiBase64: string): KeyObject | null {
  try {
    const key = createPublicKey({ key: Buffer.from(spkiBase64, "base64"), format: "der", type: "spki" });
    return key.asymmetricKeyType === "ed25519" ? key : null;
  } catch {
    return null;
  }
}

/**
 * The keys a catalog may be signed with. An entry whose id doesn't match its key, or that isn't Ed25519, is dropped.
 * `extra` adds keys (base64 SPKI) for tests; the caller decides when that is allowed.
 */
export function trustedKeys(extra: string[] = [], table: Readonly<Record<string, string>> = CATALOG_PUBLIC_KEYS): Map<string, KeyObject> {
  const keys = new Map<string, KeyObject>();
  const add = (spki: string, id?: string) => {
    const key = parsePublicKey(spki);
    const keyId = keyIdOf(spki);
    if (key && (id === undefined || id === keyId)) keys.set(keyId, key);
  };
  for (const [id, spki] of Object.entries(table)) add(spki, id);
  for (const spki of extra) add(spki);
  return keys;
}
