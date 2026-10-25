import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogClient, RETIRE_AFTER_MS, catalogConfig, itemDir, readSnapshot, startCatalog } from "../src/server/catalog.ts";
import type { CatalogItem } from "../src/server/catalog-format.ts";
import { FAKE_URL, OTHER_TEST_KEY, TEST_KEY, fakeServer, makeCatalog, type TestItem } from "./catalog-helpers.ts";

const temps: string[] = [];
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "framejam-catalog-client-"));
  temps.push(dir);
  return dir;
};
afterEach(() => {
  vi.useRealTimers();
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const DAY = 24 * 60 * 60 * 1000;
const APP = "0.6.0";

const reel: TestItem = {
  id: "reel",
  version: "1.0.0",
  files: { "SKILL.md": "# Reel\n", "scripts/run.sh": { content: "#!/bin/sh\necho hi\n", mode: 0o755 }, "template/a.txt": "same\n", "template/b.txt": "same\n" },
};
const clip: TestItem = { id: "clip", version: "2.0.0", files: { "SKILL.md": "# Clip\n" } };

function setup(items: TestItem[] = [reel, clip], options: { bundled?: Record<string, Record<string, string>>; appVersion?: string; now?: () => number } = {}) {
  const root = tmp();
  const server = fakeServer(makeCatalog(items));
  let bundledDir: string | undefined;
  if (options.bundled) {
    bundledDir = tmp();
    for (const [id, files] of Object.entries(options.bundled)) {
      for (const [rel, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(bundledDir, id, rel)), { recursive: true });
        fs.writeFileSync(path.join(bundledDir, id, rel), content);
      }
    }
  }
  const logs: string[] = [];
  const make = (extra: Partial<ConstructorParameters<typeof CatalogClient>[0]> = {}) =>
    new CatalogClient({
      root,
      url: FAKE_URL,
      appVersion: options.appVersion ?? APP,
      bundledDirs: bundledDir ? { playbook: bundledDir } : undefined,
      extraKeys: [TEST_KEY.publicKey],
      fetch: server.fetch,
      now: options.now,
      log: (m) => logs.push(m),
      ...extra,
    });
  const snapshot = (appVersion = options.appVersion ?? APP) => readSnapshot(root, { appVersion, extraKeys: [TEST_KEY.publicKey] });
  return { root, server, client: make(), make, logs, snapshot, bundledDir };
}

const itemOf = (s: ReturnType<typeof setup>, id: string): CatalogItem => s.server.catalog.index.items.find((i) => i.id === id)!;
const blobRequests = (s: ReturnType<typeof setup>) => s.server.requests.filter((r) => r.startsWith("blobs/"));
const folders = (root: string) =>
  fs.existsSync(path.join(root, "items", "playbook"))
    ? fs.readdirSync(path.join(root, "items", "playbook")).flatMap((id) => fs.readdirSync(path.join(root, "items", "playbook", id)).map((v) => `${id}/${v}`))
    : [];

describe("off switches", () => {
  const cfg = (vars: Record<string, string>, installed: boolean) => catalogConfig((name) => vars[name], installed);

  it("is on for an installed copy with the default URL", () => {
    expect(cfg({}, true)).toMatchObject({ enabled: true, url: "https://www.framejam.ai/catalog/v1", extraKeys: [] });
  });

  it("FRAMEJAM_CATALOG_URL=off turns it off, in any case", () => {
    for (const value of ["off", "OFF", " off "]) expect(cfg({ CATALOG_URL: value }, true)).toMatchObject({ enabled: false, reason: "env-off" });
    expect(cfg({ CATALOG_URL: "off" }, false)).toMatchObject({ enabled: false, reason: "env-off" });
  });

  it("FRAMEJAM_NO_UPDATE_CHECK turns it off, even with a URL", () => {
    expect(cfg({ NO_UPDATE_CHECK: "1" }, true)).toMatchObject({ enabled: false, reason: "no-update-check" });
    expect(cfg({ NO_UPDATE_CHECK: "1", CATALOG_URL: "https://example.com/c" }, false)).toMatchObject({ enabled: false, reason: "no-update-check" });
  });

  it("is off in a source checkout unless a URL is set", () => {
    expect(cfg({}, false)).toMatchObject({ enabled: false, reason: "source-checkout" });
    expect(cfg({ CATALOG_URL: "http://localhost:9/catalog/v1/" }, false)).toMatchObject({ enabled: true, url: "http://localhost:9/catalog/v1" });
  });

  it("is off for a URL that isn't http or https", () => {
    for (const url of ["ftp://x/y", "file:///tmp/c", "not a url"]) expect(cfg({ CATALOG_URL: url }, true)).toMatchObject({ enabled: false, reason: "invalid-url" });
  });

  it("trusts FRAMEJAM_CATALOG_PUBLIC_KEY only in a source checkout", () => {
    expect(cfg({ CATALOG_URL: "https://x.test/c", CATALOG_PUBLIC_KEY: TEST_KEY.publicKey }, false).extraKeys).toEqual([TEST_KEY.publicKey]);
    expect(cfg({ CATALOG_PUBLIC_KEY: TEST_KEY.publicKey }, true).extraKeys).toEqual([]);
  });

  it("reads the real environment, including the FRAMECUT_ fallback", () => {
    const saved = { url: process.env.FRAMEJAM_CATALOG_URL, no: process.env.FRAMEJAM_NO_UPDATE_CHECK };
    try {
      delete process.env.FRAMEJAM_NO_UPDATE_CHECK;
      process.env.FRAMEJAM_CATALOG_URL = "off";
      expect(catalogConfig().enabled).toBe(false);
      delete process.env.FRAMEJAM_CATALOG_URL;
      process.env.FRAMEJAM_NO_UPDATE_CHECK = "1";
      expect(catalogConfig().enabled).toBe(false);
    } finally {
      for (const [key, value] of [["FRAMEJAM_CATALOG_URL", saved.url], ["FRAMEJAM_NO_UPDATE_CHECK", saved.no]] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("makes no request and writes nothing when off", async () => {
    const root = tmp();
    const server = fakeServer(makeCatalog([reel]));
    const original = globalThis.fetch;
    globalThis.fetch = server.fetch;
    try {
      expect(startCatalog(root, () => {}, { enabled: false, url: FAKE_URL, extraKeys: [] })).toBeUndefined();
      await new Promise((r) => setTimeout(r, 20));
    } finally {
      globalThis.fetch = original;
    }
    expect(server.requests).toEqual([]);
    expect(fs.readdirSync(root)).toEqual([]);
  });
});

describe("refresh", () => {
  it("downloads, verifies and stores every item, with modes", async () => {
    const s = setup();
    const result = await s.client.refresh();
    expect(result).toMatchObject({ ok: true, changed: true, downloaded: 6, seeded: 0 });
    const snapshot = s.snapshot()!;
    expect([...snapshot.items.playbook.keys()].sort()).toEqual(["clip", "reel"]);
    const dir = snapshot.items.playbook.get("reel")!.dir;
    expect(dir).toBe(itemDir(s.root, itemOf(s, "reel")));
    expect(fs.readFileSync(path.join(dir, "SKILL.md"), "utf8")).toBe("# Reel\n");
    expect(fs.statSync(path.join(dir, "scripts/run.sh")).mode & 0o777).toBe(0o755);
    expect(fs.statSync(path.join(dir, "SKILL.md")).mode & 0o777).toBe(0o644);
    expect(fs.readFileSync(path.join(dir, "template/b.txt"), "utf8")).toBe("same\n");
    expect(fs.existsSync(path.join(s.root, "state.json"))).toBe(true);
    expect(s.client.status()).toMatchObject({ generatedAt: s.server.catalog.index.generatedAt, lastError: undefined });
  });

  it("asks for each distinct blob once, and nothing for an unchanged catalog", async () => {
    const s = setup();
    await s.client.refresh();
    expect(new Set(blobRequests(s)).size).toBe(blobRequests(s).length);
    s.server.requests.length = 0;
    expect(await s.client.refresh()).toMatchObject({ ok: true, changed: false, downloaded: 0 });
    expect(s.server.requests).toEqual(["index.json", "index.json.sig"]);
  });

  it("copies unchanged files from the bundled copy by path and hash, and downloads the rest", async () => {
    const s = setup([reel], { bundled: { reel: { "SKILL.md": "# Reel\n", "scripts/run.sh": "#!/bin/sh\necho CHANGED\n", "template/a.txt": "same\n" } } });
    const result = await s.client.refresh();
    expect(result).toMatchObject({ ok: true, seeded: 2, downloaded: 3 });
    expect(blobRequests(s)).toHaveLength(3);
    const dir = s.snapshot()!.items.playbook.get("reel")!.dir;
    expect(fs.readFileSync(path.join(dir, "scripts/run.sh"), "utf8")).toBe("#!/bin/sh\necho hi\n");
    expect(fs.statSync(path.join(dir, "scripts/run.sh")).mode & 0o777).toBe(0o755);
  });

  it("seeds a new version from the previous one and keeps the old folder", async () => {
    const s = setup([reel]);
    await s.client.refresh();
    const v1 = [...s.snapshot()!.items.playbook.values()][0]!.dir;
    s.server.catalog = makeCatalog([{ ...reel, version: "1.1.0", files: { ...reel.files, "SKILL.md": "# Reel v2\n" } }], { generatedAt: "2026-11-03T00:00:00.000Z" });
    s.server.requests.length = 0;
    expect(await s.client.refresh()).toMatchObject({ ok: true, changed: true, downloaded: 2, seeded: 3 });
    expect(blobRequests(s)).toHaveLength(2);
    const v2 = s.snapshot()!.items.playbook.get("reel")!;
    expect(v2.item.version).toBe("1.1.0");
    expect(v2.dir).not.toBe(v1);
    expect(fs.existsSync(path.join(v1, "playbook.json"))).toBe(true);
  });

  it("shares one run between concurrent calls", async () => {
    const s = setup([clip]);
    await Promise.all([s.client.refresh(), s.client.refresh()]);
    expect(s.server.requests.filter((r) => r === "index.json")).toHaveLength(1);
  });

  it("works when two FrameJam processes refresh into the same folder at once", async () => {
    const s = setup();
    const results = await Promise.all([s.client.refresh(), s.make().refresh()]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(folders(s.root).sort()).toHaveLength(2);
    expect(fs.readdirSync(path.join(s.root, "items", "playbook", "reel")).every((n) => !n.startsWith(".tmp-"))).toBe(true);
    expect(s.snapshot()!.items.playbook.size).toBe(2);
  });

  it("works over real HTTP", async () => {
    const catalog = makeCatalog([reel]);
    const server = http.createServer((req, res) => {
      const rel = (req.url ?? "").replace(/^\/v1\//, "");
      const body = rel === "index.json" ? catalog.indexBytes : rel === "index.json.sig" ? Buffer.from(catalog.signature) : catalog.blobs.get(rel.replace("blobs/", ""));
      if (body) res.end(body);
      else res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const root = tmp();
      const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
      const client = new CatalogClient({ root, url, appVersion: APP, extraKeys: [TEST_KEY.publicKey] });
      expect(await client.refresh()).toMatchObject({ ok: true, downloaded: 4 });
      expect(readSnapshot(root, { appVersion: APP, extraKeys: [TEST_KEY.publicKey] })!.items.playbook.has("reel")).toBe(true);
    } finally {
      server.close();
    }
  });
});

describe("verification", () => {
  it("refuses an index whose signature doesn't match, and stores nothing", async () => {
    const s = setup();
    s.server.respond = (rel, body) => (rel === "index.json" ? Buffer.from(body.toString("utf8").replace("1.0.0", "9.9.9")) : undefined);
    expect(await s.client.refresh()).toMatchObject({ ok: false, code: "bad-signature" });
    expect(fs.existsSync(path.join(s.root, "state.json"))).toBe(false);
    expect(folders(s.root)).toEqual([]);
    expect(blobRequests(s)).toEqual([]);
  });

  it("refuses an index signed by a key the app doesn't trust", async () => {
    const s = setup();
    s.server.catalog = makeCatalog([reel], { key: OTHER_TEST_KEY });
    expect(await s.client.refresh()).toMatchObject({ ok: false, code: "unknown-key" });
    expect(blobRequests(s)).toEqual([]);
  });

  it("trusts nothing when the app has no matching key (the real table is empty in this build)", async () => {
    const s = setup();
    expect(await s.make({ extraKeys: [] }).refresh()).toMatchObject({ ok: false, code: "unknown-key" });
    expect(folders(s.root)).toEqual([]);
  });

  it("refuses a blob that doesn't match its hash, leaves no folder and keeps the last good state", async () => {
    const s = setup([clip]);
    await s.client.refresh();
    const before = fs.readFileSync(path.join(s.root, "state.json"), "utf8");
    s.server.catalog = makeCatalog([reel, clip], { generatedAt: "2026-11-03T00:00:00.000Z" });
    const skill = itemOf(s, "reel").files.find((f) => f.path === "scripts/run.sh")!;
    s.server.respond = (rel) => (rel === `blobs/${skill.sha256}` ? Buffer.from("#!/bin/sh\nrm -rf ~\n".padEnd(skill.size, " ")) : undefined);
    expect(await s.client.refresh()).toMatchObject({ ok: false, code: "bad-file" });
    expect(folders(s.root)).toEqual([`clip/${path.basename(itemDir(s.root, itemOf(s, "clip")))}`]);
    expect(fs.readFileSync(path.join(s.root, "state.json"), "utf8")).toBe(before);
    expect(s.snapshot()!.items.playbook.has("reel")).toBe(false);
    expect(s.snapshot()!.items.playbook.has("clip")).toBe(true);
  });

  it("refuses a blob of the wrong size, and one that is far too large", async () => {
    const s = setup([clip]);
    s.server.respond = (rel) => (rel.startsWith("blobs/") ? Buffer.alloc(10_000, "x") : undefined);
    expect(await s.client.refresh()).toMatchObject({ ok: false, code: "bad-file" });
    expect(folders(s.root)).toEqual([]);
  });

  it("refuses a response that declares a huge size before reading it", async () => {
    const s = setup([clip]);
    s.server.respond = (rel, body) => (rel === "index.json" ? new Response(new Uint8Array(body), { headers: { "content-length": String(50 * 1024 * 1024) } }) : undefined);
    expect(await s.client.refresh()).toMatchObject({ ok: false, code: "bad-file" });
  });

  it("ignores an index with a newer schema and keeps what it has", async () => {
    const s = setup([clip]);
    await s.client.refresh();
    s.server.catalog = makeCatalog([clip], { overrides: { schema: 2 }, generatedAt: "2026-11-03T00:00:00.000Z" });
    expect(await s.client.refresh()).toMatchObject({ ok: false, code: "schema-too-new" });
    expect(s.snapshot()!.generatedAt).toBe("2026-11-02T17:00:00.000Z");
  });

  it("ignores items of unknown kinds", async () => {
    const s = setup([clip]);
    const raw = JSON.parse(s.server.catalog.indexBytes.toString("utf8"));
    raw.items.push({ kind: "future-kind", id: "neon", whatever: true });
    const bytes = Buffer.from(JSON.stringify(raw));
    s.server.catalog = { ...s.server.catalog, indexBytes: bytes, signature: (await import("./catalog-helpers.ts")).signBytes(bytes) };
    expect(await s.client.refresh()).toMatchObject({ ok: true });
    expect([...s.snapshot()!.items.playbook.keys()]).toEqual(["clip"]);
  });

  it("refuses an older index than the one it has (rollback protection)", async () => {
    const s = setup([clip]);
    s.server.catalog = makeCatalog([clip], { generatedAt: "2026-12-01T00:00:00.000Z" });
    await s.client.refresh();
    s.server.catalog = makeCatalog([clip, reel], { generatedAt: "2026-11-01T00:00:00.000Z" });
    expect(await s.client.refresh()).toMatchObject({ ok: false, code: "bad-index" });
    expect(s.snapshot()!.generatedAt).toBe("2026-12-01T00:00:00.000Z");
    expect(s.snapshot()!.items.playbook.has("reel")).toBe(false);
  });

  it("verifies the saved index again on every read", async () => {
    const s = setup([clip]);
    await s.client.refresh();
    const file = path.join(s.root, "state.json");
    const state = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(s.snapshot()).toBeDefined();

    fs.writeFileSync(file, JSON.stringify({ ...state, indexText: state.indexText.replace("2.0.0", "2.0.1") }));
    expect(s.snapshot()).toBeUndefined();

    fs.writeFileSync(file, JSON.stringify(state));
    expect(s.snapshot()).toBeDefined();
    expect(readSnapshot(s.root, { appVersion: APP })).toBeUndefined();
    fs.writeFileSync(file, "not json");
    expect(s.snapshot()).toBeUndefined();
  });
});

describe("minAppVersion", () => {
  it("doesn't download an item that needs a newer app, and downloads the rest", async () => {
    const s = setup([clip, { ...reel, minAppVersion: "0.7.0" }]);
    expect(await s.client.refresh()).toMatchObject({ ok: true });
    expect([...s.snapshot()!.items.playbook.keys()]).toEqual(["clip"]);
    expect(blobRequests(s).length).toBe(itemOf(s, "clip").files.length);
    expect(folders(s.root).some((f) => f.startsWith("reel/"))).toBe(false);
  });

  it("downloads it once the app is new enough", async () => {
    const s = setup([{ ...reel, minAppVersion: "0.7.0" }], { appVersion: "0.7.0" });
    expect(await s.client.refresh()).toMatchObject({ ok: true });
    expect(s.snapshot()!.items.playbook.has("reel")).toBe(true);
  });

  it("checks again when reading, so an older app skips what a newer one downloaded", async () => {
    const s = setup([{ ...reel, minAppVersion: "0.7.0" }], { appVersion: "0.7.0" });
    await s.client.refresh();
    expect(s.snapshot("0.7.0")!.items.playbook.has("reel")).toBe(true);
    expect(s.snapshot("0.6.9")!.items.playbook.has("reel")).toBe(false);
  });
});

describe("withdrawn items", () => {
  it("hides the cached copy and doesn't download a withdrawn id", async () => {
    const s = setup([reel, clip]);
    await s.client.refresh();
    expect(s.snapshot()!.items.playbook.has("reel")).toBe(true);
    s.server.catalog = makeCatalog([clip], { withdrawn: ["reel"], generatedAt: "2026-11-03T00:00:00.000Z" });
    await s.client.refresh();
    const snapshot = s.snapshot()!;
    expect(snapshot.items.playbook.has("reel")).toBe(false);
    expect(snapshot.withdrawn.playbook.has("reel")).toBe(true);
    expect(snapshot.items.playbook.has("clip")).toBe(true);
  });

  it("withdraws an id that's still listed, and never fetches it", async () => {
    const s = setup([reel, clip]);
    s.server.catalog = makeCatalog([reel, clip], { withdrawn: ["reel"] });
    await s.client.refresh();
    expect([...s.snapshot()!.items.playbook.keys()]).toEqual(["clip"]);
    expect(blobRequests(s).length).toBe(itemOf(s, "clip").files.length);
  });
});

describe("offline and cache", () => {
  it("keeps serving the cached catalog when the network fails, then recovers", async () => {
    const s = setup([clip]);
    await s.client.refresh();
    s.server.offline = true;
    expect(await s.client.refresh()).toMatchObject({ ok: false, code: "network" });
    expect(s.snapshot()!.items.playbook.has("clip")).toBe(true);
    expect(s.client.status().lastError?.message).toContain("fetch failed");
    expect(s.logs).toHaveLength(1);
    await s.client.refresh();
    expect(s.logs).toHaveLength(1);
    s.server.offline = false;
    expect(await s.client.refresh()).toMatchObject({ ok: true });
    expect(s.client.status().lastError).toBeUndefined();
  });

  it("has nothing, without error, on a first run offline", async () => {
    const s = setup([clip]);
    s.server.offline = true;
    expect(await s.client.refresh()).toMatchObject({ ok: false });
    expect(s.snapshot()).toBeUndefined();
    expect(fs.readdirSync(s.root)).toEqual([]);
  });

  it("treats HTTP errors as failures", async () => {
    const s = setup([clip]);
    s.server.respond = () => new Response("nope", { status: 503 });
    expect(await s.client.refresh()).toMatchObject({ ok: false, error: expect.stringContaining("503") });
  });
});

describe("retiring old folders", () => {
  it("keeps an unreferenced folder for 7 days, then removes it", async () => {
    let now = Date.parse("2026-11-02T18:00:00Z");
    const s = setup([reel], { now: () => now });
    await s.client.refresh();
    const v1 = path.basename(itemDir(s.root, itemOf(s, "reel")));
    s.server.catalog = makeCatalog([{ ...reel, version: "1.1.0" }], { generatedAt: "2026-11-03T00:00:00.000Z" });
    await s.client.refresh();
    const v2 = path.basename(itemDir(s.root, itemOf(s, "reel")));
    expect(folders(s.root).sort()).toEqual([`reel/${v1}`, `reel/${v2}`].sort());

    now += 6 * DAY;
    await s.client.refresh();
    expect(folders(s.root)).toContain(`reel/${v1}`);

    now += 2 * DAY;
    await s.client.refresh();
    expect(folders(s.root)).toEqual([`reel/${v2}`]);
    expect(s.snapshot()!.items.playbook.get("reel")!.item.version).toBe("1.1.0");
  });

  it("counts the 7 days from when the folder stopped being used, not from when it was made", async () => {
    let now = Date.parse("2026-11-02T18:00:00Z");
    const s = setup([reel], { now: () => now });
    await s.client.refresh();
    now += 30 * DAY;
    s.server.catalog = makeCatalog([{ ...reel, version: "1.1.0" }], { generatedAt: "2026-12-03T00:00:00.000Z" });
    await s.client.refresh();
    expect(folders(s.root)).toHaveLength(2);
    now += 7 * DAY - 1000;
    await s.client.refresh();
    expect(folders(s.root)).toHaveLength(2);
  });

  it("keeps a folder that is used again", async () => {
    let now = Date.parse("2026-11-02T18:00:00Z");
    const s = setup([reel], { now: () => now });
    await s.client.refresh();
    const first = s.server.catalog;
    s.server.catalog = makeCatalog([{ ...reel, version: "1.1.0" }], { generatedAt: "2026-11-03T00:00:00.000Z" });
    await s.client.refresh();
    now += 5 * DAY;
    s.server.catalog = { ...makeCatalog([reel], { generatedAt: "2026-11-04T00:00:00.000Z" }), blobs: first.blobs };
    await s.client.refresh();
    now += 10 * DAY;
    await s.client.refresh();
    expect(s.snapshot()!.items.playbook.get("reel")!.item.version).toBe("1.0.0");
    expect(folders(s.root)).toHaveLength(1);
  });

  it("removes a withdrawn item's folder after 7 days and stale temp folders after a day", async () => {
    let now = Date.parse("2026-11-02T18:00:00Z");
    const s = setup([reel, clip], { now: () => now });
    await s.client.refresh();
    const stale = path.join(s.root, "items", "playbook", "clip", ".tmp-1-1-abc");
    fs.mkdirSync(stale);
    fs.utimesSync(stale, new Date(now - 2 * DAY), new Date(now - 2 * DAY));
    s.server.catalog = makeCatalog([clip], { withdrawn: ["reel"], generatedAt: "2026-11-03T00:00:00.000Z" });
    await s.client.refresh();
    expect(fs.existsSync(stale)).toBe(false);
    expect(folders(s.root).some((f) => f.startsWith("reel/"))).toBe(true);
    now += RETIRE_AFTER_MS + 1000;
    await s.client.refresh();
    expect(folders(s.root).some((f) => f.startsWith("reel/"))).toBe(false);
    expect(folders(s.root).some((f) => f.startsWith("clip/"))).toBe(true);
  });
});

describe("schedule", () => {
  it("refreshes at start, every 6 hours, and 30 minutes after a failure", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-11-02T18:00:00Z") });
    const s = setup([clip]);
    const indexRequests = () => s.server.requests.filter((r) => r === "index.json").length;
    s.client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(indexRequests()).toBe(1);

    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000 - 1000);
    expect(indexRequests()).toBe(1);
    s.server.offline = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(indexRequests()).toBe(2);

    await vi.advanceTimersByTimeAsync(29 * 60 * 1000);
    expect(indexRequests()).toBe(2);
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(indexRequests()).toBe(3);

    s.client.stop();
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(indexRequests()).toBe(3);
  });

  it("skips the refresh at start when another process saved a catalog a few seconds ago", async () => {
    const s = setup([clip]);
    await s.client.refresh();
    s.server.requests.length = 0;
    const second = s.make();
    second.start();
    await new Promise((r) => setTimeout(r, 20));
    second.stop();
    expect(s.server.requests).toEqual([]);
  });

  it("doesn't throw from start() when the catalog is unreachable", async () => {
    const s = setup([clip]);
    s.server.offline = true;
    s.client.start();
    await new Promise((r) => setTimeout(r, 20));
    s.client.stop();
    expect(s.client.status().lastError).toBeDefined();
  });
});
