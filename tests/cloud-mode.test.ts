import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppStore } from "../src/server/app-store.ts";
import { CloudStore } from "../src/server/cloud-store.ts";
import { setCloudMode } from "../src/server/cloud-mode.ts";
import { JsonStore } from "../src/server/json-store.ts";
import { listZip, zipFolder } from "../src/server/zip.ts";
import { createApp } from "../src/server/app.ts";
import { configureShare, shareVersion } from "../src/server/share.ts";
import type { McpContext } from "../src/server/mcp.ts";
import { packageRoot } from "../src/server/paths.ts";
import { fixturePreset, connectClient, parse } from "./helpers.ts";
import { FakeCloud } from "./fake-cloud.ts";

let root: string;
let video: string;
let cloud: FakeCloud;
let store: AppStore;
let ctx: McpContext;

const poster = async () => undefined;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "framejam-cloudmode-"));
  video = path.join(root, "v1.mp4");
  fs.copyFileSync(path.join(fixturePreset, "preview.mp4"), video);
  cloud = new FakeCloud();
  store = new AppStore(new JsonStore(path.join(root, "data")), { api: cloud, fetch: cloud.fetch, cacheMs: 0, retryDelayMs: 0, posterFrame: poster });
  ctx = { store, baseUrl: "http://localhost:2400", waitSeconds: 2, pollMs: 20, progressEveryMs: 100 };
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const cloudStore = () => store.cloud() as CloudStore;

describe("cloud mode off", () => {
  it("is the local store, and never calls the cloud", async () => {
    const { review } = await store.openReview({ title: "Local", videoPath: video });
    expect(await store.isCloud(review.id)).toBe(false);
    expect(store.local.findReview(review.id)).toBeDefined();
    await store.listReviews();
    expect(cloud.calls).toEqual([]);
  });
});

