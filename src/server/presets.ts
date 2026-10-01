import fs from "node:fs";
import path from "node:path";
import type { PresetStyle, PresetSummary } from "../shared/types.ts";
import { builtinPresetsDir } from "./paths.ts";

export interface PresetFilter {
  mood?: string;
  pacing?: string;
  format?: string;
  query?: string;
}

export interface LoadedPreset {
  style: PresetStyle;
  dir: string;
  builtin: boolean;
}

const TEXT_EXTENSIONS = new Set([".html", ".css", ".js", ".json", ".md", ".txt", ".svg"]);
const MAX_SOURCE_BYTES = 200_000;

export class PresetLibrary {
  constructor(private readonly dirs: { dir: string; builtin: boolean }[]) {}

  static forStore(userPresetsDir: string) {
    return new PresetLibrary([
      { dir: builtinPresetsDir, builtin: true },
      { dir: userPresetsDir, builtin: false },
    ]);
  }

  all(): LoadedPreset[] {
    const byId = new Map<string, LoadedPreset>();
    for (const { dir, builtin } of this.dirs) {
      if (!fs.existsSync(dir)) continue;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const presetDir = path.join(dir, entry.name);
        const styleFile = path.join(presetDir, "style.json");
        if (!fs.existsSync(styleFile)) continue;
        try {
          const style = JSON.parse(fs.readFileSync(styleFile, "utf8")) as PresetStyle;
          style.id ||= entry.name;
          byId.set(style.id, { style, dir: presetDir, builtin });
        } catch (err) {
          console.error(`[framecut] Skipping preset ${presetDir}: ${(err as Error).message}`);
        }
      }
    }
    return [...byId.values()].sort((a, b) => a.style.name.localeCompare(b.style.name));
  }

  get(id: string): LoadedPreset | undefined {
    return this.all().find((p) => p.style.id === id);
  }

  list(filter: PresetFilter = {}): LoadedPreset[] {
    const q = filter.query?.trim().toLowerCase();
    return this.all().filter(({ style }) => {
      if (filter.mood && !style.mood.some((m) => m.toLowerCase() === filter.mood!.toLowerCase())) return false;
      if (filter.pacing && style.pacing !== filter.pacing) return false;
      if (filter.format && style.format !== filter.format) return false;
      if (q) {
        const hay = [style.name, style.tagline, style.description, ...style.mood, ...(style.tags ?? [])]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  summary(p: LoadedPreset): PresetSummary {
    const base = `/api/presets/${encodeURIComponent(p.style.id)}`;
    const hasPreview = fs.existsSync(path.join(p.dir, "preview.mp4"));
    const hasPoster = fs.existsSync(path.join(p.dir, "poster.jpg"));
    return {
      ...p.style,
      hasPreview,
      hasPoster,
      previewUrl: hasPreview ? `${base}/files/preview.mp4` : undefined,
      posterUrl: hasPoster ? `${base}/files/poster.jpg` : undefined,
      compositionUrl: `${base}/files/composition/index.html`,
    };
  }

  /** Template source the agent can copy into its own Hyperframes project. */
  templateSource(p: LoadedPreset): { path: string; content: string }[] {
    const root = path.join(p.dir, "composition");
    const out: { path: string; content: string }[] = [];
    let budget = MAX_SOURCE_BYTES;
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
          const content = fs.readFileSync(full, "utf8");
          if (content.length > budget) continue;
          budget -= content.length;
          out.push({ path: path.relative(root, full), content });
        }
      }
    };
    walk(root);
    return out;
  }
}
