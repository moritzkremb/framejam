import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/server/app.ts";
import { JsonStore } from "../src/server/json-store.ts";
import { pullProject } from "../src/server/pull.ts";
import { shareVersion, shareThroughSync } from "../src/server/share.ts";
import { readSync, setProjectSync, setSyncEnabled } from "../src/server/sync-settings.ts";
import { SyncEngine } from "../src/server/sync.ts";
import { fixturePreset } from "./helpers.ts";
import { FakeCloud } from "./fake-cloud.ts";

let root: string;
let video: string;
let cloud: FakeCloud;

/** One computer: its own data dir and sync, all on the same cloud. */
function computer(name: string) {
  const local = new JsonStore(path.join(root, name));
  const sync = new SyncEngine({ local, api: cloud, fetch: cloud.fetch, retryDelayMs: 0, posterFrame: async () => undefined });
  local.remoteSource = (id, n) => sync.sourceFor(id, n);
  setSyncEnabled(true, local.root);
  const run = async () => {
    await sync.syncAll();
    await sync.idle();
  };
  return { local, sync, run };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "framejam-sync-"));
  video = path.join(root, "v1.mp4");
  fs.copyFileSync(path.join(fixturePreset, "preview.mp4"), video);
  cloud = new FakeCloud();
});

afterEach(() => {
  shareThroughSync(undefined);
  fs.rmSync(root, { recursive: true, force: true });
});

const wire = (id: string) => cloud.get(id).then((r) => r!);

describe("sync settings", () => {
  it("does nothing until sync is on", async () => {
    const a = computer("a");
    setSyncEnabled(false, a.local.root);
    a.local.openReview({ title: "Draft", videoPath: video });
    await a.run();
    expect(cloud.calls).toEqual([]);
  });

  it("leaves out a project, and putting it back syncs it", async () => {
    const a = computer("a");
    const { review } = a.local.openReview({ title: "Draft", videoPath: video });
    setProjectSync(review.id, false, a.local.root);
    await a.run();
    expect(cloud.projects.has(review.id)).toBe(false);
    expect(a.sync.status(review.id).state).toBe("left-out");
    setProjectSync(review.id, true, a.local.root);
    await a.run();
    expect(cloud.projects.has(review.id)).toBe(true);
    expect(a.sync.status(review.id).state).toBe("synced");
  });
});

