import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildCatalog, readWithdrawn, syncSiteCopies } from "../scripts/lib/catalog-build.ts";
import { validateStyle } from "../src/core/presets.ts";
import { CatalogClient, layerCopies, readSnapshot } from "../src/server/catalog.ts";
import { packageRoot, PREVIEW_BASE_URL } from "../src/server/paths.ts";
import { PresetLibrary } from "../src/server/presets.ts";
import { FAKE_URL, TEST_KEY, fakeServer, makeCatalog, type TestItem } from "./catalog-helpers.ts";
import { samplePlaybook, writePlaybook } from "./helpers.ts";

const temps: string[] = [];
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "framejam-catalog-styles-"));
  temps.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const APP = "0.6.0";
const realStyle = JSON.parse(fs.readFileSync(path.join(packageRoot, "presets/acid-chrome/style.json"), "utf8")) as Record<string, unknown>;
const style = (id: string, extra: Record<string, unknown> = {}) => ({ ...realStyle, id, name: `${id} ${extra.version ?? "1.0.0"}`, version: "1.0.0", minAppVersion: "0.6.0", ...extra });

function writeStyle(dir: string, s: Record<string, unknown>, files: Record<string, string> = {}) {
  const folder = path.join(dir, String(s.id));
  fs.mkdirSync(path.join(folder, "composition"), { recursive: true });
  fs.writeFileSync(path.join(folder, "style.json"), JSON.stringify(s, null, 2));
  fs.writeFileSync(path.join(folder, "composition/index.html"), "<!doctype html>\n");
  for (const [rel, content] of Object.entries(files)) fs.writeFileSync(path.join(folder, rel), content);
}

const input = (sources: Record<string, string>, extra = {}) => ({
  sources,
  keyId: TEST_KEY.keyId,
  sourceCommit: "a".repeat(40),
  generatedAt: "2026-11-02T17:00:00.000Z",
  ...extra,
});

