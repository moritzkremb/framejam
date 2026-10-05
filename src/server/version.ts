import fs from "node:fs";
import path from "node:path";
import { packageRoot } from "./paths.ts";

/** This copy's version, from its package.json. */
export const VERSION: string = (() => {
  try {
    return String(JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")).version ?? "0.0.0");
  } catch {
    return "0.0.0";
  }
})();

const parts = (v: string) => v.split("-")[0]!.split(".").map((n) => Number.parseInt(n, 10) || 0);

/** Negative when a < b, 0 when equal, positive when a > b. Compares major.minor.patch; ignores pre-release tags. */
export function compareVersions(a: string, b: string): number {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < 3; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
