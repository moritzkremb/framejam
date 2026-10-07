#!/usr/bin/env python3
"""Word-level transcript of a recording, free and local (whisper.cpp).

Usage:
  python3 transcribe.py intro.mp4 [--out words.json] [--model PATH] [--lang en]

Writes words.json:
  { "text": "...", "words": [ { "w": "Yesterday,", "s": 0.10, "e": 0.52 }, ... ] }

Needs ffmpeg and whisper.cpp's `whisper-cli` (macOS: `brew install whisper-cpp`).
Without --model it uses ~/.cache/whisper.cpp/ggml-base.en.bin and downloads it once
(~150 MB, free, from huggingface.co/ggerganov/whisper.cpp) if it's missing.

Already have a transcript from a service (ElevenLabs Scribe, OpenAI Whisper API, Deepgram)?
Convert its word list to the same shape instead of running this.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request

MODEL_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{name}"


def ensure_model(path, lang):
    if path:
        return path
    name = "ggml-base.en.bin" if lang == "en" else "ggml-base.bin"
    cache = os.path.expanduser("~/.cache/whisper.cpp")
    os.makedirs(cache, exist_ok=True)
    dest = os.path.join(cache, name)
    if not os.path.exists(dest):
        print(f"downloading {name} (one time, ~150 MB)...", file=sys.stderr)
        urllib.request.urlretrieve(MODEL_URL.format(name=name), dest + ".part")
        os.rename(dest + ".part", dest)
    return dest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("media")
    ap.add_argument("--out", default="words.json")
    ap.add_argument("--model")
    ap.add_argument("--lang", default="en")
    a = ap.parse_args()

    cli = shutil.which("whisper-cli") or shutil.which("whisper-cpp")
    if not cli:
        sys.exit("whisper-cli not found. Install whisper.cpp (macOS: brew install whisper-cpp) or use a transcription service.")
    model = ensure_model(a.model, a.lang)

    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "a.wav")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a.media, "-ac", "1", "-ar", "16000", wav], check=True)
        base = os.path.join(tmp, "out")
        subprocess.run([cli, "-m", model, "-f", wav, "-l", a.lang, "-ml", "1", "-sow", "-oj", "-of", base, "-np"],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        data = json.load(open(base + ".json"))

    words = []
    for seg in data.get("transcription", []):
        w = seg["text"].strip()
        if not w or w.startswith("["):
            continue
        words.append({"w": w, "s": seg["offsets"]["from"] / 1000, "e": seg["offsets"]["to"] / 1000})
    out = {"text": " ".join(x["w"] for x in words), "words": words}
    json.dump(out, open(a.out, "w"), indent=1)
    print(f"wrote {a.out}: {len(words)} words, {words[-1]['e'] if words else 0:.1f}s")


if __name__ == "__main__":
    main()
