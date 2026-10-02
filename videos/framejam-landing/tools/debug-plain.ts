import path from "node:path";
import puppeteer from "puppeteer-core";
import { root, sleep } from "./rec.ts";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage();
for (const f of ["composition-v1", "../../../../presets/paper-marker/composition"]) {
  await page.goto("file://" + path.join(root, "stage/ledgerly", f, "index.html"), { waitUntil: "networkidle2" });
  await sleep(800);
  console.log(f, await page.evaluate(`(() => {
    const tl = window.__timelines["paper-marker"];
    function vis() { return ["#s1","#s2","#s3","#s4","#s5"].map(function (s) { return getComputedStyle(document.querySelector(s)).visibility[0]; }).join(""); }
    const out = ["now " + vis()];
    for (const t of [0.5, 2.9, 7.5, 2.9, 0.5]) { tl.seek(t); out.push(t + " " + vis()); }
    return out.join("  ");
  })()`));
}
await browser.close();
