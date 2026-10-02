/**
 * Screen recorder for the footage: headless Chrome + CDP screencast (JPEG frames with
 * timestamps) → constant-30fps H.264 via ffmpeg. Headless Chrome draws no mouse cursor, so a
 * cursor overlay mirrors the app's real CSS cursor under the pointer (arrow, hand, I-beam,
 * or the custom comment-bubble cursor) and shows a soft ring on click.
 * Every take also logs its events (clicks, typing, cues) with times, for syncing SFX/captions.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type CDPSession, type Page } from "puppeteer-core";

export const base = process.env.FJ_URL ?? "http://localhost:4600";
export const root = path.resolve(import.meta.dirname, "..");
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const cursorScript = fs.readFileSync(path.join(import.meta.dirname, "cursor.js"), "utf8");

export class Take {
  browser!: Browser;
  page!: Page;
  cdp!: CDPSession;
  frames: { file: string; t: number }[] = [];
  events: { t: number; type: string; data?: unknown }[] = [];
  t0 = 0;
  mx = 0;
  my = 0;
  dir: string;
  recording = false;

  constructor(
    public name: string,
    public width = 1440,
    public height = 900,
    public dpr = 2,
  ) {
    this.dir = path.join(root, "stage", "takes", name);
  }

  async open() {
    fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(this.dir, "frames"), { recursive: true });
    this.browser = await puppeteer.launch({
      executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
      args: ["--autoplay-policy=no-user-gesture-required", "--hide-scrollbars", "--force-color-profile=srgb", "--font-render-hinting=none"],
      defaultViewport: { width: this.width, height: this.height, deviceScaleFactor: this.dpr },
    });
    this.page = await this.browser.newPage();
    await this.page.evaluateOnNewDocument(cursorScript);
    this.cdp = await this.page.createCDPSession();
    let n = 0;
    this.cdp.on("Page.screencastFrame", (f) => {
      void this.cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
      if (!this.recording) return;
      const file = path.join(this.dir, "frames", `${String(n++).padStart(6, "0")}.jpg`);
      fs.writeFileSync(file, Buffer.from(f.data, "base64"));
      this.frames.push({ file, t: f.metadata.timestamp! });
    });
    return this.page;
  }

  now() {
    return Date.now() / 1000 - this.t0;
  }
  mark(type: string, data?: unknown) {
    this.events.push({ t: Number(this.now().toFixed(3)), type, data });
  }

  async start() {
    await this.cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: this.width * this.dpr, maxHeight: this.height * this.dpr, everyNthFrame: 1 });
    await sleep(300);
    this.recording = true;
    this.t0 = Date.now() / 1000;
    this.mark("start");
  }

  /** Eased mouse move (ease-in-out), ~60 steps per second. */
  async move(x: number, y: number, ms = 650) {
    const sx = this.mx, sy = this.my;
    const steps = Math.max(2, Math.round(ms / 16));
    for (let i = 1; i <= steps; i++) {
      const p = i / steps;
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      await this.page.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e);
      await sleep(ms / steps);
    }
    this.mx = x;
    this.my = y;
  }

  async click(x: number, y: number, label: string, ms = 650) {
    await this.move(x, y, ms);
    await sleep(140);
    this.mark("click", label);
    await this.page.mouse.down();
    await sleep(90);
    await this.page.mouse.up();
  }

  async type(text: string, delay = 42) {
    this.mark("type-start", text);
    for (const ch of text) {
      await this.page.keyboard.type(ch);
      await sleep(delay + (ch === " " ? 30 : Math.random() * 30));
    }
    this.mark("type-end", text);
  }

  async box(selector: string) {
    const el = await this.page.waitForSelector(selector, { visible: true, timeout: 20000 });
    const b = await el!.boundingBox();
    if (!b) throw new Error(`no box: ${selector}`);
    return b;
  }

  async stop() {
    this.mark("end");
    await sleep(400);
    this.recording = false;
    await this.cdp.send("Page.stopScreencast");
    await this.browser.close();
    this.encode();
  }

  encode() {
    const fps = 30;
    if (!this.frames.length) throw new Error("no frames");
    const first = this.frames[0].t;
    const total = this.events.at(-1)!.t;
    const list: string[] = [];
    for (let i = 0; i < this.frames.length; i++) {
      const next = i + 1 < this.frames.length ? this.frames[i + 1].t - first : Math.max(total, this.frames[i].t - first + 1 / fps);
      const dur = Math.max(0.001, next - (this.frames[i].t - first));
      list.push(`file '${this.frames[i].file}'`, `duration ${dur.toFixed(4)}`);
    }
    list.push(`file '${this.frames.at(-1)!.file}'`);
    const listFile = path.join(this.dir, "frames.txt");
    fs.writeFileSync(listFile, list.join("\n"));
    const out = path.join(root, "assets", "footage", `${this.name}.mp4`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listFile, "-vf", `fps=${fps},scale=${this.width * this.dpr}:${this.height * this.dpr}:flags=lanczos,format=yuv420p`, "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-g", "15", "-movflags", "+faststart", out]);
    // Screencast timestamps start slightly before t0; record the offset so events line up with video time.
    const offset = Number((this.t0 - first).toFixed(3));
    fs.writeFileSync(path.join(root, "assets", "footage", `${this.name}.events.json`), JSON.stringify({ offset, frames: this.frames.length, events: this.events.map((e) => ({ ...e, t: Number((e.t + offset).toFixed(3)) })) }, null, 2));
    const fpsReal = this.frames.length / (this.frames.at(-1)!.t - first);
    console.log(`[rec] ${this.name}: ${this.frames.length} frames, ~${fpsReal.toFixed(1)} fps captured → ${out}`);
  }
}
