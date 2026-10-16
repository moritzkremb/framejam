import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MEMORY_LIMIT, relevantMemories } from "../src/core/memory.ts";
import type { Memory } from "../src/core/types.ts";
import { createApp } from "../src/server/app.ts";
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

const text = (r: ToolResult) => r.content.map((c) => c.text ?? "").join("\n");

/** A finished round on a project, with one comment; returns the review and comment ids. */
function round(title: string, comment: string) {
  const { review } = fx.store.openReview({ title, videoPath: fx.video });
  const c = fx.store.addComment(review.id, { time: 1, text: comment });
  fx.store.submit(review.id);
  return { reviewId: review.id, commentId: c.id };
}

describe("edit memory tools", () => {
  it("remembers a preference from a comment, and grows confident when another project repeats it", async () => {
    const a = round("Launch", "No fades please, hard cuts only");
    const first = parse(await mcp.call("remember", { text: "Hard cuts only, no fades", reviewId: a.reviewId, commentIds: [a.commentId] }));
    expect(first).toMatchObject({ created: true, memory: { scope: "me", confidence: "tentative", sources: [a] } });
    expect(first.next).toContain("I'll remember: Hard cuts only, no fades");

    const b = round("Teaser", "Again: hard cuts");
    const second = parse(await mcp.call("remember", { text: "hard cuts only, no fades", reviewId: b.reviewId, commentIds: [b.commentId] }));
    expect(second).toMatchObject({ created: false, memory: { id: first.memory.id, confidence: "confident" } });
    expect(second.next).toContain("no need to mention it again");
  });

  it("checks the comments it came from", async () => {
    const a = round("Launch", "Hard cuts");
    const missing = await mcp.call("remember", { text: "Hard cuts", reviewId: a.reviewId, commentIds: ["c_nope"] });
    expect(missing.isError).toBe(true);
    expect(text(missing)).toContain("c_nope");
    const noReview = await mcp.call("remember", { text: "Hard cuts", commentIds: [a.commentId] });
    expect(text(noReview)).toContain("reviewId");
    const noClient = await mcp.call("remember", { text: "Logo bottom right", scope: "client" });
    expect(noClient.isError).toBe(true);
  });

  it("returns the user's memories plus the client's, and lists the clients", async () => {
    await mcp.call("remember", { text: "Captions in the lower third", userAsked: true });
    await mcp.call("remember", { text: "Logo bottom right, never on red", scope: "client", client: "Acme" });
    await mcp.call("remember", { text: "Serif fonts only", scope: "client", client: "Beta Bakery" });

    const plain = parse(await mcp.call("get_memory"));
    expect(plain.memories.map((m: Memory) => m.text)).toEqual(["Captions in the lower third"]);
    expect(plain.clients).toEqual(["Acme", "Beta Bakery"]);
    expect(plain.howToUse).toContain("current request beats a memory");
    expect(plain.memoryUrl).toBe("http://localhost:2400/memory");

    const acme = parse(await mcp.call("get_memory", { client: "acme" }));
    expect(acme.memories.map((m: Memory) => m.text)).toEqual(["Captions in the lower third", "Logo bottom right, never on red"]);
  });

  it("comes back in open_review, and only when there is some", async () => {
    const before = parse(await mcp.call("open_review", { title: "Launch", videoPath: fx.video }));
    expect(before).not.toHaveProperty("memory");

    await mcp.call("remember", { text: "Hard cuts only" });
    await mcp.call("remember", { text: "Logo bottom right", scope: "client", client: "Acme" });
    const opened = parse(await mcp.call("open_review", { title: "Teaser", videoPath: fx.video, client: "Acme" }));
    expect(opened.memory.memories.map((m: Memory) => m.text).sort()).toEqual(["Hard cuts only", "Logo bottom right"]);
    expect(opened.memory.howToUse).toBeDefined();
  });

  it("forgets by id", async () => {
    const { memory } = parse(await mcp.call("remember", { text: "Hard cuts only" }));
    expect(parse(await mcp.call("forget", { id: memory.id })).forgotten.id).toBe(memory.id);
    expect(parse(await mcp.call("get_memory")).memories).toEqual([]);
    expect((await mcp.call("forget", { id: memory.id })).isError).toBe(true);
  });

  it("asks the agent to remember general preferences after a round", async () => {
    const { reviewId } = round("Launch", "Hard cuts only");
    const feedback = parse(await mcp.call("wait_for_feedback", { reviewId }));
    expect(feedback.next).toContain("call remember");
    expect(mcp.client.getInstructions()).toContain("get_memory");
  });
});

describe("relevant memories", () => {
  const mem = (i: number, extra: Partial<Memory> = {}): Memory => ({
    id: `mem_${i}`,
    scope: "me",
    text: `Rule ${i}`,
    confidence: "tentative",
    sources: [],
    createdAt: new Date(2026, 0, 1, 0, i).toISOString(),
    updatedAt: new Date(2026, 0, 1, 0, i).toISOString(),
    ...extra,
  });

  it("puts confident ones first, newest first, and caps the list", () => {
    const list = [...Array.from({ length: 30 }, (_, i) => mem(i)), mem(99, { confidence: "confident", updatedAt: "2025-01-01T00:00:00.000Z" })];
    const picked = relevantMemories(list);
    expect(picked).toHaveLength(MEMORY_LIMIT);
    expect(picked[0]!.id).toBe("mem_99");
    expect(picked[1]!.id).toBe("mem_29");
  });

  it("leaves out other clients' memories", () => {
    const list = [mem(1), mem(2, { scope: "client", client: "Acme" }), mem(3, { scope: "client", client: "Beta" })];
    expect(relevantMemories(list).map((m) => m.id)).toEqual(["mem_1"]);
    expect(relevantMemories(list, { client: "ACME" }).map((m) => m.id)).toEqual(["mem_2", "mem_1"]);
  });
});

describe("memory API used by the Memory page", () => {
  it("lists memories with their projects' titles, edits and forgets", async () => {
    const app = createApp(fx.ctx);
    const a = round("Launch teaser", "Hard cuts");
    const { memory } = fx.store.remember({ text: "Hard cuts only", sources: [a] });

    const list = await (await app.request("/api/memory")).json();
    expect(list).toMatchObject({ memories: [{ id: memory.id }], projects: { [a.reviewId]: "Launch teaser" } });

    const patched = await app.request(`/api/memory/${memory.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Hard cuts only, never fades" }),
    });
    expect((await patched.json()).text).toBe("Hard cuts only, never fades");

    const empty = await app.request(`/api/memory/${memory.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: "{}" });
    expect(empty.status).toBe(400);

    expect((await app.request(`/api/memory/${memory.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await app.request(`/api/memory/${memory.id}`, { method: "DELETE" })).status).toBe(404);
    expect(fx.store.listMemories()).toEqual([]);
  });
});
