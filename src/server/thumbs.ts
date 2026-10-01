import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";

let ffmpegAvailable: boolean | undefined;

export function hasFfmpeg(): boolean {
  if (ffmpegAvailable === undefined) {
    ffmpegAvailable = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
  }
  return ffmpegAvailable;
}

/** Grabs a single 480px-wide JPEG frame from a rendered video. */
export function extractFrame(videoFile: string, time: number): Promise<Buffer | undefined> {
  if (!hasFfmpeg() || !fs.existsSync(videoFile)) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const proc = spawn(
      "ffmpeg",
      ["-loglevel", "error", "-ss", String(Math.max(0, time)), "-i", videoFile, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4", "-f", "image2", "-c:v", "mjpeg", "pipe:1"],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.on("error", () => resolve(undefined));
    proc.on("close", (code) => resolve(code === 0 && chunks.length ? Buffer.concat(chunks) : undefined));
  });
}
