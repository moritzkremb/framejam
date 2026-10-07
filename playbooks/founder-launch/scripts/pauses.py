#!/usr/bin/env python3
"""Find the pauses in a talking recording and cut them out (Python 3 + ffmpeg, nothing else).

    python3 pauses.py take.mp4                       # print keep segments as JSON
    python3 pauses.py take.mp4 --out keep.json       # write them
    python3 pauses.py take.mp4 --render cut.mp4      # also render the tightened video

Pauses longer than --min-pause are shortened to --keep-gap (a natural breath), not removed entirely.
This handles dead air only; removing false starts and earlier takes needs the transcript (see references/edit.md),
after which you can hand-edit keep.json and render it with --from-json.
"""

import argparse
import json
import re
import subprocess
import sys


def probe_duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return float(out)


def detect_silences(path, noise_db, min_pause):
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af",
         f"silencedetect=noise={noise_db}dB:d={min_pause}", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", proc.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", proc.stderr)]
    return list(zip(starts, ends + [None] * (len(starts) - len(ends))))


def keep_segments(duration, silences, keep_gap, pad):
    keeps, cursor = [], 0.0
    for s, e in silences:
        e = duration if e is None else e
        cut_from = min(e, s + pad + keep_gap / 2)
        cut_to = max(cut_from, e - pad - keep_gap / 2)
        if cut_from > cursor:
            keeps.append([round(cursor, 3), round(cut_from, 3)])
        cursor = cut_to
    if duration - cursor > 0.05:
        keeps.append([round(cursor, 3), round(duration, 3)])
    return [k for k in keeps if k[1] - k[0] > 0.08]


def render(path, keeps, out, fade=0.012):
    parts, labels = [], []
    for i, (a, b) in enumerate(keeps):
        d = b - a
        parts.append(f"[0:v]trim={a}:{b},setpts=PTS-STARTPTS[v{i}]")
        parts.append(
            f"[0:a]atrim={a}:{b},asetpts=PTS-STARTPTS,afade=t=in:d={fade},afade=t=out:st={max(0, d - fade)}:d={fade}[a{i}]"
        )
        labels.append(f"[v{i}][a{i}]")
    graph = ";".join(parts) + ";" + "".join(labels) + f"concat=n={len(keeps)}:v=1:a=1[vo][ao]"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", path, "-filter_complex", graph, "-map", "[vo]", "-map", "[ao]",
         "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", out],
        check=True,
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--noise-db", type=float, default=-35, help="silence threshold (raise to -30 for noisy rooms)")
    ap.add_argument("--min-pause", type=float, default=0.45, help="pauses shorter than this stay")
    ap.add_argument("--keep-gap", type=float, default=0.18, help="breath left where a pause was cut")
    ap.add_argument("--pad", type=float, default=0.04, help="extra room kept around speech")
    ap.add_argument("--out", help="write keep segments JSON here")
    ap.add_argument("--from-json", help="render these keep segments instead of detecting")
    ap.add_argument("--render", help="render the cut video to this path")
    args = ap.parse_args()

    duration = probe_duration(args.video)
    if args.from_json:
        keeps = json.load(open(args.from_json))["keep"]
    else:
        keeps = keep_segments(duration, detect_silences(args.video, args.noise_db, args.min_pause), args.keep_gap, args.pad)
    kept = sum(b - a for a, b in keeps)
    result = {"source": args.video, "duration": round(duration, 3), "kept": round(kept, 3), "keep": keeps}
    text = json.dumps(result, indent=1)
    if args.out:
        open(args.out, "w").write(text)
    else:
        print(text)
    print(f"{len(keeps)} segments, {duration:.1f}s -> {kept:.1f}s", file=sys.stderr)
    if args.render:
        render(args.video, keeps, args.render)
        print(f"wrote {args.render}", file=sys.stderr)


if __name__ == "__main__":
    main()
