import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogClient, catalogConfig, readSnapshot } from "../src/server/catalog.ts";
import { JsonStore } from "../src/server/json-store.ts";
import { catalogDir, PLAYBOOK_PREVIEW_BASE_URL } from "../src/server/paths.ts";
import { PlaybookLibrary } from "../src/server/playbooks.ts";
import { FAKE_URL, TEST_KEY, fakeServer, makeCatalog, type TestItem } from "./catalog-helpers.ts";
import { samplePlaybook, writePlaybook } from "./helpers.ts";

const temps: string[] = [];
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "framejam-catalog-library-"));
  temps.push(dir);
  return dir;
};
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const APP = "0.6.0";

/** A catalog item holding a real, valid playbook. */
function item(id: string, version: string, extra: Partial<TestItem> & { playbook?: Record<string, unknown> } = {}): TestItem {
  const { playbook, ...rest } = extra;
  return {
    id,
    version,
    ...rest,
    files: {
      "playbook.json": JSON.stringify(samplePlaybook(id, { name: `${id} ${version}`, version, ...playbook })),
      "SKILL.md": `# ${id} ${version}\n`,
      "poster.jpg": "poster",
      ...rest.files,
    },
  };
}

/** A data folder with a downloaded catalog, a bundled folder and a user folder. */
async function setup(options: { bundled?: [string, string][]; user?: [string, string][]; items: TestItem[]; withdrawn?: string[] }) {
  const root = tmp();
  const bundled = path.join(tmp(), "bundled");
  const user = path.join(root, "playbooks");
  for (const [id, version] of options.bundled ?? []) writePlaybook(bundled, samplePlaybook(id, { name: `${id} ${version} (app)`, version }));
  for (const [id, version] of options.user ?? []) writePlaybook(user, samplePlaybook(id, { name: `${id} ${version} (mine)`, version }));
  const server = fakeServer(makeCatalog(options.items, { withdrawn: options.withdrawn }));
  const client = new CatalogClient({ root: catalogDir(root), url: FAKE_URL, appVersion: APP, extraKeys: [TEST_KEY.publicKey], fetch: server.fetch });
  const result = await client.refresh();
  expect(result.ok).toBe(true);
  const read = () => readSnapshot(catalogDir(root), { appVersion: APP, extraKeys: [TEST_KEY.publicKey] });
  const lib = new PlaybookLibrary(
    [
      { dir: bundled, builtin: true },
      { dir: user, builtin: false },
    ],
    read,
  );
  return { root, bundled, user, server, client, lib, read };
}

const names = (lib: PlaybookLibrary) => Object.fromEntries(lib.all().map((p) => [p.playbook.id, `${p.playbook.version} ${p.source}`]));

