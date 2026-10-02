import { base, sleep, Take } from "./rec.ts";

const take = new Take("styles");
const page = await take.open();
await page.goto(`${base}/styles`, { waitUntil: "networkidle2" });
await sleep(2500);
// Above the grid (filter bar row), so no card is hovered on the way in.
const LANE = 284;
take.mx = 1100;
take.my = LANE;
await page.mouse.move(take.mx, take.my);
await take.start();
await sleep(500);

const cards = await page.$$('[data-testid="preset-card"]');
const boxOf = async (i: number) => (await cards[i].boundingBox())!;

/** Enter a card straight down from the lane above it, hover, then leave straight up. */
async function hover(i: number, hold: number) {
  const b = await boxOf(i);
  const x = b.x + b.width / 2;
  await take.move(x, LANE, 650);
  await take.move(x, b.y + b.height * 0.34, 380);
  take.mark("hover", i);
  await sleep(hold);
  await take.move(x, LANE, 300);
}

await hover(1, 1500);
await hover(5, 1500);
await hover(4, 1300);

// Park in the right page margin (outside every card) and scroll.
const right = (await boxOf(5)).x + (await boxOf(5)).width + 8;
await take.move(right, LANE, 500);
take.mark("scroll");
for (let i = 0; i < 40; i++) {
  await page.mouse.wheel({ deltaY: 11 });
  await sleep(16);
}
await sleep(500);

const names = await Promise.all(cards.map((c) => c.evaluate((el) => el.textContent ?? "")));
const pm = names.findIndex((n) => n.includes("Paper Marker"));
const above = pm - 6;
const b = await boxOf(pm);
const a = await boxOf(above);
const gapY = (a.y + a.height + b.y) / 2;
// Along the row gap, then down into Paper Marker.
await take.move(right, gapY, 350);
await take.move(b.x + b.width / 2, gapY, 900);
await take.move(b.x + b.width / 2, b.y + b.height * 0.34, 380);
take.mark("hover-paper-marker");
await sleep(1600);
const use = await cards[pm].$('[data-testid="use-style-quick"]');
const ub = (await use!.boundingBox())!;
await take.click(ub.x + ub.width / 2, ub.y + ub.height / 2, "use-paper-marker", 500);
await sleep(2400);
await take.stop();
