import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { type CoreContext, createMcpServer } from "../src/core/mcp.ts";
import { packageRoot } from "../src/server/paths.ts";
import { BASE_URL, makeFixture } from "./helpers.ts";

const coreDir = path.join(packageRoot, "src", "core");
const coreFiles = fs.readdirSync(coreDir).filter((f) => f.endsWith(".ts"));

/** Packages core may use: they run in Node, browsers and serverless runtimes alike. */
const ALLOWED_PACKAGES = ["zod", "@modelcontextprotocol/sdk/"];

const TOOLS = [
  "open_review",
  "wait_for_feedback",
  "get_feedback",
  "list_reviews",
  "resolve_comments",
  "add_version",
  "get_version",
  "share_project",
  "list_share_links",
  "list_presets",
  "get_preset",
  "get_selected_preset",
  "list_playbooks",
  "get_playbook",
  "get_selected_playbook",
  "open_picker",
  "wait_for_pick",
];

async function connect(ctx: CoreContext) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createMcpServer(ctx).connect(serverTransport);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
}

describe("core", () => {
  let fx: ReturnType<typeof makeFixture>;
  afterEach(() => fs.rmSync(fx.root, { recursive: true, force: true }));

  it.each(coreFiles)("%s only imports core files and portable packages", (file) => {
    fx = makeFixture();
    const source = fs.readFileSync(path.join(coreDir, file), "utf8");
    const specifiers = [...source.matchAll(/^\s*(?:import|export)[^"']*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!);
    for (const spec of specifiers) {
      const ok = /^\.\/[\w-]+\.ts$/.test(spec) || ALLOWED_PACKAGES.some((p) => spec === p || spec.startsWith(p));
      expect(ok, `${file} imports ${spec}`).toBe(true);
    }
    expect(source, `${file} uses a Node global`).not.toMatch(/\b(Buffer|process|__dirname|require)\b[.(]/);
  });

  it("serves the same tools from just a store and a base URL", async () => {
    fx = makeFixture();
    const client = await connect({ store: fx.store, baseUrl: BASE_URL });
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual(TOOLS);
    expect(client.getInstructions()).toContain(BASE_URL);
    expect(client.getInstructions()).not.toContain("Skill version");
    await client.close();
  });

  it("names the skill version and update command when given", async () => {
    fx = makeFixture();
    const client = await connect({ store: fx.store, baseUrl: BASE_URL, skillVersion: 7, updateCommand: "update-me" });
    expect(client.getInstructions()).toContain("The current FrameJam skill is version 7.");
    expect(client.getInstructions()).toContain("Run `update-me`");
    await client.close();
  });

  it("sends a comment's frame image as base64 without Buffer", async () => {
    fx = makeFixture();
    const { review } = await fx.store.openReview({ title: "Launch", videoPath: fx.video });
    const bytes = new Uint8Array(70_000).map((_, i) => i % 251);
    const pin = fx.store.addComment(review.id, { time: 1, x: 0.5, y: 0.5, text: "Here" });
    fx.store.saveThumbnail(review.id, pin.id, bytes);
    fx.store.submit(review.id);
    const client = await connect({ store: fx.store, baseUrl: BASE_URL });
    const res = (await client.callTool({ name: "get_feedback", arguments: { reviewId: review.id } })) as {
      content: { type: string; data?: string }[];
    };
    const image = res.content.find((c) => c.type === "image");
    expect(image?.data).toBe(Buffer.from(bytes).toString("base64"));
    await client.close();
  });
});
