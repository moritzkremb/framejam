import { execFileSync } from "node:child_process";
import { createPrivateKey, createPublicKey } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CatalogError, verifyIndex } from "../src/server/catalog-format.ts";
import { keyIdOf } from "../src/server/catalog-keys.ts";
import { packageRoot } from "../src/server/paths.ts";
import {
  KEYCHAIN_SERVICE,
  buildCatalog,
  checkDrift,
  ephemeralSigner,
  folderSource,
  httpSource,
  keychainSigner,
  playbookFiles,
  readWithdrawn,
  syncSiteCopies,
  verifyCatalog,
  writeCatalog,
  type Signer,
} from "../scripts/lib/catalog-build.ts";
import { generateCatalogKey } from "../scripts/lib/catalog-keygen.ts";
import { samplePlaybook, writePlaybook } from "./helpers.ts";
import { OTHER_TEST_KEY, TEST_KEY, signBytes } from "./catalog-helpers.ts";

const temps: string[] = [];
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "framejam-catalog-build-"));
  temps.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const testSigner: Signer = { keyId: TEST_KEY.keyId, sign: (bytes) => signBytes(bytes) };
const trust = [TEST_KEY.publicKey];
const input = (playbooksDir: string, extra = {}) => ({
  playbooksDir,
  keyId: TEST_KEY.keyId,
  sourceCommit: "a".repeat(40),
  generatedAt: "2026-11-02T17:00:00.000Z",
  ...extra,
});

function fixturePlaybooks(ids = ["one", "two"]) {
  const dir = tmp();
  for (const id of ids) writePlaybook(dir, samplePlaybook(id, { minAppVersion: "0.6.0" }));
  return dir;
}

describe("the real playbooks", () => {
  const built = buildCatalog(input(path.join(packageRoot, "playbooks")));

  it("all pass validation and carry minAppVersion 0.6.0", () => {
    expect(built.index.items.length).toBeGreaterThanOrEqual(15);
    for (const item of built.index.items) {
      expect(item.minAppVersion, item.id).toBe("0.6.0");
      expect(item.files.some((f) => f.path === "playbook.json"), item.id).toBe(true);
    }
  });

  it("leave out preview videos and keep executable bits", () => {
    const files = built.index.items.flatMap((i) => i.files);
    expect(files.some((f) => f.path.endsWith("preview.mp4"))).toBe(false);
    expect(files.filter((f) => f.mode === 0o755).length).toBeGreaterThan(0);
    expect(files.every((f) => f.mode === 0o755 || f.mode === 0o644)).toBe(true);
  });

  it("build the same index twice", () => {
    expect(JSON.stringify(buildCatalog(input(path.join(packageRoot, "playbooks"))).index)).toBe(JSON.stringify(built.index));
  });
});

describe("collecting files", () => {
  it("skips previews, caches and OS litter, keeps dotfiles and nested files", () => {
    const dir = fixturePlaybooks(["one"]);
    const root = path.join(dir, "one");
    for (const rel of ["preview.mp4", "node_modules/x/index.js", "scripts/__pycache__/a.pyc", ".DS_Store", "scripts/a.pyc", "template/.gitignore", "scripts/run.sh"]) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), "x");
    }
    expect(playbookFiles(root)).toEqual(["SKILL.md", "playbook.json", "scripts/run.sh", "template/.gitignore"]);
  });

  it("refuses symlinks", () => {
    const dir = fixturePlaybooks(["one"]);
    fs.symlinkSync("/etc/hosts", path.join(dir, "one", "link"));
    expect(() => playbookFiles(path.join(dir, "one"))).toThrow(/not a plain file/);
  });

  it("normalises modes to 644 and 755", () => {
    const dir = fixturePlaybooks(["one"]);
    fs.writeFileSync(path.join(dir, "one", "a.sh"), "#!/bin/sh\n", { mode: 0o700 });
    fs.chmodSync(path.join(dir, "one", "a.sh"), 0o700);
    fs.chmodSync(path.join(dir, "one", "SKILL.md"), 0o600);
    const files = buildCatalog(input(dir)).index.items[0]!.files;
    expect(files.find((f) => f.path === "a.sh")!.mode).toBe(0o755);
    expect(files.find((f) => f.path === "SKILL.md")!.mode).toBe(0o644);
  });
});

