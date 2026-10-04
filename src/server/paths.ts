import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Repo/package root. Both `src/server/*.ts` and `dist/server/*.js` sit two levels below it. */
export const packageRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));

/** Reads FRAMEJAM_<name>, falling back to the pre-rename FRAMECUT_<name>. */
export function env(name: string): string | undefined {
  return process.env[`FRAMEJAM_${name}`] ?? process.env[`FRAMECUT_${name}`];
}

export function dataDir(): string {
  const configured = env("HOME");
  if (configured) return path.resolve(configured);
  const dir = path.join(os.homedir(), ".framejam");
  // One-time move of reviews and settings from the old name.
  const legacy = path.join(os.homedir(), ".framecut");
  if (!fs.existsSync(dir) && fs.existsSync(legacy)) {
    try {
      fs.renameSync(legacy, dir);
    } catch {
      return legacy;
    }
  }
  return dir;
}

/** How an agent should launch this copy of FrameJam, for the setup prompt in the UI. */
export function setupInfo() {
  // Installed copies (npx cache, global or project install) get the portable npx command; only a source checkout,
  // which isn't on npm under that name, needs its own absolute path.
  const installed = /[\\/]node_modules[\\/]/.test(packageRoot);
  const cliPath = path.join(packageRoot, "dist", "server", "cli.js");
  return {
    cliPath,
    mcpCommand: installed ? ["npx", "-y", "framejam", "--stdio"] : ["node", cliPath, "--stdio"],
    startCommand: installed ? ["npx", "-y", "framejam", "start"] : ["node", cliPath, "start"],
    /** What `npx skills add` installs the skill from: the GitHub repo, or this checkout. */
    skillSource: installed ? SKILL_REPO : packageRoot,
    skillPath: path.join(packageRoot, "skills", "framejam", "SKILL.md"),
  };
}

export const SKILL_REPO = "moritzkremb/framejam";
export const builtinPresetsDir = path.join(packageRoot, "presets");
export const webDistDir = path.join(packageRoot, "dist", "web");
export const DEFAULT_PORT = 2400;