describe("pushing a project", () => {
  it("mirrors versions, comments and rounds, and a second pass changes nothing", async () => {
    const a = computer("a");
    const { review } = a.local.openReview({ title: "Launch", videoPath: video });
    const c1 = a.local.addComment(review.id, { time: 1, text: "Logo bigger" });
    a.local.submit(review.id, "first pass");
    a.local.markDelivered(review.id, [a.local.getReview(review.id).batches[0]!.id]);
    a.local.resolveComments(review.id, [c1.id], "done");
    a.local.addVersion(review.id, { videoPath: video, note: "bigger logo" });
    a.local.addComment(review.id, { time: 2, text: "Now the music" });
    await a.run();

    const w = await wire(review.id);
    expect(w.versions.map((v) => [v.number, v.upload.state, v.note])).toEqual([
      [1, "ready", undefined],
      [2, "ready", "bigger logo"],
    ]);
    expect(w.comments.map((c) => [c.version, c.text, c.status])).toEqual([
      [1, "Logo bigger", "resolved"],
      [2, "Now the music", "draft"],
    ]);
    expect(w.batches).toHaveLength(1);
    expect(w.batches[0]!.deliveredAt).toBeDefined();
    expect(w.versions[0]!.sentAt).toBeDefined();

    cloud.calls.length = 0;
    await a.run();
    expect(cloud.calls.filter((c) => c.startsWith("sync") && c !== "syncIndex")).toEqual([]);
    expect((await wire(review.id)).comments).toHaveLength(2);
  });

  it("brings back what was done on the phone: a comment and Finish review", async () => {
    const a = computer("a");
    const { review } = a.local.openReview({ title: "Launch", videoPath: video });
    await a.run();
    await cloud.addComment(review.id, { time: 3, text: "From my phone" });
    await cloud.submit(review.id);
    await a.run();

    const local = a.local.getReview(review.id);
    expect(local.comments.map((c) => [c.text, c.status])).toEqual([["From my phone", "sent"]]);
    expect(local.versions[0]!.sentAt).toBeDefined();
    const waiting = a.local.undeliveredBatches(review.id);
    expect(waiting).toHaveLength(1);

    a.local.markDelivered(review.id, [waiting[0]!.id]);
    await a.run();
    expect((await wire(review.id)).batches[0]!.deliveredAt).toBeDefined();
  });

  it("merges edits and deletes from either side", async () => {
    const a = computer("a");
    const { review } = a.local.openReview({ title: "Launch", videoPath: video });
    const here = a.local.addComment(review.id, { time: 1, text: "Typed here" });
    const gone = a.local.addComment(review.id, { time: 2, text: "Delete me here" });
    await a.run();
    await cloud.addComment(review.id, { time: 3, text: "Typed on the phone" });
    await a.run();

    const rows = new Map((await wire(review.id)).comments.map((c) => [c.text, c.id]));
    a.local.updateComment(review.id, here.id, { text: "Edited here" });
    a.local.deleteComment(review.id, gone.id);
    await cloud.updateComment(review.id, rows.get("Typed on the phone")!, "Edited on the phone");
    await a.run();

    expect((await wire(review.id)).comments.map((c) => c.text).sort()).toEqual(["Edited here", "Edited on the phone"]);
    expect(a.local.getReview(review.id).comments.map((c) => c.text).sort()).toEqual(["Edited here", "Edited on the phone"]);

    await cloud.deleteComment(review.id, rows.get("Typed on the phone")!);
    await a.run();
    expect(a.local.getReview(review.id).comments.map((c) => c.text)).toEqual(["Edited here"]);
  });

  it("reopens on both sides", async () => {
    const a = computer("a");
    const { review } = a.local.openReview({ title: "Launch", videoPath: video });
    a.local.addComment(review.id, { time: 1, text: "One" });
    a.local.submit(review.id);
    await a.run();
    a.local.reopen(review.id);
    await a.run();
    const w = await wire(review.id);
    expect(w.versions[0]!.sentAt).toBeUndefined();
    expect(w.comments[0]!.status).toBe("draft");

    await cloud.submit(review.id);
    await a.run();
    expect(a.local.getReview(review.id).versions[0]!.sentAt).toBeDefined();
    await cloud.reopen(review.id);
    await a.run();
    expect(a.local.getReview(review.id).versions[0]!.sentAt).toBeUndefined();
    expect(a.local.getReview(review.id).comments[0]!.status).toBe("draft");
  });

  it("uploads the source folder with the version and hands out its download", async () => {
    const a = computer("a");
    const src = path.join(root, "src");
    fs.mkdirSync(src);
    fs.writeFileSync(path.join(src, "index.html"), "<h1>hi</h1>");
    const { review } = a.local.openReview({ title: "Launch", videoPath: video, source: src });
    expect(await a.local.sourceFor(review.id, 1)).toBeUndefined();
    await a.run();
    expect(a.local.getReview(review.id).versions[0]!.source).toMatchObject({ filename: "src-source.zip", ready: true });
    expect((await a.local.sourceFor(review.id, 1))?.url).toContain("?dl=1");
  });
});

