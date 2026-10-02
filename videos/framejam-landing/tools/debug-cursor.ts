import fs from "node:fs";
import path from "node:path";
import { base, root, sleep, Take } from "./rec.ts";
const { relay } = JSON.parse(fs.readFileSync(path.join(root, "stage/reviews.json"), "utf8"));
const take = new Take("dbg", 1440, 900, 1);
const page = await take.open();
await page.goto(`${base}${new URL(relay.url).pathname}`, { waitUntil: "networkidle2" });
await sleep(2500);
for (const [x, y] of [[300, 300], [530, 300], [530, 680], [1200, 300]]) {
  await page.mouse.move(x, y);
  await sleep(200);
  console.log(x, y, await page.evaluate(`(() => { const c = document.getElementById("__cur"); const el = document.elementFromPoint(${x}, ${y}); return { tag: el && (el.tagName + "." + el.className), cursor: el && getComputedStyle(el).cursor.slice(0, 60), src: c && c.getAttribute("src").slice(0, 40), tf: c && c.style.transform, complete: c && c.complete, nw: c && c.naturalWidth }; })()`));
}
await page.screenshot({ path: path.join(root, "stage/recon/dbg-cursor.png") });
await take.browser.close();
