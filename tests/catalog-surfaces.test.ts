import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { playbookUpdateNotice } from "../src/core/playbooks.ts";
import { createApp } from "../src/server/app.ts";
import { CatalogClient, catalogConfig, catalogStatus } from "../src/server/catalog.ts";
import { JsonStore } from "../src/server/json-store.ts";
import type { McpContext } from "../src/server/mcp.ts";
import { catalogDir } from "../src/server/paths.ts";
import { FAKE_URL, TEST_KEY, fakeServer, makeCatalog, type TestItem } from "./catalog-helpers.ts";
import { BASE_URL, connectClient, parse, samplePlaybook, writePlaybook } from "./helpers.ts";

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const item = (id: string, version: string): TestItem => ({
  id,
  version,
  minAppVersion: "0.0.1",
  files: { "playbook.json": JSON.stringify(samplePlaybook(id, { version })), "SKILL.md": `# ${id}\n` },
});

const read = (name: string) => ({ CATALOG_URL: FAKE_URL, CATALOG_PUBLIC_KEY: TEST_KEY.publicKey })[name];

/** An app with a downloaded catalog: `fresh` only exists there, `mine` is the user's older copy of `shared`. */
async function fixture(options: { offline?: boolean; config?: ReturnType<typeof catalogConfig> } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "framejam-surfaces-"));
  temps.push(root);
  const config = options.config ?? catalogConfig(read, false);
  const server = fakeServer(makeCatalog([item("fresh", "1.0.0"), item("shared", "1.2.0")]));
  const client = new CatalogClient({ root: catalogDir(root), url: FAKE_URL, appVersion: "0.6.0", extraKeys: [TEST_KEY.publicKey], fetch: server.fetch });
  expect((await client.refresh()).ok).toBe(true);
  server.offline = !!options.offline;
  const store = new JsonStore(root, { catalog: config });
  writePlaybook(store.userPlaybooksDir, samplePlaybook("shared", { version: "1.0.0" }));
  writePlaybook(store.userPlaybooksDir, samplePlaybook("current", { version: "1.0.0" }));
  const ctx: McpContext = { store, baseUrl: BASE_URL, catalog: () => catalogStatus(catalogDir(root), config, client, "0.6.0") };
  return { root, server, client, store, ctx, app: createApp(ctx) };
}

describe("update notice", () => {
  it("says which version the user has, which is available and what to do", () => {
    expect(playbookUpdateNotice({ id: "reel", version: "1.0.0" }, "1.1.0")).toBe(
      "Your copy is 1.0.0. Version 1.1.0 is available; remove ~/.framejam/playbooks/reel to use it.",
    );
    expect(playbookUpdateNotice({ id: "reel", version: "1.0.0" }, "1.1.0", "/data/playbooks/reel")).toContain("remove /data/playbooks/reel to use it");
  });
});

describe("playbook summaries", () => {
  it("say where each copy came from and flag a user copy that has a newer version", async () => {
    const { app } = await fixture();
    const { playbooks } = await (await app.request("/api/playbooks")).json();
    const by = (id: string) => playbooks.find((p: { id: string }) => p.id === id);
    expect(by("fresh")).toMatchObject({ source: "catalog", builtin: true });
    expect(by("fresh").newerVersion).toBeUndefined();
    expect(by("shared")).toMatchObject({ source: "user", builtin: false, version: "1.0.0", newerVersion: "1.2.0" });
    expect(by("current")).toMatchObject({ source: "user" });
    expect(by("current").newerVersion).toBeUndefined();
    const one = await (await app.request("/api/playbooks/shared")).json();
    expect(one.playbook.newerVersion).toBe("1.2.0");
  });
});

describe("get_playbook", () => {
  it("tells the agent about a newer version without touching the user's folder", async () => {
    const { ctx, store } = await fixture();
    const mcp = await connectClient(ctx);
    const shared = parse(await mcp.call("get_playbook", { id: "shared" }));
    expect(shared.updateNotice).toContain("Your copy is 1.0.0. Version 1.2.0 is available; remove ");
    expect(shared.updateNotice).toContain(path.join(store.userPlaybooksDir, "shared"));
    expect(shared.updateNotice).toContain("Tell the user once");
    expect(fs.existsSync(path.join(store.userPlaybooksDir, "shared", "playbook.json"))).toBe(true);
    expect(parse(await mcp.call("get_playbook", { id: "current" })).updateNotice).toBeUndefined();
    const fresh = parse(await mcp.call("get_playbook", { id: "fresh" }));
    expect(fresh.updateNotice).toBeUndefined();
    expect(fresh.skill).toContain("# fresh");
    await mcp.close();
  });
});

describe("/api/catalog", () => {
  it("reports the last refresh", async () => {
    const { app } = await fixture();
    const status = await (await app.request("/api/catalog")).json();
    expect(status).toMatchObject({ enabled: true, url: FAKE_URL, sourceCommit: "0".repeat(40) });
    expect(status.checkedAt).toBeTruthy();
    expect(status.generatedAt).toBe("2026-11-02T17:00:00.000Z");
    expect(status.lastError).toBeUndefined();
    expect(status.reason).toBeUndefined();
  });

  it("reports the last failed refresh, then clears it after a good one", async () => {
    const { app, client, server } = await fixture();
    server.offline = true;
    expect((await client.refresh()).ok).toBe(false);
    const failed = await (await app.request("/api/catalog")).json();
    expect(failed.lastError.message).toBeTruthy();
    expect(failed.checkedAt).toBeTruthy();
    server.offline = false;
    expect((await client.refresh()).ok).toBe(true);
    expect((await (await app.request("/api/catalog")).json()).lastError).toBeUndefined();
  });

  it("says why it's off", async () => {
    const off = catalogConfig((name) => ({ CATALOG_URL: "off" })[name], true);
    const { app } = await fixture({ config: off });
    expect(await (await app.request("/api/catalog")).json()).toEqual({ enabled: false, url: off.url, reason: "env-off" });
    const quiet = catalogConfig((name) => ({ NO_UPDATE_CHECK: "1" })[name], true);
    expect(catalogStatus("/nowhere", quiet)).toMatchObject({ enabled: false, reason: "no-update-check" });
  });

  it("reads the saved catalog when this process runs no client", async () => {
    const { root, client } = await fixture();
    const config = catalogConfig(read, false);
    expect(catalogStatus(catalogDir(root), config, undefined, "0.6.0")).toMatchObject({ enabled: true, generatedAt: client.status().generatedAt });
    expect(catalogStatus(path.join(root, "empty"), config, undefined, "0.6.0")).toEqual({ enabled: true, url: FAKE_URL });
  });

  it("answers when no catalog is set up", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "framejam-surfaces-"));
    temps.push(root);
    const app = createApp({ store: new JsonStore(root), baseUrl: BASE_URL });
    expect(await (await app.request("/api/catalog")).json()).toEqual({ enabled: false, url: "" });
  });

  it("is not cached", async () => {
    const { app } = await fixture();
    expect((await app.request("/api/catalog")).headers.get("cache-control")).toBe("no-store");
  });
});
