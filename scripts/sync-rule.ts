/**
 * Writes the Cursor rule `.cursor/rules/framejam.mdc` from `skills/framejam/SKILL.md`, so the two never drift.
 * `npm run sync:rule`; tests/skill-rule.test.ts fails when the rule is out of date.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { packageRoot } from "../src/server/paths.ts";

export const skillFile = path.join(packageRoot, "skills", "framejam", "SKILL.md");
export const ruleFile = path.join(packageRoot, ".cursor", "rules", "framejam.mdc");

/** Same body as the skill; the frontmatter swaps `name` for the rule fields Cursor reads. */
export function cursorRule(skill: string): string {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(skill);
  if (!match) throw new Error("SKILL.md has no frontmatter");
  const description = /^description: (.*)$/m.exec(match[1])?.[1];
  if (!description) throw new Error("SKILL.md frontmatter has no description");
  return `---\ndescription: ${description}\nglobs:\nalwaysApply: false\n---\n${skill.slice(match[0].length)}`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  fs.writeFileSync(ruleFile, cursorRule(fs.readFileSync(skillFile, "utf8")));
  console.log(`wrote ${path.relative(packageRoot, ruleFile)}`);
}
