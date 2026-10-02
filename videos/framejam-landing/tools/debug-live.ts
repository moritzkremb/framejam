import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { base, root, sleep } from "./rec.ts";

const { hero } = JSON.parse(fs.readFileSync(path.join(root, "stage/reviews.json"), "utf8"));
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required", "--hide-scrollbars"],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on("console", (m) => console.log("[console]", m.type(), m.text()));
page.on("requestfailed", (r) => console.log("[failed]", r.url(), r.failure()?.errorText));
await page.goto(`${base}${new URL(hero.url).pathname}`, { waitUntil: "networkidle2" });
await sleep(3000);
const frame = page.frames().find((f) => f !== page.mainFrame());
console.log("frames", page.frames().map((f) => f.url()));
const info = await frame?.evaluate(() => ({
  gsap: typeof (window as any).gsap,
  tls: Object.keys((window as any).__timelines ?? {}),
  ready: (window as any).__playerReady,
  fonts: [...document.fonts].map((f) => `${f.family}:${f.status}`),
  s2: getComputedStyle(document.querySelector("#s2")!).visibility,
  body: document.body.innerHTML.length,
}));
console.log(info);
const scrub = await (await page.$('[data-testid="timeline-scrub"]'))!.boundingBox();
await page.mouse.click(scrub!.x + scrub!.width * 0.36, scrub!.y + scrub!.height - 6);
await sleep(1500);
const info2 = await frame?.evaluate(() => ({
  s1: getComputedStyle(document.querySelector("#s1")!).visibility,
  s2: getComputedStyle(document.querySelector("#s2")!).visibility,
  t: (window as any).__timelines?.["paper-marker"]?.time?.(),
}));
console.log(info2);
console.log(await frame?.evaluate(`(() => {
  const tl = window.__timelines["paper-marker"];
  function vis() { return ["#s1","#s2","#s3","#s4","#s5"].map(function (s) { return getComputedStyle(document.querySelector(s)).visibility[0]; }).join(""); }
  const out = ["now " + vis() + " paused=" + tl.paused() + " children=" + tl.getChildren().length];
  
  const s2 = document.querySelector("#s2");
  out.push("inline=" + s2.getAttribute("style") + " class=" + s2.className);
  
  const sheets = []; for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) if (/visibility/.test(r.cssText)) sheets.push(r.cssText.slice(0, 140)); } catch (e) {} }
  out.push("rules: " + sheets.join(" || "));
  out.push("scripts " + [...document.scripts].map(function (s) { return s.src || s.textContent.slice(0, 80).replace(/\\s+/g, " "); }).join(" | "));
  return out.join("\\n");
})()`));
console.log(await frame?.evaluate(`(() => {
  const o = [];
  for (const sel of ["html", "body", "#stage", "#s2", "#s2a", ".grain", "#s5"]) { const e = document.querySelector(sel); const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); o.push(sel + " vis=" + cs.visibility + " op=" + cs.opacity + " disp=" + cs.display + " bg=" + cs.backgroundColor + " rect=" + [r.x, r.y, r.width, r.height].map(Math.round).join(",") + " z=" + cs.zIndex + " tf=" + cs.transform.slice(0, 40)); }
  const el = document.elementFromPoint(400, 500); o.push("at(400,500)=" + (el && (el.id || el.className || el.tagName)));
  o.push("w=" + innerWidth + "x" + innerHeight);
  return o.join("\\n");
})()`));
const ifr = await page.$("iframe");
await ifr!.screenshot({ path: path.join(root, "stage/recon/debug-iframe.png") });
await page.screenshot({ path: path.join(root, "stage/recon/debug-live.png") });
await browser.close();
