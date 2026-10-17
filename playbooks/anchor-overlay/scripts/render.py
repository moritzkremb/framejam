#!/usr/bin/env python3
"""Render edit.json (+ captions.json) to an mp4 with one ffmpeg command: no browser, no Node.

  python3 scripts/render.py                                  # edit.json + captions.json -> renders/draft.mp4 (full size)
  python3 scripts/render.py --draft                          # half size, fastest encode: the first look
  python3 scripts/render.py --sample 12:27 --draft           # just seconds 12-27 of a real plan
  python3 scripts/render.py --quick --input source/raw.mp4 --sample 0:15 [--words w.json] [--media pics/]
                                                             # a first look straight from a raw clip (see below)

The anchor (aroll) fills the frame all the time; overlays, big words, labels, asides and captions are drawn over it
with hard cuts, and punch-ins re-frame the anchor around aroll.origin. Text is drawn by ffmpeg's libass from an .ass
file made here. Needs ffmpeg with libass (standard Homebrew and Ubuntu builds have it).

--quick skips the cut: it takes the raw window as it is, transcribes it (--words, or local whisper through
`npx hyperframes transcribe`), puts a punch-in on sentence starts, and gives every long content word a plain grey
"PLACEHOLDER" card with the word written on it, unless --media has a picture named after the word (hospital.jpg).
It is only for looking at the rhythm before the real plan exists; check_plan.py rejects placeholders.
"""
import argparse, json, re, shutil, subprocess, sys, tempfile, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import anchorlib as L  # noqa: E402

STOP = set("""about above after again also always because before being between could every first found great having
here himself itself just know like little make might more most much never other over really right shall should since
still such than that their them then there these they thing things think those through today under until very want
were what when where which while whole will with would your yours""".split())


def ass_color(hex_):
    h = hex_.lstrip("#")
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H00{b}{g}{r}".upper()


def ass_time(t):
    cs = int(round(max(0, t) * 100))
    return f"{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}"


def ass_text(s):
    return str(s).replace("\\", "").replace("{", "(").replace("}", ")").replace("\n", "\\N")


def subtract(span, cuts):
    s, e = span
    pieces = [(s, e)]
    for a, b in sorted(cuts):
        nxt = []
        for ps, pe in pieces:
            if b <= ps or a >= pe:
                nxt.append((ps, pe))
                continue
            if a > ps:
                nxt.append((ps, a))
            if b < pe:
                nxt.append((b, pe))
        pieces = nxt
    return [(a, b) for a, b in pieces if b - a >= 0.1]


