import fs from "node:fs";
import path from "node:path";
import { base, root, sleep, Take } from "./rec.ts";

const { hero } = JSON.parse(fs.readFileSync(path.join(root, "stage/reviews.json"), "utf8"));
const take = new Take(process.env.TAKE ?? "review");
const page = await take.open();
await page.goto(`${base}${new URL(hero.url).pathname}`, { waitUntil: "networkidle2" });
await page.waitForFunction(() => {
  const f = document.querySelector("iframe") as HTMLIFrameElement | null;
  return Boolean((f?.contentWindow as (Window & { __playerReady?: boolean }) | null)?.__playerReady);
}, { timeout: 20000 });
await page.waitForFunction(() => document.body.innerText.includes("Agent listening"), { timeout: 30000 });
await sleep(1500);

const overlay = await take.box('[data-testid="frame-overlay"]');
const scrub = await take.box('[data-testid="timeline-scrub"]');
const at = (sx: number, sy: number) => ({ x: overlay.x + (sx / 1920) * overlay.width, y: overlay.y + (sy / 1080) * overlay.height });

take.mx = overlay.x + overlay.width * 0.55;
take.my = overlay.y + overlay.height * 0.7;
await page.mouse.move(take.mx, take.my);
await take.start();
await sleep(600);

// 1. Play, then pause on "Ledgerly reads them."
const play = await take.box(".fc-play");
const pc = { x: play.x + play.width / 2, y: play.y + play.height / 2 };
await take.click(pc.x, pc.y, "play", 700);
await sleep(2950);
await page.$eval(".fc-play", (b) => (b as HTMLButtonElement).click());
take.mark("pause");
await sleep(500);

// 2. Point at the orb and say what should change.
const reads = at(960, 540);
await take.move(reads.x - 90, reads.y + 60, 700);
await sleep(250);
await take.click(reads.x, reads.y, "pin-orb", 450);
await sleep(700);
await take.type("Make this orb lime.");
await sleep(350);
await page.keyboard.press("Enter");
take.mark("add-1");
await sleep(1300);

// 3. Drag across the filmstrip for a range (the bars scene, 4s – 6s).
const y = scrub.y + scrub.height / 2;
const x0 = scrub.x + scrub.width * 0.48;
const x1 = scrub.x + scrub.width * 0.74;
await take.move(x0, y, 750);
await sleep(200);
take.mark("drag-start");
await page.mouse.down();
for (let i = 1; i <= 40; i++) {
  const p = i / 40;
  const e = 1 - Math.pow(1 - p, 3);
  await page.mouse.move(x0 + (x1 - x0) * e, y);
  take.mx = x0 + (x1 - x0) * e;
  take.my = y;
  await sleep(18);
}
await page.mouse.up();
take.mark("drag-end");
await sleep(700);
await take.type("Bars rise all at once. Stagger them.");
await sleep(300);
await page.keyboard.press("Enter");
take.mark("add-2");
await sleep(1200);

// 4. A whole-video note.
const whole = await take.box(".fc-chip-btn");
await take.click(whole.x + whole.width / 2, whole.y + whole.height / 2, "whole-video", 650);
await sleep(500);
await take.type("Love the colours. Keep them.");
await sleep(300);
await page.keyboard.press("Enter");
take.mark("add-3");
await sleep(1400);

// 5. Finish review. The agent is listening, picks it up, and ships v2.
const send = await take.box('[data-testid="send-to-agent"]');
await take.click(send.x + send.width / 2, send.y + send.height / 2, "finish-review", 800);
await page.waitForSelector('[data-testid="handoff"]', { timeout: 10000 });
take.mark("handoff");
await take.move(send.x - 380, send.y - 240, 1400);
await page.waitForFunction(() => document.body.innerText.includes("Version 2"), { timeout: 60000 });
take.mark("v2");
await sleep(2200);

// 6. Watch the fix: seek to just before the orb and play.
const ov2 = await take.box('[data-testid="frame-overlay"]');
const sc2 = await take.box('[data-testid="timeline-scrub"]');
await take.click(sc2.x + sc2.width * 0.245, sc2.y + sc2.height - 6, "seek-v2", 900);
await sleep(500);
const play2 = await take.box(".fc-play");
await take.click(play2.x + play2.width / 2, play2.y + play2.height / 2, "play-v2", 700);
await sleep(4300);
await take.move(ov2.x + ov2.width * 0.62, ov2.y + ov2.height * 0.86, 700);
await sleep(600);
await page.$eval(".fc-play", (b) => (b as HTMLButtonElement).click());
take.mark("pause-v2");
await sleep(1200);
await take.stop();
