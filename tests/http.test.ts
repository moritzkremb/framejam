import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/server/app.ts";
import { BASE_URL, makeFixture, parse, type ToolResult } from "./helpers.ts";

let fx: ReturnType<typeof makeFixture>;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  fx = makeFixture();
  app = createApp(fx.ctx);
});

afterEach(() => {
  fs.rmSync(fx.root, { recursive: true, force: true });
});

const json = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("REST API used by the review UI", () => {
  it("adds comments (with captured thumbnails), sends them, and renders the prompt", async () => {
    const { review } = fx.store.openReview({ title: "Teaser", videoPath: fx.video });
    const tinyJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64");
    const res = await app.request(
      `/api/reviews/${review.id}/comments`,
      json({ time: 1.5, x: 0.2, y: 0.6, text: "Descenders are clipped", thumbnailDataUrl: `data:image/jpeg;base64,${tinyJpeg}` }),
    );
    expect(res.status).toBe(201);
    const comment = await res.json();
    expect(comment.status).toBe("draft");
    expect(comment.thumbnail).toBe(`${comment.id}.jpg`);

    const thumb = await app.request(`/api/reviews/${review.id}/thumbs/${comment.thumbnail}`);
    expect(thumb.headers.get("content-type")).toBe("image/jpeg");

    const empty = await app.request(`/api/reviews/${review.id}/comments`, json({ time: 1, text: "  " }));
    expect(empty.status).toBe(400);

    const sent = await (await app.request(`/api/reviews/${review.id}/submit`, json({ message: "Thanks!" }))).json();
    expect(sent.batch.commentIds).toEqual([comment.id]);
    const nothing = await app.request(`/api/reviews/${review.id}/submit`, json({}));
    expect(nothing.status).toBe(400);

    const prompt = await (await app.request(`/api/reviews/${review.id}/prompt`)).text();
    expect(prompt).toContain("# Video feedback: Teaser (v1)");
    expect(prompt).toContain("**[0:01.50]** Descenders are clipped");
  });

  it("serves video with HTTP range support", async () => {
    const { review } = fx.store.openReview({ videoPath: fx.video });
    const res = await app.request(`/api/reviews/${review.id}/versions/1/video`, { headers: { range: "bytes=0-99" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toMatch(/^bytes 0-99\/\d+$/);
    expect((await res.arrayBuffer()).byteLength).toBe(100);
  });

  it("saves a version's video where the save dialog says, or into downloads without one", async () => {
    const downloads = path.join(fx.root, "downloads");
    const { review } = fx.store.openReview({ title: "Launch: teaser", videoPath: fx.video });
    const download = () => app.request(`/api/reviews/${review.id}/versions/1/download`, { method: "POST" });

    const picked = path.join(fx.root, "picked.mp4");
    const asked: string[][] = [];
    app = createApp({ ...fx.ctx, downloadsDir: downloads, chooseSavePath: async (name, dir) => (asked.push([name, dir]), picked) });
    expect(await (await download()).json()).toEqual({ path: picked, chosen: true });
    expect(asked).toEqual([["Launch- teaser v1.mp4", downloads]]);
    expect(fs.readFileSync(picked).equals(fs.readFileSync(fx.video))).toBe(true);

    app = createApp({ ...fx.ctx, downloadsDir: downloads, chooseSavePath: async () => null });
    expect(await (await download()).json()).toEqual({ cancelled: true });

    app = createApp({ ...fx.ctx, downloadsDir: downloads, chooseSavePath: async () => undefined });
    expect((await (await download()).json()).path).toBe(path.join(downloads, "Launch- teaser v1.mp4"));
    expect((await (await download()).json()).path).toBe(path.join(downloads, "Launch- teaser v1 (2).mp4"));
    const missing = await app.request(`/api/reviews/${review.id}/versions/9/download`, { method: "POST" });
    expect(missing.status).toBe(404);
  });

  it("adds the next render to a project from before videos were mp4-only, matching it by title", async () => {
    const { review } = fx.store.openReview({ title: "Teaser", videoPath: fx.video });
    const file = path.join(fx.store.reviewsDir, `${review.id}.json`);
    const legacy = JSON.parse(fs.readFileSync(file, "utf8"));
    legacy.projectKey = fx.compositionDir;
    legacy.versions[0].compositionDir = fx.compositionDir;
    fs.writeFileSync(file, JSON.stringify(legacy));

    const v2 = path.join(fx.project, "renders", "v2.mp4");
    fs.copyFileSync(fx.video, v2);
    const next = fx.store.openReview({ title: "teaser", videoPath: v2 });
    expect(next.review.id).toBe(review.id);
    expect(next.version.number).toBe(2);
    expect(next.version).not.toHaveProperty("compositionDir");
    expect((await app.request(`/api/reviews/${review.id}/versions/1/video`)).status).toBe(200);
  });

  it("selects a preset for the agent", async () => {
    const res = await app.request("/api/selected-preset", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "data-story" }) });
    expect((await res.json()).id).toBe("data-story");
    expect(fx.store.getState().selectedPreset?.id).toBe("data-story");
    const bad = await app.request("/api/selected-preset", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "nope" }) });
    expect(bad.status).toBe(404);
  });
});

