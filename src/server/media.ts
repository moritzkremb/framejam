import fs from "node:fs";
import path from "node:path";
import type { ReviewVersion, StoryboardPanel } from "../core/types.ts";
import { isTranscriptError, parseTranscript, type Transcript } from "../core/transcript.ts";
import { type MediaInput, type PanelInput, StoreError } from "../core/store.ts";

export const PANEL_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

export type ResolvedMedia = Pick<ReviewVersion, "videoPath" | "panels" | "panelsDir">;
export type LoadedTranscript = { transcript: Transcript; sourcePath: string };

export function loadTranscript(transcriptPath: string | undefined, media: ResolvedMedia): LoadedTranscript | undefined {
  if (!transcriptPath) return undefined;
  if (media.panels?.length) throw new StoreError("Transcripts are for videos, not storyboards");
  const file = path.resolve(transcriptPath);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new StoreError(`transcriptPath does not exist: ${file}`);
  try {
    return { transcript: parseTranscript(fs.readFileSync(file, "utf8"), file), sourcePath: file };
  } catch (err) {
    if (isTranscriptError(err)) throw new StoreError(`${err.message}: ${file}`);
    throw err;
  }
}

export function resolveMedia(input: MediaInput): ResolvedMedia {
  if (input.panels?.length || input.panelsDir) {
    if (input.videoPath) throw new StoreError("A storyboard version takes panels (or panelsDir), not a video");
    return resolvePanels(input.panels, input.panelsDir);
  }
  if (!input.videoPath) {
    throw new StoreError("Provide videoPath (the rendered video, from any tool) or panels/panelsDir (a storyboard)");
  }
  const p = path.resolve(input.videoPath);
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) throw new StoreError(`videoPath does not exist: ${p}`);
  return { videoPath: p };
}

/** Panels in the given order, or every image in panelsDir sorted by file name (01.png, 02.png, … 10.png). */
export function resolvePanels(panels: PanelInput[] | undefined, panelsDir: string | undefined): ResolvedMedia {
  const dir = panelsDir ? path.resolve(panelsDir) : undefined;
  if (dir && (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory())) throw new StoreError(`panelsDir is not a folder: ${dir}`);
  const entries: { path: string; title?: string; caption?: string }[] = panels?.length
    ? panels.map((p) => (typeof p === "string" ? { path: p } : p))
    : fs
        .readdirSync(dir!)
        .filter((f) => PANEL_EXTENSIONS.has(path.extname(f).toLowerCase()) && !f.startsWith("."))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((f) => ({ path: f }));
  if (!entries.length) throw new StoreError(`No panel images (png, jpg, webp, gif, svg) in ${dir}`);
  const resolved: StoryboardPanel[] = entries.map((e) => {
    const file = path.isAbsolute(e.path) ? e.path : path.resolve(dir ?? process.cwd(), e.path);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new StoreError(`Panel image does not exist: ${file}`);
    if (!PANEL_EXTENSIONS.has(path.extname(file).toLowerCase())) throw new StoreError(`Panel isn't an image (png, jpg, webp, gif, svg): ${file}`);
    return {
      image: "",
      sourcePath: file,
      sourceMtime: Math.round(fs.statSync(file).mtimeMs),
      title: e.title?.trim() || undefined,
      caption: e.caption?.trim() || undefined,
    };
  });
  return { panels: resolved, panelsDir: dir };
}

export function panelsKey(panels: StoryboardPanel[] | undefined) {
  return JSON.stringify((panels ?? []).map((p) => [p.sourcePath, p.sourceMtime, p.title, p.caption]));
}

export function defaultTitle(media: ResolvedMedia) {
  return path.basename(media.panelsDir ?? media.videoPath ?? (media.panels ? "Untitled storyboard" : "Untitled video"));
}
