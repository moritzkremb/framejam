import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isTranscriptError, parseTranscript, type Transcript } from "../core/transcript.ts";
import type { Store } from "../core/store.ts";
import type { TranscriptionStatus } from "../core/types.ts";
import { dataDir, env } from "./paths.ts";
import { hasFfmpeg } from "./thumbs.ts";

/** The model FrameJam downloads when none is installed: multilingual, accurate and fast on a laptop. */
export const SPEECH_MODEL = {
  file: "ggml-large-v3-turbo-q5_0.bin",
  url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin",
  size: "574 MB",
};

/** Best first: a bigger model hears names and quiet speech better, and turbo is still quick. */
const MODEL_RANK = ["large-v3-turbo", "large-v3", "large", "medium", "small", "base", "tiny"];

const modelsDir = () => path.join(dataDir(), "models");

function onPath(cmd: string): string | undefined {
  const res = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], { encoding: "utf8" });
  return res.status === 0 ? res.stdout.split(/\r?\n/)[0]?.trim() || undefined : undefined;
}

/** whisper.cpp's command line tool (`whisper-cli`; older builds called it `whisper-cpp` or `main`). */
export function findWhisper(): string | undefined {
  const configured = env("WHISPER");
  if (configured) return fs.existsSync(configured) ? configured : onPath(configured);
  return onPath("whisper-cli") ?? onPath("whisper-cpp");
}

/** A whisper.cpp model already on this computer: FrameJam's own, or one another tool downloaded. */
export function findModel(): string | undefined {
  const configured = env("WHISPER_MODEL");
  if (configured) return fs.existsSync(configured) ? configured : undefined;
  const home = os.homedir();
  const dirs = [modelsDir(), path.join(home, ".cache", "whisper.cpp"), path.join(home, ".cache"), path.join(home, ".cache", "hyperframes", "whisper", "models")];
  const found: string[] = [];
  for (const dir of dirs) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const n of names) if (/^ggml-.*\.bin$|^whisper-.*\.bin$/.test(n) && !n.includes("silero")) found.push(path.join(dir, n));
  }
  const rank = (f: string) => {
    const i = MODEL_RANK.findIndex((m) => path.basename(f).includes(m));
    return i < 0 ? MODEL_RANK.length : i;
  };
  return found.sort((a, b) => rank(a) - rank(b))[0];
}

type Job = { state: "queued" | "running" | "failed"; progress?: number; error?: string };

/**
 * Transcribes renders on this computer with whisper.cpp, one at a time, when a version has no transcript from the
 * agent. Nothing is uploaded; the model is downloaded once (from Hugging Face) only when the user asks.
 */
