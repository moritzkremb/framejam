import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { builtinPresetsDir } from "../src/server/paths.ts";
import { connectClient, makeFixture, parse, samplePlaybook, writePlaybook, type ToolResult } from "./helpers.ts";

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
  parse(await mcp.call("open_review", { title: "Launch teaser", videoPath: fx.video, ...extra }));

describe("tool registry", () => {
  it("exposes the review and preset tools", async () => {
    const { tools } = await mcp.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "add_version",
        "get_feedback",
        "get_playbook",
        "get_preset",
        "get_selected_playbook",
        "get_selected_preset",
        "list_playbooks",
        "list_presets",
        "list_reviews",
        "open_review",
        "resolve_comments",
        "wait_for_feedback",
      ].sort(),
    );
  });

  it("remembers which harness connected", () => {
    expect(fx.store.getState().agent?.name).toBe("test");
  });
});

describe("open_review", () => {
  it("creates a review and returns its URL", async () => {
    const res = await open();
    expect(res.reviewId).toMatch(/^rev_/);
    expect(res.url).toBe(`http://localhost:2400/review/${res.reviewId}`);
    expect(res.version).toBe(1);
    expect(res.created).toBe(true);
    const review = fx.store.getReview(res.reviewId);
    expect(review.versions[0].videoSnapshot).toBe("v1.mp4");
  });

  it("ignores compositionDir from agents with an older skill and plays the render", async () => {
    const res = await open({ compositionDir: fx.compositionDir });
    expect(res.version).toBe(1);
    expect(fx.store.getReview(res.reviewId).versions[0]).not.toHaveProperty("compositionDir");
    const only = await mcp.call("open_review", { title: "No render", compositionDir: fx.compositionDir });
    expect(only.isError).toBe(true);
    expect(only.content[0].text).toContain("videoPath");
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
    const review = fx.store.getReview(first.reviewId);
    expect(review.comments.filter((c) => c.version === 2)).toHaveLength(0);
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
    // Still "listening" through the gap until the agent's next call.
    expect(fx.store.agentListening(reviewId)).toBe(true);
  });

  it("unblocks as soon as the user presses Send, with comments, pins and frames", async () => {
    const { reviewId } = await open();
    const pin = fx.store.addComment(reviewId, { time: 2.23, x: 0.85, y: 0.42, text: "Make this block a circle" });
    fx.store.saveThumbnail(reviewId, pin.id, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    fx.store.addComment(reviewId, { time: 3, endTime: 5.4, text: "Hold each column longer" });

    const waiting = mcp.call("wait_for_feedback", { reviewId, timeoutSeconds: 5 });
    await new Promise((r) => setTimeout(r, 150));
    expect(fx.store.agentListening(reviewId)).toBe(true);
    fx.store.submit(reviewId, "Keep the grid");

    const result = await waiting;
    const payload = parse(result);
    expect(payload.status).toBe("feedback");
    expect(payload.message).toBe("Keep the grid");
    expect(payload.comments).toHaveLength(2);
    const circle = payload.comments.find((c: { text: string }) => c.text.startsWith("Make"));
    expect(circle.at).toBe("0:02.23");
    expect(circle.position.description).toContain("right");
    expect(circle.thumbnailPath).toMatch(/\.jpg$/);
    const range = payload.comments.find((c: { kind: string }) => c.kind === "range");
    expect(range.at).toBe("0:03.00–0:05.40");
    expect(result.content.some((c) => c.type === "image" && c.mimeType === "image/jpeg")).toBe(true);
    const prompt = result.content[1].text!;
    expect(prompt).toContain("**[0:02.23]** Make this block a circle");
    expect(prompt).toContain("  - Frame with pin: ");
    expect(result.content.some((c) => c.type === "text" && c.text?.startsWith(`Frame (pin marked) for comment ${pin.id}`))).toBe(true);

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

describe("versions are rounds", () => {
  it("Send locks the version: no new, edited or deleted comments until the next version", async () => {
    const { reviewId } = await open();
    const c = fx.store.addComment(reviewId, { time: 1, text: "First" });
    fx.store.submit(reviewId);
    expect(fx.store.getReview(reviewId).versions[0].sentAt).toBeDefined();
    expect(() => fx.store.addComment(reviewId, { time: 2, text: "Late" })).toThrow(/already sent/);
    expect(() => fx.store.updateComment(reviewId, c.id, { text: "Edited" })).toThrow(/already sent/);
    expect(() => fx.store.deleteComment(reviewId, c.id)).toThrow(/already sent/);
    expect(() => fx.store.submit(reviewId)).toThrow(/already sent/);

    await mcp.call("add_version", { reviewId, videoPath: fx.video, note: "Fixed" });
    const next = fx.store.addComment(reviewId, { time: 1, text: "Round two" });
    expect(next.version).toBe(2);
    expect(() => fx.store.addComment(reviewId, { version: 1, time: 1, text: "Old" })).toThrow(/not the latest/);
  });

  it("reopening before the agent picks it up withdraws the round", async () => {
    const { reviewId } = await open();
    const c = fx.store.addComment(reviewId, { time: 1, text: "First" });
    fx.store.submit(reviewId);
    expect(fx.store.reopen(reviewId).wasDelivered).toBe(false);
    const review = fx.store.getReview(reviewId);
    expect(review.versions[0].sentAt).toBeUndefined();
    expect(review.batches).toHaveLength(0);
    fx.store.updateComment(reviewId, c.id, { text: "Edited" });
    fx.store.submit(reviewId);
    const payload = parse(await mcp.call("wait_for_feedback", { reviewId, timeoutSeconds: 1 }));
    expect(payload.revised).toBeUndefined();
    expect(payload.comments.map((x: { text: string }) => x.text)).toEqual(["Edited"]);
  });

  it("reopening after delivery sends a revised list that replaces the old one", async () => {
    const { reviewId } = await open();
    fx.store.addComment(reviewId, { time: 1, text: "First" });
    fx.store.submit(reviewId);
    await mcp.call("wait_for_feedback", { reviewId, timeoutSeconds: 1 });
    expect(fx.store.reopen(reviewId).wasDelivered).toBe(true);
    fx.store.addComment(reviewId, { time: 2, text: "Second" });
    fx.store.submit(reviewId);
    const payload = parse(await mcp.call("wait_for_feedback", { reviewId, timeoutSeconds: 1 }));
    expect(payload.revised).toBe(true);
    expect(payload.message).toMatch(/replaces the earlier one/);
    expect(payload.comments).toHaveLength(2);
    expect(() => fx.store.reopen(reviewId) && fx.store.reopen(reviewId)).toThrow(/nothing to reopen/);
  });

  it("moves unsent comments forward when the agent ships a version first", async () => {
    const { reviewId } = await open();
    fx.store.addComment(reviewId, { time: 1, text: "Not sent yet" });
    await mcp.call("add_version", { reviewId, videoPath: fx.video });
    const review = fx.store.getReview(reviewId);
    expect(review.comments[0].version).toBe(2);
  });
});

describe("get_feedback", () => {
  it("delivers the sent round, and sends unsent comments when the user never pressed Send", async () => {
    const { reviewId } = await open();
    fx.store.addComment(reviewId, { time: 1, text: "Sent note" });
    fx.store.submit(reviewId);
    const sent = parse(await mcp.call("get_feedback", { reviewId }));
    expect(sent.status).toBe("feedback");
    expect(sent.comments.map((c: { text: string }) => c.text)).toEqual(["Sent note"]);
    // Pulling feedback consumes pending batches so wait_for_feedback doesn't replay them.
    expect(fx.store.undeliveredBatches(reviewId)).toHaveLength(0);
    const again = parse(await mcp.call("get_feedback", { reviewId }));
    expect(again.status).toBe("already_delivered");

    await mcp.call("add_version", { reviewId, videoPath: fx.video });
    fx.store.addComment(reviewId, { time: 2, text: "Typed but not sent" });
    const auto = parse(await mcp.call("get_feedback", {}));
    expect(auto.reviewId).toBe(reviewId);
    expect(auto.comments.map((c: { text: string }) => c.text)).toEqual(["Typed but not sent"]);
    expect(fx.store.getReview(reviewId).versions[1].sentAt).toBeDefined();

    const all = parse(await mcp.call("get_feedback", { reviewId, include: "all" }));
    expect(all.comments).toHaveLength(2);
  });

  it("without a reviewId, picks the review whose feedback hasn't been delivered", async () => {
    const a = await open();
    const b = parse(await mcp.call("open_review", { title: "Other", videoPath: fx.video }));
    fx.store.addComment(a.reviewId, { time: 1, text: "For A" });
    fx.store.submit(a.reviewId);
    expect(b.reviewId).not.toBe(a.reviewId);
    const res = parse(await mcp.call("get_feedback", {}));
    expect(res.reviewId).toBe(a.reviewId);
  });
});

describe("list_reviews", () => {
  it("lists reviews with where each round stands", async () => {
    const { reviewId } = await open();
    const empty = parse(await mcp.call("list_reviews"));
    expect(empty.reviews[0]).toMatchObject({
      reviewId,
      latestVersion: 1,
      state: "awaiting_user",
      videoPath: fx.video,
    });
    fx.store.addComment(reviewId, { time: 1, text: "x" });
    fx.store.submit(reviewId);
    const sent = parse(await mcp.call("list_reviews"));
    expect(sent.reviews[0].state).toBe("sent_not_delivered");
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
    const noRender = await mcp.call("add_version", { reviewId, note: "Forgot the render" });
    expect(noRender.isError).toBe(true);

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

describe("storyboards", () => {
  /** A folder of panel images; the bytes don't matter, only the files. */
  const makeBoard = (names: string[]) => {
    const dir = path.join(fx.project, "storyboard");
    fs.mkdirSync(dir, { recursive: true });
    for (const n of names) fs.writeFileSync(path.join(dir, n), `img:${n}`);
    return dir;
  };

  it("opens a storyboard from a folder, sorted by file name", async () => {
    const dir = makeBoard(["10.png", "2.png", "1.png", "notes.txt"]);
    const res = parse(await mcp.call("open_review", { title: "Launch board", panelsDir: dir }));
    const v1 = fx.store.getReview(res.reviewId).versions[0];
    expect(v1.panels!.map((p) => path.basename(p.sourcePath))).toEqual(["1.png", "2.png", "10.png"]);
    expect(v1.panels![0].image).toBe("v1-panels/01.png");
    expect(fx.store.panelFileFor(res.reviewId, v1, 3)).toContain(path.join("versions", "v1-panels", "03.png"));
  });

  it("returns comments by panel, with captions, and keeps old panels when files are overwritten", async () => {
    const dir = makeBoard(["a.png", "b.png"]);
    const { reviewId } = parse(
      await mcp.call("open_review", {
        title: "Board",
        panelsDir: dir,
        panels: [{ path: "a.png", title: "Cold open", caption: "Slow push in on the laptop" }, "b.png"],
      }),
    );
    fx.store.addComment(reviewId, { time: 0, panel: 1, x: 0.2, y: 0.8, text: "Make the laptop bigger" });
    fx.store.addComment(reviewId, { time: 0, panel: 2, text: "Swap this shot for a close-up" });
    fx.store.addComment(reviewId, { time: 0, wholeVideo: true, text: "Warmer colours overall" });
    expect(() => fx.store.addComment(reviewId, { time: 0, panel: 3, text: "nope" })).toThrow(/between 1 and 2/);
    fx.store.submit(reviewId);

    const result = await mcp.call("wait_for_feedback", { reviewId });
    const res = parse(result);
    expect(res.panels).toHaveLength(2);
    const byText = Object.fromEntries(res.comments.map((c: { text: string }) => [c.text, c]));
    expect(byText["Make the laptop bigger"].at).toBe("panel 1 (Cold open)");
    expect(byText["Make the laptop bigger"].kind).toBe("pin");
    expect(byText["Make the laptop bigger"].panel.caption).toBe("Slow push in on the laptop");
    expect(byText["Make the laptop bigger"].position.description).toMatch(/bottom left of panel/);
    expect(byText["Swap this shot for a close-up"].kind).toBe("panel");
    expect(byText["Warmer colours overall"].at).toBe("whole storyboard");
    const prompt = result.content[1].text!;
    expect(prompt).toContain("# Storyboard feedback");
    expect(prompt).toContain("update the panel images");

    fs.writeFileSync(path.join(dir, "a.png"), "img:new");
    const v2 = parse(await mcp.call("add_version", { reviewId, note: "Bigger laptop" }));
    expect(v2.version).toBe(2);
    const review = fx.store.getReview(reviewId);
    expect(review.versions[1].panels![0].title).toBe("Cold open");
    expect(fs.readFileSync(fx.store.panelFileFor(reviewId, review.versions[0], 1)!, "utf8")).toBe("img:a.png");
    expect(fs.readFileSync(fx.store.panelFileFor(reviewId, review.versions[1], 1)!, "utf8")).toBe("img:new");
  });

  it("rejects mixing panels with a video", async () => {
    const dir = makeBoard(["1.png"]);
    const res = await mcp.call("open_review", { panelsDir: dir, videoPath: fx.video });
    expect(res.isError).toBe(true);
  });
});

describe("presets", () => {
  it("lists and filters the seeded presets", async () => {
    const all = parse(await mcp.call("list_presets"));
    const seeded = fs.readdirSync(builtinPresetsDir).filter((d) => fs.existsSync(path.join(builtinPresetsDir, d, "style.json")));
    expect(seeded.length).toBeGreaterThanOrEqual(6);
    expect(all.count).toBe(seeded.length);
    const square = parse(await mcp.call("list_presets", { format: "1:1" }));
    expect(square.presets.map((p: { id: string }) => p.id)).toContain("bauhaus-grid");
    expect(square.presets.every((p: { format: string }) => p.format === "1:1")).toBe(true);
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
    fx.store.setSelectedPreset("bauhaus-grid");
    const sel = parse(await mcp.call("get_selected_preset"));
    expect(sel.selected).toBe("bauhaus-grid");
    expect(sel.style.format).toBe("1:1");
    expect(sel.templateFiles.length).toBeGreaterThan(0);
  });
});

describe("playbooks", () => {
  beforeEach(() => {
    writePlaybook(fx.store.userPlaybooksDir, samplePlaybook("test-cut", { name: "Test Cut", styles: "parts", stylesNote: "captions" }));
  });

  it("lists playbooks with their cost and project", async () => {
    const all = parse(await mcp.call("list_playbooks"));
    const mine = all.playbooks.find((p: { id: string }) => p.id === "test-cut");
    expect(mine).toMatchObject({ name: "Test Cut", cost: "Free to run", selected: false, galleryUrl: "http://localhost:2400/playbooks/test-cut" });
    expect(parse(await mcp.call("list_playbooks", { query: "zzz-nothing" })).count).toBe(0);
  });

  it("returns the method, the folder and how the selected style combines", async () => {
    fx.store.setSelectedPreset("bauhaus-grid");
    const res = parse(await mcp.call("get_playbook", { id: "test-cut" }));
    expect(res.skill).toContain("Do the thing.");
    expect(fs.existsSync(res.playbookDir)).toBe(true);
    expect(res.files).toContain(path.join("scripts", "run.sh"));
    expect(res.stylesSentence).toMatch(/sets the captions\.$/);
    expect(res.selectedStyle.id).toBe("bauhaus-grid");
    expect((await mcp.call("get_playbook", { id: "nope" })).isError).toBe(true);
  });

  it("get_selected_playbook reflects the gallery selection", async () => {
    expect(parse(await mcp.call("get_selected_playbook")).selected).toBeNull();
    fx.store.setSelectedPlaybook("test-cut");
    const sel = parse(await mcp.call("get_selected_playbook"));
    expect(sel.selected).toBe("test-cut");
    expect(sel.playbook.name).toBe("Test Cut");
  });
});
