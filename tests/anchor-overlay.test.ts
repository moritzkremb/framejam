import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { builtinPlaybooksDir } from "../src/server/paths.ts";

const pb = path.join(builtinPlaybooksDir, "anchor-overlay");
const scripts = path.join(pb, "scripts");
const template = path.join(pb, "template");

const has = (cmd: string, args: string[]) => spawnSync(cmd, args, { encoding: "utf8" }).status === 0;
const havePython = has("python3", ["-c", "import numpy"]);
const haveFfmpeg = has("ffmpeg", ["-hide_banner", "-filters"]);
const havePillow = has("python3", ["-c", "import PIL.ImageFont"]);

type Plan = Record<string, any>;

const root = fs.mkdtempSync(path.join(os.tmpdir(), "anchor-overlay-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

let n = 0;
function project(edit: Plan, extra: Record<string, unknown> = {}) {
  const dir = path.join(root, `p${n++}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(path.join(template, "assets"), path.join(dir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(dir, "edit.json"), JSON.stringify(edit));
  for (const [name, data] of Object.entries(extra)) fs.writeFileSync(path.join(dir, name), JSON.stringify(data));
  return dir;
}

function py(script: string, args: string[], cwd: string) {
  const r = spawnSync("python3", [path.join(scripts, script), ...args], { cwd, encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const example = () => JSON.parse(fs.readFileSync(path.join(template, "edit.example.json"), "utf8")) as Plan;
const words = () => JSON.parse(fs.readFileSync(path.join(template, "words.example.json"), "utf8"));
const captions = () => JSON.parse(fs.readFileSync(path.join(template, "captions.example.json"), "utf8"));

function checkPlan(edit: Plan, caps: unknown = captions()) {
  const dir = project(edit, { "captions.json": caps, "words.json": words() });
  return py("check_plan.py", ["edit.json", "captions.json", "--words", "words.json"], dir);
}

describe.skipIf(!havePython)("anchor-overlay: check_plan.py", () => {
  it("passes the example plan with its words and captions", () => {
    const r = checkPlan(example());
    expect(r.out).toContain("plan ok");
    expect(r.code).toBe(0);
  });

  it("fails an overlay that hides the sides of the anchor", () => {
    const p = example();
    p.overlays[0].box = [0, 290, 1080, 1300];
    const r = checkPlan(p);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/A-roll hidden: overlay o1 leaves \d+ px at the side/);
  });

  it("fails a thumb that reaches the eyes, and three overlays at once", () => {
    const p = example();
    p.aroll.eyeY = 600;
    const thumb = p.overlays.find((o: Plan) => o.kind === "thumb")!;
    thumb.box = [110, 230, 860, 400];
    p.overlays.push({ ...p.overlays[0], id: "x1", src: "assets/vis/chart.png" }, { ...p.overlays[0], id: "x2", src: "assets/vis/camera.png" });
    const r = checkPlan(p);
    expect(r.out).toMatch(/thumb o\d+ reaches y/);
    expect(r.out).toMatch(/overlays at once/);
  });

  it("fails an overlay that doesn't start on its word", () => {
    const p = example();
    p.overlays[1].at += 0.5;
    p.overlays[1].end += 0.5;
    const r = checkPlan(p);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/on the word/);
  });

  it("fails text in the platform-UI zone and a caption over a big word", () => {
    const p = example();
    p.theme.captionY = 1600;
    const r = checkPlan(p);
    expect(r.out).toMatch(/platform-UI zone/);
    const caps = captions();
    const big = p.big[0];
    caps.push({ start: big.at, end: big.at + 0.4, text: "slow", words: [{ text: "slow", orig: "slow", start: big.at }] });
    expect(checkPlan(example(), caps).out).toMatch(/runs while the big word/);
  });

  it("fails a gap with no change, a same-picture repeat and a missing music object", () => {
    const p = example();
    p.overlays = p.overlays.slice(0, 2);
    p.overlays[1].src = p.overlays[0].src;
    delete p.music;
    const r = checkPlan(p);
    expect(r.out).toMatch(/same picture in a row/);
    expect(r.out).toMatch(/music: it's on by default/);
    expect(r.out).toMatch(/overlay cadence: overlays cover/);
  });

  it("lets a plan turn music off", () => {
    const p = example();
    p.music = false;
    const r = checkPlan(p);
    expect(r.code).toBe(0);
    expect(r.out).toContain("plan ok");
  });

  it("rejects placeholders in a normal plan", () => {
    const p = example();
    p.overlays[0].placeholder = true;
    expect(checkPlan(p).out).toMatch(/is a placeholder/);
  });
});

describe.skipIf(!havePython)("anchor-overlay: make_captions.py", () => {
  const run = (args: string[]) => {
    const dir = project(example(), { "words.json": words() });
    const r = py("make_captions.py", ["--words", "words.json", "--duration", "26.61", "--out", "c.json", ...args], dir);
    expect(r.code).toBe(0);
    return JSON.parse(fs.readFileSync(path.join(dir, "c.json"), "utf8")) as { text: string; start: number; end: number; words: unknown[] }[];
  };

  it("defaults to one word at a time in the speaker's own case, with commas kept and full stops dropped", () => {
    const caps = run([]);
    expect(caps.every((c) => c.words.length === 1)).toBe(true);
    expect(caps.map((c) => c.text)).toContain("Most");
    expect(caps.map((c) => c.text)).toContain("timeline,");
    expect(caps.map((c) => c.text)).toContain("way");
    expect(caps.some((c) => c.text !== c.text.toLowerCase() && c.text !== c.text.toUpperCase())).toBe(true);
    expect(caps.every((c) => c.end - c.start >= 0.19 && c.end - c.start <= 1.21)).toBe(true);
  });

  it("makes all-caps chunks of up to three words when asked", () => {
    const caps = run(["--max-words", "3", "--case", "upper"]);
    expect(caps.every((c) => c.words.length <= 3 && c.text === c.text.toUpperCase())).toBe(true);
    expect(caps.some((c) => c.words.length === 3)).toBe(true);
  });

  it("passes the plan check with the three-word all-caps override in the theme", () => {
    const caps = run(["--max-words", "3", "--case", "upper", "--breaks", "edit.json", "--hide", "edit.json"]);
    const p = example();
    p.theme = { captionCase: "upper", captionMaxWords: 3 };
    const r = checkPlan(p, caps);
    expect(r.out).not.toMatch(/captions:/);
  });

  it("hides captions while a big word is up", () => {
    const caps = run(["--hide", "edit.json"]);
    const big = example().big[0];
    expect(caps.some((c) => c.start < big.end && c.end > big.at)).toBe(false);
  });
});

describe.skipIf(!havePython || !havePillow || !haveFfmpeg)("anchor-overlay: render.py and check_render.py", () => {
  const ff = (args: string[]) => {
    const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
  };

  function tiny(overlay: Plan) {
    const plan: Plan = {
      duration: 4,
      fps: 30,
      aroll: { src: "assets/speech.mp4", eyeY: 720 },
      punches: [{ at: 2.5, zoom: 1.12 }],
      overlays: [{ id: "o1", src: "assets/vis/a.png", size: [800, 450], at: 1, end: 2, ...overlay }],
      big: [],
      labels: [],
      asides: [],
      music: false,
    };
    const dir = project(plan);
    fs.mkdirSync(path.join(dir, "assets", "vis"), { recursive: true });
    ff(["-f", "lavfi", "-i", "testsrc2=s=1080x1920:r=30:d=4", "-f", "lavfi", "-i", "sine=f=220:d=4,volume=0.4", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(dir, "assets", "speech.mp4")]);
    ff(["-f", "lavfi", "-i", "color=c=0xd04030:s=800x450", "-frames:v", "1", path.join(dir, "assets", "vis", "a.png")]);
    return { dir, plan };
  }

  it("renders a plan and the render checker passes it (and adding gain fixes loudness)", () => {
    const { dir } = tiny({ kind: "thumb" });
    const r = py("render.py", ["--draft", "--out", "r.mp4"], dir);
    expect(r.code, r.out).toBe(0);
    expect(fs.existsSync(path.join(dir, "r.mp4"))).toBe(true);
    const c = py("check_render.py", ["r.mp4", "--edit", "edit.json", "--json"], dir);
    const result = JSON.parse(c.out) as { failures: string[]; facts: Record<string, unknown> };
    expect(result.facts.overlaysConfirmed).toBe("1/1");
    expect(result.failures.filter((f) => !f.startsWith("loudness") && !f.startsWith("cadence"))).toEqual([]);
  });

  it("fails the render check when the overlay is drawn over the anchor's sides", () => {
    const { dir } = tiny({ kind: "card", box: [0, 290, 1080, 1300], size: [800, 1000] });
    expect(py("render.py", ["--draft", "--out", "r.mp4"], dir).code).toBe(0);
    const c = py("check_render.py", ["r.mp4", "--edit", "edit.json"], dir);
    expect(c.code).toBe(1);
    expect(c.out).toMatch(/A-roll hidden at the side/);
  });

  it("fails the render check when an overlay isn't where the plan says", () => {
    const { dir, plan } = tiny({ kind: "thumb" });
    expect(py("render.py", ["--draft", "--out", "r.mp4"], dir).code).toBe(0);
    plan.overlays[0].at = 3;
    plan.overlays[0].end = 3.9;
    fs.writeFileSync(path.join(dir, "late.json"), JSON.stringify(plan));
    const c = py("check_render.py", ["r.mp4", "--edit", "late.json"], dir);
    expect(c.code).toBe(1);
    expect(c.out).toMatch(/overlay o1/);
  });

  it("flags a render with a black stretch", () => {
    const { dir } = tiny({ kind: "thumb" });
    ff(["-f", "lavfi", "-i", "color=c=black:s=540x960:r=30:d=4", "-f", "lavfi", "-i", "sine=f=220:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", path.join(dir, "black.mp4")]);
    const c = py("check_render.py", ["black.mp4", "--edit", "edit.json"], dir);
    expect(c.code).toBe(1);
    expect(c.out).toMatch(/black frames/);
  });

  it("draws the text with the bundled fonts, on its frames only, with no libass or drawtext", () => {
    const { dir, plan } = tiny({ kind: "thumb" });
    const noText = py("render.py", ["--draft", "--out", "plain.mp4"], dir);
    expect(noText.code, noText.out).toBe(0);

    plan.big = [{ text: "five", at: 0.2, end: 0.9 }];
    plan.labels = [{ text: "1. first", at: 2.2, end: 3.5 }];
    fs.writeFileSync(path.join(dir, "edit.json"), JSON.stringify(plan));
    fs.writeFileSync(path.join(dir, "captions.json"), JSON.stringify([{ start: 1.2, end: 1.9, text: "Hello", words: [{ text: "Hello", orig: "Hello", start: 1.2 }] }]));
    const r = py("render.py", ["--draft", "--out", "t.mp4"], dir);
    expect(r.code, r.out).toBe(0);
    expect(r.out).not.toMatch(/fontselect|failed|No such filter/i);

    const band = (file: string, t: number, crop: string) => {
      const f = spawnSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", path.join(dir, file), "-frames:v", "1", "-vf", `crop=${crop},format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 1 << 26 });
      expect(f.status, String(f.stderr)).toBe(0);
      return f.stdout as Buffer;
    };
    const diff = (a: Buffer, b: Buffer) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0) / a.length;
    const chest = "540:90:0:570";
    const top = "540:60:0:170";
    const mid = "540:120:0:330";
    expect(diff(band("t.mp4", 1.5, chest), band("plain.mp4", 1.5, chest))).toBeGreaterThan(3);
    expect(diff(band("t.mp4", 2.05, chest), band("plain.mp4", 2.05, chest))).toBeLessThan(1);
    expect(diff(band("t.mp4", 0.5, mid), band("plain.mp4", 0.5, mid))).toBeGreaterThan(3);
    expect(diff(band("t.mp4", 1.05, mid), band("plain.mp4", 1.05, mid))).toBeLessThan(1);
    expect(diff(band("t.mp4", 2.8, top), band("plain.mp4", 2.8, top))).toBeGreaterThan(3);
    expect(diff(band("t.mp4", 3.7, top), band("plain.mp4", 3.7, top))).toBeLessThan(1);
  });
});
