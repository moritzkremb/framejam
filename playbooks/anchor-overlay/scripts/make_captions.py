#!/usr/bin/env python3
"""Group edited-time words into caption chunks and write captions.json and captions.srt.

Input is the transcript of the FINAL edited audio (not the raw recording). Accepted formats: a JSON list of
{text|word,start,end}, {"words": [...]}, or {"segments": [{"words": [...]}]}.

Default: ONE word at a time, exactly as spoken (case and commas kept, sentence-ending full stops dropped).
For a different taste pass, for example, --max-words 3 --case upper. Rules: at most
--max-words words and --max-chars characters per chunk; a chunk never runs past the end of a sentence or across a
--breaks time; every chunk lasts 0.2-1.2 s (--min-dur, --max-dur); start and end snap to the --fps frame grid;
chunks never overlap and short gaps are closed so text doesn't flicker. --hide edit.json drops or trims every chunk
that would run while a big word is on screen. Each chunk keeps its words with start times and the recognised
spelling ("orig"), so check_plan.py can compare the text with the transcript after name fixes.
Fix recognised names with --fix "cloud code=Claude Code" (case-insensitive, repeatable).
"""
import argparse, json, math, re
from pathlib import Path


def load_words(path):
    d = json.loads(Path(path).read_text())
    if isinstance(d, dict) and "words" in d:
        d = d["words"]
    elif isinstance(d, dict) and "segments" in d:
        d = [w for s in d["segments"] for w in s.get("words", [])]
    out = []
    for w in d:
        if w.get("type", "word") != "word" or "start" not in w:
            continue
        text = str(w.get("text", w.get("word", ""))).strip()
        if text:
            out.append({"text": text, "start": float(w["start"]), "end": float(w["end"])})
    return out


def apply_fixes(words, fixes):
    for w in words:
        w.setdefault("orig", w["text"])
    for fix in fixes:
        src, dst = fix.split("=", 1)
        src_toks = src.lower().split()
        dst_toks = dst.split()
        i = 0
        while i <= len(words) - len(src_toks):
            seg = [re.sub(r"[^\w']", "", w["text"]).lower() for w in words[i : i + len(src_toks)]]
            if seg == src_toks:
                trail = re.sub(r"^.*?([^\w']*)$", r"\1", words[i + len(src_toks) - 1]["text"])
                merged = {"text": " ".join(dst_toks) + trail, "start": words[i]["start"], "end": words[i + len(src_toks) - 1]["end"],
                          "orig": " ".join(w["orig"] for w in words[i : i + len(src_toks)])}
                words[i : i + len(src_toks)] = [merged]
            i += 1
    return words


def tidy(t, case):
    t = re.sub(r"[.!?]+$", "", t)
    return t.upper() if case == "upper" else t.lower() if case == "lower" else t


def build(words, max_words=1, max_chars=16, fps=30, breaks=(), duration=None, min_dur=0.2, max_dur=1.2, case="asis"):
    def crosses(t0, t1):
        return any(t0 < x <= t1 for x in breaks)

    runs, cur = [], []
    for w in words:
        if cur and (re.search(r"[.!?;:]$", cur[-1]["text"]) or crosses(cur[0]["start"] + 0.02, w["start"] + 0.02)):
            runs.append(cur)
            cur = []
        cur.append(w)
    if cur:
        runs.append(cur)
    groups = []
    for run in runs:
        k = math.ceil(len(run) / max_words)
        while True:
            sizes = [len(run) // k + (1 if i < len(run) % k else 0) for i in range(k)]
            chunks, i = [], 0
            for n in sizes:
                chunks.append(run[i : i + n])
                i += n
            if k >= len(run) or all(len(" ".join(x["text"] for x in c)) <= max_chars for c in chunks):
                break
            k += 1
        groups.extend(chunks)

    f = fps
    caps = []
    for g in groups:
        s = math.floor(g[0]["start"] * f) / f
        e = math.ceil(max(g[-1]["end"], g[0]["start"] + min_dur) * f) / f
        ws = [{"text": tidy(x["text"], case), "orig": x.get("orig", x["text"]), "start": round(max(s, x["start"]), 4)} for x in g]
        caps.append({"start": s, "end": e, "text": " ".join(x["text"] for x in ws), "words": ws})
    for i in range(len(caps) - 1):
        nxt = caps[i + 1]["start"]
        if caps[i]["end"] > nxt or nxt - caps[i]["end"] < 0.25:
            caps[i]["end"] = nxt
    for c in caps:
        c["end"] = min(c["end"], round(math.floor((c["start"] + max_dur) * f) / f, 4))
    if duration:
        caps[-1]["end"] = min(caps[-1]["end"] + 0.3, duration)
    caps = [c for c in caps if c["end"] - c["start"] >= 1 / f]
    for c in caps:
        c["start"], c["end"] = round(c["start"], 4), round(c["end"], 4)
    return caps


def hide_during(caps, spans, fps=30, min_dur=0.2):
    out = []
    for c in caps:
        s, e = c["start"], c["end"]
        hit = [(a, b) for a, b in spans if a < e and b > s]
        if hit:
            a, b = min(hit)
            if s >= a:
                continue
            e = round(math.floor(a * fps) / fps, 4)
            if e - s < 1 / fps:
                continue
        out.append({**c, "end": e})
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--words", required=True, help="edited-time transcript JSON")
    ap.add_argument("--out", default="captions.json")
    ap.add_argument("--max-words", type=int, default=1)
    ap.add_argument("--max-chars", type=int, default=16)
    ap.add_argument("--case", choices=["asis", "upper", "lower"], default="asis")
    ap.add_argument("--min-dur", type=float, default=0.2)
    ap.add_argument("--max-dur", type=float, default=1.2)
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--breaks", help="edit.json (breaks at every overlay start) or a JSON list of times")
    ap.add_argument("--hide", help="edit.json: no caption while one of its big words is on screen")
    ap.add_argument("--fix", action="append", default=[])
    ap.add_argument("--duration", type=float, help="video length; the last caption ends here at most")
    a = ap.parse_args()

    words = apply_fixes(load_words(a.words), a.fix)
    breaks = []
    if a.breaks:
        b = json.loads(Path(a.breaks).read_text())
        breaks = sorted(x["at"] for x in b["overlays"]) if isinstance(b, dict) else sorted(b)
        a.duration = a.duration or (b.get("duration") if isinstance(b, dict) else None)
    spans = []
    if a.hide:
        e = json.loads(Path(a.hide).read_text())
        spans = [(x["at"], x["end"]) for x in e.get("big", [])]
        words = [w for w in words if not any(s0 <= w["start"] < s1 for s0, s1 in spans)]
        breaks = sorted(breaks + [s0 for s0, _ in spans])
    caps = build(words, a.max_words, a.max_chars, a.fps, breaks, a.duration, a.min_dur, a.max_dur, a.case)
    if spans:
        caps = hide_during(caps, spans, a.fps, a.min_dur)

    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(caps, indent=1) + "\n")

    def srt_t(t):
        ms = round(t * 1000)
        return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"

    out.with_suffix(".srt").write_text("".join(f"{i}\n{srt_t(c['start'])} --> {srt_t(c['end'])}\n{c['text']}\n\n" for i, c in enumerate(caps, 1)))
    print(json.dumps({"captions": len(caps), "out": str(out)}))


if __name__ == "__main__":
    main()
