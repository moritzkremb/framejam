/**
 * Drives the review UI like a human reviewer (headless Chrome via puppeteer-core), at
 * half-screen width: clicks an element in the video and comments on it, drags a range on
 * the filmstrip, adds a whole-video comment, presses "Finish review", waits for v2, then
 * tours the styles gallery.
 * Saves screenshots (and a screencast when ffmpeg is available) to OUT_DIR.
 *
 * Run while `npm run e2e` is waiting:  OUT_DIR=./artifacts npx tsx scripts/ui-demo.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";

const base = (process.env.FRAMEJAM_URL ?? "http://localhost:4517").replace(/\/$/, "");
const outDir = path.resolve(process.env.OUT_DIR ?? "artifacts");
const chrome = process.env.CHROME_PATH ?? ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(fs.existsSync);
fs.mkdirSync(outDir, { recursive: true });

const reviewFile = path.join(os.tmpdir(), "framejam-e2e-review.json");
for (let i = 0; i < 60 && !fs.existsSync(reviewFile); i++) await new Promise((r) => setTimeout(r, 500));
const { url } = JSON.parse(fs.readFileSync(reviewFile, "utf8")) as { url: string };
const reviewPath = new URL(url).pathname;

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--window-size=560,900"],
  defaultViewport: { width: Number(process.env.WIDTH ?? 560), height: Number(process.env.HEIGHT ?? 900) },
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

/** Types into the comment box and presses Enter to add the comment. */
async function addComment(text: string) {
  await page.waitForFunction(() => document.activeElement?.tagName === "TEXTAREA");
  await page.keyboard.type(text, { delay: 10 });
  await page.keyboard.press("Enter");
  await page.waitForFunction((t) => [...document.querySelectorAll('[data-testid="comment-card"]')].some((c) => c.textContent?.includes(t)), {}, text.slice(0, 30));
  await sleep(400);
}

await page.goto(`${base}${reviewPath}`, { waitUntil: "networkidle2" });
// The latest version plays the live composition (clicks resolve to elements).
await page.waitForFunction(
  () => {
    const f = document.querySelector("iframe") as HTMLIFrameElement | null;
    const w = f?.contentWindow as (Window & { __playerReady?: boolean }) | null;
    return Boolean(w?.__playerReady) || ((document.querySelector("video") as HTMLVideoElement | null)?.readyState ?? 0) >= 2;
  },
  { timeout: 15000 },
);
await sleep(1200);
await shot("01-review-empty");

// 1. Click something in the video and comment on it.
await seekTo(0.3);
{
  const b = await box(page, '[data-testid="frame-overlay"]');
  await page.mouse.click(b.x + b.width * 0.85, b.y + b.height * 0.42);
}
await addComment("Make this red block a circle and slow its rotation.");

// 2. Drag across the filmstrip to comment on a range.
{
  const strip = await box(page, '[data-testid="timeline-scrub"]');
  const y = strip.y + strip.height / 2;
  await page.mouse.move(strip.x + strip.width * 0.5, y);
  await page.mouse.down();
  await page.mouse.move(strip.x + strip.width * 0.6, y, { steps: 8 });
  await page.mouse.move(strip.x + strip.width * 0.75, y, { steps: 8 });
  await page.mouse.up();
}
await addComment("The three columns land too fast. Hold each one ~0.4s longer before the next.");

// 3. A whole-video comment.
await page.click(".fc-chip-btn");
await addComment("Otherwise looks great, keep the grid.");
await shot("02-review-comments");

// 4. Finish review: the version locks and the box becomes the handoff card.
await page.click('[data-testid="send-to-agent"]');
await page.waitForSelector('[data-testid="handoff"]', { timeout: 10000 });
await sleep(900);
await shot("03-review-sent");

// 5. Wait for the agent's v2: the page moves to it with an empty comment list.
try {
  await page.waitForFunction(() => document.body.innerText.includes("Version 2 of 2"), { timeout: 60000 });
  await sleep(1500);
  await shot("04-review-v2");
} catch {
  console.log("[ui] agent did not post v2 within 60s (is `npm run e2e` running?)");
}

// 6. Styles gallery: Use straight from a card, then open one.
await page.goto(`${base}/styles`, { waitUntil: "networkidle2" });
await sleep(800);
const cards = await page.$$('[data-testid="preset-card"]');
if (cards[2]) {
  await cards[2].hover();
  await sleep(1800);
}
await shot("05-styles-gallery");
await page.goto(`${base}/styles/neon-terminal`, { waitUntil: "networkidle2" });
await sleep(1500);
await page.click('[data-testid="use-style"]');
await sleep(1200);
await shot("06-style-detail-selected");

await recorder?.stop();
await browser.close();
console.log("[ui] done →", outDir);
