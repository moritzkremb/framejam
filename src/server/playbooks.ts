import fs from "node:fs";
import path from "node:path";
import { validatePlaybook } from "../core/playbooks.ts";
import type { PlaybookCatalog } from "../core/store.ts";
import type { LoadedPlaybook as CoreLoadedPlaybook, Playbook, PlaybookSummary } from "../core/types.ts";
import { safeJoin } from "./files.ts";
import { layerCopies, type CatalogSnapshot } from "./catalog.ts";
import { builtinPlaybooksDir, PLAYBOOK_PREVIEW_BASE_URL } from "./paths.ts";

/** A playbook in a folder on this computer. */
export interface LoadedPlaybook extends CoreLoadedPlaybook {
  dir: string;
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

function readPlaybook(playbookDir: string, fallbackId: string): Playbook | undefined {
  const file = path.join(playbookDir, "playbook.json");
  if (!fs.existsSync(file)) return undefined;
  try {
    const playbook = JSON.parse(fs.readFileSync(file, "utf8")) as Playbook;
    playbook.id ||= fallbackId;
    playbook.skill ||= "SKILL.md";
    const errors = validatePlaybook(playbook);
    if (errors.length) throw new Error(errors.join("; "));
    return playbook;
  } catch (err) {
    console.error(`[framejam] Skipping playbook ${playbookDir}: ${(err as Error).message}`);
    return undefined;
  }
}

/**
 * Where playbooks come from, lowest priority first: the copies shipped with the app (`builtin: true` folders), the
 * downloaded catalog, then the user's own folder (`builtin: false`).
 *
 * - A catalog copy replaces the bundled one only when its version is higher; a tie keeps the bundled copy.
 * - A user's copy always wins. When the app has a higher version of it, the copy gets `newerVersion`.
 * - A withdrawn catalog id only hides the catalog copy; the bundled one still shows.
 */
export class PlaybookLibrary implements PlaybookCatalog {
  constructor(
    private readonly dirs: { dir: string; builtin: boolean }[],
    private readonly catalog?: () => CatalogSnapshot | undefined,
  ) {}

  static forStore(userPlaybooksDir: string, catalog?: () => CatalogSnapshot | undefined) {
    return new PlaybookLibrary(
      [
        { dir: builtinPlaybooksDir, builtin: true },
        { dir: userPlaybooksDir, builtin: false },
      ],
      catalog,
    );
  }

  private scan(dirs: { dir: string; builtin: boolean }[]): Map<string, LoadedPlaybook> {
    const byId = new Map<string, LoadedPlaybook>();
    for (const { dir, builtin } of dirs) {
      if (!fs.existsSync(dir)) continue;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const playbookDir = path.join(dir, entry.name);
        const playbook = readPlaybook(playbookDir, entry.name);
        if (playbook) byId.set(playbook.id, { playbook, dir: playbookDir, builtin, source: builtin ? "bundled" : "user" });
      }
    }
    return byId;
  }

  private catalogCopies(): Map<string, LoadedPlaybook> {
    const out = new Map<string, LoadedPlaybook>();
    let snapshot: CatalogSnapshot | undefined;
    try {
      snapshot = this.catalog?.();
    } catch {
      return out;
    }
    for (const [id, { item, dir }] of snapshot?.items.playbook ?? []) {
      const playbook = readPlaybook(dir, id);
      if (!playbook) continue;
      if (playbook.id !== id || playbook.version !== item.version) {
        console.error(`[framejam] Skipping catalog playbook ${dir}: playbook.json doesn't match the catalog entry`);
        continue;
      }
      out.set(id, { playbook, dir, builtin: true, source: "catalog" });
    }
    return out;
  }

  all(): LoadedPlaybook[] {
    const layered = layerCopies(
      { bundled: this.scan(this.dirs.filter((d) => d.builtin)), catalog: this.catalogCopies(), user: this.scan(this.dirs.filter((d) => !d.builtin)) },
      (p) => p.playbook.version,
    );
    return [...layered.values()]
      .map(({ copy, newerVersion }) => (newerVersion ? { ...copy, newerVersion } : copy))
      .sort((a, b) => a.playbook.name.localeCompare(b.playbook.name));
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
    const previewUrl = (rel: string) =>
      fs.existsSync(path.join(p.dir, rel)) ? `${base}/files/${rel}` : p.builtin ? `${PLAYBOOK_PREVIEW_BASE_URL}/${id}/${rel}` : undefined;
    const posterUrl = (rel: string) => (fs.existsSync(path.join(p.dir, rel)) ? `${base}/files/${rel}` : undefined);
    return {
      ...p.playbook,
      builtin: p.builtin,
      source: p.source,
      newerVersion: p.newerVersion,
      previewShape: previewShape(path.join(p.dir, "poster.jpg"), p.playbook.format),
      hasPreview: localPreview || p.builtin,
      previewUrl: previewUrl("preview.mp4"),
      posterUrl: posterUrl("poster.jpg"),
      featuredStyles: (p.playbook.featuredStyles ?? []).map((s) => {
        const dir = `previews/${encodeURIComponent(s.id)}`;
        return { ...s, previewUrl: previewUrl(`${dir}/preview.mp4`), posterUrl: posterUrl(`${dir}/poster.jpg`) };
      }),
      examples: (p.playbook.examples ?? []).map((x) => {
        const dir = `previews/${encodeURIComponent(x.id)}`;
        return { ...x, previewUrl: previewUrl(`${dir}/preview.mp4`), posterUrl: posterUrl(`${dir}/poster.jpg`) };
      }),
    };
  }

  file(p: LoadedPlaybook, rel: string): string | undefined {
    return safeJoin(p.dir, rel);
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
        if (dir === p.dir && entry.name === "previews") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else out.push(path.relative(p.dir, full));
      }
    };
    walk(p.dir);
    return out.sort();
  }
}
