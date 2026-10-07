"""Correct engine/data/lyrics.json after lyrics_align.py. Re-run after every align.

  .venv/bin/python tools/lyrics_fix.py

1. Onset snap: Whisper pulls a line's first word early into silence after a gap. For every line whose first word starts
   where the vocal stem is quiet, find the energy rise (within 0.9 s) and remap the line's words onto [rise, line end].
2. Hand fixes from analysis/lyrics_fixes.json (optional, applied last), measured from vocal-stem energy:
   {"intro": {"0": [[2.92, 3.06], [3.06, 3.2], ...]}}   section -> line index within the section -> [start, end] per word.
   Use it for spoken lines Whisper missed (it still needs the line in lyrics.txt; align then spreads it badly).
Print the vocal RMS around a doubtful line to measure it:
   .venv/bin/python tools/lyrics_fix.py --rms 0 9.5
"""
import glob
import json
import pathlib
import sys

import numpy as np
import soundfile as sf

ROOT = pathlib.Path(__file__).resolve().parent.parent
P = ROOT / "engine" / "data" / "lyrics.json"
stem = glob.glob(str(ROOT / "stems" / "htdemucs" / "*" / "vocals.wav"))
assert stem, "run audio_analysis.py first"
y, sr = sf.read(stem[0])
y = y.mean(1) if y.ndim > 1 else y

if len(sys.argv) > 1 and sys.argv[1] == "--rms":
    t0, t1 = float(sys.argv[2]), float(sys.argv[3])
    h = int(sr * 0.05)
    for i in range(int(t0 * sr), int(t1 * sr), h):
        r = np.sqrt((y[i:i + h] ** 2).mean())
        if r * 400 > 2:
            print(f"{i / sr:6.2f} " + "#" * int(r * 400))
    sys.exit()

L = json.loads(P.read_text())
hop = int(sr * 0.01)
rms = np.sqrt(np.convolve(y ** 2, np.ones(hop * 3) / (hop * 3), "same")[::hop])
thr = 0.12 * np.percentile(rms, 95)
for ln in L["lines"]:
    w0 = ln["words"][0]
    i = int(w0["s"] * 100)
    if rms[i:i + 4].mean() >= thr:
        continue
    j = i
    while j < len(rms) and rms[j] < thr and j - i < 90:
        j += 1
    s, s0, e = j / 100, w0["s"], ln["e"]
    if j - i >= 90 or s >= e - 0.15:
        continue
    k = (e - s) / (e - s0)
    for w in ln["words"]:
        w["s"] = round(s + (w["s"] - s0) * k, 3)
        w["e"] = round(s + (w["e"] - s0) * k, 3)
    print(f"snap {ln['text'][:30]!r}: {s0:.2f} -> {s:.2f}")
    ln["s"] = s

fx = ROOT / "analysis" / "lyrics_fixes.json"
FIX = json.loads(fx.read_text()) if fx.exists() else {}
seen = {}
for ln in L["lines"]:
    k = seen.get(ln["section"], 0)
    seen[ln["section"]] = k + 1
    times = FIX.get(ln["section"], {}).get(str(k))
    if not times:
        continue
    assert len(times) == len(ln["words"]), (ln["text"], len(ln["words"]))
    for w, (s, e) in zip(ln["words"], times):
        w["s"], w["e"] = s, e
    ln["s"], ln["e"] = times[0][0], times[-1][1]
    print(f"hand fix {ln['text'][:30]!r}")
P.write_text(json.dumps(L))
print("fixed", P)
