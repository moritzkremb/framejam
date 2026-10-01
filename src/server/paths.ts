import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Repo/package root. Both `src/server/*.ts` and `dist/server/*.js` sit two levels below it. */
export const packageRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));

export function dataDir(): string {
  return path.resolve(process.env.FRAMECUT_HOME ?? path.join(os.homedir(), ".framecut"));
}

export const builtinPresetsDir = path.join(packageRoot, "presets");
export const webDistDir = path.join(packageRoot, "dist", "web");
export const DEFAULT_PORT = 4517;
