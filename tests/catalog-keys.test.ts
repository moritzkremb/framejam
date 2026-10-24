import { describe, expect, it } from "vitest";
import { ACTIVE_KEY_ID, CATALOG_PUBLIC_KEYS, keyIdOf, parsePublicKey } from "../src/server/catalog-keys.ts";

describe("built-in key table", () => {
  it("only holds Ed25519 public keys filed under their own key id", () => {
    for (const [id, spki] of Object.entries(CATALOG_PUBLIC_KEYS)) {
      expect(parsePublicKey(spki), id).not.toBeNull();
      expect(keyIdOf(spki), id).toBe(id);
    }
  });

  // `npm publish` runs this through `prepublishOnly` (FRAMEJAM_RELEASE_CHECK=1). A release with an empty or
  // incomplete table would reject every catalog, or leave no spare key. See docs/catalog.md, steps A and B.
  it.skipIf(!process.env.FRAMEJAM_RELEASE_CHECK)("holds the active key and the spare key, for a release", () => {
    expect(Object.keys(CATALOG_PUBLIC_KEYS)).toHaveLength(2);
    expect(Object.keys(CATALOG_PUBLIC_KEYS)).toContain(ACTIVE_KEY_ID);
  });
});
