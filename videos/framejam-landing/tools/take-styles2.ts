import { base, sleep, Take } from "./rec.ts";

// Styles page, no scroll: hover text-free previews (Bauhaus Grid, Doodle Mascot), then Use on Cyanotype Mac.
const take = new Take("styles2");
const page = await take.open();
await page.goto(`${base}/styles`, { waitUntil: "networkidle2" });
await sleep(2500);
const LANE = 284;
take.mx = 1100;
take.my = LANE;
await page.mouse.move(take.mx, take.my);
await take.start();
await sleep(400);

const cards = await page.$$('[data-testid="preset-card"]');
const names = await Promise.all(cards.map((c) => c.evaluate((el) => el.textContent ?? "")));
const idx = (n: string) => names.findIndex((t) => t.includes(n));
const boxOf = async (i: number) => (await cards[i].boundingBox())!;

async function hover(i: number, hold: number, label: string) {
  const b = await boxOf(i);
  const x = b.x + b.width / 2;
  await take.move(x, LANE, 550);
  await take.move(x, b.y + b.height * 0.34, 320);
  take.mark("hover", label);
  await sleep(hold);
  await take.move(x, LANE, 280);
}

await hover(idx("Bauhaus Grid"), 1500, "bauhaus");

// Row 2 cards: come in along the gap between rows 1 and 2.
const cy = idx("Cyanotype Mac");
const doodle = idx("Doodle Mascot");
const r1 = await boxOf(cy - 6);
const r2 = await boxOf(cy);
const gapY = (r1.y + r1.height + r2.y) / 2;
const d = await boxOf(doodle);
await take.move(d.x + d.width / 2, gapY, 600);
await take.move(d.x + d.width / 2, d.y + d.height * 0.34, 300);
take.mark("hover", "doodle");
await sleep(1500);
await take.move(d.x + d.width / 2, gapY, 260);
const c = await boxOf(cy);
await take.move(c.x + c.width / 2, gapY, 600);
await take.move(c.x + c.width / 2, c.y + c.height * 0.34, 300);
take.mark("hover", "cyanotype");
await sleep(1500);
const use = await cards[cy].$('[data-testid="use-style-quick"]');
const ub = (await use!.boundingBox())!;
await take.click(ub.x + ub.width / 2, ub.y + ub.height / 2, "use-cyanotype", 450);
await sleep(2600);
await take.stop();
