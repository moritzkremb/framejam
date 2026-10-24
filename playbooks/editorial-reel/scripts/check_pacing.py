#!/usr/bin/env python3
"""Check the pacing of a reel plan (edit.json) before building it.

Counts every visual change: beat starts, punches, hook cards, big words landing, and every pop-up's entrance plus the
moments inside it (a message landing, an icon struck, a chat sent). Prints beats, pop-ups, the average time between
changes, the time per layout and every hold longer than --max-hold seconds (default 2.0: this style changes something
every 1-1.5 s). Exits with 1 when a beat is shorter than --min-beat or a hold is too long, so it can gate a build.
Holds over a playing video (a screen recording or PiP clip) are listed but allowed.
"""
import argparse, json, sys
from pathlib import Path

VIDEO_EXT = (".mp4", ".webm", ".mov", ".m4v")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("edit", nargs="?", default="edit.json")
    ap.add_argument("--max-hold", type=float, default=2.0)
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
        changes += [float(c["at"]) for c in b.get("cards", []) if "at" in c]
        if "at" in b:
            changes.append(float(b["at"]))
    for p in pops:
        at = float(p["at"])
        until = float(p.get("until", at + 2.5))
        changes += [at, until]
        changes += [float(x["at"]) for x in p.get("items", []) + p.get("messages", []) if "at" in x]
        changes += [float(f["at"]) for f in p.get("focus", [])]
        if p["type"] in ("chat", "comment", "follow", "timer"):
            changes.append(at + 1.0)
        srcs = [p.get("src", "")] + list(p.get("srcs", []))
        if any(str(x).lower().endswith(VIDEO_EXT) for x in srcs):
            moving.append((at, until))
    changes = sorted(set(round(t, 3) for t in changes if 0 <= t < dur))
    holds = [(b - t, t) for t, b in zip(changes, changes[1:] + [dur])]

    per = {}
    for b in beats:
        per[b["layout"]] = per.get(b["layout"], 0) + b["_len"]
    print(f"{len(beats)} beats and {len(pops)} pop-ups in {dur:.1f} s: average beat {dur / len(beats):.2f} s, "
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
            print(f"  hold {h:.2f} s from {t:.2f} s" + (" (video plays, allowed)" if ok else ""))
            bad = bad or not ok
    print("pacing ok" if not bad else "pacing needs work")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
