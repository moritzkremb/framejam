import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonStore } from "../src/server/json-store.ts";
import { createTranscriber, findModel } from "../src/server/transcribe.ts";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

/** Stands in for whisper-cli: writes whisper.cpp's JSON for two words next to `-of`. */
const FAKE_WHISPER = `#!/bin/sh
while [ $# -gt 0 ]; do [ "$1" = "-of" ] && out="$2"; shift; done
echo "progress = 50%" >&2
cat > "$out.json" <<'JSON'
{"transcription":[{"offsets":{"from":0,"to":400},"text":" Hello"},{"offsets":{"from":400,"to":900},"text":" there."}]}
JSON
`;

let root: string;
let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  saved = { ...process.env };
  root = fs.mkdtempSync(path.join(os.tmpdir(), "framejam-transcribe-"));
  // No real models or tools from this computer.
  process.env.HOME = path.join(root, "home");
  process.env.FRAMEJAM_HOME = path.join(root, "data");
  delete process.env.FRAMEJAM_WHISPER_MODEL;
  fs.mkdirSync(process.env.HOME, { recursive: true });
});

afterEach(() => {
  process.env = saved;
  fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const store = new JsonStore(process.env.FRAMEJAM_HOME!);
  const video = path.join(root, "v1.mp4");
  spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=duration=1", "-f", "lavfi", "-i", "color=size=64x64:duration=1", "-shortest", video]);
  const { review } = store.openReview({ title: "Talk", videoPath: video });
  return { store, id: review.id };
}

const fakeWhisper = () => {
  const file = path.join(root, "whisper-cli");
  fs.writeFileSync(file, FAKE_WHISPER, { mode: 0o755 });
  return file;
};

const until = async (check: () => Promise<boolean>) => {
  for (let i = 0; i < 100 && !(await check()); i++) await new Promise((r) => setTimeout(r, 50));
};

describe("findModel", () => {
  it("prefers the most accurate model it finds", () => {
    const dir = path.join(process.env.HOME!, ".cache", "whisper.cpp");
    fs.mkdirSync(dir, { recursive: true });
    for (const f of ["ggml-base.en.bin", "ggml-large-v3-turbo.bin", "ggml-silero-v5.bin"]) fs.writeFileSync(path.join(dir, f), "");
    expect(path.basename(findModel()!)).toBe("ggml-large-v3-turbo.bin");
  });
});

describe.skipIf(!hasFfmpeg)("local transcription", () => {
  it("asks for whisper.cpp when it isn't installed", async () => {
    process.env.FRAMEJAM_WHISPER = path.join(root, "missing-whisper");
    const { store, id } = fixture();
    expect(await createTranscriber(store).status(id, 1)).toEqual({ state: "no-tool", ffmpeg: true });
  });

  it("offers to download a model when there's none", async () => {
    process.env.FRAMEJAM_WHISPER = fakeWhisper();
    const { store, id } = fixture();
    expect((await createTranscriber(store).status(id, 1)).state).toBe("no-model");
  });

  it("transcribes the render and saves it as the version's transcript", async () => {
    process.env.FRAMEJAM_WHISPER = fakeWhisper();
    process.env.FRAMEJAM_WHISPER_MODEL = path.join(root, "ggml-small.bin");
    fs.writeFileSync(process.env.FRAMEJAM_WHISPER_MODEL, "");
    const { store, id } = fixture();
    const t = createTranscriber(store);
    expect((await t.status(id, 1)).state).toBe("ready");
    expect(["queued", "running"]).toContain((await t.start(id, 1)).state);
    await until(async () => (await t.status(id, 1)).state === "done");
    expect(await t.status(id, 1)).toEqual({ state: "done", local: true });
    const version = store.getReview(id).versions[0];
    expect(store.transcriptFor(id, version)?.words.map((w) => w.text)).toEqual(["Hello", "there."]);
  });

  it("keeps a transcript the agent attached while it ran", async () => {
    process.env.FRAMEJAM_WHISPER = fakeWhisper();
    process.env.FRAMEJAM_WHISPER_MODEL = path.join(root, "ggml-small.bin");
    fs.writeFileSync(process.env.FRAMEJAM_WHISPER_MODEL, "");
    const { store, id } = fixture();
    store.setTranscript(id, 1, { words: [{ text: "Agent", start: 0, end: 1 }], paragraphs: [0] }, "/agent/words.json");
    const t = createTranscriber(store);
    expect(await t.start(id, 1)).toEqual({ state: "done", local: false });
    expect(store.transcriptFor(id, store.getReview(id).versions[0])?.words[0].text).toBe("Agent");
  });
});
