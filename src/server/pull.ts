/**
 * `framejam pull <project>` (H3.9): unpacks a project's latest source into a folder, so a local agent continues work
 * that started on the phone, in a web chat or on another computer, and downloads its footage (H3.8) into `footage/`
 * there. Never replaces a file changed after that version was made unless told to.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Review } from "../core/types.ts";
import type { CloudFootage } from "./cloud-api.ts";
import type { FetchLike } from "./cloud.ts";
import type { JsonStore } from "./json-store.ts";
import { findProject } from "./share.ts";
import type { SyncEngine } from "./sync.ts";
import { readZip } from "./zip.ts";

export interface PullOptions {
  store: JsonStore;
  engine: SyncEngine;
  ref: string;
  /** Where to unpack; defaults to a folder named after the project in `cwd`. */
  into?: string;
  /** Replace files changed after the version was made. */
  force?: boolean;
  cwd: string;
  /** A FrameJam app is running on this computer and does the syncing, so this process only waits for it. */
  appSyncs: boolean;
  fetch?: FetchLike;
  /** How long to wait for a running app to bring a project in (tests shorten it). */
  waitMs?: number;
}

export interface PullResult {
  ok: boolean;
  text: string;
  dir?: string;
}

const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "framejam-project";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** The project's footage in the cloud; none when it isn't synced or the cloud doesn't keep footage yet. */
async function footageOf(opts: PullOptions, id: string): Promise<CloudFootage[]> {
  const session = opts.engine.api();
  if (!session || !opts.engine.isSynced(id)) return [];
  try {
    return await session.api.footageList(id);
  } catch {
    return [];
  }
}

/** A file name that is safe in one folder, unique among the footage. */
function footageNames(items: CloudFootage[]): string[] {
  const seen = new Set<string>();
  return items.map((item) => {
    const clean = path.basename(item.filename).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "") || "footage";
    const ext = path.extname(clean);
    let name = clean;
    for (let n = 2; seen.has(name.toLowerCase()); n++) name = `${clean.slice(0, clean.length - ext.length)} (${n})${ext}`;
    seen.add(name.toLowerCase());
    return name;
  });
}

/** Downloads footage into `<dir>/footage`, skipping files already there at the same size. A different file there is kept unless forced. */
async function pullFootage(dir: string, items: CloudFootage[], opts: PullOptions): Promise<string> {
  if (!items.length) return "";
  const into = path.join(dir, "footage");
  const names = footageNames(items);
  let written = 0;
  let same = 0;
  const kept: string[] = [];
  const failed: string[] = [];
  for (const [i, item] of items.entries()) {
    const name = names[i]!;
    const dest = path.join(into, name);
    const size = fs.existsSync(dest) ? fs.statSync(dest).size : undefined;
    if (size === item.bytes) {
      same++;
      continue;
    }
    if (size !== undefined && !opts.force) {
      kept.push(name);
      continue;
    }
    if (!item.downloadUrl) {
      failed.push(name);
      continue;
    }
    fs.mkdirSync(into, { recursive: true });
    const part = `${dest}.part`;
    try {
      const res = await (opts.fetch ?? fetch)(item.downloadUrl);
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), fs.createWriteStream(part));
      fs.renameSync(part, dest);
      written++;
    } catch {
      fs.rmSync(part, { force: true });
      failed.push(name);
    }
  }
  let text = ` Footage: ${plural(written, "file")} downloaded into ${into}${same ? ` (${same} already there)` : ""}.`;
  if (kept.length) text += ` Kept your own ${kept.slice(0, 5).join(", ")}${kept.length > 5 ? ` and ${kept.length - 5} more` : ""} (a different file of the same name is there); --force replaces ${kept.length === 1 ? "it" : "them"}.`;
  if (failed.length) text += ` Couldn't download ${failed.join(", ")}; run framejam pull again.`;
  return text;
}

/** The project here, or the cloud one the ref names (by id or exact title), brought to this computer. */
async function resolve(opts: PullOptions): Promise<Review | PullResult> {
  const { store, engine, ref } = opts;
  const here = await findProject(store, ref).catch(() => undefined);
  const session = engine.api();
  if (here) {
    if (session && engine.isSynced(here.id) && !opts.appSyncs) await engine.bring(here.id).catch(() => {});
    return store.findReview(here.id) ?? here;
  }
  if (!session) return { ok: false, text: `No project here matches "${ref}". To pull one from FrameJam Cloud, sign in first: framejam login` };
  const wanted = ref.trim().toLowerCase();
  const index = await session.api.syncIndex();
  const matches = index.filter((p) => p.id === ref.trim() || p.title.trim().toLowerCase() === wanted);
  if (!matches.length) return { ok: false, text: `No project matches "${ref}" here or in your FrameJam Cloud account. Use its id (rev_…) or its exact title.` };
  if (matches.length > 1) return { ok: false, text: `More than one project is called "${ref}": ${matches.map((p) => p.id).join(", ")}. Use its id.` };
  const id = matches[0]!.id;
  if (!engine.enabled()) return { ok: false, text: `"${matches[0]!.title}" is in FrameJam Cloud. Turn on sync to bring it here: framejam sync on` };
  if (!engine.isSynced(id)) return { ok: false, text: `"${matches[0]!.title}" is left out of sync on this computer. Sync it first: framejam sync on ${id}` };
  if (opts.appSyncs) {
    const deadline = Date.now() + (opts.waitMs ?? 60_000);
    while (Date.now() < deadline) {
      const review = store.findReview(id);
      if (review) return review;
      await delay(500);
    }
    return { ok: false, text: `"${matches[0]!.title}" hasn't reached this computer yet. Its first version may still be uploading; try again in a minute.` };
  }
  if (!(await engine.bring(id))) return { ok: false, text: `"${matches[0]!.title}" is still uploading its first version. Try again in a minute.` };
  return store.findReview(id) ?? { ok: false, text: `Couldn't bring "${matches[0]!.title}" to this computer.` };
}

