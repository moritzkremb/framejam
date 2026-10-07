#!/usr/bin/env python3
"""When is each word said? assets/vo/<id>.wav -> assets/vo/<id>.words.json  [{"w", "t0", "t1"}, ...]

    python scripts/word_times.py            # every scene whose words file is missing or older than its audio
    python scripts/word_times.py --force

Uses whisper.cpp (`whisper-cli`, free and local: `brew install whisper-cpp`, or build it from
https://github.com/ggml-org/whisper.cpp). The model is found in $WHISPER_MODEL, ~/.cache/whisper-cpp or
~/.cache/hyperframes/whisper/models, else ggml-base.en.bin (~150 MB) is downloaded once.
Without whisper-cli it falls back to an estimate (words spread by length over the clip) and says so.
"""
import argparse
import json
import os
import shutil
import subprocess
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VO = ROOT / "assets" / "vo"
MODEL_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/"


def duration(p):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip())


def find_model():
    if os.environ.get("WHISPER_MODEL"):
        return Path(os.environ["WHISPER_MODEL"])
    dirs = [Path.home() / ".cache" / "whisper-cpp", Path.home() / ".cache" / "hyperframes" / "whisper" / "models"]
    for name in ("ggml-small.en.bin", "ggml-base.en.bin", "ggml-medium.en.bin"):
        for d in dirs:
            if (d / name).exists():
                return d / name
    dirs[0].mkdir(parents=True, exist_ok=True)
    print("downloading ggml-base.en.bin (free, one time, ~150 MB)")
    urllib.request.urlretrieve(MODEL_URL + "ggml-base.en.bin", dirs[0] / "ggml-base.en.bin")
    return dirs[0] / "ggml-base.en.bin"


def whisper(wav, model):
    with tempfile.TemporaryDirectory() as tmp:
        w16 = Path(tmp) / "a.wav"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-ar", "16000", "-ac", "1", str(w16)],
                       check=True)
        base = Path(tmp) / "out"
        subprocess.run(["whisper-cli", "-m", str(model), "-f", str(w16), "-ml", "1", "-sow", "-oj", "-of", str(base),
                        "-np"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        data = json.loads(Path(str(base) + ".json").read_text())
    words = []
    for tok in data["transcription"]:
        t = tok["text"].strip()
        if t and any(ch.isalnum() for ch in t):
            words.append({"w": t, "t0": tok["offsets"]["from"] / 1000, "t1": tok["offsets"]["to"] / 1000})
    return words


def estimate(text, dur):
    ws = text.split()
    total = sum(len(w) + 1 for w in ws)
    out, t = [], 0.0
    for w in ws:
        d = dur * (len(w) + 1) / total
        out.append({"w": w, "t0": round(t, 3), "t1": round(t + d, 3)})
        t += d
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    script = json.loads((ROOT / "script.json").read_text())
    have_whisper = shutil.which("whisper-cli") is not None
    model = find_model() if have_whisper else None
    if not have_whisper:
        print("whisper-cli not found: estimating word times (install whisper-cpp for real ones)")
    for sc in script["scenes"]:
        wav = VO / f"{sc['id']}.wav"
        out = VO / f"{sc['id']}.words.json"
        if not wav.exists():
            print("no audio for", sc["id"], "- run scripts/tts.py first")
            continue
        if out.exists() and out.stat().st_mtime > wav.stat().st_mtime and not a.force:
            continue
        words = whisper(wav, model) if have_whisper else estimate(sc["text"], duration(wav))
        out.write_text(json.dumps(words, indent=0))
        print("timed", sc["id"], len(words), "words")


if __name__ == "__main__":
    main()
