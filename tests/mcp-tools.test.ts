import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connectClient, makeFixture, parse, type ToolResult } from "./helpers.ts";

let fx: ReturnType<typeof makeFixture>;
let mcp: Awaited<ReturnType<typeof connectClient>>;

beforeEach(async () => {
  fx = makeFixture();
  mcp = await connectClient(fx.ctx);
});

afterEach(async () => {
  await mcp.close();
  fs.rmSync(fx.root, { recursive: true, force: true });
});

const open = async (extra: Record<string, unknown> = {}) =>
  parse(await mcp.call("open_review", { title: "Launch teaser", videoPath: fx.video, compositionDir: fx.compositionDir, ...extra }));

describe("tool registry", () => {
  it("exposes the review and preset tools", async () => {
    const { tools } = await mcp.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["add_version", "get_feedback", "get_preset", "get_selected_preset", "list_presets", "open_review", "resolve_comments", "wait_for_feedback"].sort(),
    );
  });
});

describe("open_review", () => {
  it("creates a review and returns its URL", async () => {
    const res = await open();
    expect(res.reviewId).toMatch(/^rev_/);
    expect(res.url).toBe(`http://localhost:4517/review/${res.reviewId}`);
    expect(res.version).toBe(1);
    expect(res.created).toBe(true);
    const review = fx.store.getReview(res.reviewId);
    expect(review.versions[0].compositionDir).toBe(fx.compositionDir);
    expect(review.versions[0].videoSnapshot).toBe("v1.mp4");
  });

  it("is idempotent for identical media, and adds a version once feedback was sent", async () => {
    const first = await open();
    const again = await open();
    expect(again.reviewId).toBe(first.reviewId);
    expect(again.version).toBe(1);

    fx.store.addComment(first.reviewId, { time: 1, text: "Tighten the intro" });
    fx.store.submit(first.reviewId);
    const v2 = await open({ note: "Tighter intro" });
    expect(v2.reviewId).toBe(first.reviewId);
    expect(v2.version).toBe(2);
    expect(v2.created).toBe(false);
    expect(v2.openComments).toBe(1);
  });

  it("rejects missing media", async () => {
    const res = await mcp.call("open_review", { videoPath: path.join(fx.root, "nope.mp4") });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("does not exist");
    const none = await mcp.call("open_review", { title: "x" });
    expect(none.isError).toBe(true);
  });
});

