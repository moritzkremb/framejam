import fs from "node:fs";
import path from "node:path";
import type { PresetCatalog } from "../core/store.ts";
import type { LoadedPreset as CoreLoadedPreset, PresetFilter, PresetStyle, PresetSummary } from "../core/types.ts";
import { layerCopies, type CatalogSnapshot } from "./catalog.ts";
import { safeJoin } from "./files.ts";
import { builtinPresetsDir, PREVIEW_BASE_URL } from "./paths.ts";

/** A preset in a folder on this computer. */
export interface LoadedPreset extends CoreLoadedPreset {
  dir: string;
  source: "bundled" | "catalog" | "user";
}

const TEXT_EXTENSIONS = new Set([".html", ".css", ".js", ".json", ".md", ".txt", ".svg"]);
const MAX_SOURCE_BYTES = 200_000;

function readStyle(presetDir: string, fallbackId: string): PresetStyle | undefined {
  const file = path.join(presetDir, "style.json");
  if (!fs.existsSync(file)) return undefined;
  try {
    const style = JSON.parse(fs.readFileSync(file, "utf8")) as PresetStyle;
    style.id ||= fallbackId;
    return style;
  } catch (err) {
    console.error(`[framejam] Skipping style ${presetDir}: ${(err as Error).message}`);
    return undefined;
  }
}

/**
 * Where styles come from, with the same rules as playbooks: the copies shipped with the app, the downloaded catalog
 * (only when its version is higher), then the user's own folder, which always wins.
 */
export class PresetLibrary implements PresetCatalog {
  constructor(
    private readonly dirs: { dir: string; builtin: boolean }[],
    private readonly catalog?: () => CatalogSnapshot | undefined,
  ) {}

  static forStore(userPresetsDir: string, catalog?: () => CatalogSnapshot | undefined) {
    return new PresetLibrary(
      [
        { dir: builtinPresetsDir, builtin: true },
        { dir: userPresetsDir, builtin: false },
      ],
      catalog,
    );
  }

  private scan(builtin: boolean): Map<string, LoadedPreset> {
    const byId = new Map<string, LoadedPreset>();
    for (const { dir } of this.dirs.filter((d) => d.builtin === builtin)) {
      if (!fs.existsSync(dir)) continue;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const presetDir = path.join(dir, entry.name);
        const style = readStyle(presetDir, entry.name);
        if (style) byId.set(style.id, { style, dir: presetDir, builtin, source: builtin ? "bundled" : "user" });
      }
    }
    return byId;
  }

  private catalogCopies(): Map<string, LoadedPreset> {
    const out = new Map<string, LoadedPreset>();
    let snapshot: CatalogSnapshot | undefined;
    try {
      snapshot = this.catalog?.();
    } catch {
      return out;
    }
    for (const [id, { item, dir }] of snapshot?.items.style ?? []) {
      const style = readStyle(dir, id);
      if (!style) continue;
      if (style.id !== id || style.version !== item.version) {
        console.error(`[framejam] Skipping catalog style ${dir}: style.json doesn't match the catalog entry`);
        continue;
      }
      out.set(id, { style, dir, builtin: true, source: "catalog" });
    }
    return out;
  }

  all(): LoadedPreset[] {
    const layered = layerCopies({ bundled: this.scan(true), catalog: this.catalogCopies(), user: this.scan(false) }, (p) => p.style.version);
    return [...layered.values()].map(({ copy }) => copy).sort((a, b) => a.style.name.localeCompare(b.style.name));
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
    const id = encodeURIComponent(p.style.id);
    const base = `/api/presets/${id}`;
    const localPreview = fs.existsSync(path.join(p.dir, "preview.mp4"));
    const hasPreview = localPreview || p.builtin;
    const hasPoster = fs.existsSync(path.join(p.dir, "poster.jpg"));
    return {
      ...p.style,
      source: p.source,
      hasPreview,
      hasPoster,
      previewUrl: localPreview ? `${base}/files/preview.mp4` : p.builtin ? `${PREVIEW_BASE_URL}/${id}/preview.mp4` : undefined,
      posterUrl: hasPoster ? `${base}/files/poster.jpg` : undefined,
    };
  }

  templateDir(p: LoadedPreset): string {
    return path.join(p.dir, "composition");
  }

  previewFile(p: LoadedPreset): string | undefined {
    const file = path.join(p.dir, "preview.mp4");
    return fs.existsSync(file) ? file : undefined;
  }

  file(p: LoadedPreset, rel: string): string | undefined {
    return safeJoin(p.dir, rel);
  }

  /** Text files of the example composition, as paths relative to its folder. */
  templateFiles(p: LoadedPreset): string[] {
    return this.templateSource(p).map((f) => f.path);
  }

  /** Source of the example composition: a reference for how the look's techniques are built. */
  templateSource(p: LoadedPreset): { path: string; content: string }[] {
    const root = this.templateDir(p);
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