describe("library with a downloaded catalog", () => {
  it("uses the catalog copy only when its version is higher than the bundled one", async () => {
    const { lib } = await setup({
      bundled: [["newer", "1.0.0"], ["same", "1.0.0"], ["older", "1.2.0"], ["ten", "1.9.0"]],
      items: [item("newer", "1.1.0"), item("same", "1.0.0"), item("older", "1.1.0"), item("ten", "1.10.0")],
    });
    expect(names(lib)).toEqual({ newer: "1.1.0 catalog", same: "1.0.0 bundled", older: "1.2.0 bundled", ten: "1.10.0 catalog" });
    expect(lib.get("newer")!.playbook.name).toBe("newer 1.1.0");
    expect(lib.get("same")!.playbook.name).toBe("same 1.0.0 (app)");
  });

  it("shows playbooks that only the catalog has, as built in", async () => {
    const { lib } = await setup({ bundled: [["old", "1.0.0"]], items: [item("only-here", "1.0.0")] });
    const p = lib.get("only-here")!;
    expect(p.source).toBe("catalog");
    expect(p.builtin).toBe(true);
    expect(fs.existsSync(path.join(p.dir, "playbook.json"))).toBe(true);
    expect(lib.skillText(p)).toContain("# only-here 1.0.0");
    expect(lib.files(p)).toEqual(["SKILL.md", "playbook.json", "poster.jpg"]);
    expect(names(lib)).toEqual({ old: "1.0.0 bundled", "only-here": "1.0.0 catalog" });
  });

  it("streams a catalog playbook's preview from the website and serves its poster from the folder", async () => {
    const { lib } = await setup({ items: [item("only-here", "1.0.0")] });
    const summary = lib.summary(lib.get("only-here")!);
    expect(summary.previewUrl).toBe(`${PLAYBOOK_PREVIEW_BASE_URL}/only-here/preview.mp4`);
    expect(summary.posterUrl).toBe("/api/playbooks/only-here/files/poster.jpg");
    expect(summary.hasPreview).toBe(true);
    expect(summary.builtin).toBe(true);
  });

  it("serves files from a catalog folder and refuses paths outside it", async () => {
    const { lib } = await setup({ items: [item("only-here", "1.0.0")] });
    const p = lib.get("only-here")!;
    expect(lib.file(p, "SKILL.md")).toBe(path.join(p.dir, "SKILL.md"));
    expect(lib.file(p, "../../state.json")).toBeUndefined();
  });

  it("hides a withdrawn catalog copy but keeps the bundled one", async () => {
    const { lib } = await setup({
      bundled: [["kept", "1.0.0"]],
      items: [item("kept", "1.5.0"), item("gone", "1.0.0")],
      withdrawn: ["kept", "gone"],
    });
    expect(names(lib)).toEqual({ kept: "1.0.0 bundled" });
  });

  it("ignores items that need a newer app", async () => {
    const { lib } = await setup({
      bundled: [["a", "1.0.0"]],
      items: [item("a", "2.0.0", { minAppVersion: "9.0.0" }), item("b", "1.0.0", { minAppVersion: "9.0.0" })],
    });
    expect(names(lib)).toEqual({ a: "1.0.0 bundled" });
  });

  it("skips a catalog folder whose playbook.json doesn't match the catalog entry", async () => {
    const wrongVersion = item("a", "2.0.0", { files: { "playbook.json": JSON.stringify(samplePlaybook("a", { version: "1.0.0" })) } });
    const wrongId = item("b", "1.0.0", { files: { "playbook.json": JSON.stringify(samplePlaybook("c", { version: "1.0.0" })) } });
    const broken = item("d", "1.0.0", { files: { "playbook.json": JSON.stringify({ id: "d", version: "1.0.0" }) } });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { lib } = await setup({ bundled: [["a", "1.0.0"]], items: [wrongVersion, wrongId, broken] });
    expect(names(lib)).toEqual({ a: "1.0.0 bundled" });
    error.mockRestore();
  });

  it("falls back to the bundled copy when the catalog folder is gone", async () => {
    const { lib, read } = await setup({ bundled: [["a", "1.0.0"]], items: [item("a", "1.1.0")] });
    expect(names(lib)).toEqual({ a: "1.1.0 catalog" });
    fs.rmSync(read()!.playbooks.get("a")!.dir, { recursive: true });
    expect(names(lib)).toEqual({ a: "1.0.0 bundled" });
  });

  it("falls back to the bundled copies when the saved catalog no longer verifies", async () => {
    const { lib, root } = await setup({ bundled: [["a", "1.0.0"]], items: [item("a", "1.1.0"), item("b", "1.0.0")] });
    const file = path.join(catalogDir(root), "state.json");
    const state = JSON.parse(fs.readFileSync(file, "utf8"));
    fs.writeFileSync(file, JSON.stringify({ ...state, indexText: state.indexText.replace("1.1.0", "9.9.9") }));
    expect(names(lib)).toEqual({ a: "1.0.0 bundled" });
  });

  it("works without a catalog at all", () => {
    const bundled = path.join(tmp(), "bundled");
    writePlaybook(bundled, samplePlaybook("a"));
    const lib = new PlaybookLibrary([{ dir: bundled, builtin: true }], () => undefined);
    expect(names(lib)).toEqual({ a: "1.0.0 bundled" });
    expect(new PlaybookLibrary([{ dir: bundled, builtin: true }]).all().length).toBe(1);
  });

  it("falls back when reading the catalog throws", () => {
    const bundled = path.join(tmp(), "bundled");
    writePlaybook(bundled, samplePlaybook("a"));
    const lib = new PlaybookLibrary([{ dir: bundled, builtin: true }], () => {
      throw new Error("boom");
    });
    expect(names(lib)).toEqual({ a: "1.0.0 bundled" });
  });
});

