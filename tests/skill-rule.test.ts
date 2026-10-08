import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cursorRule, readReleased, releaseProblem, ruleFile, skillFile } from "../scripts/sync-rule.ts";
import { currentSkillVersion, parseSkillVersion, skillHash, skillStatus } from "../src/server/skill.ts";

describe("agent instructions", () => {
  it("keeps the Cursor rule in sync with SKILL.md (run npm run sync:rule)", () => {
    expect(fs.readFileSync(ruleFile, "utf8")).toBe(cursorRule(fs.readFileSync(skillFile, "utf8")));
  });

  it("raises the skill version whenever a released skill changes", () => {
    expect(releaseProblem(fs.readFileSync(skillFile, "utf8"), readReleased())).toBeNull();
    const v1 = "---\nname: x\n---\n# X\n\nSkill version: 1\n\nDo it.\n";
    expect(releaseProblem(v1, { "1": skillHash(v1) })).toBeNull();
    expect(releaseProblem(v1.replace("Do it.", "Do it twice."), { "1": skillHash(v1) })).toMatch(/Raise "Skill version" to 2/);
    expect(releaseProblem("no version here", {})).toMatch(/needs a "Skill version/);
  });
});

describe("skill status", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "framejam-skills-"));
  const copy = (name: string, text: string) => {
    fs.mkdirSync(path.join(root, name), { recursive: true });
    fs.writeFileSync(path.join(root, name, "SKILL.md"), text);
    return path.join(root, name);
  };

  it("reads the version FrameJam ships", () => {
    expect(currentSkillVersion()).toBe(parseSkillVersion(fs.readFileSync(skillFile, "utf8")));
    expect(currentSkillVersion()).toBeGreaterThanOrEqual(3);
  });

  it("flags installed copies that are older or unversioned, and ignores missing folders", () => {
    const current = currentSkillVersion()!;
    const fresh = copy("fresh", `Skill version: ${current}\n`);
    const old = copy("old", `Skill version: ${current - 1}\n`);
    const legacy = copy("legacy", "# FrameJam skill from 0.2\n");
    const missing = path.join(root, "missing");
    expect(skillStatus([fresh, missing]).outdated).toBe(false);
    expect(skillStatus([fresh, old]).outdated).toBe(true);
    expect(skillStatus([legacy]).copies).toEqual([{ path: path.join(legacy, "SKILL.md"), version: null }]);
    expect(skillStatus([legacy]).outdated).toBe(true);
    expect(skillStatus([]).outdated).toBe(false);
  });
});
