/**
 * Plays the agent's side of the loop against a running framejam server over
 * streamable HTTP MCP: pick a preset, open a review, block on wait_for_feedback
 * until a human presses "Finish review", then ship v2 (which starts a fresh round).
 *
 *   npm start                       # in one terminal
 *   npm run e2e                     # in another; then comment + send in the browser
 *
 * Env: FRAMEJAM_URL (default http://localhost:4517), E2E_MAX_WAITS (default 20 ≈ 16 min)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { builtinPresetsDir } from "../src/server/paths.ts";

const base = (process.env.FRAMEJAM_URL ?? "http://localhost:4517").replace(/\/$/, "");
const maxWaits = Number(process.env.E2E_MAX_WAITS ?? 20);
const presetId = process.env.E2E_PRESET ?? "swiss-editorial";

type ToolResult = { content: { type: string; text?: string }[]; isError?: boolean };
const firstJson = (r: ToolResult) => JSON.parse(r.content.find((c) => c.type === "text")!.text!);
const log = (...a: unknown[]) => console.log("[agent]", ...a);

const client = new Client({ name: "framejam-e2e", version: "0.1.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = (await client.callTool({ name, arguments: args }, undefined, { timeout: 120_000 })) as ToolResult;
  if (r.isError) throw new Error(`${name} failed: ${r.content.map((c) => c.text).join(" ")}`);
  return r;
};

const tools = await client.listTools();
log("tools:", tools.tools.map((t) => t.name).join(", "));

const presets = firstJson(await call("list_presets"));
log(`list_presets → ${presets.count} presets`);
const preset = firstJson(await call("get_preset", { id: presetId }));
log(`get_preset(${presetId}) → ${preset.style.name}, ${preset.templateFiles.length} template file(s)`);

// Simulate the agent's own project: copy the preset template and its render.
const project = fs.mkdtempSync(path.join(os.tmpdir(), "framejam-e2e-"));
fs.cpSync(path.join(builtinPresetsDir, presetId, "composition"), path.join(project, "composition"), { recursive: true });
fs.mkdirSync(path.join(project, "renders"));
const v1 = path.join(project, "renders", "v1.mp4");
fs.copyFileSync(path.join(builtinPresetsDir, presetId, "preview.mp4"), v1);

const opened = firstJson(
  await call("open_review", {
    title: process.env.E2E_TITLE ?? "Q3 field report teaser",
    videoPath: v1,
    compositionDir: path.join(project, "composition"),
    note: "First cut",
  }),
);
log(`open_review → ${opened.url} (v${opened.version})`);
fs.writeFileSync(path.join(os.tmpdir(), "framejam-e2e-review.json"), JSON.stringify(opened));

let feedback: ToolResult | undefined;
for (let i = 1; i <= maxWaits; i++) {
  const started = Date.now();
  const r = await call("wait_for_feedback", { reviewId: opened.reviewId });
  const payload = firstJson(r);
  log(`wait_for_feedback #${i} → ${payload.status} after ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (payload.status === "feedback") {
    feedback = r;
    break;
  }
}
if (!feedback) {
  log("No feedback arrived; giving up.");
  process.exit(1);
}

const payload = firstJson(feedback);
const images = feedback.content.filter((c) => c.type === "image").length;
log(`received ${payload.comments.length} comment(s), ${images} frame image(s)${payload.message ? `, note: "${payload.message}"` : ""}`);
for (const c of payload.comments) {
  log(`  [${c.at}] ${c.text}${c.element ? `  ← ${c.element.selector}` : ""}${c.position ? `  @ ${c.position.description}` : ""}`);
}
console.log("\n----- prompt markdown -----\n" + feedback.content[1].text + "\n---------------------------\n");
fs.writeFileSync(path.join(os.tmpdir(), "framejam-e2e-feedback.json"), JSON.stringify(payload, null, 2));

// "Apply" the feedback: ship v2 with a note. v2 starts with an empty comment list.
const v2 = path.join(project, "renders", "v2.mp4");
fs.copyFileSync(v1, v2);
const added = firstJson(await call("add_version", { reviewId: opened.reviewId, videoPath: v2, note: "Applied your comments" }));
log(`add_version → v${added.version}`);
const reviews = firstJson(await call("list_reviews"));
log(`list_reviews → ${reviews.reviews.find((r: { reviewId: string }) => r.reviewId === opened.reviewId)?.state}`);
await client.close();