export function createTranscriber(store: Store) {
  const jobs = new Map<string, Job>();
  const queue: { id: string; n: number }[] = [];
  let download: { progress: number; error?: string } | undefined;
  let busy = false;
  let tool: { whisper?: string; model?: string; checked: number } | undefined;

  const tools = () => {
    // Re-checked now and then, so installing whisper.cpp or a model doesn't need a restart.
    if (!tool || Date.now() - tool.checked > 10_000) tool = { whisper: findWhisper(), model: findModel(), checked: Date.now() };
    return tool;
  };

  async function status(id: string, n: number): Promise<TranscriptionStatus> {
    const review = await store.getReview(id);
    const version = review.versions.find((v) => v.number === n);
    if (!version || version.panels?.length) return { state: "unavailable" };
    if (version.transcript) return { state: "done", local: !version.transcript.sourcePath };
    const job = jobs.get(`${id}:${n}`);
    if (job?.state === "failed") return { state: "failed", error: job.error };
    if (job) return { state: job.state, progress: job.progress, downloading: download && !download.error ? download.progress : undefined };
    if (download?.error) return { state: "failed", error: download.error };
    const t = tools();
    if (!t.whisper || !hasFfmpeg()) return { state: "no-tool", ffmpeg: hasFfmpeg() };
    if (!t.model) return { state: "no-model", modelSize: SPEECH_MODEL.size };
    return { state: "ready" };
  }

  /** Queues the version. Downloads the speech model first when there's none. */
  async function start(id: string, n: number): Promise<TranscriptionStatus> {
    const key = `${id}:${n}`;
    // Starting again after a failure is a retry.
    if (jobs.get(key)?.state === "failed") jobs.delete(key);
    if (download?.error) download = undefined;
    const s = await status(id, n);
    if (s.state === "ready" || s.state === "no-model") {
      jobs.set(key, { state: "queued" });
      queue.push({ id, n });
      void drain();
    }
    return status(id, n);
  }

  async function drain() {
    if (busy) return;
    busy = true;
    try {
      while (queue.length) {
        const { id, n } = queue.shift()!;
        const key = `${id}:${n}`;
        try {
          if (!tools().model) await downloadModel();
          jobs.set(key, { state: "running", progress: 0 });
          await run(id, n, (p) => jobs.set(key, { state: "running", progress: p }));
          jobs.delete(key);
        } catch (err) {
          jobs.set(key, { state: "failed", error: err instanceof Error ? err.message : String(err) });
        }
      }
    } finally {
      busy = false;
    }
  }

  async function downloadModel() {
    const dir = modelsDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, SPEECH_MODEL.file);
    const part = `${file}.part`;
    download = { progress: 0 };
    try {
      const res = await fetch(SPEECH_MODEL.url);
      if (!res.ok || !res.body) throw new Error(`Couldn't download the speech model (HTTP ${res.status})`);
      const total = Number(res.headers.get("content-length")) || 0;
      const out = fs.createWriteStream(part);
      let got = 0;
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        got += chunk.length;
        if (total) download.progress = got / total;
        if (!out.write(chunk)) await new Promise<void>((r) => out.once("drain", () => r()));
      }
      await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
      fs.renameSync(part, file);
      download = undefined;
      tool = undefined;
    } catch (err) {
      fs.rmSync(part, { force: true });
      download = { progress: 0, error: err instanceof Error ? err.message : String(err) };
      throw err;
    }
  }

  async function run(id: string, n: number, onProgress: (p: number) => void): Promise<void> {
    const review = await store.getReview(id);
    const version = review.versions.find((v) => v.number === n);
    const video = version && (await store.videoFileFor(id, version));
    if (!video) throw new Error("The render for this version is missing");
    const { whisper, model } = tools();
    if (!whisper || !model) throw new Error("whisper.cpp isn't installed");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "framejam-transcribe-"));
    try {
      const wav = path.join(tmp, "audio.wav");
      const audio = await exec("ffmpeg", ["-v", "error", "-y", "-i", video, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav]);
      if (audio.code !== 0 && /does not contain any stream|matches no streams/i.test(audio.stderr)) return save(id, n, { words: [], paragraphs: [] });
      if (audio.code !== 0) throw new Error(`ffmpeg couldn't read the audio: ${audio.stderr.trim().split("\n").at(-1)}`);
      const multilingual = !/\.en[.-]/.test(path.basename(model));
      const threads = String(Math.max(1, Math.min(8, os.cpus().length - 1)));
      const out = path.join(tmp, "words");
      const args = ["-m", model, "-f", wav, "-ml", "1", "-sow", "-oj", "-of", out, "-t", threads, "-pp", "-np", ...(multilingual ? ["-l", "auto"] : [])];
      const res = await exec(whisper, args, (line) => {
        const m = /progress\s*=\s*(\d+)%/.exec(line);
        if (m) onProgress(Number(m[1]) / 100);
      });
      if (res.code !== 0 || !fs.existsSync(`${out}.json`)) throw new Error(`whisper.cpp failed: ${res.stderr.trim().split("\n").at(-1) ?? "no output"}`);
      let transcript: Transcript;
      try {
        transcript = parseTranscript(fs.readFileSync(`${out}.json`, "utf8"), `${out}.json`);
      } catch (err) {
        // Music or silence: an empty transcript, so it isn't transcribed again.
        if (!isTranscriptError(err) || !err.message.startsWith("No timed words")) throw err;
        transcript = { words: [], paragraphs: [] };
      }
      await save(id, n, transcript);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  async function save(id: string, n: number, transcript: Transcript) {
    // The agent may have attached its own transcript while this ran; that one wins.
    const now = (await store.getReview(id)).versions.find((v) => v.number === n);
    if (now && !now.transcript) await store.setTranscript(id, n, transcript);
  }

  return { status, start };
}

export type Transcriber = ReturnType<typeof createTranscriber>;

function exec(cmd: string, args: string[], onStderr?: (line: string) => void): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => {
      const s = d.toString();
      stderr += s;
      if (onStderr) for (const line of s.split(/\r?\n/)) onStderr(line);
    });
    proc.on("error", (err) => resolve({ code: -1, stderr: err.message }));
    proc.on("close", (code) => resolve({ code: code ?? -1, stderr }));
  });
}
