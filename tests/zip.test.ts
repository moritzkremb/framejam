import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StoreError } from "../src/core/store.ts";
import { checkZip, listZip, zipFolder } from "../src/server/zip.ts";

let tmp: string;
let project: string;

const put = (rel: string, content: string | Buffer = rel) => {
  const full = path.join(project, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
};

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "framejam-zip-"));
  project = path.join(tmp, "teaser");
  fs.mkdirSync(project);
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const names = (file: string) => listZip(file).map((e) => e.name).sort();

describe("zipFolder", () => {
  it("packs the project and leaves out dependencies, build output, renders and secrets", async () => {
    put("index.html", "<h1>hi</h1>");
    put("src/scene.ts", "export const a = 1;");
    put("src/build/keep.ts", "// code, not output");
    put("assets/logo.svg", "<svg/>");
    put("node_modules/left-pad/index.js", "x");
    put("nested/node_modules/y/index.js", "x");
    put(".git/HEAD", "ref");
    put("dist/bundle.js", "x");
    put("renders/final.mp4", "video");
    put(".env", "TOKEN=secret");
    put(".env.local", "TOKEN=secret");
    put("deploy.pem", "key");
    put("debug.log", "log");
    put(".DS_Store", "x");

    const out = path.join(tmp, "out", "source.zip");
    const packed = await zipFolder(project, out);

    expect(names(out)).toEqual(["assets/logo.svg", "index.html", "src/build/keep.ts", "src/scene.ts"]);
    expect(packed.files).toBe(4);
    expect(packed.bytes).toBe(fs.statSync(out).size);
    expect(packed.left).toEqual(expect.arrayContaining(["node_modules/", "dist/", "renders/", "secret files (.env, keys)"]));
    expect(fs.readdirSync(path.dirname(out))).toEqual(["source.zip"]);
  });

  it("makes a zip other tools can read, with the same bytes back", async () => {
    const big = Buffer.from("frame ".repeat(50_000));
    put("scene.js", big);
    put("empty.txt", "");
    put("deep/er/file.json", JSON.stringify({ ok: true }));
    const out = path.join(tmp, "source.zip");
    await zipFolder(project, out);

    const unzip = (() => {
      try {
        execFileSync("unzip", ["-v"], { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    })();
    if (unzip) {
      execFileSync("unzip", ["-tq", out], { stdio: "ignore" });
      const into = path.join(tmp, "extracted");
      execFileSync("unzip", ["-q", out, "-d", into]);
      expect(fs.readFileSync(path.join(into, "scene.js")).equals(big)).toBe(true);
      expect(fs.readFileSync(path.join(into, "empty.txt"), "utf8")).toBe("");
      expect(JSON.parse(fs.readFileSync(path.join(into, "deep/er/file.json"), "utf8"))).toEqual({ ok: true });
    }
    expect(listZip(out).find((e) => e.name === "scene.js")?.size).toBe(big.length);
    expect(fs.statSync(out).size).toBeLessThan(big.length);
  });

  it("skips files it was told are the render itself", async () => {
    put("main.ts", "x");
    put("out.mp4", "video");
    const out = path.join(tmp, "source.zip");
    await zipFolder(project, out, { skip: [path.join(project, "out.mp4")] });
    expect(names(out)).toEqual(["main.ts"]);
  });

  it("follows the folder's git ignore rules", async () => {
    try {
      execFileSync("git", ["init", "-q"], { cwd: project });
    } catch {
      return;
    }
    put(".gitignore", "cache-data/\n*.tmp\n");
    put("main.ts", "x");
    put("cache-data/blob.bin", "x");
    put("scratch.tmp", "x");
    const out = path.join(tmp, "source.zip");
    await zipFolder(project, out);
    expect(names(out)).toEqual([".gitignore", "main.ts"]);
  });

  it("says so when nothing is left to pack", async () => {
    put("node_modules/a/index.js", "x");
    put(".env", "x");
    await expect(zipFolder(project, path.join(tmp, "source.zip"))).rejects.toThrow(/Nothing to pack/);
  });

  it("refuses a project over the cap, naming the biggest files, and leaves nothing behind", async () => {
    put("a.bin", Buffer.alloc(40_000, 7));
    put("b.bin", randomBytes(40_000));
    const out = path.join(tmp, "out", "source.zip");
    const err = await zipFolder(project, out, { maxBytes: 20_000 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StoreError);
    expect((err as Error).message).toMatch(/cap for a source zip/);
    expect((err as Error).message).toMatch(/b\.bin/);
    expect(fs.existsSync(out)).toBe(false);
    expect(fs.existsSync(path.dirname(out)) ? fs.readdirSync(path.dirname(out)) : []).toEqual([]);
  });
});

describe("checkZip", () => {
  /** A stored (uncompressed) zip with the given entry names, enough for the central directory reader. */
  function handMade(file: string, entries: string[]) {
    const parts: Buffer[] = [];
    const central: Buffer[] = [];
    let offset = 0;
    for (const name of entries) {
      const nameBuf = Buffer.from(name);
      const data = Buffer.from("x");
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt32LE(zlib.crc32(data), 14);
      local.writeUInt32LE(1, 18);
      local.writeUInt32LE(1, 22);
      local.writeUInt16LE(nameBuf.length, 26);
      parts.push(local, nameBuf, data);
      const h = Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50, 0);
      h.writeUInt16LE(20, 4);
      h.writeUInt16LE(20, 6);
      h.writeUInt32LE(zlib.crc32(data), 16);
      h.writeUInt32LE(1, 20);
      h.writeUInt32LE(1, 24);
      h.writeUInt16LE(nameBuf.length, 28);
      h.writeUInt32LE(offset, 42);
      central.push(h, nameBuf);
      offset += 30 + nameBuf.length + 1;
    }
    const dir = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(dir.length, 12);
    end.writeUInt32LE(offset, 16);
    fs.writeFileSync(file, Buffer.concat([...parts, dir, end]));
  }

  it("accepts a clean zip and reports what's in it", () => {
    const file = path.join(tmp, "ok.zip");
    handMade(file, ["index.html", "src/a.ts", "src/"]);
    expect(checkZip(file)).toEqual({ files: 2, bytes: fs.statSync(file).size });
  });

  it("accepts the zip FrameJam itself makes", async () => {
    put("a.ts", "x");
    const file = path.join(tmp, "own.zip");
    await zipFolder(project, file);
    expect(checkZip(file).files).toBe(1);
  });

  it("rejects dependencies, version control and secrets", () => {
    for (const bad of ["node_modules/x/index.js", "app/.git/config", ".env", "config/.env.production", "keys/id_rsa", "cert.pem"]) {
      const file = path.join(tmp, "bad.zip");
      handMade(file, ["ok.ts", bad]);
      expect(() => checkZip(file), bad).toThrow(/Leave out/);
    }
  });

  it("rejects a zip that is too big, empty, or not a zip", () => {
    const file = path.join(tmp, "ok.zip");
    handMade(file, ["a.ts"]);
    expect(() => checkZip(file, 10)).toThrow(/cap for a source zip/);
    handMade(file, ["only-a-folder/"]);
    expect(() => checkZip(file)).toThrow(/no files/);
    const junk = path.join(tmp, "junk.zip");
    fs.writeFileSync(junk, "this is not a zip");
    expect(() => checkZip(junk)).toThrow(/isn't a readable zip/);
  });
});