describe("cloud mode on", () => {
  beforeEach(() => setCloudMode(true, store.local.root));

  it("makes new projects in the cloud and keeps local ones local", async () => {
    setCloudMode(false, store.local.root);
    const { review: local } = await store.openReview({ title: "Old project", videoPath: video });
    setCloudMode(true, store.local.root);

    const { review: made } = await store.openReview({ title: "New project", videoPath: video });
    expect(await store.isCloud(made.id)).toBe(true);
    expect(await store.isCloud(local.id)).toBe(false);
    expect(store.local.findReview(made.id)).toBeUndefined();
    expect(cloud.projects.has(made.id)).toBe(true);
    expect(cloud.projects.has(local.id)).toBe(false);

    const titles = (await store.listReviews()).map((r) => r.title).sort();
    expect(titles).toEqual(["New project", "Old project"]);
  });

  it("follows `framejam cloud off` without a restart", async () => {
    const { review } = await store.openReview({ title: "In the cloud", videoPath: video });
    expect(store.cloud()).toBeDefined();
    setCloudMode(false, store.local.root);
    expect(store.cloud()).toBeUndefined();
    expect((await store.listReviews()).map((r) => r.id)).not.toContain(review.id);
    setCloudMode(true, store.local.root);
    expect((await store.listReviews()).map((r) => r.id)).toContain(review.id);
  });

  it("shows the upload state until the files are in the cloud", async () => {
    let release!: () => void;
    cloud.gate = new Promise<void>((resolve) => (release = resolve));
    const { review } = await store.openReview({ title: "Uploading", videoPath: video });
    const during = (await store.getReview(review.id)).versions[0]!;
    expect(during.upload?.state).toBe("uploading");
    expect(during.upload?.total).toBeGreaterThan(0);

    release();
    await cloudStore().waitForUpload(review.id, 1);
    const after = (await store.getReview(review.id)).versions[0]!;
    expect(after.upload).toBeUndefined();
    const key = [...cloud.objects.keys()].find((k) => k.endsWith(".mp4"));
    expect(key).toBeDefined();
    expect(cloud.objects.get(key!)!.bytes.length).toBe(fs.statSync(video).size);
  });

  it("tries a dropped upload again before giving up", async () => {
    cloud.failPuts = 2;
    const { review } = await store.openReview({ title: "Shaky", videoPath: video });
    await cloudStore().waitForUpload(review.id, 1);
    expect((await store.getReview(review.id)).versions[0]!.upload).toBeUndefined();
    expect(cloud.failPuts).toBe(0);
  });

  it("marks a failed upload, and retries it when the project is opened again or the app restarts", async () => {
    cloud.failPuts = 99;
    const { review } = await store.openReview({ title: "Flaky", videoPath: video });
    await expect(cloudStore().waitForUpload(review.id, 1, 5_000)).rejects.toThrow(/didn't finish uploading/);
    expect((await store.getReview(review.id)).versions[0]!.upload?.state).toBe("failed");

    cloud.failPuts = 0;
    const again = await store.openReview({ title: "Flaky", videoPath: video, reviewId: review.id });
    expect(again.created).toBe(false);
    await cloudStore().waitForUpload(review.id, 1);
    expect((await store.getReview(review.id)).versions[0]!.upload).toBeUndefined();

    cloud.failPuts = 99;
    fs.appendFileSync(video, "next");
    await store.addVersion(review.id, { videoPath: video });
    await expect(cloudStore().waitForUpload(review.id, 2, 5_000)).rejects.toThrow(/didn't finish uploading/);
    cloud.failPuts = 0;
    const restarted = new AppStore(new JsonStore(store.local.root), { api: cloud, fetch: cloud.fetch, cacheMs: 0, retryDelayMs: 0, posterFrame: poster });
    expect(await restarted.cloud()!.resumeUploads()).toBe(1);
    await restarted.cloud()!.waitForUpload(review.id, 2);
    expect((await restarted.getReview(review.id)).versions[1]!.upload).toBeUndefined();
  });

  it("keeps an earlier version's file when the agent overwrites the render", async () => {
    const { review } = await store.openReview({ title: "Overwrite", videoPath: video });
    await cloudStore().waitForUpload(review.id, 1);
    const first = fs.readFileSync(video);
    fs.writeFileSync(video, Buffer.concat([first, Buffer.from("changed")]));
    await store.addVersion(review.id, { videoPath: video, note: "second" });
    await cloudStore().waitForUpload(review.id, 2);

    const full = await store.getReview(review.id);
    const file1 = await store.videoFileFor(review.id, full.versions[0]!);
    const file2 = await store.videoFileFor(review.id, full.versions[1]!);
    expect(fs.readFileSync(file1!).equals(first)).toBe(true);
    expect(fs.readFileSync(file2!).length).toBe(first.length + "changed".length);
  });

  it("downloads a version from the cloud when this computer has no copy", async () => {
    const { review } = await store.openReview({ title: "Elsewhere", videoPath: video });
    await cloudStore().waitForUpload(review.id, 1);
    fs.rmSync(path.join(store.local.root, "cloud"), { recursive: true, force: true });

    const fresh = new AppStore(new JsonStore(store.local.root), { api: cloud, fetch: cloud.fetch, cacheMs: 0, posterFrame: poster });
    const version = (await fresh.getReview(review.id)).versions[0]!;
    const file = await fresh.videoFileFor(review.id, version);
    expect(file).toBeDefined();
    expect(fs.readFileSync(file!).equals(fs.readFileSync(video))).toBe(true);
  });
});

describe("an agent in cloud mode", () => {
  beforeEach(() => setCloudMode(true, store.local.root));

  it("opens, gets a comment, waits for feedback, adds a version and resolves", async () => {
    const mcp = await connectClient(ctx);
    try {
      const opened = parse(await mcp.call("open_review", { title: "Cloud teaser", videoPath: video }));
      expect(opened.created).toBe(true);
      const reviewId = opened.reviewId as string;
      expect(cloud.projects.has(reviewId)).toBe(true);

      const comment = await store.addComment(reviewId, { time: 1.5, text: "Tighten the intro", version: 1 });
      expect(comment.status).toBe("draft");

      const waiting = mcp.call("wait_for_feedback", { reviewId, timeoutSeconds: 5 });
      await new Promise((r) => setTimeout(r, 250));
      expect(await store.agentListening(reviewId)).toBe(true);
      await store.submit(reviewId, "Mostly good");
      const feedback = parse(await waiting);
      expect(feedback.status).toBe("feedback");
      expect(feedback.comments.map((c: { text: string }) => c.text)).toEqual(["Tighten the intro"]);
      expect(feedback.message).toBe("Mostly good");

      fs.appendFileSync(video, "more");
      const added = parse(await mcp.call("add_version", { reviewId, videoPath: video, note: "Tighter intro" }));
      expect(added.version).toBe(2);

      const resolved = parse(await mcp.call("resolve_comments", { reviewId, ids: [comment.id], note: "Cut 2s" }));
      expect(resolved.resolved).toEqual([comment.id]);

      await cloudStore().waitForUpload(reviewId, 2);
      const review = await store.getReview(reviewId);
      expect(review.versions.map((v) => v.upload)).toEqual([undefined, undefined]);
      expect(review.comments[0]!.status).toBe("resolved");
      expect(review.comments[0]!.resolution?.version).toBe(2);
    } finally {
      await mcp.close();
    }
  });
});

describe("notes and source files", () => {
  beforeEach(() => setCloudMode(true, store.local.root));

  let project: string;
  beforeEach(() => {
    project = path.join(root, "teaser");
    fs.mkdirSync(path.join(project, "src"), { recursive: true });
    fs.mkdirSync(path.join(project, "node_modules/dep"), { recursive: true });
    fs.writeFileSync(path.join(project, "index.html"), "<h1>teaser</h1>");
    fs.writeFileSync(path.join(project, "src/scene.ts"), "export {};");
    fs.writeFileSync(path.join(project, "node_modules/dep/index.js"), "x");
    fs.writeFileSync(path.join(project, ".env"), "SECRET=1");
  });

  const zipNames = (file: string) => listZip(file).map((e) => e.name).sort();

  it("uploads the packed folder with the version and downloads it again", async () => {
    const { review } = await store.openReview({ title: "With source", videoPath: video, notes: "## v1\nRender: `npx hyperframes render`", source: project });
    const queued = (await store.getReview(review.id)).versions[0]!;
    expect(queued.notes).toContain("npx hyperframes render");
    expect(queued.source).toMatchObject({ filename: "teaser-source.zip", ready: false });
    expect(queued.upload?.total).toBeGreaterThan(fs.statSync(video).size);

    await cloudStore().waitForUpload(review.id, 1);
    const done = (await store.getReview(review.id)).versions[0]!;
    expect(done.upload).toBeUndefined();
    expect(done.source).toMatchObject({ filename: "teaser-source.zip", ready: true });
    expect(cloud.calls.filter((c) => c === "versionReady")).toHaveLength(1);

    const got = await store.sourceFor(review.id, 1);
    expect(got).toMatchObject({ filename: "teaser-source.zip" });
    const bytes = cloud.objects.get(new URL(got!.url).pathname.slice(1))!.bytes;
    const file = path.join(root, "downloaded.zip");
    fs.writeFileSync(file, bytes);
    expect(zipNames(file)).toEqual(["index.html", "src/scene.ts"]);
  });

  it("takes a zip the agent made, and refuses a source that isn't a folder or a zip", async () => {
    const made = path.join(root, "mine.zip");
    await zipFolder(project, made);
    const { review } = await store.openReview({ title: "Zip given", videoPath: video, source: made });
    await cloudStore().waitForUpload(review.id, 1);
    expect((await store.getReview(review.id)).versions[0]!.source).toMatchObject({ filename: "mine.zip", ready: true });

    fs.appendFileSync(video, "more");
    await expect(store.addVersion(review.id, { videoPath: video, source: path.join(root, "missing.zip") })).rejects.toThrow(/does not exist/);
    await expect(store.addVersion(review.id, { videoPath: video, source: path.join(project, "index.html") })).rejects.toThrow(/project folder or a \.zip/);
    expect((await store.getReview(review.id)).versions).toHaveLength(1);
  });

  it("keeps versions without source as they were, and says so", async () => {
    const { review } = await store.openReview({ title: "Plain", videoPath: video, notes: "just notes" });
    await cloudStore().waitForUpload(review.id, 1);
    expect(await store.sourceFor(review.id, 1)).toBeUndefined();
    const v = (await store.getReview(review.id)).versions[0]!;
    expect(v.source).toBeUndefined();
    expect(v.notes).toBe("just notes");
  });

  it("lets a failed upload try again with the source still on this computer", async () => {
    cloud.failPuts = 99;
    const { review } = await store.openReview({ title: "Retry source", videoPath: video, source: project });
    await expect(cloudStore().waitForUpload(review.id, 1, 5_000)).rejects.toThrow(/didn't finish uploading/);
    cloud.failPuts = 0;
    const again = await store.openReview({ title: "Retry source", videoPath: video, reviewId: review.id, source: project });
    expect(again.created).toBe(false);
    await cloudStore().waitForUpload(review.id, 1);
    expect((await store.getReview(review.id)).versions[0]!.source?.ready).toBe(true);
  });

  it("is what an agent in another chat reads from the link alone, then continues", async () => {
    const mcp = await connectClient(ctx);
    try {
      const opened = parse(await mcp.call("open_review", { title: "Handoff", videoPath: video, notes: "v1 notes", source: project }));
      expect(opened.source).toMatchObject({ filename: "teaser-source.zip" });
      const reviewId = opened.reviewId as string;
      await cloudStore().waitForUpload(reviewId, 1);

      fs.appendFileSync(video, "two");
      const added = parse(
        await mcp.call("add_version", { reviewId, videoPath: video, note: "Faster", notes: "## What changed\n- cut 2s\n\nRender: `npx hyperframes render`", source: project }),
      );
      expect(added).toMatchObject({ version: 2, notesSaved: true });
      await cloudStore().waitForUpload(reviewId, 2);

      const link = `https://app.framejam.ai/p/${reviewId}?v=1`;
      const first = parse(await mcp.call("get_version", { reviewId: link }));
      expect(first).toMatchObject({ reviewId, version: 1, latestVersion: 2, notes: "v1 notes" });
      expect(first.source.downloadUrl).toContain("https://r2.test/");
      expect(first.source.command).toContain("curl -L -o 'teaser-source.zip'");
      expect(first.versions).toEqual([
        { number: 1, hasNotes: true, hasSource: true },
        { number: 2, note: "Faster", hasNotes: true, hasSource: true },
      ]);

      const latest = parse(await mcp.call("get_version", { reviewId }));
      expect(latest.version).toBe(2);
      expect(latest.notes).toContain("npx hyperframes render");

      const third = parse(await mcp.call("add_version", { reviewId: `https://app.framejam.ai/p/${reviewId}`, videoPath: video, notes: "v3 from the link" }));
      expect(third.version).toBe(3);
      const missing = await mcp.call("get_version", { reviewId, version: 9 });
      expect(missing.isError).toBe(true);
    } finally {
      await mcp.close();
    }
  });

  it("keeps notes on a local project and says the source wasn't attached", async () => {
    setCloudMode(false, store.local.root);
    const mcp = await connectClient(ctx);
    try {
      const opened = parse(await mcp.call("open_review", { title: "Local notes", videoPath: video, notes: "kept", source: project }));
      expect(opened).toMatchObject({ notesSaved: true });
      expect(opened.source.attached).toBe(false);
      const got = parse(await mcp.call("get_version", { reviewId: opened.reviewId as string }));
      expect(got).toMatchObject({ notes: "kept", source: null });
    } finally {
      await mcp.close();
    }
  });

  it("shows notes to guests only when the creator turns it on, and never the source", async () => {
    const { review } = await store.openReview({ title: "Notes link", videoPath: video, notes: "private how-to", source: project });
    await cloudStore().waitForUpload(review.id, 1);
    await shareVersion(store, review.id, {});
    expect((await cloud.link(review.id))?.showNotes).toBe(false);

    const on = await configureShare(store, review.id, { showNotes: true }, {});
    expect(on.showNotes).toBe(true);
    expect((await cloud.link(review.id))?.showNotes).toBe(true);
    const off = await configureShare(store, review.id, { showNotes: false }, {});
    expect(off.showNotes).toBe(false);

    const app = createApp(ctx);
    const body = (await (await app.request(`/api/reviews/${review.id}/share/settings`, { method: "POST", body: JSON.stringify({ showNotes: true }), headers: { "content-type": "application/json" } })).json()) as { showNotes: boolean };
    expect(body.showNotes).toBe(true);
  });

  it("serves a fresh download link to the app", async () => {
    const app = createApp(ctx);
    const { review } = await store.openReview({ title: "App link", videoPath: video, source: project });
    await cloudStore().waitForUpload(review.id, 1);
    const ok = await app.request(`/api/reviews/${review.id}/versions/1/source`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ filename: "teaser-source.zip" });
    expect((await app.request(`/api/reviews/${review.id}/versions/2/source`)).status).toBe(404);
  });
});

describe("the app", () => {
  it("reports cloud mode and flags cloud projects", async () => {
    const app = createApp(ctx);
    const health = async () => (await (await app.request("/api/health")).json()) as { cloud: { on: boolean; signedOut: boolean } };
    expect((await health()).cloud).toEqual({ on: false, signedOut: false });

    setCloudMode(true, store.local.root);
    expect((await health()).cloud).toEqual({ on: true, signedOut: false });

    const { review } = await store.openReview({ title: "Flagged", videoPath: video });
    const list = (await (await app.request("/api/reviews")).json()) as { id: string; cloud?: boolean }[];
    expect(list.find((r) => r.id === review.id)?.cloud).toBe(true);
    const one = (await (await app.request(`/api/reviews/${review.id}`)).json()) as { cloud?: boolean };
    expect(one.cloud).toBe(true);

    setCloudMode(false, store.local.root);
    const local = await store.openReview({ title: "Plain", videoPath: video });
    const plain = (await (await app.request(`/api/reviews/${local.review.id}`)).json()) as { cloud?: boolean };
    expect(plain.cloud).toBeUndefined();
  });
});

describe("framejam cloud", () => {
  const run = promisify(execFile);
  const cli = (home: string, ...args: string[]) =>
    run(process.execPath, ["--import", "tsx", path.join(packageRoot, "src/server/cli.ts"), ...args], {
      cwd: packageRoot,
      env: { ...process.env, FRAMEJAM_HOME: home },
    }).then(
      (r) => ({ code: 0, out: r.stdout + r.stderr }),
      (e: { code?: number; stdout?: string; stderr?: string }) => ({ code: e.code ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") }),
    );

  it("reports off by default, refuses to turn on signed out, and turns off", async () => {
    const home = path.join(root, "cli-home");
    fs.mkdirSync(home);
    const status = await cli(home, "cloud");
    expect(status.out).toContain("Cloud mode is off");

    const on = await cli(home, "cloud", "on");
    expect(on.code).not.toBe(0);
    expect(on.out).toContain("framejam login");
    expect(fs.existsSync(path.join(home, "cloud.json"))).toBe(false);

    setCloudMode(true, home);
    const signedOut = await cli(home, "cloud", "status");
    expect(signedOut.out).toContain("signed out");

    const off = await cli(home, "cloud", "off");
    expect(off.code).toBe(0);
    expect(off.out).toContain("Cloud mode is off");
    expect(JSON.parse(fs.readFileSync(path.join(home, "cloud.json"), "utf8")).enabled).toBe(false);
  });
});