describe("two computers", () => {
  it("brings a project to the other computer, and versions made there come back", async () => {
    const a = computer("a");
    const b = computer("b");
    const { review } = a.local.openReview({ title: "Launch", videoPath: video });
    a.local.addComment(review.id, { time: 1, text: "From A" });
    await a.run();

    await b.run();
    const there = b.local.getReview(review.id);
    expect(there.title).toBe("Launch");
    expect(b.local.videoFileFor(review.id, there.versions[0]!)).toBeDefined();
    expect(there.comments.map((c) => c.text)).toEqual(["From A"]);

    b.local.addVersion(review.id, { videoPath: video, note: "made on B" });
    b.local.addComment(review.id, { time: 2, text: "From B" });
    await b.run();
    await a.run();
    const back = a.local.getReview(review.id);
    expect(back.versions.map((v) => v.note)).toEqual([undefined, "made on B"]);
    expect(a.local.videoFileFor(review.id, back.versions[1]!)).toBeDefined();
    expect(back.comments.map((c) => [c.version, c.text])).toEqual([
      [2, "From A"],
      [2, "From B"],
    ]);
  });

  it("stops syncing a project the other computer removed from the cloud, and keeps it here", async () => {
    const a = computer("a");
    const b = computer("b");
    const { review } = a.local.openReview({ title: "Launch", videoPath: video });
    await a.run();
    await b.run();
    setProjectSync(review.id, false, b.local.root);
    await b.sync.forget(review.id);
    expect(cloud.projects.has(review.id)).toBe(false);
    await a.run();
    expect(a.local.findReview(review.id)).toBeDefined();
    expect(readSync(a.local.root).optOut).toContain(review.id);
    expect(cloud.projects.has(review.id)).toBe(false);
  });
});

describe("framejam pull", () => {
  function madeOnA() {
    const a = computer("a");
    const src = path.join(root, "teaser");
    fs.mkdirSync(path.join(src, "scenes"), { recursive: true });
    fs.writeFileSync(path.join(src, "index.html"), "<h1>v1</h1>");
    fs.writeFileSync(path.join(src, "scenes", "intro.js"), "export const intro = 1;");
    const { review } = a.local.openReview({ title: "Launch Teaser", videoPath: video, source: src });
    return { a, src, id: review.id };
  }

  it("brings a project made elsewhere and unpacks its source into a folder named after it", async () => {
    const { a, id } = madeOnA();
    await a.run();
    const b = computer("b");
    const cwd = path.join(root, "work");
    fs.mkdirSync(cwd);
    const result = await pullProject({ store: b.local, engine: b.sync, ref: "launch teaser", cwd, appSyncs: false, fetch: cloud.fetch });
    expect(result).toMatchObject({ ok: true, dir: path.join(cwd, "launch-teaser") });
    expect(result.text).toContain(id);
    expect(fs.readFileSync(path.join(cwd, "launch-teaser", "scenes", "intro.js"), "utf8")).toBe("export const intro = 1;");
    expect(b.local.findReview(id)?.title).toBe("Launch Teaser");

    const again = await pullProject({ store: b.local, engine: b.sync, ref: id, cwd, appSyncs: false, fetch: cloud.fetch });
    expect(again.text).toContain("0 files written (2 already up to date)");
  });

  it("won't replace a file changed after the version was made, unless forced", async () => {
    const { a, id } = madeOnA();
    await a.run();
    const b = computer("b");
    const cwd = path.join(root, "work");
    fs.mkdirSync(cwd);
    await pullProject({ store: b.local, engine: b.sync, ref: id, cwd, appSyncs: false, fetch: cloud.fetch });
    const page = path.join(cwd, "launch-teaser", "index.html");
    fs.writeFileSync(page, "<h1>my edit</h1>");

    const refused = await pullProject({ store: b.local, engine: b.sync, ref: id, cwd, appSyncs: false, fetch: cloud.fetch });
    expect(refused).toMatchObject({ ok: false });
    expect(refused.text).toContain("index.html");
    expect(fs.readFileSync(page, "utf8")).toBe("<h1>my edit</h1>");

    const forced = await pullProject({ store: b.local, engine: b.sync, ref: id, cwd, force: true, appSyncs: false, fetch: cloud.fetch });
    expect(forced.ok).toBe(true);
    expect(fs.readFileSync(page, "utf8")).toBe("<h1>v1</h1>");
  });

  it("points at the working folder on the computer that made it, and explains what's missing", async () => {
    const { a, src, id } = madeOnA();
    const here = await pullProject({ store: a.local, engine: a.sync, ref: id, cwd: root, appSyncs: false });
    expect(here).toMatchObject({ ok: true, dir: src });

    const plain = a.local.openReview({ title: "No source", videoPath: video });
    expect((await pullProject({ store: a.local, engine: a.sync, ref: plain.review.id, cwd: root, appSyncs: false })).text).toContain("has no source files");
    expect((await pullProject({ store: a.local, engine: a.sync, ref: "Nothing like this", cwd: root, appSyncs: false })).ok).toBe(false);
  });

  it("asks for sync before bringing a cloud project here", async () => {
    const { a } = madeOnA();
    await a.run();
    const b = computer("b");
    setSyncEnabled(false, b.local.root);
    const result = await pullProject({ store: b.local, engine: b.sync, ref: "Launch Teaser", cwd: root, appSyncs: false, fetch: cloud.fetch });
    expect(result.text).toContain("framejam sync on");
  });
});

