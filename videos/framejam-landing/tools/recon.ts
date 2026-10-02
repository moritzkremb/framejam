import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const base = process.env.FJ_URL ?? "http://localhost:4600";
const out = path.resolve(import.meta.dirname, "../stage/recon");
fs.mkdirSync(out, { recursive: true });
const { hero } = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../stage/reviews.json"), "utf8"));
const W = Number(process.env.W ?? 1600);
const H = Number(process.env.H ?? 1000);

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required", "--hide-scrollbars"],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pages: [string, string][] = [
  ["home", "/home"],
  ["styles", "/styles"],
  ["style-detail", "/styles/paper-marker"],
  ["reviews", "/reviews"],
  ["review", new URL(hero.url).pathname],
];
for (const [name, p] of pages) {
  await page.goto(base + p, { waitUntil: "networkidle2" });
  await sleep(2500);
  await page.screenshot({ path: path.join(out, `${name}-${W}.png`) });
  console.log(name);
}
await browser.close();