def make_ass(plan, caps, path):
    t = plan["theme"]
    m = L.Measurer(plan)
    sw = t["captionStrokeWidth"]
    styles = [
        ("Cap", t["captionFont"], t["captionSize"], t["captionColor"], t["captionStroke"], sw),
        ("Big", t["bigFont"], t["bigSize"], t.get("bigColor", "#FFFFFF"), t.get("bigStroke", "#000000"), t.get("bigStrokeWidth", 6)),
        ("Label", t["labelFont"], t["labelSize"], t.get("labelColor", "#FFFFFF"), t.get("labelStroke", "#000000"), t.get("labelStrokeWidth", 4)),
        ("Aside", t["asideFont"], t["asideSize"], t.get("asideColor", "#FFFFFF"), t.get("asideStroke", "#000000"), t.get("asideStrokeWidth", 3)),
    ]
    out = [f"[Script Info]\nScriptType: v4.00+\nPlayResX: {L.W}\nPlayResY: {L.H}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n",
           "[V4+ Styles]",
           "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding"]
    for name, font, size, col, stroke, w in styles:
        out.append(f"Style: {name},{font},{size},{ass_color(col)},{ass_color(col)},{ass_color(stroke)},&H00000000,0,0,0,0,100,100,0,0,1,{w},0,5,0,0,0,1")
    out += ["", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]
    ev = []
    big_spans = [(float(b["at"]), float(b["end"])) for b in plan["big"]]
    for c in caps or []:
        for a, b in subtract((c["start"], c["end"]), big_spans):
            txt = L.style_text(t, "caption", c["text"])
            ev.append((a, 0, f"Dialogue: 0,{ass_time(a)},{ass_time(b)},Cap,,0,0,0,,{{\\an5\\pos({L.W // 2},{t['captionY']})}}{ass_text(txt)}"))
    for b in plan["big"]:
        r, size = L.text_rect(plan, m, "big", b["text"], size=t["bigSize"], width_cap=t["bigMaxWidth"])
        txt = L.style_text(t, "big", b["text"])
        ev.append((float(b["at"]), 1, f"Dialogue: 1,{ass_time(b['at'])},{ass_time(b['end'])},Big,,0,0,0,,{{\\an5\\pos({L.W // 2},{t['bigY']})\\fs{int(size)}}}{ass_text(txt)}"))
    rects = [(float(o["at"]), float(o["end"]), r) for o in plan["overlays"] for r in L.overlay_rects(plan, o)]
    for l in plan["labels"]:
        r, size = L.text_rect(plan, m, "label", l["text"], width_cap=960)
        cuts = [(a, b) for a, b, rr in rects if L.rects_hit(r, rr, pad=8)]
        txt = L.style_text(t, "label", l["text"])
        for a, b in subtract((float(l["at"]), float(l["end"])), cuts):
            ev.append((a, 2, f"Dialogue: 2,{ass_time(a)},{ass_time(b)},Label,,0,0,0,,{{\\an5\\pos({L.W // 2},{t['labelY']})\\fs{int(size)}}}{ass_text(txt)}"))
    for a in plan["asides"]:
        ev.append((float(a["at"]), 3, f"Dialogue: 3,{ass_time(a['at'])},{ass_time(a['end'])},Aside,,0,0,0,,{{\\an5\\pos({L.W // 2},{t['asideY']})}}{ass_text(a['text'])}"))
    for o in plan["overlays"]:
        if o.get("aside"):
            x, y, w, h = L.overlay_rects(plan, o)[0]
            ev.append((float(o["at"]), 3, f"Dialogue: 3,{ass_time(o['at'])},{ass_time(o['end'])},Aside,,0,0,0,,{{\\an1\\pos({x},{y - 12})}}{ass_text(o['aside'])}"))
    out += [e for _, _, e in sorted(ev, key=lambda e: (e[0], e[1]))]
    Path(path).write_text("\n".join(out) + "\n", encoding="utf-8")


def make_placeholder(plan, o, tmp):
    w, h = (o.get("size") or [800, 600])[:2]
    word = L.style_text({"x": "upper"}, "x", str(o.get("word") or o.get("id") or "picture")).replace("'", "").replace(":", " ")
    font = plan["_root"] / plan["theme"]["captionFontFile"]
    out = Path(tmp) / f"placeholder-{o['id']}.png"
    vf = (f"drawtext=fontfile={font}:text='{word}':fontcolor=white:fontsize={max(24, int(w / max(6, len(word)) * 1.4))}:x=(w-text_w)/2:y=(h-text_h)/2,"
          f"drawtext=fontfile={font}:text='PLACEHOLDER':fontcolor=0xdddddd:fontsize=28:x=24:y=20")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=0x4a4a4a:s={w}x{h}", "-vf", vf, "-frames:v", "1", str(out)], check=True)
    return out


