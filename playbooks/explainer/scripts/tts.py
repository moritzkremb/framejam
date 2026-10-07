#!/usr/bin/env python3
"""Narration: one audio file per scene from script.json -> assets/vo/<scene id>.wav

    python scripts/tts.py                          # provider from script.json "voice" (default kokoro)
    python scripts/tts.py 03-voice                 # redo one scene
    python scripts/tts.py --provider record        # the user recorded assets/vo/<id>.wav themselves
    python scripts/tts.py --provider openai --paid-ok

Free:  kokoro (local model; pip install kokoro-onnx soundfile), say (macOS), piper (local), record.
Paid:  openai (OPENAI_API_KEY), elevenlabs (ELEVENLABS_API_KEY). They refuse to run without --paid-ok.
`voice.speed` (e.g. 1.1) speeds every file up with ffmpeg without changing pitch. Silence at both ends is trimmed.
Needs ffmpeg. The spoken text is scene["tts"] when present (pronunciation fixes), else scene["text"].
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
VO = ROOT / "assets" / "vo"
PAID = {"openai", "elevenlabs"}
KOKORO_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"


def run(cmd):
    subprocess.run([str(c) for c in cmd], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def finish(src, dst, speed):
    trim = ("silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
            "silenceremove=start_periods=1:start_threshold=-50dB,areverse")
    af = trim + (f",atempo={speed}" if speed and abs(speed - 1) > 0.001 else "")
    run(["ffmpeg", "-y", "-i", src, "-af", af, "-ar", "48000", "-ac", "1", dst])


_kokoro = None


def kokoro(text, out, voice):
    global _kokoro
    if _kokoro is None:
        try:
            from kokoro_onnx import Kokoro, EspeakConfig
            import espeakng_loader
        except ImportError:
            sys.exit("kokoro: run `pip install kokoro-onnx soundfile` first (a venv is best)")
        cache = Path.home() / ".cache" / "kokoro-onnx"
        cache.mkdir(parents=True, exist_ok=True)
        for name in ("kokoro-v1.0.onnx", "voices-v1.0.bin"):
            if not (cache / name).exists():
                print(f"downloading {name} (free, one time, ~330 MB total)")
                urllib.request.urlretrieve(KOKORO_URL + name, cache / name)
        # espeak-ng can't read its data from a path with spaces; copy it somewhere safe if needed.
        lib_dir = Path(espeakng_loader.get_library_path()).parent
        if " " in str(lib_dir):
            safe = Path(tempfile.gettempdir()) / "espeakng_loader"
            if not safe.exists():
                shutil.copytree(lib_dir, safe)
            lib_dir = safe
        cfg = EspeakConfig(lib_path=str(next(lib_dir.glob("libespeak-ng*"))), data_path=str(lib_dir / "espeak-ng-data"))
        _kokoro = Kokoro(str(cache / "kokoro-v1.0.onnx"), str(cache / "voices-v1.0.bin"), espeak_config=cfg)
    import soundfile as sf
    v = voice.get("voice", "am_michael")
    samples, sr = _kokoro.create(text, voice=v, speed=1.0, lang="en-gb" if v.startswith("b") else "en-us")
    p = out.with_suffix(".wav")
    sf.write(p, samples, sr)
    return p


def say(text, out, voice):
    p = out.with_suffix(".aiff")
    cmd = ["say", "-o", p] + (["-v", voice["voice"]] if voice.get("voice") else [])
    run(cmd + (["-r", str(voice["rate"])] if voice.get("rate") else []) + [text])
    return p


def piper(text, out, voice):
    model = voice.get("model") or os.environ.get("PIPER_MODEL") or sys.exit("piper: set voice.model (.onnx path)")
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
    with urllib.request.urlopen(req, timeout=180) as r:
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
    with urllib.request.urlopen(req, timeout=180) as r:
        p.write_bytes(r.read())
    return p


PROVIDERS = {"kokoro": kokoro, "say": say, "piper": piper, "openai": openai, "elevenlabs": elevenlabs}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("only", nargs="*", help="scene ids to (re)make; default: every scene without audio")
    ap.add_argument("--provider")
    ap.add_argument("--voice")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--paid-ok", action="store_true")
    a = ap.parse_args()

    script = json.loads((ROOT / "script.json").read_text())
    voice = dict(script.get("voice", {}))
    provider = a.provider or voice.get("provider", "kokoro")
    if a.voice:
        voice["voice"] = a.voice
    if provider in PAID and not a.paid_ok:
        sys.exit(f"{provider} costs money. Ask the user first, then rerun with --paid-ok.")
    VO.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for sc in script["scenes"]:
            dst = VO / f"{sc['id']}.wav"
            if provider == "record":
                print(("ok      " if dst.exists() else "MISSING ") + str(dst.relative_to(ROOT)), "-", sc["text"][:70])
                continue
            if a.only and sc["id"] not in a.only:
                continue
            if dst.exists() and not a.force and not a.only:
                continue
            raw = PROVIDERS[provider](sc.get("tts", sc["text"]), Path(tmp) / sc["id"], voice)
            finish(raw, dst, float(voice.get("speed", 1.0)))
            print("made", dst.relative_to(ROOT))


if __name__ == "__main__":
    main()
