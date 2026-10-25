import { SEMVER } from "./playbooks.ts";
import type { PresetStyle } from "./types.ts";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStringList = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");

/** Problems with a style.json, as plain messages. Empty when it's valid. */
export function validateStyle(s: Partial<PresetStyle>): string[] {
  const errors: string[] = [];
  for (const key of ["id", "name", "tagline", "description", "guide"] as const) {
    if (typeof s[key] !== "string" || !s[key]) errors.push(`${key} is required`);
  }
  if (typeof s.id === "string" && !/^[a-z0-9][a-z0-9-]*$/.test(s.id)) errors.push("id must be lowercase letters, digits and dashes");
  if (s.version !== undefined && !SEMVER.test(s.version)) errors.push("version must look like 1.0.0");
  if (s.minAppVersion !== undefined && !SEMVER.test(s.minAppVersion)) errors.push("minAppVersion must look like 0.6.0");
  if (!isStringList(s.mood)) errors.push("mood must be a list of words");
  if (!["slow", "medium", "fast"].includes(s.pacing as string)) errors.push("pacing must be slow, medium or fast");
  if (!["16:9", "9:16", "1:1"].includes(s.format as string)) errors.push("format must be 16:9, 9:16 or 1:1");
  for (const key of ["width", "height", "durationSeconds"] as const) {
    if (typeof s[key] !== "number" || !(s[key] > 0)) errors.push(`${key} must be a positive number`);
  }
  for (const key of ["palette", "fonts", "easing"] as const) if (!isObject(s[key])) errors.push(`${key} must be an object`);
  for (const key of ["transitions", "textAnimations"] as const) if (!isStringList(s[key])) errors.push(`${key} must be a list`);
  if (!isObject(s.rhythm) || typeof s.rhythm.averageShotSeconds !== "number") errors.push("rhythm.averageShotSeconds is required");
  if (s.tags !== undefined && !isStringList(s.tags)) errors.push("tags must be a list");
  return errors;
}
