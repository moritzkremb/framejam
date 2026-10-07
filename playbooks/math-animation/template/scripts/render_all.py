#!/usr/bin/env python3
"""Render every scene in script.json order, join them, lay the narration on its cues, add optional music.

    python scripts/render_all.py --out renders/v1.mp4   # final: 1080p60, one new file per version
    python scripts/render_all.py -q l               # fast draft: 480p15
    python scripts/render_all.py --only Proof       # re-render one scene, reuse the others
    python scripts/render_all.py --no-render        # just re-join and re-mix
    python scripts/render_all.py --music bed.mp3 --music-db -24

Writes build/silent.mp4 (picture only), the --out file (picture + voice + music, -16 LUFS; default
out/video.mp4) and build/timeline.json (where each scene starts, to map review comments to scenes).
Needs manim and ffmpeg on PATH (run it from the venv).
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"


def sh(cmd, **kw):
    print("$", " ".join(str(c) for c in cmd)[:200])
    subprocess.run([str(c) for c in cmd], check=True, cwd=ROOT, **kw)


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                          str(path)], capture_output=True, text=True, check=True).stdout
    return float(out.strip())


def scene_file(name):
    hits = sorted((BUILD / "media" / "videos" / "scenes").glob(f"*/{name}.mp4"), key=lambda p: p.stat().st_mtime)
    if not hits:
        sys.exit(f"no render for {name}; run without --no-render")
    return hits[-1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-q", default="h", choices=list("lmhpk"), help="l=480p15 m=720p30 h=1080p60 k=4K")
    ap.add_argument("--only", nargs="*", default=[])
    ap.add_argument("--no-render", action="store_true")
    ap.add_argument("--music")
    ap.add_argument("--music-db", type=float, default=-22, help="music level under the voice")
    ap.add_argument("--out", default="out/video.mp4")
    a = ap.parse_args()

    script = json.loads((ROOT / "script.json").read_text())
    names = [s["id"] for s in script["scenes"]]

    if not a.no_render:
        for n in names:
            if not a.only or n in a.only:
                sh(["manim", f"-q{a.q}", "scenes.py", n])

    files = [scene_file(n) for n in names]
    BUILD.mkdir(exist_ok=True)
    lst = BUILD / "concat.txt"
    lst.write_text("".join(f"file '{f}'\n" for f in files))
    silent = BUILD / "silent.mp4"
    sh(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", silent])
    total = duration(silent)

    # place every narration line at (scene offset + cue time)
    inputs, filters, labels, timeline = [], [], [], []
    offset = 0.0
    for n, f in zip(names, files):
        timeline.append({"scene": n, "start": round(offset, 2), "end": round(offset + duration(f), 2)})
        cues_p = BUILD / "cues" / f"{n}.json"
        cues = json.loads(cues_p.read_text())["cues"] if cues_p.exists() else []
        for c in cues:
            wav = ROOT / "audio" / n / f"{c['line']}.wav"
            if not wav.exists():
                print("no audio for", f"{n}/{c['line']}", "- silent there")
                continue
            i = len(inputs) // 2 + 1
            ms = int(round((offset + c["t"]) * 1000))
            inputs += ["-i", wav]
            filters.append(f"[{i}:a]aresample=48000,adelay={ms}:all=1[v{i}]")
            labels.append(f"[v{i}]")
        offset += duration(f)

    out = Path(a.out) if Path(a.out).is_absolute() else ROOT / a.out
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", silent] + inputs
    if labels:
        filters.append(f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0,apad[vo]")
        mix = "[vo]"
        if a.music:
            m = len(inputs) // 2 + 1
            cmd += ["-stream_loop", "-1", "-i", a.music]
            filters.append(f"[{m}:a]aresample=48000,volume={a.music_db}dB,"
                           f"afade=t=out:st={max(total - 2.5, 0):.2f}:d=2.5[bg]")
            filters.append("[vo]asplit[vo1][vo2]")
            filters.append("[bg][vo2]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[duck]")
            filters.append("[vo1][duck]amix=inputs=2:normalize=0[mx]")
            mix = "[mx]"
        filters.append(f"{mix}loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]")
        cmd += ["-filter_complex", ";".join(filters), "-map", "0:v", "-map", "[a]",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", f"{total:.3f}", "-movflags", "+faststart",
                out]
    else:
        cmd += ["-c", "copy", out]
    sh(cmd)
    (BUILD / "timeline.json").write_text(json.dumps(timeline, indent=1))
    for t in timeline:
        print(f"  {t['start']:7.2f} - {t['end']:7.2f}  {t['scene']}")
    print(f"done: {out} ({total:.1f} s)")


if __name__ == "__main__":
    main()
