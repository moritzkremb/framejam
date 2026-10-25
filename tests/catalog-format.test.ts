import { describe, expect, it } from "vitest";
import { validatePlaybook } from "../src/core/playbooks.ts";
import {
  CatalogError,
  checkFileBytes,
  isCompatible,
  isSafeRelativePath,
  parseIndex,
  sha256Hex,
  verifyIndex,
} from "../src/server/catalog-format.ts";
import { keyIdOf, parsePublicKey, trustedKeys } from "../src/server/catalog-keys.ts";
import { samplePlaybook } from "./helpers.ts";
import { OTHER_TEST_KEY, TEST_KEY, makeCatalog, signBytes } from "./catalog-helpers.ts";

const trust = { extraKeys: [TEST_KEY.publicKey] };

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof CatalogError ? e.code : `other: ${String(e)}`;
  }
  return "none";
}

describe("signature", () => {
  it("accepts an index signed with a trusted key", () => {
    const c = makeCatalog([{ id: "one" }]);
    const index = verifyIndex(c.indexBytes, c.signature, trust);
    expect(index.items.map((i) => i.id)).toEqual(["one"]);
    expect(index.keyId).toBe(TEST_KEY.keyId);
  });

  it("rejects an index when one byte changed after signing", () => {
    const c = makeCatalog([{ id: "one" }]);
    const tampered = Buffer.from(c.indexBytes.toString("utf8").replace("one", "two"));
    expect(codeOf(() => verifyIndex(tampered, c.signature, trust))).toBe("bad-signature");
  });

  it("rejects a signature made with a different key that the index names", () => {
    const c = makeCatalog([{ id: "one" }]);
    const forged = signBytes(c.indexBytes, OTHER_TEST_KEY.privateKey);
    expect(codeOf(() => verifyIndex(c.indexBytes, forged, { extraKeys: [TEST_KEY.publicKey, OTHER_TEST_KEY.publicKey] }))).toBe("bad-signature");
  });

  it("rejects a keyId the app doesn't trust, even with a valid signature", () => {
    const c = makeCatalog([{ id: "one" }], { key: OTHER_TEST_KEY });
    expect(codeOf(() => verifyIndex(c.indexBytes, c.signature, trust))).toBe("unknown-key");
  });

  it("rejects everything when no key is trusted", () => {
    const c = makeCatalog([{ id: "one" }]);
    expect(codeOf(() => verifyIndex(c.indexBytes, c.signature, { keys: new Map() }))).toBe("unknown-key");
    expect(codeOf(() => verifyIndex(c.indexBytes, c.signature))).toBe("unknown-key");
  });

  it("rejects a malformed or missing signature", () => {
    const c = makeCatalog([{ id: "one" }]);
    for (const sig of ["", "not base64!", Buffer.alloc(10).toString("base64"), `${c.signature}AA`]) {
      expect(codeOf(() => verifyIndex(c.indexBytes, sig, trust))).toBe("bad-signature");
    }
  });

  it("accepts a signature with a trailing newline, as the build script writes it", () => {
    const c = makeCatalog([{ id: "one" }]);
    expect(() => verifyIndex(c.indexBytes, `${c.signature}\n`, trust)).not.toThrow();
  });

  it("rejects an index that isn't JSON before looking for a key", () => {
    expect(codeOf(() => verifyIndex(Buffer.from("nope"), "x", trust))).toBe("bad-index");
  });
});

describe("key table", () => {
  it("derives the key id from the public key", () => {
    expect(TEST_KEY.keyId).toMatch(/^[0-9a-f]{8}$/);
    expect(keyIdOf(TEST_KEY.publicKey)).toBe(TEST_KEY.keyId);
    expect(TEST_KEY.keyId).not.toBe(OTHER_TEST_KEY.keyId);
  });

  it("drops table entries whose id doesn't match the key, and keys that aren't Ed25519", () => {
    const keys = trustedKeys([], {
      [TEST_KEY.keyId]: TEST_KEY.publicKey,
      "deadbeef": OTHER_TEST_KEY.publicKey,
      "00000000": "bm90IGEga2V5",
    });
    expect([...keys.keys()]).toEqual([TEST_KEY.keyId]);
    expect(parsePublicKey("bm90IGEga2V5")).toBeNull();
  });
});

describe("file checks", () => {
  const bytes = Buffer.from("print('hi')\n");
  const file = { path: "scripts/a.py", sha256: sha256Hex(bytes), size: bytes.length, mode: 0o755 };

  it("accepts the exact bytes", () => {
    expect(() => checkFileBytes(file, bytes)).not.toThrow();
  });

  it("rejects a hash mismatch of the same size", () => {
    expect(codeOf(() => checkFileBytes(file, Buffer.from("print('ho')\n")))).toBe("bad-file");
  });

  it("rejects a size mismatch", () => {
    expect(codeOf(() => checkFileBytes(file, Buffer.from("print('hi')\n\n")))).toBe("bad-file");
    expect(codeOf(() => checkFileBytes(file, Buffer.alloc(0)))).toBe("bad-file");
  });
});