describe("validation", () => {
  const messageFor = (patch: Record<string, unknown>, folder?: string) => {
    const dir = tmp();
    writePlaybook(dir, { ...samplePlaybook("one", { minAppVersion: "0.6.0" }), ...patch });
    if (folder) fs.renameSync(path.join(dir, "one"), path.join(dir, folder));
    try {
      buildCatalog(input(dir));
    } catch (e) {
      return (e as Error).message;
    }
    return "";
  };

  it("lists every problem at once", () => {
    const message = messageFor({ minAppVersion: undefined, version: "1.0", skill: "MISSING.md" });
    expect(message).toContain("minAppVersion is required");
    expect(message).toContain("version must look like 1.0.0");
    expect(message).toContain("MISSING.md is missing");
  });

  it("rejects an id that doesn't match its folder, and an invalid playbook.json", () => {
    expect(messageFor({}, "other")).toContain("doesn't match the folder name");
    expect(messageFor({ steps: [] })).toContain("steps needs at least one item");
  });

  it("rejects a withdrawn id that's still in playbooks/", () => {
    const dir = fixturePlaybooks(["one"]);
    expect(() => buildCatalog(input(dir, { withdrawn: [{ kind: "playbook", id: "one" }] }))).toThrow(/withdrawn but still/);
  });

  it("reads the withdrawn list", () => {
    const dir = tmp();
    const file = path.join(dir, "w.json");
    expect(readWithdrawn(file)).toEqual([]);
    fs.writeFileSync(file, JSON.stringify(["old", "older"]));
    expect(readWithdrawn(file)).toEqual([{ kind: "playbook", id: "old" }, { kind: "playbook", id: "older" }]);
    fs.writeFileSync(file, JSON.stringify([1]));
    expect(() => readWithdrawn(file)).toThrow();
  });
});

