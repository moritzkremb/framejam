import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./paths.ts";

/**
 * Whether this computer syncs its projects with FrameJam Cloud (`framejam sync on|off`, or the choice made at
 * `framejam login`), and the projects left out of it. `enabled` is missing until the user has answered.
 */
export interface SyncSettings {
  enabled?: boolean;
  /** Projects that stay on this computer even while sync is on. */
  optOut: string[];
  /** When the signed-out nudge was last shown, so it shows at most once a week. ISO time. */
  nudgedAt?: string;
}

export function syncFile(root: string = dataDir()): string {
  return path.join(root, "sync.json");
}

let cached: { file: string; mtimeMs: number; settings: SyncSettings } | undefined;

/** Read on every call (a stat when nothing changed), so `framejam sync on` works without a restart. */
export function readSync(root: string = dataDir()): SyncSettings {
  const file = syncFile(root);
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    return { optOut: [] };
  }
  if (cached?.file === file && cached.mtimeMs === mtimeMs) return cached.settings;
  let settings: SyncSettings = { optOut: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<SyncSettings>;
    settings = {
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : undefined,
      optOut: Array.isArray(raw.optOut) ? raw.optOut.filter((x): x is string => typeof x === "string") : [],
      nudgedAt: typeof raw.nudgedAt === "string" ? raw.nudgedAt : undefined,
    };
  } catch {
    // A broken file reads as "never answered".
  }
  cached = { file, mtimeMs, settings };
  return settings;
}

function writeSync(settings: SyncSettings, root: string): SyncSettings {
  fs.mkdirSync(root, { recursive: true });
  const file = syncFile(root);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`);
  fs.renameSync(tmp, file);
  cached = undefined;
  return settings;
}

export function setSyncEnabled(enabled: boolean, root: string = dataDir()): SyncSettings {
  return writeSync({ ...readSync(root), enabled }, root);
}

/** Leaves a project out of sync (`false`) or puts it back (`true`). */
export function setProjectSync(reviewId: string, synced: boolean, root: string = dataDir()): SyncSettings {
  const current = readSync(root);
  const optOut = current.optOut.filter((id) => id !== reviewId);
  if (!synced) optOut.push(reviewId);
  return writeSync({ ...current, optOut }, root);
}

export function markNudged(root: string = dataDir(), at = new Date()): SyncSettings {
  return writeSync({ ...readSync(root), nudgedAt: at.toISOString() }, root);
}

/** How many projects this computer has and how much they take, for "Sync your projects?" at sign-in. */
export function localProjects(root: string = dataDir()): { projects: number; bytes: number } {
  const dir = path.join(root, "reviews");
  let projects = 0;
  let bytes = 0;
  const walk = (p: string) => {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(p);
    } catch {
      return;
    }
    if (stat.isDirectory()) for (const f of fs.readdirSync(p)) walk(path.join(p, f));
    else bytes += stat.size;
  };
  try {
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".json")) projects++;
      walk(path.join(dir, f));
    }
  } catch {
    // No projects yet.
  }
  return { projects, bytes };
}

export function isProjectSynced(reviewId: string, root: string = dataDir()): boolean {
  const s = readSync(root);
  return s.enabled === true && !s.optOut.includes(reviewId);
}
