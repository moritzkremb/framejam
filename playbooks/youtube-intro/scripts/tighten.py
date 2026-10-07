#!/usr/bin/env python3
"""Tighten a talking-head take: shorten every pause, cut retakes, keep captions in sync.

Usage:
  python3 tighten.py intro.mp4 --words words.json [--drop "3.2-7.9,14.1-15.0"]
                     [--max-gap 0.30] [--keep-gap 0.12] [--noise -35] --render tight.mp4

  --drop      source time ranges to remove (retakes, flubs, "um, let me start again").
              Pick them from words.json at word boundaries.
  --max-gap   pauses longer than this are shortened (seconds)
  --keep-gap  how much of a shortened pause stays (seconds)
  --noise     silence threshold in dB (raise to -30 for a noisy room)

Writes cuts.json (kept source ranges and the time map) and words_cut.json (the words on the
new timeline, for captions and graphics timing). With --render it also writes the cut video
(H.264 CRF 16, AAC 192k) with 10 ms audio fades at every cut so there are no clicks.
Needs ffmpeg. Pauses are found from the audio, not the transcript, because word timestamps
from most transcribers run into the next word.
"""
import argparse
import json
import re
import subprocess


def probe_duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         check=True, capture_output=True, text=True).stdout
    return float(out.strip())


def silences(path, noise, min_d):
    err = subprocess.run(["ffmpeg", "-hide_banner", "-i", path, "-af", f"silencedetect=noise={noise}dB:d={min_d}",
                          "-f", "null", "-"], capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", err)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", err)]
    return list(zip(starts, ends + [None] * (len(starts) - len(ends))))


def merge(ranges):
    out = []
    for s, e in sorted(ranges):
        if out and s <= out[-1][1] + 1e-3:
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("media")
    ap.add_argument("--words")
    ap.add_argument("--drop", default="")
    ap.add_argument("--max-gap", type=float, default=0.30)
    ap.add_argument("--keep-gap", type=float, default=0.12)
    ap.add_argument("--noise", type=float, default=-35)
    ap.add_argument("--cuts", default="cuts.json")
    ap.add_argument("--words-out", default="words_cut.json")
    ap.add_argument("--render")
    a = ap.parse_args()

    dur = probe_duration(a.media)
    removed = []
    for s, e in silences(a.media, a.noise, a.max_gap):
        e = dur if e is None else e
        if s <= 0.01:
            removed.append([0, max(0, e - 0.05)])
        elif e >= dur - 0.01:
            removed.append([s + 0.15, dur])
        elif e - s > a.max_gap:
            removed.append([s + a.keep_gap / 2, e - a.keep_gap / 2])
    for r in filter(None, a.drop.split(",")):
        s, e = (float(v) for v in r.split("-"))
        removed.append([s, e])
    removed = merge(removed)

    keep, t = [], 0.0
    for s, e in removed:
        if s - t > 0.04:
            keep.append([round(t, 3), round(s, 3)])
        t = max(t, e)
    if dur - t > 0.04:
        keep.append([round(t, 3), round(dur, 3)])

    def remap(x):
        acc = 0.0
        for s, e in keep:
            if x < s:
                return None
            if x <= e:
                return round(acc + x - s, 3)
            acc += e - s
        return None

    new_len = round(sum(e - s for s, e in keep), 3)
    json.dump({"source": a.media, "sourceDuration": dur, "duration": new_len, "keep": keep}, open(a.cuts, "w"), indent=1)
    print(f"{dur:.2f}s -> {new_len:.2f}s, {len(keep)} segments, wrote {a.cuts}")

    if a.words:
        words = json.load(open(a.words))["words"]
        out = []
        for w in words:
            mid = (w["s"] + w["e"]) / 2
            if remap(mid) is None:
                continue
            s = remap(w["s"]) or remap(mid)
            e = remap(w["e"]) or remap(mid)
            out.append({"w": w["w"], "s": s, "e": max(e, s + 0.05)})
        json.dump({"text": " ".join(w["w"] for w in out), "words": out}, open(a.words_out, "w"), indent=1)
        print(f"wrote {a.words_out}: {len(out)} words")

    if a.render:
        parts, labels = [], []
        for i, (s, e) in enumerate(keep):
            d = e - s
            fo = max(0, d - 0.01)
            parts.append(f"[0:v]trim={s}:{e},setpts=PTS-STARTPTS[v{i}]")
            parts.append(f"[0:a]atrim={s}:{e},asetpts=PTS-STARTPTS,afade=t=in:d=0.01,afade=t=out:st={fo:.3f}:d=0.01[a{i}]")
            labels.append(f"[v{i}][a{i}]")
        parts.append(f"{''.join(labels)}concat=n={len(keep)}:v=1:a=1[v][a]")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a.media, "-filter_complex", ";".join(parts),
                        "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "16", "-preset", "fast",
                        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", a.render], check=True)
        print(f"wrote {a.render}")


if __name__ == "__main__":
    main()
