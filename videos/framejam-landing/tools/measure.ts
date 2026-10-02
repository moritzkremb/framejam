import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { base, root, sleep } from "./rec.ts";

const { relay } = JSON.parse(fs.readFileSync(path.join(root, "stage/reviews.json"), "utf8"));
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, defaultViewport: { width: 1440, height: 900 } });
const page = await browser.newPage();
const out: Record<string, unknown> = {};
const boxes = async (prefix: string, sels: string[]) => {
  for (const s of sels) {
    const el = await page.$(s);
    const b = el && (await el.boundingBox());
    out[`${prefix} ${s}`] = b && [b.x, b.y, b.width, b.height].map(Math.round);
  }
};
await page.goto(`${base}${new URL(relay.url).pathname}`, { waitUntil: "networkidle2" });
await sleep(2500);
await boxes("review", ['[data-testid="frame-overlay"]', '[data-testid="timeline-scrub"]', ".fc-play", "textarea", '[data-testid="send-to-agent"]', ".fc-chip-btn", "aside", "header"]);
await page.goto(`${base}/styles`, { waitUntil: "networkidle2" });
await sleep(1500);
const cards = await page.$$('[data-testid="preset-card"]');
for (const i of [0, 1, 4, 5, 13]) {
  const b = await cards[i].boundingBox();
  out[`styles card${i}`] = b && [b.x, b.y, b.width, b.height].map(Math.round);
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
