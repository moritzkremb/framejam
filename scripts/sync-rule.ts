/**
 * Writes the Cursor rule `.cursor/rules/framejam.mdc` from `skills/framejam/SKILL.md`, so the two never drift.
 * `npm run sync:rule`; tests/skill-rule.test.ts fails when the rule is out of date.
 *
 * With `--release` (run by `npm version`), it also records the skill's fingerprint for its "Skill version" in
 * `skills/framejam/versions.json`, and refuses if that version was already released with different text.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { packageRoot } from "../src/server/paths.ts";
import { parseSkillVersion, skillFile, skillHash, skillVersionsFile } from "../src/server/skill.ts";

export { skillFile };
export const ruleFile = path.join(packageRoot, ".cursor", "rules", "framejam.mdc");

/** Same body as the skill; the frontmatter swaps `name` for the rule fields Cursor reads. */
export function cursorRule(skill: string): string {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(skill);
  if (!match) throw new Error("SKILL.md has no frontmatter");
  const description = /^description: (.*)$/m.exec(match[1])?.[1];
  if (!description) throw new Error("SKILL.md frontmatter has no description");
  return `---\ndescription: ${description}\nglobs:\nalwaysApply: false\n---\n${skill.slice(match[0].length)}`;
}

export type ReleasedSkills = Record<string, string>;

export function readReleased(): ReleasedSkills {
  return JSON.parse(fs.readFileSync(skillVersionsFile, "utf8")).released as ReleasedSkills;
}

/** Null when fine; otherwise why this skill text can't ship under its version number. */
export function releaseProblem(skill: string, released: ReleasedSkills): string | null {
  const version = parseSkillVersion(skill);
  if (version === null) return 'SKILL.md needs a "Skill version: N" line.';
  const known = released[String(version)];
  if (known && known !== skillHash(skill)) {
    return `SKILL.md changed after skill version ${version} was released. Raise "Skill version" to ${version + 1}.`;
  }
  return null;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const skill = fs.readFileSync(skillFile, "utf8");
  fs.writeFileSync(ruleFile, cursorRule(skill));
  console.log(`wrote ${path.relative(packageRoot, ruleFile)}`);
  if (process.argv.includes("--release")) {
    const released = readReleased();
    const problem = releaseProblem(skill, released);
    if (problem) {
      console.error(problem);
      process.exit(1);
    }
    released[String(parseSkillVersion(skill))] = skillHash(skill);
    fs.writeFileSync(skillVersionsFile, `${JSON.stringify({ released }, null, 2)}\n`);
    console.log(`recorded skill version ${parseSkillVersion(skill)} in ${path.relative(packageRoot, skillVersionsFile)}`);
  }
}
