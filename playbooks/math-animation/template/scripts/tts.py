#!/usr/bin/env python3
"""Make one audio file per narration line from script.json, then write audio/durations.json.

    python scripts/tts.py                        # provider from script.json ("kokoro" by default)
    python scripts/tts.py --provider say         # macOS built-in voice, free
    python scripts/tts.py --provider record      # you recorded audio/<Scene>/<line>.wav yourself
    python scripts/tts.py --only Proof/why       # redo one line
    python scripts/tts.py --provider openai --paid-ok   # paid: needs OPENAI_API_KEY

Free:  kokoro (local model, pip install kokoro-onnx soundfile), say (macOS), piper (local), record.
Paid:  openai (OPENAI_API_KEY), elevenlabs (ELEVENLABS_API_KEY). These refuse to run without --paid-ok.
Needs ffmpeg on PATH. Every file is trimmed of leading/trailing silence and stored as 48 kHz mono WAV.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / "audio"
PAID = {"openai", "elevenlabs"}
KOKORO_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"


def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def finish(src, dst):
    """Trim silence at both ends, convert to 48 kHz mono wav."""
    trim = ("silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
            "silenceremove=start_periods=1:start_threshold=-50dB,areverse")
    dst.parent.mkdir(parents=True, exist_ok=True)
    run(["ffmpeg", "-y", "-i", str(src), "-af", trim, "-ar", "48000", "-ac", "1", str(dst)])


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                          str(path)], capture_output=True, text=True, check=True).stdout
    return round(float(out.strip()), 3)


# ---------- providers: each writes `text` to the file `out` (any format ffmpeg reads)

_kokoro = None


def kokoro(text, out, voice):
    global _kokoro
    if _kokoro is None:
        try:
            from kokoro_onnx import Kokoro, EspeakConfig
            import espeakng_loader
        except ImportError:
            sys.exit("kokoro: run `pip install kokoro-onnx soundfile` in this venv first")
        cache = Path.home() / ".cache" / "kokoro-onnx"
        cache.mkdir(parents=True, exist_ok=True)
        files = {}
        for name in ("kokoro-v1.0.onnx", "voices-v1.0.bin"):
            p = cache / name
            if not p.exists():
                print(f"downloading {name} (free, one time, ~300 MB total)")
                urllib.request.urlretrieve(KOKORO_URL + name, p)
            files[name] = p
        # espeak-ng can't read its data from a path with spaces; copy it somewhere safe if needed.
        lib_dir = Path(espeakng_loader.get_library_path()).parent
        if " " in str(lib_dir):
            safe = Path(tempfile.gettempdir()) / "espeakng_loader"
            if not safe.exists():
                shutil.copytree(lib_dir, safe)
            lib_dir = safe
        cfg = EspeakConfig(lib_path=str(next(lib_dir.glob("libespeak-ng*"))), data_path=str(lib_dir / "espeak-ng-data"))
        _kokoro = Kokoro(str(files["kokoro-v1.0.onnx"]), str(files["voices-v1.0.bin"]), espeak_config=cfg)
    import soundfile as sf
    v = voice.get("voice", "am_michael")
    samples, sr = _kokoro.create(text, voice=v, speed=float(voice.get("speed", 1.0)),
                                 lang="en-gb" if v.startswith("b") else "en-us")
    sf.write(out.with_suffix(".wav"), samples, sr)
    return out.with_suffix(".wav")


def say(text, out, voice):
    p = out.with_suffix(".aiff")
    cmd = ["say", "-o", str(p)]
    if voice.get("voice"):
        cmd += ["-v", voice["voice"]]
    if voice.get("rate"):
        cmd += ["-r", str(voice["rate"])]
    run(cmd + [text])
    return p


def piper(text, out, voice):
    model = voice.get("model") or os.environ.get("PIPER_MODEL")
    if not model:
        sys.exit("piper: set voice.model in script.json (path to a .onnx voice) or PIPER_MODEL")
    p = out.with_suffix(".wav")
    subprocess.run(["piper", "--model", model, "--output_file", str(p)], input=text, text=True, check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return p


def openai(text, out, voice):
    body = {"model": voice.get("model", "gpt-4o-mini-tts"), "voice": voice.get("voice", "ash"), "input": text,
            "response_format": "wav"}
    if voice.get("instructions"):
        body["instructions"] = voice["instructions"]
    req = urllib.request.Request("https://api.openai.com/v1/audio/speech", data=json.dumps(body).encode(),
                                 headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}",
                                          "Content-Type": "application/json"})
    p = out.with_suffix(".raw.wav")
    with urllib.request.urlopen(req, timeout=120) as r:
        p.write_bytes(r.read())
    return p


def elevenlabs(text, out, voice):
    vid = voice.get("voice_id") or sys.exit("elevenlabs: set voice.voice_id in script.json")
    body = {"text": text, "model_id": voice.get("model", "eleven_multilingual_v2")}
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{vid}?output_format=mp3_44100_128",
        data=json.dumps(body).encode(),
        headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "Content-Type": "application/json",
                 "User-Agent": "framejam-playbook"})
    p = out.with_suffix(".mp3")
    with urllib.request.urlopen(req, timeout=120) as r:
        p.write_bytes(r.read())
    return p


PROVIDERS = {"kokoro": kokoro, "say": say, "piper": piper, "openai": openai, "elevenlabs": elevenlabs}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider")
    ap.add_argument("--voice", help="override the voice id")
    ap.add_argument("--only", nargs="*", default=[], help="Scene/line ids to (re)make")
    ap.add_argument("--force", action="store_true", help="remake lines that already have audio")
    ap.add_argument("--paid-ok", action="store_true", help="allow a paid provider")
    a = ap.parse_args()

    script = json.loads((ROOT / "script.json").read_text())
    voice = dict(script.get("voice", {}))
    provider = a.provider or voice.get("provider", "kokoro")
    if a.voice:
        voice["voice"] = a.voice
    if provider in PAID and not a.paid_ok:
        sys.exit(f"{provider} costs money. Ask the user first, then rerun with --paid-ok.")

    durations = {}
    with tempfile.TemporaryDirectory() as tmp:
        for sc in script["scenes"]:
            for ln in sc["lines"]:
                key = f"{sc['id']}/{ln['id']}"
                dst = AUDIO / sc["id"] / f"{ln['id']}.wav"
                make = provider != "record" and (a.force or not dst.exists()) and (not a.only or key in a.only)
                if make:
                    raw = PROVIDERS[provider](ln.get("tts", ln["text"]), Path(tmp) / key.replace("/", "__"), voice)
                    finish(raw, dst)
                    print("made", key)
                if dst.exists():
                    durations[key] = duration(dst)
                else:
                    print("missing", key, "(scenes will use an estimate)")
    AUDIO.mkdir(exist_ok=True)
    (AUDIO / "durations.json").write_text(json.dumps(durations, indent=1))
    print(f"{len(durations)} lines, {sum(durations.values()):.1f} s of narration -> audio/durations.json")


if __name__ == "__main__":
    main()
