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
import { createApp } from "../src/server/app.ts";
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