def build_command(plan, caps, out, draft, tmp):
    fps = plan["fps"]
    cmd = ["ffmpeg", "-v", "error", "-y"] + L.aroll_input_args(plan)
    filters = L.aroll_graph(plan, label="v0")
    last, k = "v0", 0
    idx = 1
    for o in plan["overlays"]:
        rects = L.overlay_rects(plan, o)
        for i, src in enumerate(L.srcs(o)):
            path = plan["_root"] / src
            if o.get("placeholder") and not path.exists():
                path = make_placeholder(plan, o, tmp)
            x, y, w, h = rects[i]
            at, end = float(o["at"]), float(o["end"])
            if L.is_video(src):
                cmd += ["-ss", L.num(o.get("start", 0)), "-t", L.num(end - at + 0.1), "-i", str(path)]
                pre = f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1,fps={fps},setpts=PTS-STARTPTS+{L.num(at)}/TB"
            else:
                cmd += ["-framerate", str(fps), "-loop", "1", "-t", L.num(plan["duration"]), "-i", str(path)]
                pre = f"scale={w}:{h}:flags=lanczos,setsar=1,format=yuv420p"
            border = plan["theme"].get("overlayBorder")
            if border:
                pre += f",drawbox=x=0:y=0:w=iw:h=ih:color={border.get('color', '#FFFFFF').lstrip('#')}:t={int(border.get('width', 6))}"
            filters.append(f"[{idx}:v]{pre}[p{k}]")
            filters.append(f"[{last}][p{k}]overlay={x}:{y}:enable='between(t,{L.num(at)},{L.num(end)})':eof_action=pass[v{k + 1}]")
            last = f"v{k + 1}"
            idx += 1
            k += 1
    ass = Path(tmp) / "text.ass"
    make_ass(plan, caps, ass)
    fonts = Path(tmp) / "fonts"
    fonts.mkdir(exist_ok=True)
    for key in ("captionFontFile", "bigFontFile", "labelFontFile", "asideFontFile"):
        src = plan["_root"] / plan["theme"][key]
        if src.exists():
            shutil.copy(src, fonts / src.name)
    tail = f"[{last}]ass={ass.as_posix()}:fontsdir={fonts.as_posix()}"
    if draft:
        tail += f",scale={L.W // 2}:{L.H // 2}:flags=bilinear"
    filters.append(tail + ",format=yuv420p[vout]")
    music_index = None
    if L.music_active(plan):
        music_index = idx
        cmd += L.music_input_args(plan)
    af = L.audio_graph(plan, music_index)
    if music_index is not None:
        af.append("[voice][music]amix=inputs=2:duration=first:normalize=0:dropout_transition=0,alimiter=limit=0.89[aout]")
        amap = "[aout]"
    else:
        amap = "[voice]"
    graph = Path(tmp) / "graph.txt"
    graph.write_text(";\n".join(filters + af) + "\n")
    enc = ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "28"] if draft else ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"]
    cmd += ["-filter_complex_script", str(graph), "-map", "[vout]", "-map", amap, "-t", L.num(plan["duration"]), "-r", str(fps), *enc,
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(out)]
    return cmd, graph


