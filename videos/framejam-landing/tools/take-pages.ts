import { base, sleep, Take } from "./rec.ts";

const which = process.argv[2];

if (which === "style") {
  const take = new Take("style-detail");
  const page = await take.open();
  await page.goto(`${base}/styles/paper-marker`, { waitUntil: "networkidle2" });
  await sleep(1500);
  take.mx = 900;
  take.my = 700;
  await page.mouse.move(take.mx, take.my);
  await take.start();
  await sleep(2600);
  const tabs = await page.$$('[role="tab"]');
  const label = async (i: number) => tabs[i].evaluate((el) => el.textContent ?? "");
  for (let i = 0; i < tabs.length; i++) {
    const t = await label(i);
    if (t.includes("agent")) {
      for (let k = 0; k < 30; k++) {
        await page.mouse.wheel({ deltaY: 12 });
        await sleep(16);
      }
      await sleep(300);
      const b = (await tabs[i].boundingBox())!;
      await take.click(b.x + b.width / 2, b.y + b.height / 2, "tab-agent", 800);
      await sleep(1800);
    }
  }
  for (let k = 0; k < 50; k++) {
    await page.mouse.wheel({ deltaY: 10 });
    await sleep(16);
  }
  await sleep(900);
  const use = await take.box('[data-testid="use-style"]');
  await take.click(use.x + use.width / 2, use.y + use.height / 2, "use-style", 900);
  await sleep(2200);
  await take.stop();
}

if (which === "home") {
  const take = new Take("home");
  const page = await take.open();
  await page.goto(`${base}/home`, { waitUntil: "networkidle2" });
  await sleep(1500);
  take.mx = 1000;
  take.my = 650;
  await page.mouse.move(take.mx, take.my);
  await take.start();
  await sleep(2500);
  take.mark("scroll");
  for (let k = 0; k < 70; k++) {
    await page.mouse.wheel({ deltaY: 9 });
    await sleep(16);
  }
  await sleep(800);
  const copy = await page.$$("button");
  for (const b of copy) {
    const t = await b.evaluate((el) => el.textContent ?? "");
    if (t.trim() === "Copy") {
      const bb = (await b.boundingBox())!;
      await take.click(bb.x + bb.width / 2, bb.y + bb.height / 2, "copy", 900);
      break;
    }
  }
  await sleep(2200);
  await take.stop();
}