describe("wait_for_feedback", () => {
  it("returns pending when nothing is sent before the timeout", async () => {
    const { reviewId } = await open();
    const started = Date.now();
    const res = parse(await mcp.call("wait_for_feedback", { reviewId, timeoutSeconds: 1 }));
    expect(res.status).toBe("pending");
    expect(Date.now() - started).toBeGreaterThanOrEqual(950);
    expect(fx.store.getReview(reviewId).agentWaitingAt).toBeUndefined();
  });

  it("unblocks as soon as the user presses Send, with comments, element info and frames", async () => {
    const { reviewId } = await open();
    const pin = fx.store.addComment(reviewId, {
      time: 2.23,
      x: 0.85,
      y: 0.42,
      text: "Make this block a circle",
      source: "live",
      element: {
        selector: "#red-block",
        tagName: "div",
        tweens: [{ targets: ["#red-block"], start: 2.1, end: 2.9, ease: "power2.inOut", props: { rotation: 90 }, relation: "active" }],
      },
    });
    fx.store.saveThumbnail(reviewId, pin.id, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    fx.store.addComment(reviewId, { time: 3, endTime: 5.4, text: "Hold each column longer" });

    const waiting = mcp.call("wait_for_feedback", { reviewId, timeoutSeconds: 5 });
    await new Promise((r) => setTimeout(r, 150));
    expect(fx.store.getReview(reviewId).agentWaitingAt).toBeDefined();
    fx.store.submit(reviewId, "Keep the grid");

    const result = await waiting;
    const payload = parse(result);
    expect(payload.status).toBe("feedback");
    expect(payload.message).toBe("Keep the grid");
    expect(payload.comments).toHaveLength(2);
    const circle = payload.comments.find((c: { text: string }) => c.text.startsWith("Make"));
    expect(circle.at).toBe("0:02.23");
    expect(circle.element.selector).toBe("#red-block");
    expect(circle.position.description).toContain("right");
    expect(circle.thumbnailPath).toMatch(/\.jpg$/);
    const range = payload.comments.find((c: { kind: string }) => c.kind === "range");
    expect(range.at).toBe("0:03.00–0:05.40");
    expect(result.content.some((c) => c.type === "image" && c.mimeType === "image/jpeg")).toBe(true);
    const prompt = result.content[1].text!;
    expect(prompt).toContain("**[0:02.23]** Make this block a circle");
    expect(prompt).toContain("Active tween: #red-block { rotation: 90 }");

    // Delivered batches are not returned twice.
    const next = parse(await mcp.call("wait_for_feedback", { reviewId, timeoutSeconds: 1 }));
    expect(next.status).toBe("pending");
  });

  it("returns immediately when feedback was sent before the agent started waiting", async () => {
    const { reviewId } = await open();
    fx.store.addComment(reviewId, { time: 0.5, text: "Logo is too small" });
    fx.store.submit(reviewId);
    const started = Date.now();
    const payload = parse(await mcp.call("wait_for_feedback", { reviewId, timeoutSeconds: 5 }));
    expect(payload.status).toBe("feedback");
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("sends progress notifications while blocked", async () => {
    const { reviewId } = await open();
    const progress: number[] = [];
    const res = (await mcp.call("wait_for_feedback", { reviewId, timeoutSeconds: 1 }, { onprogress: (p) => progress.push(p.progress) })) as ToolResult;
    expect(parse(res).status).toBe("pending");
    expect(progress.length).toBeGreaterThan(0);
  });

  it("errors for unknown reviews", async () => {
    const res = await mcp.call("wait_for_feedback", { reviewId: "rev_missing" });
    expect(res.isError).toBe(true);
  });
});

describe("get_feedback", () => {
  it("returns open comments including unsent drafts, and can include resolved ones", async () => {
    const { reviewId } = await open();
    const a = fx.store.addComment(reviewId, { time: 1, text: "Draft note" });
    const b = fx.store.addComment(reviewId, { time: 2, text: "Sent note" });
    fx.store.submit(reviewId);
    fx.store.addComment(reviewId, { time: 3, text: "Another draft" });
    fx.store.resolveComments(reviewId, [a.id]);

    const open1 = parse(await mcp.call("get_feedback", { reviewId }));
    expect(open1.comments.map((c: { text: string }) => c.text)).toEqual(["Sent note", "Another draft"]);
    expect(open1.comments[0].status).toBe("sent");

    const all = parse(await mcp.call("get_feedback", { reviewId, include: "all" }));
    expect(all.comments).toHaveLength(3);
    const resolved = parse(await mcp.call("get_feedback", { reviewId, include: "resolved" }));
    expect(resolved.comments.map((c: { id: string }) => c.id)).toEqual([a.id]);
    expect(b.id).toBeDefined();

    // Pulling feedback also consumes pending batches so wait_for_feedback doesn't replay them.
    expect(fx.store.undeliveredBatches(reviewId)).toHaveLength(0);
  });
});

describe("resolve_comments and add_version", () => {
  it("resolves by id or 'all', recording the version and note", async () => {
    const { reviewId } = await open();
    const a = fx.store.addComment(reviewId, { time: 1, text: "One" });
    fx.store.addComment(reviewId, { time: 2, text: "Two" });
    fx.store.submit(reviewId);

    const v2 = parse(await mcp.call("add_version", { reviewId, videoPath: fx.video, note: "Fixes" }));
    expect(v2.version).toBe(2);
    expect(v2.openComments).toBe(2);
    expect(fx.store.getReview(reviewId).versions[1].compositionDir).toBe(fx.compositionDir);

    const r1 = parse(await mcp.call("resolve_comments", { reviewId, ids: [a.id, "c_missing"], note: "Bigger logo" }));
    expect(r1.resolved).toEqual([a.id]);
    expect(r1.missing).toEqual(["c_missing"]);
    expect(r1.stillOpen).toBe(1);
    const resolved = fx.store.getReview(reviewId).comments.find((c) => c.id === a.id)!;
    expect(resolved.resolution).toEqual({ version: 2, note: "Bigger logo" });

    const r2 = parse(await mcp.call("resolve_comments", { reviewId, ids: ["all"] }));
    expect(r2.resolved).toHaveLength(1);
    expect(r2.stillOpen).toBe(0);
  });

  it("keeps earlier renders watchable after the file is overwritten", async () => {
    const { reviewId } = await open();
    fx.store.addComment(reviewId, { time: 1, text: "x" });
    fx.store.submit(reviewId);
    fs.writeFileSync(fx.video, "overwritten");
    await mcp.call("add_version", { reviewId, videoPath: fx.video });
    const review = fx.store.getReview(reviewId);
    const v1 = fx.store.videoFileFor(reviewId, review.versions[0])!;
    expect(fs.statSync(v1).size).toBeGreaterThan(1000);
    expect(fs.readFileSync(fx.store.videoFileFor(reviewId, review.versions[1])!, "utf8")).toBe("overwritten");
  });
});

describe("presets", () => {
  it("lists and filters the seeded presets", async () => {
    const all = parse(await mcp.call("list_presets"));
    expect(all.count).toBeGreaterThanOrEqual(6);
    expect(all.count).toBeLessThanOrEqual(10);
    const vertical = parse(await mcp.call("list_presets", { format: "9:16" }));
    expect(vertical.presets.map((p: { id: string }) => p.id)).toContain("kinetic-captions");
    expect(vertical.presets.every((p: { format: string }) => p.format === "9:16")).toBe(true);
    const slow = parse(await mcp.call("list_presets", { pacing: "slow" }));
    expect(slow.presets.every((p: { pacing: string }) => p.pacing === "slow")).toBe(true);
    const q = parse(await mcp.call("list_presets", { query: "terminal" }));
    expect(q.presets[0].id).toBe("neon-terminal");
  });

  it("returns style.json, guide and template source", async () => {
    const res = parse(await mcp.call("get_preset", { id: "noir-quote" }));
    expect(res.style.palette.text).toMatch(/^#/);
    expect(res.style.fonts.display.family).toBe("Playfair Display");
    expect(res.guide.length).toBeGreaterThan(100);
    const index = res.templateFiles.find((f: { path: string }) => f.path === "index.html");
    expect(index.content).toContain('window.__timelines["noir-quote"]');
    expect(fs.existsSync(res.previewVideo)).toBe(true);
    const missing = await mcp.call("get_preset", { id: "nope" });
    expect(missing.isError).toBe(true);
  });

  it("every seeded preset has a valid style.json and a Hyperframes composition", async () => {
    const all = parse(await mcp.call("list_presets"));
    for (const { id } of all.presets) {
      const p = parse(await mcp.call("get_preset", { id }));
      for (const key of ["name", "tagline", "description", "palette", "fonts", "easing", "transitions", "textAnimations", "rhythm", "guide"]) {
        expect(p.style[key], `${id}.${key}`).toBeTruthy();
      }
      const html = p.templateFiles.find((f: { path: string }) => f.path === "index.html").content as string;
      expect(html, id).toContain(`data-composition-id="${id}"`);
      expect(html, id).toContain(`window.__timelines["${id}"]`);
      expect(html, id).toContain(`data-width="${p.style.width}"`);
    }
  });

  it("get_selected_preset reflects the gallery selection", async () => {
    const none = parse(await mcp.call("get_selected_preset"));
    expect(none.selected).toBeNull();
    fx.store.setSelectedPreset("retro-pop");
    const sel = parse(await mcp.call("get_selected_preset"));
    expect(sel.selected).toBe("retro-pop");
    expect(sel.style.format).toBe("1:1");
    expect(sel.templateFiles.length).toBeGreaterThan(0);
  });
});
