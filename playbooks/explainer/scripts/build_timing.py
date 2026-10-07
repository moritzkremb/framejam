#!/usr/bin/env python3
"""The video's clock. script.json + assets/vo/*.wav + *.words.json -> assets/timing.json and assets/timing.js

    python scripts/build_timing.py

- Scenes are laid end to end from their voice length: lead-in + voice + tail (+ an end hold on the last one).
- Every script word gets its spoken time (the transcript is aligned back to the script, so typos in the
  transcript don't matter).
- Named cues: in a scene, "cues": {"c_name": "word"} or {"c_name": ["word", 2]} (2nd time the word is said)
  give the time that word starts. Animations and sound effects are placed on cue names, never on raw seconds.
  Every scene also gets the cues "<id>" (scene start) and "<id>.vo" (voice start).
- Captions: short chunks (break at punctuation or ~7 words), each held until the next one starts.

timing.js sets window.TIMING for HTML compositions (Hyperframes); timing.json is the same data for any tool.
"""
import difflib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VO = ROOT / "assets" / "vo"
WEAK = {"a", "an", "the", "and", "of", "to", "in", "on", "for", "with", "into", "how", "you", "is", "at", "it", "that"}


def norm(w):
    return re.sub(r"[^a-z0-9']", "", w.lower().replace("’", "'"))


def duration(p):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip())


def align(script_words, heard):
    """Give each script word the time of the matching heard word; interpolate the rest."""
    a = [norm(w) for w in script_words]
    b = [norm(h["w"]) for h in heard]
    times = [None] * len(a)
    for blk in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_matching_blocks():
        for k in range(blk.size):
            h = heard[blk.b + k]
            times[blk.a + k] = (h["t0"], h["t1"])
    end = heard[-1]["t1"] if heard else 1.0
    i = 0
    while i < len(a):
        if times[i] is not None:
            i += 1
            continue
        j = i
        while j < len(a) and times[j] is None:
            j += 1
        left = times[i - 1][1] if i > 0 else 0.0
        right = times[j][0] if j < len(a) else end
        step = max(right - left, 0.05) / (j - i)
        for k in range(i, j):
            times[k] = (left + step * (k - i), left + step * (k - i + 1))
        i = j
    return times


def captions_for(scene_words, sid):
    out, chunk = [], []
    for i, wd in enumerate(scene_words):
        chunk.append(wd)
        rest = 0
        for nxt in scene_words[i + 1:]:
            rest += 1
            if re.search(r"[.!?:,;]$", nxt["w"]):
                break
        hard = re.search(r"[.!?]$", wd["w"])
        soft = re.search(r"[:,;]$", wd["w"]) and len(chunk) >= 3
        full = len(chunk) >= 6 and norm(wd["w"]) not in WEAK and rest > 2
        if hard or soft or full or len(chunk) >= 9 or i == len(scene_words) - 1:
            out.append({"text": " ".join(x["w"] for x in chunk), "t0": chunk[0]["t0"], "t1": chunk[-1]["t1"],
                        "scene": sid})
            chunk = []
    return out


def main():
    script = json.loads((ROOT / "script.json").read_text())
    tc = {"first_lead": 0.6, "lead": 0.3, "tail": 0.5, "end_hold": 3.0, **script.get("timing", {})}
    scenes, words, captions, cues = [], [], [], {}
    t = 0.0
    n = len(script["scenes"])
    for idx, sc in enumerate(script["scenes"]):
        sid = sc["id"]
        wav = VO / f"{sid}.wav"
        if not wav.exists():
            raise SystemExit(f"missing {wav.relative_to(ROOT)}: run scripts/tts.py")
        vo_dur = duration(wav)
        lead = tc["first_lead"] if idx == 0 else tc["lead"]
        dur = lead + vo_dur + tc["tail"] + (tc["end_hold"] if idx == n - 1 else 0) + sc.get("hold", 0)
        vo = t + lead
        scenes.append({"id": sid, "start": round(t, 3), "dur": round(dur, 3), "vo": round(vo, 3),
                       "voDur": round(vo_dur, 3), "chapter": sc.get("chapter", "")})
        cues[sid] = round(t, 3)
        cues[sid + ".vo"] = round(vo, 3)

        wf = VO / f"{sid}.words.json"
        heard = json.loads(wf.read_text()) if wf.exists() else []
        sw = sc["text"].split()
        tt = align(sw, heard) if heard else [(vo_dur * i / len(sw), vo_dur * (i + 1) / len(sw)) for i in range(len(sw))]
        scene_words = [{"w": w, "t0": round(vo + a0, 3), "t1": round(vo + a1, 3), "scene": sid}
                       for w, (a0, a1) in zip(sw, tt)]
        words.extend(scene_words)
        captions.extend(captions_for(scene_words, sid))

        for name, target in sc.get("cues", {}).items():
            word, nth = (target, 1) if isinstance(target, str) else target
            hits = [w for w in scene_words if norm(w["w"]) == norm(word)]
            if len(hits) < nth:
                raise SystemExit(f"cue {name}: '{word}' (#{nth}) not in scene {sid}. Words: {' '.join(sw)}")
            cues[name] = hits[nth - 1]["t0"]
        t += dur

    for i, c in enumerate(captions):
        nxt = captions[i + 1]["t0"] if i + 1 < len(captions) else c["t1"] + 0.6
        c["t1"] = round(min(nxt, c["t1"] + 0.6), 3)

    out = {"total": round(t, 3), "fps": script.get("fps", 30), "scenes": scenes, "cues": cues,
           "captions": captions, "words": words}
    (ROOT / "assets" / "timing.json").write_text(json.dumps(out, indent=1))
    (ROOT / "assets" / "timing.js").write_text("window.TIMING = " + json.dumps(out) + ";\n")
    print(f"total {out['total']} s")
    for s in scenes:
        print(f"  {s['start']:7.2f}  {s['dur']:6.2f}s  {s['id']}")


if __name__ == "__main__":
    main()
