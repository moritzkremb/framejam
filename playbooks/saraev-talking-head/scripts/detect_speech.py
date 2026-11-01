#!/usr/bin/env python3
"""Detect speech and write a backend-neutral segment file.

Silero (optional, neural):
  python3 detect_speech.py raw.mp4 --backend silero --min-silence 0.5 --out vad.json

ffmpeg (portable amplitude fallback):
  python3 detect_speech.py raw.mp4 --backend ffmpeg --min-silence 0.5 --noise-db -40 --out vad.json

The public reference names a neural detector but does not publish its exact package or settings. The Silero and
ffmpeg backends here are open alternatives. Every boundary still needs review.
"""
import argparse
import json
import re
import subprocess
import tempfile
from pathlib import Path


def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True)


def duration(path):
    return float(
        run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]).stdout.strip()
    )


def merge(segments, gap):
    out = []
    for segment in sorted(segments, key=lambda x: x["start"]):
        start, end = max(0.0, float(segment["start"])), float(segment["end"])
        if end <= start:
            continue
        if out and start - out[-1]["end"] < gap:
            out[-1]["end"] = max(out[-1]["end"], end)
        else:
            out.append({"start": start, "end": end})
    return out


def silero_segments(src, min_silence):
    try:
        from silero_vad import get_speech_timestamps, load_silero_vad, read_audio
    except ImportError as exc:
        raise SystemExit(
            "Silero backend is not installed. Install the optional `silero-vad[audio]` package, "
            "or use --backend ffmpeg as the amplitude-based fallback."
        ) from exc
    with tempfile.TemporaryDirectory(prefix="saraev-vad-") as tmp:
        wav = Path(tmp) / "mono-16k.wav"
        run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vn", "-ac", "1", "-ar", "16000", str(wav)])
        audio = read_audio(str(wav), sampling_rate=16000)
        model = load_silero_vad()
        found = get_speech_timestamps(
            audio,
            model,
            sampling_rate=16000,
            min_silence_duration_ms=round(min_silence * 1000),
            speech_pad_ms=0,
            return_seconds=True,
        )
    return [{"start": float(x["start"]), "end": float(x["end"])} for x in found]


def ffmpeg_segments(src, min_silence, noise_db):
    total = duration(src)
    result = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-i",
            str(src),
            "-vn",
            "-af",
            f"silencedetect=noise={noise_db}dB:d={min_silence}",
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode:
        raise SystemExit(result.stderr.strip() or "ffmpeg silencedetect failed")
    log = result.stderr
    events = []
    for match in re.finditer(r"silence_(start|end):\s*([0-9.]+)", log):
        events.append((match.start(), match.group(1), float(match.group(2))))
    silences = []
    open_start = None
    for _, kind, value in sorted(events):
        if kind == "start":
            open_start = value
        elif open_start is not None:
            silences.append((open_start, value))
            open_start = None
        else:
            silences.append((0.0, value))
    if open_start is not None:
        silences.append((open_start, total))
    speech = []
    cursor = 0.0
    for start, end in silences:
        if start > cursor:
            speech.append({"start": cursor, "end": min(start, total)})
        cursor = max(cursor, end)
    if cursor < total:
        speech.append({"start": cursor, "end": total})
    return speech, log


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("input")
    parser.add_argument("--backend", choices=["silero", "ffmpeg"], default="silero")
    parser.add_argument("--min-silence", type=float, default=0.5, help="seconds before speech islands split")
    parser.add_argument("--noise-db", type=float, default=-40, help="ffmpeg fallback only")
    parser.add_argument("--out", default="vad.json")
    args = parser.parse_args()
    src = Path(args.input).resolve()
    if args.min_silence <= 0:
        raise SystemExit("--min-silence must be positive")
    log = None
    if args.backend == "silero":
        speech = silero_segments(src, args.min_silence)
    else:
        speech, log = ffmpeg_segments(src, args.min_silence, args.noise_db)
    speech = merge(speech, args.min_silence)
    if not speech:
        raise SystemExit("No speech found. Check the source audio and detector settings.")
    data = {
        "timebase": "seconds",
        "backend": args.backend,
        "source": str(src),
        "sourceDuration": round(duration(src), 6),
        "parameters": {"minSilence": args.min_silence, "noiseDb": args.noise_db if args.backend == "ffmpeg" else None},
        "speech": [{"start": round(x["start"], 6), "end": round(x["end"], 6)} for x in speech],
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, indent=2) + "\n")
    if log is not None:
        out.with_suffix(".log").write_text(log)
    print(json.dumps({"backend": args.backend, "segments": len(speech), "out": str(out)}))


if __name__ == "__main__":
    main()