describe("styles in the catalog build", () => {
  it("publishes every built-in style next to the playbooks", () => {
    const built = buildCatalog(input({ playbook: path.join(packageRoot, "playbooks"), style: path.join(packageRoot, "presets") }));
    const styles = built.index.items.filter((i) => i.kind === "style");
    expect(styles.length).toBe(fs.readdirSync(path.join(packageRoot, "presets")).filter((d) => fs.existsSync(path.join(packageRoot, "presets", d, "style.json"))).length);
    expect(built.index.items.filter((i) => i.kind === "playbook").length).toBeGreaterThanOrEqual(15);
    for (const item of styles) {
      expect(item.minAppVersion, item.id).toBe("0.6.0");
      expect(item.files.map((f) => f.path), item.id).toContain("style.json");
      expect(item.files.some((f) => f.path.endsWith("preview.mp4")), item.id).toBe(false);
    }
  });

  it("checks every built-in style.json", () => {
    for (const id of fs.readdirSync(path.join(packageRoot, "presets"))) {
      const file = path.join(packageRoot, "presets", id, "style.json");
      if (fs.existsSync(file)) expect(validateStyle(JSON.parse(fs.readFileSync(file, "utf8"))), id).toEqual([]);
    }
  });

  it("names the kind in every problem", () => {
    const styles = tmp();
    writeStyle(styles, style("broken", { palette: "red", version: "one" }));
    writeStyle(styles, style("old", { minAppVersion: undefined }));
    expect(() => buildCatalog(input({ style: styles }))).toThrow(/style broken: version must look like 1\.0\.0[\s\S]*style broken: palette must be an object[\s\S]*style old: minAppVersion is required/);
  });

  it("keeps a playbook and a style with the same id apart", () => {
    const playbooks = tmp();
    const styles = tmp();
    writePlaybook(playbooks, samplePlaybook("neon", { minAppVersion: "0.6.0" }));
    writeStyle(styles, style("neon"));
    const built = buildCatalog(input({ playbook: playbooks, style: styles }));
    expect(built.index.items.map((i) => `${i.kind} ${i.id}`)).toEqual(["playbook neon", "style neon"]);
    expect(() => buildCatalog(input({ playbook: playbooks, style: styles }, { withdrawn: [{ kind: "style", id: "neon" }] }))).toThrow(/style neon is withdrawn/);
    expect(() => buildCatalog(input({ playbook: playbooks }, { withdrawn: [{ kind: "style", id: "neon" }] }))).not.toThrow();
  });

  it("reads a withdrawn list by kind, and a plain list as playbook ids", () => {
    const file = path.join(tmp(), "withdrawn.json");
    fs.writeFileSync(file, JSON.stringify({ playbook: ["a"], style: ["b"] }));
    expect(readWithdrawn(file)).toEqual([
      { kind: "playbook", id: "a" },
      { kind: "style", id: "b" },
    ]);
    fs.writeFileSync(file, JSON.stringify(["a"]));
    expect(readWithdrawn(file)).toEqual([{ kind: "playbook", id: "a" }]);
    fs.writeFileSync(file, JSON.stringify({ widget: ["a"] }));
    expect(() => readWithdrawn(file)).toThrow(/must map a kind/);
  });

  it("copies style.json to the website's presets folder", () => {
    const styles = tmp();
    const site = tmp();
    writeStyle(styles, style("neon"));
    writeStyle(styles, style("not-on-site"));
    fs.mkdirSync(path.join(site, "neon"));
    const items = buildCatalog(input({ style: styles })).index.items;
    expect(syncSiteCopies({ style: styles }, { style: site }, items, true)).toEqual(["style neon"]);
    expect(fs.existsSync(path.join(site, "neon", "style.json"))).toBe(false);
    expect(syncSiteCopies({ style: styles }, { style: site }, items)).toEqual(["style neon"]);
    expect(fs.readFileSync(path.join(site, "neon", "style.json"), "utf8")).toBe(fs.readFileSync(path.join(styles, "neon", "style.json"), "utf8"));
    expect(fs.existsSync(path.join(site, "not-on-site"))).toBe(false);
  });
});

