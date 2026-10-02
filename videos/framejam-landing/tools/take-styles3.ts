import { base, sleep, Take } from "./rec.ts";

// Styles page, no scroll: hover Bauhaus Grid, then Doodle Mascot, and press Use on Doodle Mascot.
const take = new Take("styles3");
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

const bauhaus = await boxOf(idx("Bauhaus Grid"));
await take.move(bauhaus.x + bauhaus.width / 2, LANE, 550);
await take.move(bauhaus.x + bauhaus.width / 2, bauhaus.y + bauhaus.height * 0.34, 320);
take.mark("hover", "bauhaus");
await sleep(1500);
await take.move(bauhaus.x + bauhaus.width / 2, LANE, 280);

// Row 2: come in along the gap between rows 1 and 2.
const doodle = idx("Doodle Mascot");
const d = await boxOf(doodle);
const above = await boxOf(doodle - 6);
const gapY = (above.y + above.height + d.y) / 2;
await take.move(d.x + d.width / 2, gapY, 600);
await take.move(d.x + d.width / 2, d.y + d.height * 0.34, 300);
take.mark("hover", "doodle");
await sleep(1500);
const use = await cards[doodle].$('[data-testid="use-style-quick"]');
const ub = (await use!.boundingBox())!;
await take.click(ub.x + ub.width / 2, ub.y + ub.height / 2, "use-doodle", 500);
await sleep(2600);
await take.stop();
