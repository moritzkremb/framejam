import fs from "node:fs";
import path from "node:path";
import { validatePlaybook } from "../shared/playbooks.ts";
import type { Playbook, PlaybookSummary } from "../shared/types.ts";
import { builtinPlaybooksDir, PLAYBOOK_PREVIEW_BASE_URL } from "./paths.ts";

export interface LoadedPlaybook {
  playbook: Playbook;
  dir: string;
  builtin: boolean;
}

const MAX_FILES = 400;

/** Width and height from a JPEG's frame header, without decoding it. */
export function jpegSize(buf: Buffer): { width: number; height: number } | undefined {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return undefined;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return undefined;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return undefined;
}

function previewShape(poster: string, format: Playbook["format"]): PlaybookSummary["previewShape"] {
  try {
    const size = jpegSize(fs.readFileSync(poster));
    if (size) return size.height > size.width * 1.05 ? "tall" : size.width > size.height * 1.05 ? "wide" : "square";
  } catch {
    // No poster: fall back to the playbook's format.
  }
  return format === "9:16" ? "tall" : format === "1:1" ? "square" : "wide";
}

export class PlaybookLibrary {
  constructor(private readonly dirs: { dir: string; builtin: boolean }[]) {}

  static forStore(userPlaybooksDir: string) {
    return new PlaybookLibrary([
      { dir: builtinPlaybooksDir, builtin: true },
      { dir: userPlaybooksDir, builtin: false },
    ]);
  }

  all(): LoadedPlaybook[] {
    const byId = new Map<string, LoadedPlaybook>();
    for (const { dir, builtin } of this.dirs) {
      if (!fs.existsSync(dir)) continue;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const playbookDir = path.join(dir, entry.name);
        const file = path.join(playbookDir, "playbook.json");
        if (!fs.existsSync(file)) continue;
        try {
          const playbook = JSON.parse(fs.readFileSync(file, "utf8")) as Playbook;
          playbook.id ||= entry.name;
          playbook.skill ||= "SKILL.md";
          const errors = validatePlaybook(playbook);
          if (errors.length) throw new Error(errors.join("; "));
          byId.set(playbook.id, { playbook, dir: playbookDir, builtin });
        } catch (err) {
          console.error(`[framejam] Skipping playbook ${playbookDir}: ${(err as Error).message}`);
        }
      }
    }
    return [...byId.values()].sort((a, b) => a.playbook.name.localeCompare(b.playbook.name));
  }

  get(id: string): LoadedPlaybook | undefined {
    return this.all().find((p) => p.playbook.id === id);
  }

  list(query?: string): LoadedPlaybook[] {
    const q = query?.trim().toLowerCase();
    if (!q) return this.all();
    return this.all().filter(({ playbook: p }) =>
      [p.name, p.tagline, p.description, p.get, ...p.bring, ...(p.tags ?? [])].join(" ").toLowerCase().includes(q),
    );
  }

  summary(p: LoadedPlaybook): PlaybookSummary {
    const id = encodeURIComponent(p.playbook.id);
    const base = `/api/playbooks/${id}`;
    const localPreview = fs.existsSync(path.join(p.dir, "preview.mp4"));
    return {
      ...p.playbook,
      builtin: p.builtin,
      previewShape: previewShape(path.join(p.dir, "poster.jpg"), p.playbook.format),
      hasPreview: localPreview || p.builtin,
      previewUrl: localPreview ? `${base}/files/preview.mp4` : p.builtin ? `${PLAYBOOK_PREVIEW_BASE_URL}/${id}/preview.mp4` : undefined,
      posterUrl: fs.existsSync(path.join(p.dir, "poster.jpg")) ? `${base}/files/poster.jpg` : undefined,
    };
  }

  skillText(p: LoadedPlaybook): string {
    const file = path.join(p.dir, p.playbook.skill);
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  }

  /** Paths relative to the playbook folder, for the agent to read or copy. */
  files(p: LoadedPlaybook): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (out.length >= MAX_FILES || entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "__pycache__") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else out.push(path.relative(p.dir, full));
      }
    };
    walk(p.dir);
    return out.sort();
  }
}