describe("paths", () => {
  it("accepts plain relative paths", () => {
    for (const p of ["playbook.json", "scripts/a.py", "template/assets/music.mp3", "references/a b.md"]) expect(isSafeRelativePath(p)).toBe(true);
  });

  it("rejects traversal, absolute paths and odd characters", () => {
    for (const p of ["", "../x", "a/../x", "a/./x", "/etc/passwd", "a//b", "a/", "a\\b", "C:/x", "a\u0000b", "a\nb", "x".repeat(201), 5, null]) {
      expect(isSafeRelativePath(p)).toBe(false);
    }
  });

  it("rejects an index that lists an unsafe path, even when signed", () => {
    const c = makeCatalog([{ id: "one", files: { "../escape.sh": "echo no" } }]);
    expect(codeOf(() => verifyIndex(c.indexBytes, c.signature, trust))).toBe("bad-index");
  });

  it("rejects a duplicate path and a missing playbook.json", () => {
    const base = makeCatalog([{ id: "one" }]).index;
    const dup = { ...base, items: [{ ...base.items[0]!, files: [...base.items[0]!.files, base.items[0]!.files[0]!] }] };
    expect(codeOf(() => parseIndex(Buffer.from(JSON.stringify(dup))))).toBe("bad-index");
    const none = { ...base, items: [{ ...base.items[0]!, files: [{ ...base.items[0]!.files[0]!, path: "other.json" }] }] };
    expect(codeOf(() => parseIndex(Buffer.from(JSON.stringify(none))))).toBe("bad-index");
  });
});

describe("index shape", () => {
  const base = () => makeCatalog([{ id: "one", files: { "scripts/run.sh": { content: "#!/bin/sh\n", mode: 0o755 } } }]);

  it("keeps modes and sizes", () => {
    const c = base();
    const item = parseIndex(c.indexBytes).items[0]!;
    expect(item.files.find((f) => f.path === "scripts/run.sh")).toMatchObject({ mode: 0o755, size: 10 });
  });

  it("ignores items of unknown kinds and withdrawn entries of unknown kinds", () => {
    const c = makeCatalog([{ id: "one" }]);
    const raw = JSON.parse(c.indexBytes.toString("utf8"));
    raw.items.push({ kind: "future-kind", id: "Not Valid!", whatever: true });
    raw.withdrawn = [{ kind: "future-kind", id: "x" }, { kind: "playbook", id: "old" }];
    const index = parseIndex(Buffer.from(JSON.stringify(raw)));
    expect(index.items.map((i) => i.id)).toEqual(["one"]);
    expect(index.withdrawn).toEqual([{ kind: "playbook", id: "old" }]);
  });

  it("ignores a schema newer than the app, with its own error code", () => {
    const c = makeCatalog([{ id: "one" }], { overrides: { schema: 2 } });
    expect(codeOf(() => verifyIndex(c.indexBytes, c.signature, trust))).toBe("schema-too-new");
  });

  it("rejects invalid fields", () => {
    for (const overrides of [{ schema: 0 }, { schema: "1" }, { keyId: "xyz" }, { generatedAt: "yesterday" }, { items: "no" }, { sourceCommit: 5 }]) {
      const c = makeCatalog([{ id: "one" }], { overrides });
      expect(codeOf(() => parseIndex(c.indexBytes)), JSON.stringify(overrides)).toBe("bad-index");
    }
    for (const item of [{ id: "Bad Id" }, { id: "one", version: "1.0" }, { id: "one", minAppVersion: "latest" }]) {
      const c = makeCatalog([item]);
      expect(codeOf(() => parseIndex(c.indexBytes)), JSON.stringify(item)).toBe("bad-index");
    }
  });

  it("rejects a listed id twice", () => {
    const c = makeCatalog([{ id: "one" }, { id: "one", version: "1.1.0" }]);
    expect(codeOf(() => parseIndex(c.indexBytes))).toBe("bad-index");
  });

  it("rejects bad sizes, hashes and modes", () => {
    const raw = JSON.parse(base().indexBytes.toString("utf8"));
    for (const patch of [{ size: -1 }, { size: 1.5 }, { size: 26 * 1024 * 1024 }, { sha256: "ABC" }, { mode: 0o7777 }, { mode: -1 }]) {
      const copy = structuredClone(raw);
      Object.assign(copy.items[0].files[0], patch);
      expect(codeOf(() => parseIndex(Buffer.from(JSON.stringify(copy)))), JSON.stringify(patch)).toBe("bad-index");
    }
  });

  it("rejects an oversized index", () => {
    expect(codeOf(() => parseIndex(Buffer.alloc(3 * 1024 * 1024, " ")))).toBe("bad-index");
  });
});

describe("minAppVersion", () => {
  it("allows an app at or above it", () => {
    expect(isCompatible({ minAppVersion: "0.6.0" }, "0.6.0")).toBe(true);
    expect(isCompatible({ minAppVersion: "0.6.0" }, "0.6.1")).toBe(true);
    expect(isCompatible({ minAppVersion: "0.6.0" }, "1.0.0")).toBe(true);
    expect(isCompatible({ minAppVersion: "0.6.0" }, "0.10.0")).toBe(true);
  });

  it("refuses an older app", () => {
    expect(isCompatible({ minAppVersion: "0.6.0" }, "0.5.9")).toBe(false);
    expect(isCompatible({ minAppVersion: "0.6.0" }, "0.5.0")).toBe(false);
    expect(isCompatible({ minAppVersion: "1.2.0" }, "1.1.9")).toBe(false);
  });

  it("is checked by validatePlaybook when present, and optional", () => {
    const base = samplePlaybook("one");
    expect(validatePlaybook(base)).toEqual([]);
    expect(validatePlaybook({ ...base, minAppVersion: "0.6.0" })).toEqual([]);
    for (const bad of ["0.6", "v0.6.0", "latest", "", "0.6.0-beta"]) {
      expect(validatePlaybook({ ...base, minAppVersion: bad })).toEqual(["minAppVersion must look like 0.6.0"]);
    }
    expect(validatePlaybook({ ...base, minAppVersion: 6 as unknown as string })).toEqual(["minAppVersion must look like 0.6.0"]);
  });
});
