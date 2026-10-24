#!/usr/bin/env python3
"""Check the pacing of a reel plan (edit.json) before building it.

Counts every visual change: beat starts, punches, and every graphic's entrance plus the moments inside it (a list item
landing, a node popping out, a card coming into focus, a profile sliding in, a number finishing its count, the prompt
typing and sending). Prints beats, graphics, the average time between changes, the share of time on the board and every hold
longer than --max-hold seconds (default 3.0: this style changes something every 1-2 s and lets the speaker hold a
little longer between boards). Exits with 1 when a beat is
shorter than --min-beat or a hold is too long, so it can gate a build. Holds over a playing clip (a cutaway, a board
filled with a clip, or a clip inside a tree or thumbnail) or over the prompt typing are listed but allowed.
"""
import argparse, json, sys
from pathlib import Path

VIDEO_EXT = (".mp4", ".webm", ".mov", ".m4v")
LISTS = ("items", "nodes", "children", "people", "rows", "focus")


def is_video(src):
    return str(src).lower().endswith(VIDEO_EXT)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("edit", nargs="?", default="edit.json")
    ap.add_argument("--max-hold", type=float, default=3.0)
    ap.add_argument("--min-beat", type=float, default=0.6)
    a = ap.parse_args()

    e = json.loads(Path(a.edit).read_text())
    dur = float(e["duration"])
    beats = sorted(e["beats"], key=lambda b: b["start"])
    pops = e.get("pops", [])
    changes, moving = [], []
    for i, b in enumerate(beats):
        s = float(b["start"])
        b["_len"] = (float(beats[i + 1]["start"]) if i + 1 < len(beats) else dur) - s
        changes.append(s)
        changes += [float(p["at"]) for p in b.get("punches", [])]
        if is_video(b.get("media", "")):
            moving.append((s, s + b["_len"]))
    for p in pops:
        at = float(p["at"])
        until = float(p.get("until", at + 2.5))
        changes += [at, until]
        for key in LISTS:
            changes += [float(x["at"]) for x in p.get(key, []) if isinstance(x, dict) and "at" in x]
        if isinstance(p.get("note"), dict) and "at" in p["note"]:
            changes.append(float(p["note"]["at"]))
        if "strikeAt" in p:
            changes.append(float(p["strikeAt"]))
        if p["type"] in ("tree", "mindmap", "stats", "badge", "title"):
            changes.append(at + 0.6)
        if isinstance(p.get("input"), dict) and p["input"].get("text"):
            ta = float(p["input"].get("at", at + 0.5)) + 0.2
            typed = ta + len(p["input"]["text"]) / float(p["input"].get("cps", 24))
            changes += [ta, typed + 0.2]
            moving.append((ta, typed + 0.6))
        srcs = list(p.get("srcs", [])) + [c.get("src", "") for c in p.get("children", [])]
        if any(is_video(x) for x in srcs):
            moving.append((at, until))
    changes = sorted(set(round(t, 3) for t in changes if 0 <= t < dur))
    holds = [(b - t, t) for t, b in zip(changes, changes[1:] + [dur])]

    per = {}
    for b in beats:
        per[b["layout"]] = per.get(b["layout"], 0) + b["_len"]
    print(f"{len(beats)} beats and {len(pops)} graphics in {dur:.1f} s: average beat {dur / len(beats):.2f} s, "
          f"{len(changes)} changes, one every {dur / max(1, len(changes)):.2f} s")
    print("time per layout: " + ", ".join(f"{k} {v / dur * 100:.0f}%" for k, v in sorted(per.items())))
    bad = False
    for b in beats:
        if b["_len"] < a.min_beat:
            print(f"  too short: {b.get('id', '?')} at {b['start']} s lasts {b['_len']:.2f} s")
            bad = True
    for h, t in holds:
        if h > a.max_hold:
            ok = any(s0 <= t + 0.05 and t + h <= s1 + 0.05 for s0, s1 in moving)
            print(f"  hold {h:.2f} s from {t:.2f} s" + (" (something plays, allowed)" if ok else ""))
            bad = bad or not ok
    print("pacing ok" if not bad else "pacing needs work")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
