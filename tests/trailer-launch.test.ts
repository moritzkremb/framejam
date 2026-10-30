import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validatePlaybook } from "../src/core/playbooks.ts";
import { builtinPlaybooksDir } from "../src/server/paths.ts";

const pb = path.join(builtinPlaybooksDir, "trailer-launch");
const script = path.join(pb, "scripts", "trailer_bed.py");

const hasUv = spawnSync("uv", ["--version"], { encoding: "utf8" }).status === 0;
const hasPyDeps = spawnSync("python3", ["-c", "import numpy, scipy, soundfile"], { encoding: "utf8" }).status === 0;

describe("trailer-launch playbook", () => {
  it("is valid and catalog-only shaped", () => {
    const raw = JSON.parse(fs.readFileSync(path.join(pb, "playbook.json"), "utf8"));
    expect(validatePlaybook(raw)).toEqual([]);
    expect(raw.id).toBe("trailer-launch");
    expect(raw.minAppVersion).toBe("0.6.0");
    expect(raw.inspiredBy?.[0]?.url).toContain("_ganimate_");
    expect(fs.existsSync(path.join(pb, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(pb, "poster.jpg"))).toBe(true);
    expect(fs.existsSync(path.join(pb, "preview.mp4"))).toBe(false);
    expect(fs.existsSync(script)).toBe(true);
  });
});

describe.skipIf(!hasUv && !hasPyDeps)("trailer-launch: trailer_bed.py", () => {
  it("keeps the silence window near zero and the drop louder", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trailer-bed-"));
    const cues = path.join(dir, "cues.json");
    const out = path.join(dir, "bed.wav");
    fs.writeFileSync(
      cues,
      JSON.stringify({
        bpm: 120,
        duration: 8,
        mood: "night",
        sections: [
          { t: 0, dur: 2.5, type: "atmosphere" },
          { t: 2.5, dur: 2, type: "build" },
          { t: 4.5, dur: 1.5, type: "silence" },
          { t: 6, dur: 2, type: "climax" },
        ],
        hits: [{ t: 6, sfx: "boom" }],
      }),
    );
    if (hasUv) execFileSync("uv", ["run", script, cues, "--out", out, "--print-sections"], { encoding: "utf8" });
    else execFileSync("python3", [script, cues, "--out", out, "--print-sections"], { encoding: "utf8" });
    expect(fs.existsSync(out)).toBe(true);

    const wav = fs.readFileSync(out);
    const data = wav.subarray(44);
    const sr = 44100;
    const rms = (t0: number, t1: number) => {
      const i0 = Math.floor(t0 * sr) * 4;
      const i1 = Math.min(data.length, Math.floor(t1 * sr) * 4);
      let s = 0;
      let n = 0;
      for (let i = i0; i + 1 < i1; i += 2) {
        const v = data.readInt16LE(i) / 32768;
        s += v * v;
        n++;
      }
      return n ? Math.sqrt(s / n) : 0;
    };
    const silent = rms(4.55, 5.9);
    const drop = rms(6.05, 7.4);
    expect(silent).toBeLessThan(0.005);
    expect(drop).toBeGreaterThan(0.04);
    expect(drop).toBeGreaterThan(silent * 20);
  });
});
