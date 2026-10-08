import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { packageRoot } from "./paths.ts";
import { UPDATE_COMMAND } from "./update.ts";

export const skillFile = path.join(packageRoot, "skills", "framejam", "SKILL.md");
export const skillVersionsFile = path.join(packageRoot, "skills", "framejam", "versions.json");

/** The number on the skill's "Skill version: N" line, or null when it has none (skills from before 0.3.0). */
export function parseSkillVersion(text: string): number | null {
  const m = /^Skill version: (\d+)/m.exec(text);
  return m ? Number(m[1]) : null;
}

export function skillHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** The skill version this FrameJam ships. */
export function currentSkillVersion(): number | null {
  try {
    return parseSkillVersion(fs.readFileSync(skillFile, "utf8"));
  } catch {
    return null;
  }
}

/** Where `npx skills add -g` and the apps keep global skills. */
export function defaultSkillDirs(home = os.homedir()): string[] {
  return [".agents", ".claude", ".cursor", ".codex"].map((d) => path.join(home, d, "skills", "framejam"));
}

export interface SkillStatus {
  current: number | null;
  /** Installed copies of the FrameJam skill and their versions (null: older than versioning). */
  copies: { path: string; version: number | null }[];
  outdated: boolean;
  command: string;
}

export function skillStatus(dirs = defaultSkillDirs()): SkillStatus {
  const current = currentSkillVersion();
  const copies = dirs.flatMap((dir) => {
    const file = path.join(dir, "SKILL.md");
    try {
      return [{ path: file, version: parseSkillVersion(fs.readFileSync(file, "utf8")) }];
    } catch {
      return [];
    }
  });
  const outdated = current !== null && copies.some((c) => c.version === null || c.version < current);
  return { current, copies, outdated, command: UPDATE_COMMAND };
}
