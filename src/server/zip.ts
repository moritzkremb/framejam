/**
 * The source zip of a version (H2.6): a project folder packed so another agent can continue it. A small writer
 * (deflate, streamed, no dependency) and a reader of the central directory, which is enough to check a zip the agent
 * made itself.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import zlib from "node:zlib";
import { StoreError } from "../core/store.ts";

/** The biggest source zip FrameJam Cloud keeps (the cloud enforces the same number). */
export const MAX_SOURCE_BYTES = 500 * 1024 * 1024;

/** Folders left out wherever they are: dependencies, version control and caches. */
const SKIP_ANYWHERE = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".cache",
  ".parcel-cache",
  ".vercel",
  ".framejam",
  "__pycache__",
]);

/** Folders left out at the top of the project only (a `src/build` is code): build output and renders. */
const SKIP_TOP = new Set(["dist", "build", "out", "coverage", ".venv", "venv", "renders", "render"]);

const SKIP_FILES = new Set([".DS_Store", "Thumbs.db"]);

const SECRET = /^\.env(\..+)?$|\.pem$|^id_(rsa|ed25519)$/;

export interface SourceOptions {
  /** Files that are the render itself (the version's video), so they aren't packed again. */
  skip?: string[];
  maxBytes?: number;
}

export interface PackedSource {
  file: string;
  /** What's in it, for the notes and the result the agent sees. */
  files: number;
  bytes: number;
  /** Whole folders and file kinds that were left out. */
  left: string[];
}

const run = promisify(execFile);

function skipPath(rel: string): { skip: boolean; why?: string } {
  const parts = rel.split("/");
  const name = parts.at(-1) ?? "";
  const dirs = parts.slice(0, -1);
  for (const dir of dirs) if (SKIP_ANYWHERE.has(dir)) return { skip: true, why: `${dir}/` };
  if (dirs[0] && SKIP_TOP.has(dirs[0])) return { skip: true, why: `${dirs[0]}/` };
  if (SKIP_FILES.has(name)) return { skip: true };
  if (SECRET.test(name)) return { skip: true, why: "secret files (.env, keys)" };
  if (/\.log$/.test(name)) return { skip: true, why: "*.log" };
  return { skip: false };
}

/** Files in the folder, relative with forward slashes. Uses git's ignore rules when the folder is in a repository. */
async function listFiles(dir: string, left: Set<string>): Promise<string[]> {
  try {
    const { stdout } = await run("git", ["-C", dir, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { maxBuffer: 64 * 1024 * 1024 });
    const listed = stdout.split("\0").filter(Boolean);
    // `ls-files` also lists tracked files that were deleted since.
    const present = listed.filter((rel) => {
      try {
        return fs.lstatSync(path.join(dir, rel)).isFile();
      } catch {
        return false;
      }
    });
    if (present.length) return present;
  } catch {
    // Not a git checkout, or git isn't installed: walk the folder.
  }
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const next = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (SKIP_ANYWHERE.has(entry.name)) left.add(`${entry.name}/`);
        else walk(next);
      } else if (entry.isFile()) {
        out.push(next);
      }
    }
  };
  walk("");
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(crc: number, chunk: Buffer): number {
  let c = ~crc >>> 0;
  for (let i = 0; i < chunk.length; i++) c = CRC_TABLE[(c ^ chunk[i]!) & 0xff]! ^ (c >>> 8);
  return ~c >>> 0;
}

function dosTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

interface Entry {
  name: Buffer;
  crc: number;
  compressed: number;
  size: number;
  offset: number;
  time: number;
  date: number;
  mode: number;
}

async function writeAll(out: fs.WriteStream, data: Buffer): Promise<void> {
  if (!out.write(data)) await new Promise<void>((resolve) => out.once("drain", resolve));
}