describe("a user's own copy", () => {
  it("always wins over a newer catalog copy and says a newer version exists", async () => {
    const { lib } = await setup({ bundled: [["a", "1.0.0"]], user: [["a", "1.0.0"]], items: [item("a", "1.1.0")] });
    const p = lib.get("a")!;
    expect(p.source).toBe("user");
    expect(p.builtin).toBe(false);
    expect(p.playbook.name).toBe("a 1.0.0 (mine)");
    expect(p.newerVersion).toBe("1.1.0");
  });

  it("says a newer version exists when the bundled copy is the newer one", async () => {
    const { lib } = await setup({ bundled: [["a", "1.2.0"]], user: [["a", "1.0.0"]], items: [item("a", "1.1.0")] });
    expect(lib.get("a")!.newerVersion).toBe("1.2.0");
  });

  it("compares versions as numbers", async () => {
    const { lib } = await setup({ user: [["a", "1.9.0"], ["b", "1.10.0"]], items: [item("a", "1.10.0"), item("b", "1.9.0")] });
    expect(lib.get("a")!.newerVersion).toBe("1.10.0");
    expect(lib.get("b")!.newerVersion).toBeUndefined();
  });

  it("gets no notice when it's as new as the catalog's or newer", async () => {
    const { lib } = await setup({ user: [["a", "1.1.0"], ["b", "2.0.0"]], items: [item("a", "1.1.0"), item("b", "1.5.0")] });
    expect(lib.get("a")!.newerVersion).toBeUndefined();
    expect(lib.get("b")!.newerVersion).toBeUndefined();
  });

  it("gets no notice when the only newer copy is withdrawn or needs a newer app", async () => {
    const { lib } = await setup({
      user: [["a", "1.0.0"], ["b", "1.0.0"]],
      items: [item("a", "2.0.0"), item("b", "2.0.0", { minAppVersion: "9.0.0" })],
      withdrawn: ["a"],
    });
    expect(lib.get("a")!.newerVersion).toBeUndefined();
    expect(lib.get("b")!.newerVersion).toBeUndefined();
  });

  it("is untouched when the app has no copy of it", async () => {
    const { lib } = await setup({ user: [["mine", "1.0.0"]], items: [item("other", "1.0.0")] });
    expect(lib.get("mine")!.newerVersion).toBeUndefined();
    expect(lib.get("mine")!.source).toBe("user");
  });
});

describe("the store's off switches", () => {
  /** A data folder with a downloaded catalog whose only playbook isn't bundled. */
  async function downloaded() {
    const { root } = await setup({ items: [item("catalog-only-test", "1.0.0", { minAppVersion: "0.0.1" })] });
    return root;
  }

  function stub(env: Record<string, string>) {
    for (const name of ["CATALOG_URL", "CATALOG_PUBLIC_KEY", "NO_UPDATE_CHECK"]) vi.stubEnv(`FRAMEJAM_${name}`, env[name] ?? "");
  }

  const ids = (root: string) => new JsonStore(root).playbooks.all().map((p) => p.playbook.id);

  it("shows downloaded playbooks when the catalog is on", async () => {
    const root = await downloaded();
    stub({ CATALOG_URL: FAKE_URL, CATALOG_PUBLIC_KEY: TEST_KEY.publicKey });
    expect(ids(root)).toContain("catalog-only-test");
  });

  it("shows nothing downloaded when FRAMEJAM_CATALOG_URL is off", async () => {
    const root = await downloaded();
    stub({ CATALOG_URL: "OFF", CATALOG_PUBLIC_KEY: TEST_KEY.publicKey });
    expect(ids(root)).not.toContain("catalog-only-test");
  });

  it("shows nothing downloaded when FRAMEJAM_NO_UPDATE_CHECK is set, even with a URL", async () => {
    const root = await downloaded();
    stub({ CATALOG_URL: FAKE_URL, CATALOG_PUBLIC_KEY: TEST_KEY.publicKey, NO_UPDATE_CHECK: "1" });
    expect(ids(root)).not.toContain("catalog-only-test");
  });

  it("shows nothing downloaded in a source checkout unless a URL is set", async () => {
    const root = await downloaded();
    stub({ CATALOG_PUBLIC_KEY: TEST_KEY.publicKey });
    expect(ids(root)).not.toContain("catalog-only-test");
  });

  it("shows nothing downloaded when the catalog's key isn't trusted", async () => {
    const root = await downloaded();
    stub({ CATALOG_URL: FAKE_URL });
    expect(ids(root)).not.toContain("catalog-only-test");
  });

  it("takes the catalog settings from options when given", async () => {
    const root = await downloaded();
    stub({});
    const store = new JsonStore(root, { catalog: catalogConfig((name) => ({ CATALOG_URL: FAKE_URL, CATALOG_PUBLIC_KEY: TEST_KEY.publicKey })[name], false) });
    expect(store.playbooks.all().map((p) => p.playbook.id)).toContain("catalog-only-test");
  });
});
