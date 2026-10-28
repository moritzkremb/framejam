import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { builtinPlaybooksDir } from "../src/server/paths.ts";

const playbook = path.join(builtinPlaybooksDir, "saraev-talking-head");
const scripts = path.join(playbook, "scripts");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "saraev-talking-head-"));
const haveFfmpeg = spawnSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf8" }).status === 0;

function run(command: string, args: string[], cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 16 << 20 });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

function py(script: string, args: string[]) {
  return run("python3", [path.join(scripts, script), ...args]);
}

beforeAll(() => {
  if (!haveFfmpeg) return;
  const source = path.join(root, "raw.mp4");
  const result = run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=s=640x360:r=30:d=6",
    "-f",
    "lavfi",
    "-i",
    "sine=f=330:d=1.1:r=48000",
    "-f",
    "lavfi",
    "-i",
    "sine=f=440:d=1.1:r=48000",
    "-f",
    "lavfi",
    "-i",
    "sine=f=550:d=1.8:r=48000",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=48000:cl=mono:d=6",
    "-filter_complex",
    "[1:a]adelay=100[a1];[2:a]adelay=1900[a2];[3:a]adelay=3700[a3];[a1][a2][a3][4:a]amix=inputs=4:duration=longest:normalize=0[a]",
    "-map",
    "0:v",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    source,
  ]);
  expect(result.code, result.out).toBe(0);
  fs.writeFileSync(
    path.join(root, "words.json"),
    JSON.stringify({
      words: [
        { text: "A", start: 0.2, end: 0.3 },
        { text: "clean", start: 0.32, end: 0.58 },
        { text: "opening.", start: 0.6, end: 0.95 },
        { text: "mistake", start: 2.0, end: 2.3 },
        { text: "CUT", start: 2.38, end: 2.52 },
        { text: "NOW", start: 2.54, end: 2.72 },
        { text: "A", start: 3.8, end: 3.9 },
        { text: "better", start: 3.92, end: 4.18 },
        { text: "ending.", start: 4.2, end: 4.55 },
      ],
    }),
  );
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe.skipIf(!haveFfmpeg)("saraev talking-head pipeline", () => {
  it("finds speech islands with the deterministic fallback", () => {
    const result = py("detect_speech.py", [
      "raw.mp4",
      "--backend",
      "ffmpeg",
      "--min-silence",
      "0.5",
      "--noise-db",
      "-45",
      "--out",
      "vad.json",
    ]);
    expect(result.code, result.out).toBe(0);
    const vad = JSON.parse(fs.readFileSync(path.join(root, "vad.json"), "utf8"));
    expect(vad.backend).toBe("ffmpeg");
    expect(vad.parameters.minSilence).toBe(0.5);
    expect(vad.speech.length).toBe(3);
  });

  it("removes only speech islands carrying a configured marker and keeps an auditable map", () => {
    const result = py("plan_edit.py", [
      "--input",
      "raw.mp4",
      "--vad",
      "vad.json",
      "--words",
      "words.json",
      "--trigger",
      "cut now",
      "--teaser",
      "3.8:4.4",
      "--out",
      "edit-01",
    ]);
    expect(result.code, result.out).toBe(0);
    const decisions = JSON.parse(fs.readFileSync(path.join(root, "edit-01", "decisions.json"), "utf8"));
    const edited = JSON.parse(fs.readFileSync(path.join(root, "edit-01", "edited.words.json"), "utf8"));
    const plan = JSON.parse(fs.readFileSync(path.join(root, "edit-01", "edit.json"), "utf8"));
    expect(decisions.removedIslands).toHaveLength(1);
    expect(decisions.matches[0].action).toBe("remove_speech_island");
    expect(edited.words.some((word: { text: string }) => /cut|now|mistake/i.test(word.text))).toBe(false);
    expect(plan.clips[0].role).toBe("teaser");
    expect(plan.triggers).toEqual(["cut now"]);
  });

  it("renders captions and graphics, then creates a short technical comparison", () => {
    const captions = py("make_captions.py", [
      "--words",
      "edit-01/edited.words.json",
      "--out",
      "edit-01/captions.srt",
      "--max-words",
      "3",
    ]);
    expect(captions.code, captions.out).toBe(0);
    const planPath = path.join(root, "edit-01", "edit.json");
    const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
    plan.graphics = [{ start: 0.1, end: 1.5, text: "PIPELINE FIXTURE", position: "top" }];
    fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
    const render = py("render.py", [
      "edit-01/edit.json",
      "--captions",
      "edit-01/captions.srt",
      "--sample",
      "0:2",
      "--out",
      "sample.mp4",
    ]);
    expect(render.code, render.out).toBe(0);
    expect(fs.statSync(path.join(root, "sample.mp4")).size).toBeGreaterThan(10_000);
    const compare = py("compare_renders.py", [
      "sample.mp4",
      "sample.mp4",
      "--out",
      "compare.mp4",
      "--report",
      "compare.json",
      "--height",
      "180",
    ]);
    expect(compare.code, compare.out).toBe(0);
    const report = JSON.parse(fs.readFileSync(path.join(root, "compare.json"), "utf8"));
    expect(report.purpose).toContain("no style-parity score");
    expect(report.candidate.blackRanges).toEqual([]);
    expect(fs.statSync(path.join(root, "compare.mp4")).size).toBeGreaterThan(10_000);
  });
});