/** Deflates one file into the zip, streaming. Returns the sizes and checksum for the central directory. */
async function addFile(out: fs.WriteStream, file: string, name: string, offset: number): Promise<{ entry: Entry; written: number }> {
  const stat = fs.statSync(file);
  const nameBuf = Buffer.from(name, "utf8");
  const when = dosTime(stat.mtime);
  // Flag bit 3: sizes and checksum follow the data, so nothing has to be known up front. Bit 11: UTF-8 names.
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0808, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(when.time, 10);
  header.writeUInt16LE(when.date, 12);
  header.writeUInt16LE(nameBuf.length, 26);
  await writeAll(out, header);
  await writeAll(out, nameBuf);

  let crc = 0;
  let size = 0;
  let compressed = 0;
  const deflate = zlib.createDeflateRaw({ level: 6 });
  const input = fs.createReadStream(file);
  input.on("data", (chunk) => {
    crc = crc32(crc, chunk as Buffer);
    size += (chunk as Buffer).length;
  });
  input.on("error", (err) => deflate.destroy(err));
  input.pipe(deflate);
  for await (const chunk of deflate) {
    compressed += (chunk as Buffer).length;
    await writeAll(out, chunk as Buffer);
  }
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(crc, 4);
  descriptor.writeUInt32LE(compressed, 8);
  descriptor.writeUInt32LE(size, 12);
  await writeAll(out, descriptor);
  const mode = ((stat.mode & 0o777) || 0o644) | 0o100000;
  return {
    entry: { name: nameBuf, crc, compressed, size, offset, time: when.time, date: when.date, mode },
    written: 30 + nameBuf.length + compressed + 16,
  };
}

