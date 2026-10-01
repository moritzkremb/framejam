/**
 * Drives the review UI like a human reviewer (headless Chrome via puppeteer-core):
 * pins comments on the rendered video, marks a time range, clicks an element in the
 * live Hyperframes composition, presses "Send to agent", then tours the preset gallery.
 * Saves screenshots (and a screencast when ffmpeg is available) to OUT_DIR.
 *
 * Run while `npm run e2e` is waiting:  OUT_DIR=./artifacts npx tsx scripts/ui-demo.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";

const base = (process.env.FRAMECUT_URL ?? "http://localhost:4517").replace(/\/$/, "");
const outDir = path.resolve(process.env.OUT_DIR ?? "artifacts");
const chrome = process.env.CHROME_PATH ?? ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(fs.existsSync);
fs.mkdirSync(outDir, { recursive: true });

const reviewFile = path.join(os.tmpdir(), "framecut-e2e-review.json");
for (let i = 0; i < 60 && !fs.existsSync(reviewFile); i++) await new Promise((r) => setTimeout(r, 500));
const { url } = JSON.parse(fs.readFileSync(reviewFile, "utf8")) as { url: string };
const reviewPath = new URL(url).pathname;

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--window-size=1600,1000"],
  defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const shot = async (name: string) => {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file });
  console.log("[ui] screenshot", file);
};
const recorder = process.env.NO_SCREENCAST ? undefined : await page.screencast({ path: path.join(outDir, "review-flow.webm") as `${string}.webm` }).catch(() => undefined);

async function box(p: Page, selector: string) {
  const el = await p.waitForSelector(selector, { visible: true });
  const b = await el!.boundingBox();
  if (!b) throw new Error(`No box for ${selector}`);
  return b;
}

async function seekTo(fraction: number) {
  const b = await box(page, '[data-testid="timeline-scrub"]');
  await page.mouse.click(b.x + b.width * fraction, b.y + b.height - 6);
  await sleep(400);
}

async function pinAndComment(fx: number, fy: number, text: string) {
  const b = await box(page, '[data-testid="frame-overlay"]');
  await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy);
  await page.waitForSelector("textarea", { visible: true });
  await sleep(300);
  await page.type("textarea", text, { delay: 12 });
  await sleep(250);
  await page.keyboard.down("Control");
  await page.keyboard.press("Enter");
  await page.keyboard.up("Control");
  await page.waitForFunction((t) => [...document.querySelectorAll('[data-testid="comment-card"]')].some((c) => c.textContent?.includes(t)), {}, text.slice(0, 30));
  await sleep(400);
}

await page.goto(`${base}${reviewPath}`, { waitUntil: "networkidle2" });
await page.waitForSelector("video");
await page.waitForFunction(() => ((document.querySelector("video") as HTMLVideoElement | null)?.readyState ?? 0) >= 2);
await sleep(600);
await shot("01-review-empty");

// 1. Pin a comment on the rendered video.
await seekTo(0.2);
await pinAndComment(0.2, 0.62, "The red line clips the descenders on “shipping”. Give the masks a bit more room.");

// 2. Mark a range on the timeline lane.
{
  const lane = await box(page, '[data-testid="timeline-lane"]');
  const y = lane.y + lane.height / 2;
  await page.mouse.move(lane.x + lane.width * 0.41, y);
  await page.mouse.down();
  await page.mouse.move(lane.x + lane.width * 0.55, y, { steps: 8 });
  await page.mouse.move(lane.x + lane.width * 0.72, y, { steps: 8 });
  await page.mouse.up();
  await page.waitForSelector("textarea", { visible: true });
  await page.type("textarea", "The three columns land too fast — hold each one ~0.4s longer before the next.", { delay: 10 });
  await page.keyboard.down("Control");
  await page.keyboard.press("Enter");
  await page.keyboard.up("Control");
  await sleep(600);
}

// 3. Switch to the live composition and click an element.
await page.click('[data-testid="source-live"]');
await page.waitForFunction(() => {
  const f = document.querySelector("iframe") as HTMLIFrameElement | null;
  const w = f?.contentWindow as (Window & { __playerReady?: boolean }) | null;
  return Boolean(w?.__playerReady);
}, { timeout: 15000 });
await sleep(800);
await seekTo(0.3);
await pinAndComment(0.85, 0.42, "Make this red block a circle and slow its rotation.");
await shot("02-review-comments");

// 4. Send to agent.
await page.type('input[placeholder^="Optional note"]', "Otherwise looks great — keep the grid.", { delay: 8 });
await page.click('[data-testid="send-to-agent"]');
await page.waitForFunction(() => document.body.innerText.includes("Sent"), { timeout: 10000 });
await sleep(900);
await shot("03-review-sent");

// 5. Wait for the agent's v2 + resolutions to arrive live.
try {
  await page.waitForFunction(() => document.body.innerText.includes("Version 2 is ready") || document.body.innerText.includes("v2"), { timeout: 60000 });
  await sleep(1500);
  const tabs = await page.$$('[role="tab"]');
  for (const t of tabs) if ((await t.evaluate((n) => n.textContent ?? "")).startsWith("Resolved")) await t.click();
  await sleep(700);
  await shot("04-review-resolved-v2");
} catch {
  console.log("[ui] agent did not post v2 within 60s (is `npm run e2e` running?)");
}

// 6. Preset gallery.
await page.goto(`${base}/presets`, { waitUntil: "networkidle2" });
await sleep(800);
const cards = await page.$$('[data-testid="preset-card"]');
if (cards[2]) {
  await cards[2].hover();
  await sleep(1800);
}
await shot("05-presets-gallery");
await page.goto(`${base}/presets/neon-terminal`, { waitUntil: "networkidle2" });
await sleep(1500);
await page.click('[data-testid="use-style"]');
await sleep(1200);
await shot("06-preset-detail-selected");

await recorder?.stop();
await browser.close();
console.log("[ui] done →", outDir);