describe("writing and verifying", () => {
  function publish(ids = ["one", "two"], withdrawn: { kind: "playbook"; id: string }[] = []) {
    const playbooks = fixturePlaybooks(ids);
    const out = path.join(tmp(), "v1");
    const built = buildCatalog(input(playbooks, { withdrawn }));
    const { blobsWritten } = writeCatalog(out, built, testSigner);
    return { playbooks, out, built, blobsWritten };
  }

  it("writes an index, a signature and one blob per distinct file, and verifies its own output", async () => {
    const { out, built, blobsWritten } = publish();
    expect(fs.readdirSync(out).sort()).toEqual(["blobs", "index.json", "index.json.sig"]);
    expect(blobsWritten).toBe(fs.readdirSync(path.join(out, "blobs")).length);
    const result = await verifyCatalog(folderSource(out), trust);
    expect(result.index.items.map((i) => i.id)).toEqual(["one", "two"]);
    expect(result.files).toBe(blobsWritten);
    expect(built.index.items[0]!.files.length).toBeGreaterThan(0);
  });

  it("is rejected by an app that doesn't trust the key (the real table is empty here)", async () => {
    const { out } = publish();
    await expect(verifyCatalog(folderSource(out))).rejects.toMatchObject({ code: "unknown-key" });
  });

  it("is rejected when the index is edited, a blob is changed or a blob is missing", async () => {
    const edited = publish();
    const indexFile = path.join(edited.out, "index.json");
    fs.writeFileSync(indexFile, fs.readFileSync(indexFile, "utf8").replace("1.0.0", "9.9.9"));
    await expect(verifyCatalog(folderSource(edited.out), trust)).rejects.toMatchObject({ code: "bad-signature" });

    const changed = publish();
    const blob = path.join(changed.out, "blobs", fs.readdirSync(path.join(changed.out, "blobs"))[0]!);
    fs.appendFileSync(blob, "x");
    await expect(verifyCatalog(folderSource(changed.out), trust)).rejects.toMatchObject({ code: "bad-file" });

    const missing = publish();
    fs.rmSync(path.join(missing.out, "blobs", fs.readdirSync(path.join(missing.out, "blobs"))[0]!));
    await expect(verifyCatalog(folderSource(missing.out), trust)).rejects.toBeInstanceOf(CatalogError);
  });

  it("refuses to sign with a key other than the one the index names", () => {
    const built = buildCatalog(input(fixturePlaybooks()));
    expect(() => writeCatalog(path.join(tmp(), "v1"), built, { keyId: OTHER_TEST_KEY.keyId, sign: () => "" })).toThrow(/different key/);
  });

  it("keeps old blobs when a playbook changes, and writes only new ones", () => {
    const { playbooks, out, blobsWritten } = publish(["one"]);
    const before = fs.readdirSync(path.join(out, "blobs"));
    fs.appendFileSync(path.join(playbooks, "one", "SKILL.md"), "\nMore.\n");
    const again = writeCatalog(out, buildCatalog(input(playbooks, { generatedAt: "2026-11-03T00:00:00.000Z" })), testSigner);
    expect(again.blobsWritten).toBe(1);
    expect(fs.readdirSync(path.join(out, "blobs"))).toHaveLength(blobsWritten + 1);
    for (const sha of before) expect(fs.existsSync(path.join(out, "blobs", sha))).toBe(true);
  });

  it("publishes the withdrawn list", async () => {
    const { out } = publish(["one"], [{ kind: "playbook", id: "gone" }]);
    expect((await verifyCatalog(folderSource(out), trust)).index.withdrawn).toEqual([{ kind: "playbook", id: "gone" }]);
  });

  it("verifies over HTTP, as --verify-remote does", async () => {
    const { out } = publish();
    const server = http.createServer((req, res) => {
      const file = path.join(out, (req.url ?? "").replace(/^\/catalog\/v1\//, ""));
      if (fs.existsSync(file) && fs.statSync(file).isFile()) res.end(fs.readFileSync(file));
      else res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/catalog/v1`;
      expect((await verifyCatalog(httpSource(base), trust)).index.items).toHaveLength(2);
      fs.rmSync(path.join(out, "blobs", fs.readdirSync(path.join(out, "blobs"))[0]!));
      await expect(verifyCatalog(httpSource(base), trust)).rejects.toThrow(/HTTP 404/);
      await expect(verifyCatalog(httpSource(`${base}/nope`), trust)).rejects.toThrow(/HTTP 404/);
    } finally {
      server.close();
    }
  });
});

describe("drift", () => {
  function published() {
    const playbooks = fixturePlaybooks(["one", "two"]);
    const out = path.join(tmp(), "v1");
    writeCatalog(out, buildCatalog(input(playbooks)), testSigner);
    return { playbooks, out };
  }
  const drift = async (playbooks: string, out: string) => checkDrift(out, buildCatalog(input(playbooks)), trust);

  it("is none right after publishing, even when only the time changed", async () => {
    const { playbooks, out } = published();
    expect(await drift(playbooks, out)).toEqual({ ok: true });
    expect(await checkDrift(out, buildCatalog(input(playbooks, { generatedAt: "2027-01-01T00:00:00.000Z", sourceCommit: "b".repeat(40) })), trust)).toEqual({ ok: true });
  });

  it("reports a changed, added and removed playbook", async () => {
    const { playbooks, out } = published();
    fs.appendFileSync(path.join(playbooks, "one", "SKILL.md"), "changed");
    writePlaybook(playbooks, samplePlaybook("three", { minAppVersion: "0.6.0" }));
    fs.rmSync(path.join(playbooks, "two"), { recursive: true });
    const result = await drift(playbooks, out);
    expect(result).toMatchObject({ ok: false });
    const reasons = (result as { reasons: string[] }).reasons.join("\n");
    expect(reasons).toContain("one changed");
    expect(reasons).toContain("three isn't in the catalog");
    expect(reasons).toContain("two is in the catalog but no longer");
  });

  it("reports a missing catalog, a catalog that doesn't verify and a changed withdrawn list", async () => {
    const { playbooks, out } = published();
    expect(await checkDrift(path.join(tmp(), "none"), buildCatalog(input(playbooks)), trust)).toMatchObject({ ok: false });
    expect(await checkDrift(out, buildCatalog(input(playbooks)), [])).toMatchObject({ ok: false });
    const withdrawn = await checkDrift(out, buildCatalog(input(playbooks, { withdrawn: [{ kind: "playbook", id: "gone" }] })), trust);
    expect((withdrawn as { reasons: string[] }).reasons).toEqual(["the withdrawn list changed"]);
  });
});

describe("site copies", () => {
  it("rewrites playbook.json only where the website already has the folder", () => {
    const playbooks = fixturePlaybooks(["one", "two"]);
    const site = tmp();
    fs.mkdirSync(path.join(site, "one"));
    fs.writeFileSync(path.join(site, "one", "playbook.json"), "{}");
    const items = buildCatalog(input(playbooks)).index.items;

    expect(syncSiteCopies(playbooks, site, items, true)).toEqual(["one"]);
    expect(fs.readFileSync(path.join(site, "one", "playbook.json"), "utf8")).toBe("{}");

    expect(syncSiteCopies(playbooks, site, items)).toEqual(["one"]);
    expect(fs.readFileSync(path.join(site, "one", "playbook.json"))).toEqual(fs.readFileSync(path.join(playbooks, "one", "playbook.json")));
    expect(fs.existsSync(path.join(site, "two"))).toBe(false);
    expect(syncSiteCopies(playbooks, site, items)).toEqual([]);
  });
});

describe("Keychain signer", () => {
  const stored = (key = TEST_KEY) => key.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");

  it("reads the key with find-generic-password -w and signs in memory", () => {
    const calls: string[][] = [];
    const signer = keychainSigner(TEST_KEY.keyId, (command, args) => {
      calls.push([command, ...args]);
      return `${stored()}\n`;
    });
    const bytes = Buffer.from("index");
    const index = JSON.stringify({ keyId: TEST_KEY.keyId });
    expect(signer.sign(Buffer.from(index))).toBe(signBytes(Buffer.from(index)));
    expect(signer.sign(bytes)).toBe(signBytes(bytes));
    expect(calls[0]).toEqual(["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", TEST_KEY.keyId, "-w"]);
  });

  it("refuses a Keychain entry that holds a different key than its account says", () => {
    const signer = keychainSigner(TEST_KEY.keyId, () => stored(OTHER_TEST_KEY));
    expect(() => signer.sign(Buffer.from("x"))).toThrow(/different key/);
  });

  it("explains a denied or missing key without printing anything from the Keychain", () => {
    const denied = keychainSigner(TEST_KEY.keyId, () => {
      throw new Error(`secret ${stored()}`);
    });
    expect(() => denied.sign(Buffer.from("x"))).toThrow(/Couldn't read key/);
    try {
      denied.sign(Buffer.from("x"));
    } catch (e) {
      expect((e as Error).message).not.toContain(stored());
    }
    const garbage = keychainSigner(TEST_KEY.keyId, () => "not a key");
    expect(() => garbage.sign(Buffer.from("x"))).toThrow(/isn't an Ed25519 private key/);
  });
});

describe("key generation", () => {
  function generate(options: { spare?: boolean } = {}, findFails = false) {
    const inputs: { command: string; args: string[]; input: string }[] = [];
    const finds: string[][] = [];
    const result = generateCatalogKey(
      options,
      (command, args, stdin) => inputs.push({ command, args, input: stdin }),
      (command, args) => {
        finds.push([command, ...args]);
        if (findFails) throw new Error("not found");
        return "metadata";
      },
    );
    return { result, inputs, finds };
  }

  it("passes the private key to security over stdin, never in arguments", () => {
    const { result, inputs, finds } = generate();
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.args).toEqual(["-i"]);
    const line = inputs[0]!.input;
    expect(line).toContain(`add-generic-password -a ${result.keyId} -s ${KEYCHAIN_SERVICE}`);
    expect(line).toContain(`-T ""`);
    expect(line).toContain("(active)");
    expect(line).not.toContain(" -U");
    const secret = /-w (\S+)\n$/.exec(line)![1]!;
    expect(inputs[0]!.args.join(" ")).not.toContain(secret);
    expect(finds[0]).toEqual(["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", result.keyId]);
    expect(finds[0]).not.toContain("-w");

    const key = createPrivateKey({ key: Buffer.from(secret, "base64"), format: "der", type: "pkcs8" });
    const spki = createPublicKey(key).export({ format: "der", type: "spki" }).toString("base64");
    expect(spki).toBe(result.publicKey);
    expect(keyIdOf(spki)).toBe(result.keyId);
  });

  it("returns only the key id and the public key", () => {
    const { result, inputs } = generate({ spare: true });
    expect(Object.keys(result).sort()).toEqual(["keyId", "publicKey"]);
    expect(JSON.stringify(result)).not.toContain(/-w (\S+)\n$/.exec(inputs[0]!.input)![1]!);
    expect(inputs[0]!.input).toContain("(spare)");
  });

  it("makes a different key every time", () => {
    expect(generate().result.keyId).not.toBe(generate().result.keyId);
  });

  it("fails when the Keychain doesn't have the key afterwards", () => {
    expect(() => generate({}, true)).toThrow(/Nothing was saved/);
  });
});

describe("throwaway signer", () => {
  it("signs catalogs that verify only with its own public key", async () => {
    const signer = ephemeralSigner();
    const playbooks = fixturePlaybooks();
    const out = path.join(tmp(), "v1");
    writeCatalog(out, buildCatalog(input(playbooks, { keyId: signer.keyId })), signer);
    expect((await verifyCatalog(folderSource(out), [signer.publicKey])).index.keyId).toBe(signer.keyId);
    await expect(verifyCatalog(folderSource(out), trust)).rejects.toMatchObject({ code: "unknown-key" });
    expect(() => verifyIndex(fs.readFileSync(path.join(out, "index.json")), fs.readFileSync(path.join(out, "index.json.sig"), "utf8"))).toThrow(CatalogError);
  });
});

describe("catalog-only playbooks", () => {
  const playbooksDir = path.join(packageRoot, "playbooks");
  const manifest = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as { files: string[] };
  const excludedIds = (files: string[]) => files.flatMap((f) => (/^!playbooks\/([^*/]+)$/.exec(f) ? [f.slice("!playbooks/".length)] : []));
  const packed = (cwd: string): string[] => {
    const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return (JSON.parse(out) as { files: { path: string }[] }[])[0]!.files.map((f) => f.path);
  };

  it("are in the catalog and left out of the package, and every other playbook is packed", () => {
    const inCatalog = new Set(buildCatalog(input(playbooksDir)).index.items.map((i) => i.id));
    const excluded = excludedIds(manifest(packageRoot).files);
    for (const id of excluded) expect(inCatalog.has(id), `${id} is excluded from npm but not in the catalog`).toBe(true);
    const files = packed(packageRoot);
    for (const id of excluded) expect(files.filter((f) => f.startsWith(`playbooks/${id}/`)), id).toEqual([]);
    for (const id of inCatalog) {
      if (!excluded.includes(id)) expect(files, `${id} is neither bundled nor excluded`).toContain(`playbooks/${id}/playbook.json`);
    }
    expect(files.some((f) => f.endsWith("preview.mp4"))).toBe(false);
  });

  it("only lists playbook folders that exist", () => {
    for (const id of excludedIds(manifest(packageRoot).files)) expect(fs.existsSync(path.join(playbooksDir, id, "playbook.json")), id).toBe(true);
  });

  it("are left out by a '!playbooks/<id>' line and nothing else", () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "x", version: "1.0.0", files: ["playbooks", "!playbooks/*/preview.mp4", "!playbooks/hidden"] }));
    for (const id of ["hidden", "shown"]) {
      writePlaybook(dir + "/playbooks", samplePlaybook(id, { minAppVersion: "0.6.0" }), { preview: true });
    }
    const files = packed(dir);
    expect(files).toContain("playbooks/shown/playbook.json");
    expect(files.filter((f) => f.startsWith("playbooks/hidden/"))).toEqual([]);
    expect(files.some((f) => f.endsWith("preview.mp4"))).toBe(false);
    expect(excludedIds(manifest(dir).files)).toEqual(["hidden"]);
  });
});

describe("documentation", () => {
  const text = (file: string) => fs.readFileSync(path.join(packageRoot, file), "utf8");

  it("names every catalog setting where users and the directory reviewer look", () => {
    for (const name of ["FRAMEJAM_CATALOG_URL", "FRAMEJAM_NO_UPDATE_CHECK"]) {
      expect(text("README.md"), `README.md ${name}`).toContain(name);
      expect(text("plugin/README.md"), `plugin/README.md ${name}`).toContain(name);
    }
    for (const name of ["FRAMEJAM_CATALOG_URL", "FRAMEJAM_NO_UPDATE_CHECK", "FRAMEJAM_CATALOG_PUBLIC_KEY"]) expect(text("docs/catalog.md")).toContain(name);
    expect(text("plugin/README.md")).toContain("framejam.ai/catalog/v1");
  });

  it("walks through the one-time steps with the commands that exist", () => {
    const guide = text("docs/catalog.md");
    const scripts = JSON.parse(text("package.json")).scripts as Record<string, string>;
    for (const command of ["npm run catalog:keygen", "npm run catalog", "--check", "--verify-remote", "--test-key"]) expect(guide).toContain(command);
    expect(scripts.catalog).toBeTruthy();
    expect(scripts["catalog:keygen"]).toBeTruthy();
    expect(text("AGENTS.md")).toContain("docs/catalog.md");
  });
});
