import fs from "node:fs";
import path from "node:path";
import { type Guide, parseGuide } from "../core/guides.ts";
import { packageRoot } from "./paths.ts";

export const guidesDir = path.join(packageRoot, "skills", "framejam", "guides");

/** Every guide next to the skill, in name order. */
export function loadGuides(dir = guidesDir): Guide[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => parseGuide(f.slice(0, -3), fs.readFileSync(path.join(dir, f), "utf8")));
}
