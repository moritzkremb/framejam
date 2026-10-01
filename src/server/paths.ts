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

export const builtinPresetsDir = path.join(packageRoot, "presets");
export const webDistDir = path.join(packageRoot, "dist", "web");
export const DEFAULT_PORT = 4517;