describe("MCP over streamable HTTP", () => {
  it("runs the one-click loop: wait_for_feedback unblocks when the UI posts Send", async () => {
    const client = new Client({ name: "http-test", version: "0.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${BASE_URL}/mcp`), {
        fetch: async (input, init) => app.fetch(new Request(input, init)),
      }),
    );
    const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args }) as Promise<ToolResult>;

    const opened = parse(await call("open_review", { title: "HTTP teaser", videoPath: fx.video }));
    const waiting = call("wait_for_feedback", { reviewId: opened.reviewId, timeoutSeconds: 5 });

    await new Promise((r) => setTimeout(r, 200));
    await app.request(`/api/reviews/${opened.reviewId}/comments`, json({ time: 4.2, text: "Swap the outro color" }));
    await app.request(`/api/reviews/${opened.reviewId}/submit`, json({}));

    const payload = parse(await waiting);
    expect(payload.status).toBe("feedback");
    expect(payload.comments.map((c: { text: string }) => c.text)).toEqual(["Swap the outro color"]);
    await client.close();
  });

  it("flags an agent whose MCP process runs code that has since changed on disk", async () => {
    const { review } = fx.store.openReview({ title: "Teaser", videoPath: fx.video });
    const entry = path.join(fx.root, "cli.js");
    fs.writeFileSync(entry, "v1");
    const build = createHash("sha1").update("v1").digest("hex");
    const stateFile = path.join(fx.store.root, "state.json");
    fs.writeFileSync(stateFile, JSON.stringify({ agent: { name: "Cursor", at: new Date(Date.now() - 60_000).toISOString(), entry, build } }));
    const outdated = async () => (await (await app.request(`/api/reviews/${review.id}`)).json()).agentOutdated;
    expect(await outdated()).toBe(false);

    // A rebuild that rewrites identical code is not a new version.
    fs.writeFileSync(entry, "v1");
    expect(await outdated()).toBe(false);

    fs.writeFileSync(entry, "v2");
    fs.utimesSync(entry, new Date(), new Date(Date.now() + 1000));
    expect(await outdated()).toBe(true);
  });

  it("falls back to modification time for agents recorded without a build hash", async () => {
    const { review } = fx.store.openReview({ title: "Teaser", videoPath: fx.video });
    const entry = path.join(fx.root, "cli.js");
    fs.writeFileSync(entry, "");
    const connectedAt = new Date(Date.now() - 60_000);
    fs.utimesSync(entry, new Date(connectedAt.getTime() - 60_000), new Date(connectedAt.getTime() - 60_000));
    const stateFile = path.join(fx.store.root, "state.json");
    fs.writeFileSync(stateFile, JSON.stringify({ agent: { name: "Cursor", at: connectedAt.toISOString(), entry } }));
    const outdated = async () => (await (await app.request(`/api/reviews/${review.id}`)).json()).agentOutdated;
    expect(await outdated()).toBe(false);

    fs.utimesSync(entry, new Date(), new Date());
    expect(await outdated()).toBe(true);
  });
});