def transcribe_window(src, a, b, tmp):
    wav = Path(tmp) / "window-16k.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", L.num(a), "-t", L.num(b - a), "-i", str(src), "-vn", "-ac", "1", "-ar", "16000", str(wav)], check=True)
    try:
        subprocess.run(["npx", "-y", "hyperframes", "transcribe", str(wav), "--dir", tmp, "--model", "small.en", "--json"], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except (OSError, subprocess.CalledProcessError):
        raise SystemExit("--quick needs word times: pass --words transcript.json, or install local whisper (npx hyperframes transcribe).")
    return L.load_words(Path(tmp) / "transcript.json")


def quick_plan(args, root, tmp):
    src = Path(args.input).resolve()
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(src)], capture_output=True, text=True).stdout.strip())
    a, b = (float(x) for x in args.sample.split(":")) if args.sample else (0.0, min(15.0, dur))
    b = min(b, dur)
    words = L.load_words(args.words) if args.words else transcribe_window(src, a, b, tmp)
    words = [{**w, "start": w["start"] - a, "end": w["end"] - a} for w in words if a <= w["start"] < b]
    media = {p.stem.lower(): p for p in Path(args.media).glob("*")} if args.media else {}
    overlays, punches, last_end, n = [], [], -9.0, 0
    zoom = 1.0
    for i, w in enumerate(words):
        if i == 0 or re.search(r"[.!?]$", words[i - 1]["text"]):
            zoom = 1.12 if zoom == 1.0 else 1.0
            punches.append({"at": round(w["start"], 3), "zoom": zoom})
        tok = L.norm_word(w["text"])
        if len(tok) < 5 or tok in STOP or w["start"] - last_end < 0.4 or w["start"] < 0.5:
            continue
        kind = "thumb" if n % 2 == 0 else "card"
        end = min(w["start"] + 1.4, b - a)
        o = {"id": f"o{n + 1}", "kind": kind, "at": round(w["start"], 3), "end": round(end, 3), "word": tok}
        if tok in media:
            o["src"] = str(media[tok])
        else:
            o.update({"src": f"placeholder-{tok}.png", "placeholder": True, "size": [800, 450] if kind == "thumb" else [800, 1000]})
        overlays.append(o)
        last_end, n = end, n + 1
    plan = {"duration": round(b - a, 3), "fps": 30, "aroll": {"src": str(src), "offset": a, "eyeY": 720}, "theme": {}, "checks": {},
            "punches": punches, "overlays": overlays, "big": [], "labels": [], "asides": [], "music": False}
    pf = Path(tmp) / "edit.json"
    pf.write_text(json.dumps(plan))
    p = L.load_plan(pf)
    p["_root"] = root
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import make_captions as MC
    caps = MC.build([{**w, "orig": w["text"]} for w in words], fps=30, duration=b - a)
    # aroll offset already holds the window start; the words were shifted, so don't shift twice
    return p, caps


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("edit", nargs="?", default="edit.json")
    ap.add_argument("--captions", help="captions.json (default: captions.json next to edit.json if it exists)")
    ap.add_argument("--out", default=None)
    ap.add_argument("--draft", action="store_true", help="half size, fastest encode")
    ap.add_argument("--sample", help="render only A:B seconds, e.g. 12:27")
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--input")
    ap.add_argument("--words")
    ap.add_argument("--media")
    ap.add_argument("--print-cmd", action="store_true")
    ap.add_argument("--keep", action="store_true", help="keep the temporary graph and .ass files")
    a = ap.parse_args()
    t0 = time.time()
    tmp = tempfile.mkdtemp(prefix="anchor-render-")
    try:
        if a.quick:
            if not a.input:
                raise SystemExit("--quick needs --input raw.mp4")
            plan, caps = quick_plan(a, Path.cwd(), tmp)
        else:
            plan = L.load_plan(a.edit)
            cp = Path(a.captions) if a.captions else plan["_root"] / "captions.json"
            caps = L.load_captions(cp) if cp.exists() else None
            if caps is None:
                print("no captions.json: rendering without spoken captions", file=sys.stderr)
            if a.sample:
                s, e = (float(x) for x in a.sample.split(":"))
                plan, caps = L.window(plan, caps, s, min(e, float(plan["duration"])))
        out = Path(a.out or ("renders/draft.mp4" if not a.draft else "renders/draft-small.mp4"))
        out.parent.mkdir(parents=True, exist_ok=True)
        cmd, graph = build_command(plan, caps, out, a.draft, tmp)
        if a.print_cmd:
            print(" ".join(cmd))
            print(graph.read_text())
        r = subprocess.run(cmd)
        if r.returncode:
            raise SystemExit(f"ffmpeg failed ({r.returncode})")
        print(json.dumps({"out": str(out), "seconds": round(time.time() - t0, 1), "duration": plan["duration"],
                          "realtimeFactor": round(plan["duration"] / (time.time() - t0), 2)}))
    finally:
        if a.keep:
            print("kept", tmp)
        else:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
