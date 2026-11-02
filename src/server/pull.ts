/**
 * `framejam pull <project>` (H3.9): unpacks a project's latest source into a folder, so a local agent continues work
 * that started on the phone, in a web chat or on another computer. Never replaces a file changed after that version
 * was made unless told to.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Review } from "../core/types.ts";
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
  const next = `\nProject id: ${review.id}. Comments and versions stay in FrameJam; add the next one with add_version.`;

  if (version.sourcePath && !opts.into && fs.existsSync(version.sourcePath)) {
    return { ok: true, dir: version.sourcePath, text: `${name[0]!.toUpperCase()}${name.slice(1)} was made on this computer. Its files are in ${version.sourcePath}${next}` };
  }
  if (!version.source) {
    const render = version.videoPath ? ` Its render is at ${version.videoPath}.` : "";
    return { ok: false, text: `${name[0]!.toUpperCase()}${name.slice(1)} has no source files, only what was reviewed.${render} Ask the agent that made it to pass source with the next version.` };
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
    return { ok: true, dir, text: `Unpacked ${name} into ${dir}: ${plan.length} file${plan.length === 1 ? "" : "s"} written${unchanged}.${next}` };
  } catch (err) {
    return { ok: false, text: err instanceof Error ? err.message : String(err) };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
