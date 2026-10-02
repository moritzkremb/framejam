/**
 * Plays the agent against an isolated framejam instance for the footage.
 *   seed   — pick a style, open the hero review (Ledgerly teaser) plus two background reviews
 *   listen — block on wait_for_feedback for the hero review, then ship v2 with a note
 * Env: FJ_URL (default http://localhost:4600)
 */
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const base = (process.env.FJ_URL ?? "http://localhost:4600").replace(/\/$/, "");
const root = path.resolve(import.meta.dirname, "..");
const stage = path.join(root, "stage");
const presets = path.resolve(root, "../../presets");
const stateFile = path.join(stage, "reviews.json");

type ToolResult = { content: { type: string; text?: string }[]; isError?: boolean };
const json = (r: ToolResult) => JSON.parse(r.content.find((c) => c.type === "text")!.text!);

const client = new Client({ name: "Cursor", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = (await client.callTool({ name, arguments: args }, undefined, { timeout: 120_000 })) as ToolResult;
  if (r.isError) throw new Error(`${name}: ${r.content.map((c) => c.text).join(" ")}`);
  return r;
};

function stageProject(id: string, preset: string) {
  const dir = path.join(stage, id);
  if (!fs.existsSync(path.join(dir, "composition"))) {
    fs.cpSync(path.join(presets, preset, "composition"), path.join(dir, "composition"), { recursive: true });
  }
  fs.mkdirSync(path.join(dir, "renders"), { recursive: true });
  const v1 = path.join(dir, "renders", "v1.mp4");
  if (!fs.existsSync(v1)) fs.copyFileSync(path.join(presets, preset, "preview.mp4"), v1);
  return dir;
}

const mode = process.argv[2] ?? "seed";

if (mode === "seed") {
  const relay = stageProject("relay", "neon-terminal");
  const sweep = stageProject("sweep", "soft-gradient-saas");
  const ledgerly = path.join(stage, "ledgerly");

  const r1 = json(await call("open_review", { title: "Relay deploy teaser", videoPath: path.join(relay, "renders/v1.mp4"), compositionDir: path.join(relay, "composition"), note: "First cut" }));
  await call("add_version", { reviewId: r1.reviewId, videoPath: path.join(relay, "renders/v1.mp4"), note: "Slower cursor, bigger log lines" });
  const r2 = json(await call("open_review", { title: "Morning sweep promo", videoPath: path.join(sweep, "renders/v1.mp4"), compositionDir: path.join(sweep, "composition"), note: "First cut" }));
  const hero = json(await call("open_review", { title: "Ledgerly teaser", videoPath: path.join(ledgerly, "renders/v1.mp4"), compositionDir: path.join(ledgerly, "composition"), note: "First cut" }));
  fs.writeFileSync(stateFile, JSON.stringify({ hero, relay: r1, sweep: r2 }, null, 2));
  console.log(JSON.stringify({ hero: hero.url, relay: r1.url, sweep: r2.url }));
}

if (mode === "listen") {
  const { hero } = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  for (let i = 0; i < 40; i++) {
    const p = json(await call("wait_for_feedback", { reviewId: hero.reviewId }));
    console.log("[agent] wait_for_feedback →", p.status);
    if (p.status !== "feedback") continue;
    for (const c of p.comments) console.log(`  [${c.at}] ${c.text}${c.element ? ` ← ${c.element.selector}` : ""}`);
    await new Promise((r) => setTimeout(r, Number(process.env.WORK_MS ?? 5000)));
    const ledgerly = path.join(stage, "ledgerly");
    fs.cpSync(path.join(ledgerly, "composition-v2"), path.join(ledgerly, "composition"), { recursive: true });
    const v = json(await call("add_version", { reviewId: hero.reviewId, videoPath: path.join(ledgerly, "renders/v2.mp4"), note: "Lime marker on “reads”, tags land a beat apart" }));
    console.log("[agent] add_version → v" + v.version);
    break;
  }
}

await client.close();
