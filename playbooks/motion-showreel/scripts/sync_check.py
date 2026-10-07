#!/usr/bin/env python3
"""Check that big visual hits land on their audio hits in a render.

Usage:
  python3 sync_check.py renders/v1.mp4 --at 6.0,12.0 [--window 1.0]

For each time it looks at a window around it and prints when the largest change in picture
brightness starts and when the largest audio onset happens, and the offset in frames.
0 to +1 frame (picture on or just after the sound) is right for cuts and floods. A move that
deliberately starts early to peak on the hit (an anticipation) reads a few frames negative;
look at those frames before changing anything. Needs ffmpeg and numpy.
"""
import argparse
import json
import subprocess

import numpy as np


def fps_of(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate",
                          "-of", "json", path], check=True, capture_output=True, text=True).stdout
    n, d = json.loads(out)["streams"][0]["r_frame_rate"].split("/")
    return float(n) / float(d)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--at", required=True)
    ap.add_argument("--window", type=float, default=1.0)
    a = ap.parse_args()
    fps = fps_of(a.video)
    for t in (float(x) for x in a.at.split(",")):
        start = max(0.0, t - a.window / 2)
        raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(start), "-t", str(a.window), "-i", a.video,
                              "-vf", "scale=64:36,format=gray", "-f", "rawvideo", "-"], check=True, capture_output=True).stdout
        v = np.frombuffer(raw, np.uint8).reshape(-1, 36, 64).mean((1, 2))
        dv = np.abs(np.diff(v))
        vi = int(np.argmax(dv >= 0.25 * dv.max())) + 1  # first frame of the change, not its steepest frame
        vt = start + vi / fps
        raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(start), "-t", str(a.window), "-i", a.video,
                              "-ac", "1", "-ar", "48000", "-f", "s16le", "-"], check=True, capture_output=True).stdout
        x = np.frombuffer(raw, np.int16).astype(float)
        hop = 240
        e = np.array([np.abs(x[k:k + hop]).mean() for k in range(0, len(x) - hop, hop)])
        at_ = start + (int(np.argmax(np.diff(e))) + 1) * hop / 48000
        off = (vt - at_) * fps
        verdict = "ok" if -0.5 <= off <= 1.5 else "OFF"
        print(f"@{t:.2f}s  picture {vt:.3f}s  audio {at_:.3f}s  offset {off:+.1f} frames  {verdict}")


if __name__ == "__main__":
    main()
