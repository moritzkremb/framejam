#!/usr/bin/env python3
"""Check the pacing of a beat plan (edit.json) before building it.

Counts every visual change: beat starts, plus changes inside a beat (punches, focus zooms, words and gallery cards
landing, the title highlighter). Prints beats, the average beat length, the average time between changes, the time
per layout and every hold longer than --max-hold seconds. Exits with 1 when a beat is shorter than --min-beat or a
hold is too long, so it can gate a build. Holds over a playing video are listed but allowed (the footage moves).
"""
import argparse, json, sys
from pathlib import Path

VIDEO_EXT = (".mp4", ".webm", ".mov", ".m4v")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("edit", nargs="?", default="edit.json")
    ap.add_argument("--max-hold", type=float, default=2.5)
    ap.add_argument("--min-beat", type=float, default=0.8)
    a = ap.parse_args()

    e = json.loads(Path(a.edit).read_text())
    dur = float(e["duration"])
    beats = sorted(e["beats"], key=lambda b: b["start"])
    changes, moving = [], set()
    for i, b in enumerate(beats):
        s = float(b["start"])
        end = float(beats[i + 1]["start"]) if i + 1 < len(beats) else dur
        b["_len"] = end - s
        changes.append(s)
        v = b.get("visual") or {}
        inner = [f["at"] for f in v.get("focus", [])] + [p["at"] for p in b.get("punches", [])] + list(v.get("at", []))
        if b["layout"] == "words":
            inner += b.get("at", [])
        if "markAt" in b:
            inner.append(b["markAt"])
        changes += [float(t) for t in inner if float(t) - s > 0.3]
        if b["layout"] == "roadmap" and (b.get("step") or b.get("check")):
            changes.append(s + 0.5)
        if str(v.get("src", "")).lower().endswith(VIDEO_EXT):
            moving.add(round(s, 3))
    changes = sorted(set(round(t, 3) for t in changes))
    holds = [(b - t, t) for t, b in zip(changes, changes[1:] + [dur])]

    per = {}
    for b in beats:
        per[b["layout"]] = per.get(b["layout"], 0) + b["_len"]
    print(f"{len(beats)} beats in {dur:.1f} s: average beat {dur / len(beats):.2f} s, "
          f"{len(changes)} changes, one every {dur / len(changes):.2f} s")
    print("time per layout: " + ", ".join(f"{k} {v / dur * 100:.0f}%" for k, v in sorted(per.items())))
    bad = False
    for b in beats:
        if b["_len"] < a.min_beat:
            print(f"  too short: {b.get('id', '?')} at {b['start']} s lasts {b['_len']:.2f} s")
            bad = True
    for h, t in holds:
        if h > a.max_hold:
            ok = round(t, 3) in moving
            print(f"  hold {h:.2f} s from {t:.2f} s" + (" (video plays, allowed)" if ok else ""))
            bad = bad or not ok
    print("pacing ok" if not bad else "pacing needs work")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