describe("limits and sharing", () => {
  it("pauses projects over the plan's limit with the cloud's reason", async () => {
    cloud.syncLimit = 2;
    const a = computer("a");
    const ids = ["One", "Two", "Three"].map((title) => a.local.openReview({ title, videoPath: video }).review.id);
    await a.run();
    expect(cloud.projects.size).toBe(2);
    const paused = ids.find((id) => !cloud.projects.has(id))!;
    expect(a.sync.status(paused)).toMatchObject({ state: "paused", error: expect.stringContaining("can sync 2 projects") });

    const check = () => (a.sync as unknown as { checkCloud(): Promise<void> }).checkCloud();
    await check();
    const kept = ids.find((id) => id !== paused)!;
    setProjectSync(kept, false, a.local.root);
    await a.sync.forget(kept);
    await check();
    await a.sync.idle();
    expect(cloud.projects.has(paused)).toBe(true);
    expect(a.sync.status(paused).state).toBe("synced");
  });

  it("shares a synced project through its cloud copy without uploading again", async () => {
    const a = computer("a");
    shareThroughSync({ api: () => cloud, isSynced: (id) => a.sync.isSynced(id), waitForUpload: (id, n) => a.sync.waitForUpload(id, n) });
    const { review } = a.local.openReview({ title: "Launch", videoPath: video });
    await a.run();
    cloud.calls.length = 0;
    const out = await shareVersion(a.local, review.id);
    expect(out.version).toBe(1);
    expect(cloud.calls).toContain("share");
    expect(cloud.calls).not.toContain("requestUpload");
  });
});

describe("the app's sync routes", () => {
  it("reports a project's sync and leaves it out, removing the cloud copy", async () => {
    const a = computer("a");
    const app = createApp({ store: a.local, baseUrl: "http://localhost:2400", sync: a.sync });
    const { review } = a.local.openReview({ title: "Launch", videoPath: video });
    await a.run();
    const status = await (await app.request(`/api/reviews/${review.id}/sync`)).json();
    expect(status.state).toBe("synced");
    const listed = await (await app.request("/api/reviews")).json();
    expect(listed[0].sync.state).toBe("synced");

    const off = await app.request(`/api/reviews/${review.id}/sync`, { method: "POST", body: JSON.stringify({ synced: false }), headers: { "content-type": "application/json" } });
    expect((await off.json()).state).toBe("left-out");
    expect(cloud.projects.has(review.id)).toBe(false);
  });

  it("won't turn sync on while signed out", async () => {
    const local = new JsonStore(path.join(root, "solo"));
    const sync = new SyncEngine({ local });
    const app = createApp({ store: local, baseUrl: "http://localhost:2400", sync });
    const health = await (await app.request("/api/health")).json();
    expect(health.sync).toMatchObject({ enabled: false, asked: false, signedIn: false });
    const res = await app.request("/api/sync", { method: "POST", body: JSON.stringify({ enabled: true }), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(409);
  });
});
