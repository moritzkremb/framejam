// Deterministic renderer: steps the engine frame by frame in headless Chrome, pipes JPEGs to ffmpeg.
// usage: node tools/render.mjs --from 22 --to 30 --fps 30 --scale 0.5 --out out/preview.mp4 [--only a,b] [--workers 3] [--noaudio] [--crf 16] [--variant b] [--force]  (--to defaults to the song length; an existing --out is kept unless --force)
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { serve } from "./serve.mjs";
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .join(" ")
    .split("--")
    .filter(Boolean)
    .map((s) => {
      const [k, ...v] = s.trim().split(" ");
      return [k, v.join(" ") || true];
    }),
);
const fps = +(args.fps ?? 30),
  scale = +(args.scale ?? 1),
  from = +(args.from ?? 0),
  to = +(
    args.to ??
    JSON.parse(fs.readFileSync("engine/data/audio.json", "utf8")).duration
  ),
  workers = +(args.workers ?? 1);
const out = args.out ?? "out/render.mp4";
if (fs.existsSync(out) && !args.force) {
  console.error(`${out} exists; pass --force to replace it`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
const f0 = Math.round(from * fps),
  f1 = Math.round(to * fps);
const { srv, port } = await serve(0);
const q = new URLSearchParams({ scale: String(scale) });
if (args.only) q.set("only", args.only);
if (args.variant || args.ending) q.set("variant", args.variant || args.ending);
const launch = () =>
  chromium.launch({
    channel: "chrome",
    headless: true,
    args: [
      "--use-angle=metal",
      "--enable-gpu",
      "--ignore-gpu-blocklist",
      "--enable-unsafe-swiftshader=false",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
    ],
  });
async function renderChunk(a, b, file, wi) {
  const browser = await launch();
  const page = await browser.newPage({
    viewport: {
      width: Math.round(1920 * scale),
      height: Math.round(1080 * scale),
    },
  });
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning")
      console.log(`[w${wi}] ${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => console.log(`[w${wi}] pageerror: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/engine/index.html?${q}`);
  await page.waitForFunction(() => window.__ready || window.__error, null, {
    timeout: 180000,
  });
  const err = await page.evaluate(() => window.__error);
  if (err) throw new Error(err);
  const ff = spawn(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "image2pipe",
      "-framerate",
      String(fps),
      "-c:v",
      "mjpeg",
      "-i",
      "-",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      String(args.crf ?? 16),
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(fps),
      file,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const t0 = Date.now();
  for (let f = a; f < b; f++) {
    const buf = await page.evaluate(
      async ([f, fps]) => {
        await window.renderFrame(f, fps);
        const u8 = await window.grab("image/jpeg", 0.94);
        let s = "";
        for (let i = 0; i < u8.length; i += 0x8000)
          s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
        return btoa(s);
      },
      [f, fps],
    );
    if (!ff.stdin.write(Buffer.from(buf, "base64")))
      await new Promise((r) => ff.stdin.once("drain", r));
    if ((f - a) % 60 === 0)
      process.stdout.write(
        `[w${wi}] frame ${f}/${b} ${((f - a + 1) / ((Date.now() - t0) / 1000)).toFixed(1)} fps\n`,
      );
  }
  ff.stdin.end();
  const code = await new Promise((r) => ff.on("close", r));
  await browser.close();
  if (code !== 0)
    throw new Error(`ffmpeg chunk encode failed (exit ${code}): ${file}`);
}
const n = f1 - f0,
  per = Math.ceil(n / workers),
  parts = [];
await Promise.all(
  Array.from({ length: workers }, (_, i) => {
    const a = f0 + i * per,
      b = Math.min(f1, a + per);
    if (a >= b) return;
    const file = out.replace(/\.mp4$/, `.part${i}.mp4`);
    parts.push([i, file]);
    return renderChunk(a, b, file, i);
  }),
);
parts.sort((x, y) => x[0] - y[0]);
const list = out + ".txt";
fs.writeFileSync(
  list,
  parts.map(([, f]) => `file '${path.resolve(f)}'`).join("\n"),
);
const muxArgs = [
  "-y",
  "-loglevel",
  "error",
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  list,
];
if (!args.noaudio)
  muxArgs.push(
    "-ss",
    String(f0 / fps),
    "-t",
    String(n / fps),
    "-i",
    JSON.parse(fs.readFileSync("engine/data/audio.json", "utf8")).master,
    "-map",
    "0:v",
    "-map",
    "1:a",
    "-af",
    "apad",
    "-shortest",
    "-c:a",
    "aac",
    "-b:a",
    "320k",
  ); // apad: silence after the song ends (extended end card)
muxArgs.push("-c:v", "copy", "-movflags", "+faststart", out);
const muxCode = await new Promise((r) =>
  spawn("ffmpeg", muxArgs, { stdio: "inherit" }).on("close", r),
);
if (muxCode !== 0) {
  console.error(
    `ffmpeg mux failed (exit ${muxCode}); chunk files kept for inspection`,
  );
  process.exit(1);
}
parts.forEach(([, f]) => fs.unlinkSync(f));
fs.unlinkSync(list);
srv.close();
console.log("wrote", out);