function centralDirectory(entries: Entry[], start: number): Buffer {
  const parts: Buffer[] = [];
  let length = 0;
  for (const e of entries) {
    const h = Buffer.alloc(46);
    h.writeUInt32LE(0x02014b50, 0);
    h.writeUInt16LE((3 << 8) | 20, 4);
    h.writeUInt16LE(20, 6);
    h.writeUInt16LE(0x0808, 8);
    h.writeUInt16LE(8, 10);
    h.writeUInt16LE(e.time, 12);
    h.writeUInt16LE(e.date, 14);
    h.writeUInt32LE(e.crc, 16);
    h.writeUInt32LE(e.compressed, 20);
    h.writeUInt32LE(e.size, 24);
    h.writeUInt16LE(e.name.length, 28);
    h.writeUInt32LE((e.mode << 16) >>> 0, 38);
    h.writeUInt32LE(e.offset, 42);
    parts.push(h, e.name);
    length += 46 + e.name.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(length, 12);
  end.writeUInt32LE(start, 16);
  parts.push(end);
  return Buffer.concat(parts);
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;

/**
 * Packs a project folder into `out`, leaving out dependencies, version control, build output, renders, logs and
 * secret files (and anything the folder's .gitignore ignores). Refuses a project that doesn't fit the size cap, and
 * says what's biggest.
 */
export async function zipFolder(dir: string, out: string, options: SourceOptions = {}): Promise<PackedSource> {
  const max = options.maxBytes ?? MAX_SOURCE_BYTES;
  const root = path.resolve(dir);
  const skipped = new Set((options.skip ?? []).map((f) => path.resolve(f)));
  const left = new Set<string>();
  const files: { rel: string; abs: string; size: number }[] = [];
  for (const rel of (await listFiles(root, left)).sort()) {
    const verdict = skipPath(rel);
    const abs = path.join(root, rel);
    if (verdict.skip) {
      if (verdict.why) left.add(verdict.why);
      continue;
    }
    if (skipped.has(abs) || abs === path.resolve(out)) continue;
    const stat = fs.lstatSync(abs);
    if (!stat.isFile()) continue;
    files.push({ rel, abs, size: stat.size });
  }
  if (!files.length) throw new StoreError(`Nothing to pack in ${root}: every file is left out (dependencies, build output, renders, secrets) or the folder is empty.`);
  if (files.length > 60_000) throw new StoreError(`${root} has ${files.length.toLocaleString("en-US")} files to pack. Point source at the project folder itself, not a parent of many projects.`);
  const raw = files.reduce((n, f) => n + f.size, 0);
  // Media barely compresses, so the raw size is a fair upper bound for the cap; the zip itself is checked at the end.
  if (raw > max * 4) {
    const big = [...files].sort((a, b) => b.size - a.size).slice(0, 5).map((f) => `${f.rel} (${mb(f.size)})`);
    throw new StoreError(`The project is ${mb(raw)} before packing; the cap for a source zip is ${mb(max)}. Biggest files: ${big.join(", ")}. Leave out renders and large media, or pass a smaller folder.`);
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = `${out}.${process.pid}.part`;
  const stream = fs.createWriteStream(tmp);
  const failed = new Promise<never>((_, reject) => stream.once("error", reject));
  failed.catch(() => {});
  try {
    const entries: Entry[] = [];
    let offset = 0;
    for (const f of files) {
      const { entry, written } = await Promise.race([addFile(stream, f.abs, f.rel, offset), failed]);
      entries.push(entry);
      offset += written;
      if (offset > max) {
        const big = [...files].sort((a, b) => b.size - a.size).slice(0, 5).map((x) => `${x.rel} (${mb(x.size)})`);
        throw new StoreError(`The packed project is over ${mb(max)}, the cap for a source zip. Biggest files: ${big.join(", ")}. Leave out renders and large media, or pass a smaller folder.`);
      }
    }
    await writeAll(stream, centralDirectory(entries, offset));
    await new Promise<void>((resolve, reject) => {
      stream.once("error", reject);
      stream.end(resolve);
    });
    fs.renameSync(tmp, out);
    return { file: out, files: entries.length, bytes: fs.statSync(out).size, left: [...left].sort() };
  } catch (err) {
    stream.destroy();
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

export interface ZipEntry {
  name: string;
  size: number;
}

/** The entries of a zip file, read from its central directory. Throws a StoreError when it isn't a readable zip. */
export function listZip(file: string): ZipEntry[] {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, "r");
    const length = fs.fstatSync(fd).size;
    const tail = Buffer.alloc(Math.min(length, 22 + 65_535));
    fs.readSync(fd, tail, 0, tail.length, length - tail.length);
    let at = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (at < 0) throw new Error("no end of central directory");
    const count = tail.readUInt16LE(at + 10);
    const size = tail.readUInt32LE(at + 12);
    const start = tail.readUInt32LE(at + 16);
    if (count === 0xffff || size === 0xffffffff || start === 0xffffffff) throw new Error("zip64 isn't supported");
    const dir = Buffer.alloc(size);
    fs.readSync(fd, dir, 0, size, start);
    const entries: ZipEntry[] = [];
    at = 0;
    for (let i = 0; i < count; i++) {
      if (dir.readUInt32LE(at) !== 0x02014b50) throw new Error("bad central directory");
      const nameLength = dir.readUInt16LE(at + 28);
      const extraLength = dir.readUInt16LE(at + 30);
      const commentLength = dir.readUInt16LE(at + 32);
      entries.push({ name: dir.toString("utf8", at + 46, at + 46 + nameLength), size: dir.readUInt32LE(at + 24) });
      at += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  } catch (err) {
    throw new StoreError(`${path.basename(file)} isn't a readable zip file (${err instanceof Error ? err.message : String(err)}).`);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** Checks a zip the agent made: readable, within the cap, and without dependencies, version control or secrets. */
export function checkZip(file: string, maxBytes = MAX_SOURCE_BYTES): { files: number; bytes: number } {
  const bytes = fs.statSync(file).size;
  if (bytes > maxBytes) throw new StoreError(`${path.basename(file)} is ${mb(bytes)}; the cap for a source zip is ${mb(maxBytes)}. Leave out renders and large media.`);
  const entries = listZip(file).filter((e) => !e.name.endsWith("/"));
  if (!entries.length) throw new StoreError(`${path.basename(file)} has no files in it.`);
  const bad = entries.find((e) => {
    const parts = e.name.split("/");
    return parts.slice(0, -1).some((p) => p === "node_modules" || p === ".git") || SECRET.test(parts.at(-1) ?? "");
  });
  if (bad) throw new StoreError(`${path.basename(file)} contains ${bad.name}. Leave out node_modules, .git and secret files (.env, keys), or pass the folder and FrameJam packs it for you.`);
  return { files: entries.length, bytes };
}