describe("styles from a downloaded catalog", () => {
  const styleItem = (id: string, version: string, s: Record<string, unknown> = {}): TestItem => ({
    kind: "style",
    id,
    version,
    files: { "style.json": JSON.stringify(style(id, { version, ...s })), "composition/index.html": "<!doctype html>\n", "poster.jpg": "jpg" },
  });

  async function setup(options: { items: TestItem[]; bundled?: [string, string][]; user?: [string, string][]; withdrawn?: { kind: "style"; id: string }[] }) {
    const root = tmp();
    const bundled = path.join(root, "bundled");
    const user = path.join(root, "presets");
    for (const [id, version] of options.bundled ?? []) writeStyle(bundled, style(id, { version, name: `${id} ${version} (app)` }));
    for (const [id, version] of options.user ?? []) writeStyle(user, style(id, { version, name: `${id} ${version} (mine)` }));
    const server = fakeServer(makeCatalog(options.items, { withdrawn: options.withdrawn }));
    const catalogRoot = path.join(root, "catalog");
    const client = new CatalogClient({ root: catalogRoot, url: FAKE_URL, appVersion: APP, bundledDirs: { style: bundled }, extraKeys: [TEST_KEY.publicKey], fetch: server.fetch });
    expect(await client.refresh()).toMatchObject({ ok: true });
    const read = () => readSnapshot(catalogRoot, { appVersion: APP, extraKeys: [TEST_KEY.publicKey] });
    const lib = new PresetLibrary(
      [
        { dir: bundled, builtin: true },
        { dir: user, builtin: false },
      ],
      read,
    );
    return { server, lib, read };
  }

  const names = (lib: PresetLibrary) => Object.fromEntries(lib.all().map((p) => [p.style.id, `${p.style.version} ${p.source}`]));

  it("keeps styles in their own part of the snapshot", async () => {
    const { read } = await setup({ items: [styleItem("neon", "1.0.0"), { id: "neon", version: "1.0.0", files: { "SKILL.md": "# Neon\n" } }] });
    const snapshot = read()!;
    expect([...snapshot.items.style.keys()]).toEqual(["neon"]);
    expect([...snapshot.items.playbook.keys()]).toEqual(["neon"]);
    expect(snapshot.items.style.get("neon")!.dir).not.toBe(snapshot.items.playbook.get("neon")!.dir);
  });

  it("uses the catalog copy only when its version is higher, and the user's own copy always", async () => {
    const { lib } = await setup({
      bundled: [["newer", "1.0.0"], ["same", "1.0.0"], ["mine", "1.0.0"]],
      user: [["mine", "1.0.0"]],
      items: [styleItem("newer", "1.1.0"), styleItem("same", "1.0.0"), styleItem("only-here", "1.0.0"), styleItem("mine", "2.0.0")],
    });
    expect(names(lib)).toEqual({ newer: "1.1.0 catalog", same: "1.0.0 bundled", "only-here": "1.0.0 catalog", mine: "1.0.0 user" });
    expect(lib.get("same")!.style.name).toBe("same 1.0.0 (app)");
  });

  it("streams a catalog style's preview from the website and reads its example from the folder", async () => {
    const { lib } = await setup({ items: [styleItem("only-here", "1.0.0")] });
    const p = lib.get("only-here")!;
    expect(lib.summary(p)).toMatchObject({ source: "catalog", previewUrl: `${PREVIEW_BASE_URL}/only-here/preview.mp4`, posterUrl: "/api/presets/only-here/files/poster.jpg" });
    expect(lib.templateFiles(p)).toEqual(["index.html"]);
  });

  it("copies unchanged files from the bundled style instead of downloading them", async () => {
    const shared = style("neon", { version: "1.1.0" });
    const { server } = await setup({
      bundled: [["neon", "1.0.0"]],
      items: [{ kind: "style", id: "neon", version: "1.1.0", files: { "style.json": JSON.stringify(shared), "composition/index.html": "<!doctype html>\n" } }],
    });
    expect(server.requests.filter((r) => r.startsWith("blobs/")).length).toBe(1);
  });

  it("hides a withdrawn style's catalog copy but keeps the bundled one", async () => {
    const { lib, read } = await setup({ bundled: [["neon", "1.0.0"]], items: [styleItem("other", "1.0.0")], withdrawn: [{ kind: "style", id: "neon" }] });
    expect(read()!.withdrawn.style.has("neon")).toBe(true);
    expect(read()!.withdrawn.playbook.has("neon")).toBe(false);
    expect(names(lib)).toEqual({ neon: "1.0.0 bundled", other: "1.0.0 catalog" });
  });

  it("skips a catalog folder whose style.json doesn't match the entry", async () => {
    const { lib } = await setup({ items: [{ kind: "style", id: "neon", version: "2.0.0", files: { "style.json": JSON.stringify(style("neon", { version: "1.0.0" })) } }] });
    expect(lib.all()).toEqual([]);
  });
});

describe("layerCopies", () => {
  it("applies the same rules to any kind", () => {
    const m = (entries: [string, string][]) => new Map(entries.map(([id, v]) => [id, { id, v }]));
    const out = layerCopies({ bundled: m([["a", "1.0.0"], ["b", "1.0.0"]]), catalog: m([["a", "1.2.0"], ["b", "1.0.0"], ["c", "1.0.0"]]), user: m([["a", "1.0.0"]]) }, (x) => x.v);
    expect(Object.fromEntries([...out].map(([id, x]) => [id, `${x.copy.v} ${x.source}${x.newerVersion ? ` (app has ${x.newerVersion})` : ""}`]))).toEqual({
      a: "1.0.0 user (app has 1.2.0)",
      b: "1.0.0 bundled",
      c: "1.0.0 catalog",
    });
  });
});
