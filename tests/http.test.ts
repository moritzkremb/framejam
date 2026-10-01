import fs from "node:fs";
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
    const { review } = fx.store.openReview({ title: "Teaser", videoPath: fx.video, compositionDir: fx.compositionDir });
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

  it("serves the composition with the Hyperframes runtime injected and GSAP served locally", async () => {
    const { review } = fx.store.openReview({ compositionDir: fx.compositionDir });
    const html = await (await app.request(`/api/reviews/${review.id}/versions/1/composition/`)).text();
    expect(html).toContain('data-framecut="hyperframes-runtime"');
    expect(html).toContain('src="/vendor/gsap/gsap.min.js"');
    expect(html).not.toContain("cdn.jsdelivr.net/npm/gsap");
    const gsap = await app.request("/vendor/gsap/gsap.min.js");
    expect(gsap.status).toBe(200);
    const escape = await app.request(`/api/reviews/${review.id}/versions/1/composition/..%2F..%2Fsecret`);
    expect([403, 404]).toContain(escape.status);
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
});