export async function pullProject(opts: PullOptions): Promise<PullResult> {
  let review: Review | PullResult;
  try {
    review = await resolve(opts);
  } catch (err) {
    return { ok: false, text: err instanceof Error ? err.message : String(err) };
  }
  if (!("versions" in review)) return review;
  const version = review.versions.at(-1);
  if (!version) return { ok: false, text: `"${review.title}" has no versions yet.` };
  const name = `version ${version.number} of "${review.title}"`;
  const Name = `${name[0]!.toUpperCase()}${name.slice(1)}`;
  const next = `\nProject id: ${review.id}. Comments and versions stay in FrameJam; add the next one with add_version.`;
  const footage = await footageOf(opts, review.id);

  if (version.sourcePath && !opts.into && fs.existsSync(version.sourcePath)) {
    const got = await pullFootage(version.sourcePath, footage, opts);
    return { ok: true, dir: version.sourcePath, text: `${Name} was made on this computer. Its files are in ${version.sourcePath}.${got}${next}` };
  }
  if (!version.source) {
    const render = version.videoPath ? ` Its render is at ${version.videoPath}.` : "";
    if (footage.length) {
      const dir = path.resolve(opts.cwd, opts.into ?? slug(review.title));
      const got = await pullFootage(dir, footage, opts);
      return { ok: true, dir, text: `${Name} has no source files, only what was reviewed.${render}${got}${next}` };
    }
    return { ok: false, text: `${Name} has no source files, only what was reviewed.${render} Ask the agent that made it to pass source with the next version.` };
  }

  let download;
  try {
    download = await opts.store.sourceFor(review.id, version.number);
  } catch (err) {
    return { ok: false, text: err instanceof Error ? err.message : String(err) };
  }
  if (!download) return { ok: false, text: `Couldn't get the source files of ${name}.` };

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "framejam-pull-"));
  try {
    const zip = path.join(tmp, "source.zip");
    const res = await (opts.fetch ?? fetch)(download.url);
    if (!res.ok || !res.body) return { ok: false, text: `Downloading the source files failed (HTTP ${res.status}). Try again.` };
    await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), fs.createWriteStream(zip));

    const dir = path.resolve(opts.cwd, opts.into ?? slug(review.title));
    const files = readZip(zip);
    const madeAt = Date.parse(version.createdAt);
    const changed: string[] = [];
    const plan: { dest: string; data: Buffer }[] = [];
    let same = 0;
    for (const f of files) {
      const dest = path.join(dir, f.name);
      const data = f.read();
      let stat: fs.Stats | undefined;
      try {
        stat = fs.statSync(dest);
      } catch {
        stat = undefined;
      }
      if (stat?.isFile() && stat.size === data.length && fs.readFileSync(dest).equals(data)) {
        same++;
        continue;
      }
      if (stat && stat.mtimeMs > madeAt && !opts.force) changed.push(f.name);
      plan.push({ dest, data });
    }
    if (changed.length) {
      const list = changed.slice(0, 5).join(", ") + (changed.length > 5 ? ` and ${changed.length - 5} more` : "");
      return {
        ok: false,
        dir,
        text: `${changed.length} file${changed.length === 1 ? "" : "s"} in ${dir} changed after ${name} was made: ${list}. Nothing was written. Run again with --force to replace ${changed.length === 1 ? "it" : "them"}, or --into <folder> to unpack somewhere else.`,
      };
    }
    for (const p of plan) {
      fs.mkdirSync(path.dirname(p.dest), { recursive: true });
      fs.writeFileSync(p.dest, p.data);
    }
    const unchanged = same ? ` (${same} already up to date)` : "";
    const got = await pullFootage(dir, footage, opts);
    return { ok: true, dir, text: `Unpacked ${name} into ${dir}: ${plural(plan.length, "file")} written${unchanged}.${got}${next}` };
  } catch (err) {
    return { ok: false, text: err instanceof Error ? err.message : String(err) };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
