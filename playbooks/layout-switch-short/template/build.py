#!/usr/bin/env python3
"""Build index.html (a Hyperframes composition) from edit.json and captions.json.

edit.json lists the beats of the edited talking-head video. Each beat picks one layout:

  speaker   the speaker fills the frame ("zoom": 1.0 wide, 1.12-1.18 punched in; "punches" re-frame inside the beat)
  split     a visual on top (0-960) in a rounded card on the animated background, the speaker below (960-1920)
  visual    the visual in a big card on the background, the speaker cut out in front ("cutout": transparent webm)
  roadmap   split, with the step list on top; "step": n moves the highlight to step n, "step": 0 shows them all
  title     split, with the hook title on top (on screen from the first frame)
  words     split, with one to three big words on top that land as they are spoken

A visual is {"src": ...} (image or video) or {"gallery": [src, ...]} (2-3 images fanned out, landing at "at").
Optional per visual: "label" (small chip on the card), "focus" (zooms inside the card at given times), "motion"
("push", "scroll" or "none"), "fit" ("contain" or "cover"), "box" [x, y, w, h], "backdrop" (blurred copy behind).

Run `python3 build.py` (defaults: edit.json, captions.json, index.html in this folder), then
`npx hyperframes check`, `npx hyperframes snapshot --at ...` and `npx hyperframes render`.
"""
import argparse, html, json, re, subprocess
from pathlib import Path

W, H, SEAM = 1080, 1920, 960
DEFAULT_THEME = {
    "base": "#EEE6DA",
    "blobs": ["#FF7A59", "#4FD8B0", "#7D8CFF", "#FFB0D0"],
    "grain": 1.0,
    "ink": "#121317",
    "accent": "#FFDD3C",
    "accentInk": "#121317",
    "onInk": "#FFFFFF",
    "card": "#FFFFFF",
    "radius": 30,
    "stepBg": "rgba(255,255,255,0.62)",
    "captionBg": "rgba(14,15,19,0.92)",
    "captionText": "#FFFFFF",
    "captionActive": None,
    "captionSize": 62,
    "font": "Bricolage Grotesque",
    "fontFile": "assets/fonts/bricolage-grotesque-latin-wght-normal.woff2",
    "labelFont": "Geist Mono",
    "labelFontFile": "assets/fonts/geist-mono-latin-wght-normal.woff2",
    "grainFile": "assets/grain.png",
    "progress": False,
}
LEGACY_KEYS = {"text": "ink", "title": "ink", "panelBg": "card"}
# Caption centre line per layout, in px from the top.
CAPTION_Y = {"split": SEAM, "roadmap": SEAM, "title": SEAM, "words": SEAM, "speaker": 1410, "visual": 1010}
# Where media cards sit: x, y, w, h. Top ~200 px and the strip around the seam stay free for the platform UI and captions.
SPLIT_BOX = (60, 205, 960, 690)
VISUAL_BOX = (40, 225, 1000, 700)
VIDEO_EXT = (".mp4", ".webm", ".mov", ".m4v")


def esc(s):
    return html.escape(str(s), quote=True)


def num(x):
    return f"{float(x):.3f}".rstrip("0").rstrip(".")


_dims = {}


def media_size(root, src):
    if src not in _dims:
        out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                              "-of", "csv=p=0", str(root / src)], capture_output=True, text=True).stdout.strip()
        try:
            w, h = (int(x) for x in out.split(",")[:2])
        except ValueError:
            raise SystemExit(f"Can't read the size of {src} (is ffprobe installed and the file there?)")
        _dims[src] = (w, h)
    return _dims[src]


def fit_box(mw, mh, box):
    bx, by, bw, bh = box
    s = min(bw / mw, bh / mh)
    cw, ch = round(mw * s), round(mh * s)
    return bx + (bw - cw) // 2, by + (bh - ch) // 2, cw, ch


def media_el(el_id, src, start, dur, media_start=0, fit="cover", pos="50% 50%", cls="media"):
    style = f"object-fit:{fit};object-position:{pos}"
    if src.lower().endswith(VIDEO_EXT):
        return (f'<video id="{el_id}" class="clip {cls}" src="{esc(src)}" data-start="{num(start)}" data-duration="{num(dur)}" '
                f'data-media-start="{num(media_start)}" data-track-index="2" muted playsinline style="{style}"></video>')
    return (f'<img id="{el_id}" class="clip {cls}" src="{esc(src)}" data-start="{num(start)}" data-duration="{num(dur)}" '
            f'data-track-index="2" alt="" style="{style}">')


def mark_html(line, mark, mid):
    """Wrap the first occurrence of `mark` in `line` with a highlighter span."""
    if mark and mark.lower() in line.lower():
        i = line.lower().index(mark.lower())
        a, m, b = line[:i], line[i:i + len(mark)], line[i + len(mark):]
        return f'{esc(a)}<span class="mark"><span class="mark-bg" id="{mid}"></span><span class="mark-t">{esc(m)}</span></span>{esc(b)}'
    return esc(line)


def fit_font(lines, max_px, width=940, em=0.57):
    longest = max((len(x) for x in lines), default=1)
    return int(min(max_px, width / (em * max(longest, 1))))


def main():
    here = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--edit", default=str(here / "edit.json"))
    ap.add_argument("--captions", default=str(here / "captions.json"))
    ap.add_argument("--out", default=str(here / "index.html"))
    a = ap.parse_args()

    root = Path(a.edit).resolve().parent
    e = json.loads(Path(a.edit).read_text())
    user_theme = dict(e.get("theme", {}))
    for old, new in LEGACY_KEYS.items():
        if old in user_theme and new not in user_theme:
            user_theme[new] = user_theme[old]
    theme = {**DEFAULT_THEME, **user_theme}
    theme["captionActive"] = theme["captionActive"] or theme["accent"]
    dur = float(e["duration"])
    beats = sorted(e["beats"], key=lambda b: b["start"])
    for i, b in enumerate(beats):
        b.setdefault("id", f"b{i + 1:02d}")
        b.setdefault("end", beats[i + 1]["start"] if i + 1 < len(beats) else dur)
        if b["layout"] not in CAPTION_Y:
            raise SystemExit(f"Beat {b['id']}: unknown layout {b['layout']}")
    caps = json.loads(Path(a.captions).read_text()) if Path(a.captions).exists() else []
    caps = caps["captions"] if isinstance(caps, dict) else caps
    steps = e.get("roadmap", [])
    speaker_y = e.get("speakerY", 40)
    R = int(theme["radius"])

    body, js = [], []

    # Background: paper colour, drifting colour fields, grain. Full frame; the speaker covers the bottom in split beats.
    blobs = theme["blobs"][:5]
    blob_pos = [(-380, -420), (380, -260), (-300, 360), (420, 520), (-120, 1100)]
    def fade(c, alpha):
        return f"{c}{alpha}" if c.startswith("#") and len(c) == 7 else ("transparent" if alpha == "00" else c)

    blob_html = "".join(f'<div class="blob" id="blob{i}" style="left:{blob_pos[i][0]}px;top:{blob_pos[i][1]}px;'
                        f'background:radial-gradient(closest-side,{c} 0%,{fade(c, "cc")} 38%,{fade(c, "00")} 100%)"></div>' for i, c in enumerate(blobs))
    grain = f'<div id="grain" style="background-image:url({esc(theme["grainFile"])});opacity:{theme["grain"]}"></div>' if theme["grain"] else ""
    body.append(f'<div id="bg" data-layout-allow-overflow>{blob_html}{grain}</div>')
    drift = [(170, 120, 1.12, 9.5), (-150, 170, 1.18, 11), (160, -130, 1.1, 8.5), (-180, -150, 1.15, 10.5), (140, -160, 1.12, 12)]
    for i in range(len(blobs)):
        dx, dy, sc, period = drift[i]
        reps = int(dur // period) + 1
        js.append(f"tl.fromTo('#blob{i}',{{x:0,y:0,scale:1}},{{x:{dx},y:{dy},scale:{sc},duration:{period},ease:'sine.inOut',yoyo:true,repeat:{reps}}},0);")

    # Roadmap: row backgrounds, the moving highlight slab, row content. Geometry is fixed so the slab can travel.
    n = len(steps)
    if n:
        bx, by, bw, bh = SPLIT_BOX
        gap = 14
        rh = min(118, (bh - gap * (n - 1)) // n)
        top0 = by + (bh - (rh * n + gap * (n - 1))) // 2
        row_y = [top0 + i * (rh + gap) for i in range(n)]
        rx, rw = 70, 940
        step_px = min(50, int(rh * 0.42))
        parts = [f'<div class="row-bg" id="rbg-{i + 1}" style="top:{row_y[i]}px;left:{rx}px;width:{rw}px;height:{rh}px"></div>' for i in range(n)]
        parts.append(f'<div id="slab" style="top:0;left:{rx}px;width:{rw}px;height:{rh}px"></div>')
        parts += [
            f'<div class="row-fg" id="rfg-{i + 1}" style="top:{row_y[i]}px;left:{rx}px;width:{rw}px;height:{rh}px">'
            f'<span class="badge" id="bdg-{i + 1}" style="width:{rh - 40}px;height:{rh - 40}px"><span class="bn">{i + 1:02d}</span><span class="bc">&#10003;</span></span>'
            f'<span class="rt" style="font-size:{step_px}px">{esc(t)}</span></div>'
            for i, t in enumerate(steps)
        ]
        body.append(f'<div id="roadmap" class="panel-area">{"".join(parts)}</div>')

    body.append(
        f'<div id="spk" data-layout-allow-overflow><div id="spk-zoom"><video id="spk-v" class="clip" src="{esc(e["speaker"])}" data-start="0" '
        f'data-duration="{num(dur)}" data-track-index="0" muted playsinline></video></div></div>'
    )
    body.append('<div id="seam"></div>')
    body.append(f'<audio id="narration" class="clip" src="{esc(e["narration"])}" data-start="0" data-duration="{num(dur)}" data-track-index="10" data-volume="{e.get("narrationVolume", 1)}"></audio>')
    if e.get("music"):
        m = e["music"]
        body.append(f'<audio id="music" class="clip" src="{esc(m["src"])}" data-start="0" data-duration="{num(dur)}" data-track-index="11" data-volume="{m.get("volume", 0.12)}"></audio>')
    if theme["progress"]:
        body.append('<div id="prog"><div id="prog-in"></div></div>')
        js.append(f"tl.fromTo('#prog-in',{{scaleX:0}},{{scaleX:1,duration:{num(dur)},ease:'none'}},0);")

    prev_step = None
    for b in beats:
        s, t, lay, bid = float(b["start"]), float(b["end"]), b["layout"], b["id"]
        d = t - s
        split = lay in ("split", "roadmap", "title", "words")
        zoom = b.get("zoom", 1)
        # Speaker geometry for this beat (hard cut at the beat start), then any punches inside the beat.
        if lay == "visual":
            js.append(f"tl.set('#spk',{{opacity:0}},{num(s)});")
        elif split:
            js.append(f"tl.set('#spk',{{opacity:1,top:{SEAM},height:{H - SEAM}}},{num(s)});")
            js.append(f"tl.set('#spk-v',{{objectPosition:'50% {b.get('speakerY', speaker_y)}%'}},{num(s)});")
            js.append(f"tl.set('#spk-zoom',{{scale:{zoom},transformOrigin:'{b.get('origin', '50% 38%')}'}},{num(s)});")
        else:
            js.append(f"tl.set('#spk',{{opacity:1,top:0,height:{H}}},{num(s)});")
            js.append(f"tl.set('#spk-v',{{objectPosition:'50% 50%'}},{num(s)});")
            js.append(f"tl.set('#spk-zoom',{{scale:{zoom},transformOrigin:'{b.get('origin', '50% 30%')}'}},{num(s)});")
        for p in b.get("punches", []):
            js.append(f"tl.set('#spk-zoom',{{scale:{p['zoom']}}},{num(p['at'])});")
        js.append(f"tl.set('#seam',{{opacity:{1 if split else 0}}},{num(s)});")
        js.append(f"tl.set('#roadmap',{{opacity:{1 if lay == 'roadmap' else 0}}},{num(s)});")

        v = b.get("visual")
        if v and lay in ("split", "visual"):
            box = tuple(v.get("box") or (SPLIT_BOX if lay == "split" else VISUAL_BOX))
            inner = ""
            if v.get("backdrop") and v.get("src"):
                inner += media_el(f"bd-{bid}", v["src"], s, d, v.get("mediaStart", 0), "cover", cls="media backdrop")
            if v.get("gallery"):
                srcs = v["gallery"][:3]
                k = len(srcs)
                gh = round(box[3] * (0.80 if k == 3 else 0.86))
                rots = {1: [0], 2: [-5, 5], 3: [-8, 0, 8]}[k]
                centers = {1: [0.5], 2: [0.33, 0.67], 3: [0.22, 0.5, 0.78]}[k]
                ats = v.get("at") or [s + 0.08 + i * 0.28 for i in range(k)]
                order = [0, 2, 1] if k == 3 else list(range(k))
                for i in order:
                    mw, mh = media_size(root, srcs[i])
                    side = k == 3 and i != 1
                    ch = round(gh * (0.86 if side else 1))
                    cw = round(ch * mw / mh)
                    cx = box[0] + box[2] * centers[i] - cw / 2
                    cy = box[1] + (box[3] - ch) / 2 + (24 if side else 0)
                    inner += (f'<div class="card gcard" id="g-{bid}-{i}" style="left:{cx:.0f}px;top:{cy:.0f}px;width:{cw}px;height:{ch}px">'
                              f'{media_el(f"m-{bid}-{i}", srcs[i], s, d)}</div>')
                    js.append(f"tl.fromTo('#g-{bid}-{i}',{{opacity:0,y:90,scale:.88,rotation:{rots[i] * 2.2}}},"
                              f"{{opacity:1,y:0,scale:1,rotation:{rots[i]},duration:.42,ease:'back.out(1.5)'}},{num(ats[i])});")
            else:
                src = v["src"]
                mw, mh = media_size(root, src)
                cover = v.get("fit") == "cover"
                cx, cy, cw, ch = box if cover else fit_box(mw, mh, box)
                bg = v.get("bg", theme["card"])
                m = media_el(f"m-{bid}", src, s, d, v.get("mediaStart", 0), "cover" if cover else "contain", v.get("pos", "50% 50%"))
                inner += (f'<div class="card" id="c-{bid}" style="left:{cx}px;top:{cy}px;width:{cw}px;height:{ch}px;background:{esc(bg)}">'
                          f'<div class="card-in" id="ci-{bid}">{m}</div></div>')
                if v.get("label"):
                    inner += f'<div class="lab-wrap" style="left:{cx + 4}px;top:{cy - 58}px"><span class="label">{esc(v["label"])}</span></div>'
                motion = v.get("motion", "none" if src.lower().endswith(VIDEO_EXT) else "push")
                if motion == "push":
                    js.append(f"tl.fromTo('#ci-{bid}',{{scale:1}},{{scale:1.04,duration:{num(d)},ease:'none'}},{num(s)});")
                elif motion == "scroll":
                    js.append(f"tl.fromTo('#m-{bid}',{{objectPosition:'50% 0%'}},{{objectPosition:'50% 100%',duration:{num(d)},ease:'sine.inOut'}},{num(s)});")
                js.append(f"tl.set('#m-{bid}',{{scale:1,x:0,y:0}},{num(s)});")
                for f in v.get("focus", []):
                    z = float(f.get("zoom", 1.8))
                    px, py = float(f.get("x", 0.5)) * cw, float(f.get("y", 0.5)) * ch
                    lim_x, lim_y = (z - 1) * cw / 2, (z - 1) * ch / 2
                    tx = max(-lim_x, min(lim_x, -z * (px - cw / 2)))
                    ty = max(-lim_y, min(lim_y, -z * (py - ch / 2)))
                    js.append(f"tl.to('#m-{bid}',{{scale:{z},x:{tx:.1f},y:{ty:.1f},duration:{f.get('duration', 0.5)},ease:'power3.inOut'}},{num(f['at'])});")
            body.append(f'<div id="w-{bid}" class="vis" data-layout-allow-overflow>{inner}</div>')
            js.append(f"tl.set('#w-{bid}',{{opacity:1}},{num(s)});tl.set('#w-{bid}',{{opacity:0}},{num(t)});")

        if lay == "visual":
            if not b.get("cutout"):
                raise SystemExit(f"Beat {bid}: the visual layout needs a cutout (transparent webm of the speaker for this beat)")
            sc = b.get("cutoutScale", 0.7)
            cw, ch = round(W * sc), round(H * sc)
            top = b.get("cutoutTop", 640)
            body.append(
                f'<div id="cut-{bid}" class="cut" style="left:{(W - cw) // 2}px;top:{top}px;width:{cw}px;height:{ch}px">'
                f'<video id="cv-{bid}" class="clip" src="{esc(b["cutout"])}" data-start="{num(s)}" data-duration="{num(d)}" '
                f'data-media-start="{num(b.get("cutoutStart", 0))}" data-track-index="3" muted playsinline></video></div>'
            )
            js.append(f"tl.set('#cut-{bid}',{{opacity:1}},{num(s)});tl.set('#cut-{bid}',{{opacity:0}},{num(t)});")

        if lay == "roadmap" and n:
            cur = int(b.get("step", 0))
            frm = (prev_step or cur) if cur else 0
            for i in range(1, n + 1):
                on = cur == 0 or i == cur or i == frm
                at = s + 0.04 * (i - 1)
                js.append(f"tl.set('#rbg-{i}',{{opacity:0}},{num(s)});tl.set('#rfg-{i}',{{opacity:0}},{num(s)});")
                js.append(f"tl.fromTo('#rbg-{i}',{{opacity:0,y:18}},{{opacity:{1 if on else 0.55},y:0,duration:.3,ease:'power2.out'}},{num(at)});")
                js.append(f"tl.fromTo('#rfg-{i}',{{opacity:0,y:18,filter:'blur(12px)'}},{{opacity:{1 if on else 0.5},y:0,filter:'blur({0 if on else 2.5}px)',duration:.3,ease:'power2.out'}},{num(at)});")
                js.append(f"tl.set('#rfg-{i}',{{attr:{{class:'row-fg'}}}},{num(s)});")
                js.append(f"tl.set('#bdg-{i}',{{attr:{{class:'badge'}}}},{num(s)});")
            if cur:
                if frm != cur:
                    # The slab starts on the previous step, so that row keeps light text until the slab leaves it
                    js.append(f"tl.set('#rfg-{frm}',{{attr:{{class:'row-fg on'}}}},{num(s)});")
                    js.append(f"tl.set('#rfg-{frm}',{{attr:{{class:'row-fg'}}}},{num(s + 0.3)});")
                    js.append(f"tl.to('#rfg-{frm}',{{opacity:.5,filter:'blur(2.5px)',duration:.25,ease:'power2.out'}},{num(s + 0.3)});")
                    js.append(f"tl.to('#rbg-{frm}',{{opacity:.55,duration:.25,ease:'power2.out'}},{num(s + 0.3)});")
                js.append(f"tl.set('#slab',{{y:{row_y[frm - 1]}}},{num(s)});")
                js.append(f"tl.fromTo('#slab',{{opacity:0}},{{opacity:1,duration:.22,ease:'power2.out'}},{num(s)});")
                js.append(f"tl.fromTo('#slab',{{y:{row_y[frm - 1]}}},{{y:{row_y[cur - 1]},duration:.4,ease:'power3.inOut'}},{num(s + 0.1)});")
                js.append(f"tl.set('#rfg-{cur}',{{attr:{{class:'row-fg on'}}}},{num(s + (0.3 if frm != cur else 0))});")
                prev_step = cur
            else:
                js.append(f"tl.set('#slab',{{opacity:0}},{num(s)});")
                if b.get("check"):
                    for i in range(1, n + 1):
                        js.append(f"tl.set('#bdg-{i}',{{attr:{{class:'badge done'}}}},{num(s + 0.35 + 0.22 * (i - 1))});")
                        js.append(f"tl.fromTo('#bdg-{i}',{{scale:.6}},{{scale:1,duration:.3,ease:'back.out(2.4)'}},{num(s + 0.35 + 0.22 * (i - 1))});")

        if lay == "title":
            lines = b.get("lines", [])
            fs = fit_font(lines, 128)
            spans = "".join(f'<span class="t-line" style="font-size:{fs}px">{mark_html(x, b.get("mark"), f"mk-{bid}-{i}")}</span>' for i, x in enumerate(lines))
            chip = f'<span class="chip">{esc(b["sub"])}</span>' if b.get("sub") else ""
            body.append(f'<div id="t-{bid}" class="clip title panel-area" data-start="{num(s)}" data-duration="{num(d)}" data-track-index="4"><div class="t-in">{chip}{spans}</div></div>')
            if b.get("mark"):
                for i, x in enumerate(lines):
                    if b["mark"].lower() in x.lower():
                        js.append(f"tl.fromTo('#mk-{bid}-{i}',{{scaleX:0}},{{scaleX:1,duration:.35,ease:'power3.out'}},{num(b.get('markAt', s + 0.4))});")
        if lay == "words":
            ws = b.get("words", [])
            ats = b.get("at") or [s + 0.12 + i * min(0.5, d / max(1, len(ws)) * 0.6) for i in range(len(ws))]
            fs = fit_font(ws, 150)
            spans = "".join(
                f'<span class="w" id="wd-{bid}-{i}" style="font-size:{fs}px">'
                + (mark_html(x, x, f"wm-{bid}") if i == len(ws) - 1 else esc(x)) + "</span>"
                for i, x in enumerate(ws))
            body.append(f'<div id="t-{bid}" class="clip words panel-area" data-start="{num(s)}" data-duration="{num(d)}" data-track-index="4"><div class="w-in">{spans}</div></div>')
            for i, at in enumerate(ats):
                js.append(f"tl.fromTo('#wd-{bid}-{i}',{{opacity:0,scale:.8,y:40}},{{opacity:1,scale:1,y:0,duration:.26,ease:'back.out(2)'}},{num(at)});")
            if ws:
                js.append(f"tl.fromTo('#wm-{bid}',{{scaleX:0}},{{scaleX:1,duration:.3,ease:'power3.out'}},{num(ats[-1] + 0.12)});")

    def beat_at(time):
        cur = beats[0]
        for b in beats:
            if b["start"] <= time + 1e-6:
                cur = b
        return cur

    for i, c in enumerate(caps):
        s, t = float(c["start"]), float(c["end"])
        b = beat_at((s + t) / 2)
        y = b.get("captionY", CAPTION_Y[b["layout"]])
        words = c.get("words") or [{"text": c["text"], "start": s}]
        spans = " ".join(f'<span class="cw" id="cw-{i}-{j}">{esc(w["text"])}</span>' for j, w in enumerate(words))
        body.append(
            f'<div id="cap-{i}" class="clip cap" data-start="{num(s)}" data-duration="{num(t - s - 0.002)}" data-track-index="5" '
            f'style="top:{y - 50}px"><span class="cap-in" id="ci-cap-{i}">{spans}</span></div>'
        )
        js.append(f"tl.fromTo('#ci-cap-{i}',{{scale:.9}},{{scale:1,duration:.12,ease:'back.out(2)'}},{num(s)});")
        if len(words) > 1:
            for j, w in enumerate(words):
                ws_ = max(s, float(w["start"]))
                js.append(f"tl.set('#cw-{i}-{j}',{{color:'{theme['captionActive']}'}},{num(ws_)});")
                if j + 1 < len(words):
                    js.append(f"tl.set('#cw-{i}-{j}',{{color:'{theme['captionText']}'}},{num(max(ws_ + 0.05, float(words[j + 1]['start'])))});")

    # Elements tweened more than once (roadmap rows, the slab): only the earliest fromTo may render its "from" state
    # up front, or a seek before it would show the last-authored one.
    seen = set()
    for i, line in enumerate(js):
        m = re.match(r"tl\.fromTo\('([^']+)'", line)
        if m:
            if m.group(1) in seen:
                js[i] = line.replace("},{", "},{immediateRender:false,", 1)
            seen.add(m.group(1))

    css = f"""
@font-face{{font-family:'{theme["font"]}';src:url('{theme["fontFile"]}') format('woff2');font-weight:100 900;font-style:normal}}
@font-face{{font-family:'{theme["labelFont"]}';src:url('{theme["labelFontFile"]}') format('woff2');font-weight:100 900;font-style:normal}}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:{W}px;height:{H}px;overflow:hidden;background:#000}}
#root{{position:relative;width:100%;height:100%;overflow:hidden;background:{theme["base"]};font-family:'{theme["font"]}',sans-serif;color:{theme["ink"]}}}
#bg,#spk,#seam,#roadmap,.vis,.cut,.clip,.card,.lab-wrap,#prog{{position:absolute}}
#bg{{left:0;top:0;width:{W}px;height:{H}px;overflow:hidden;background:{theme["base"]};z-index:1}}
.blob{{position:absolute;width:1300px;height:1300px;border-radius:50%}}
#grain{{position:absolute;left:0;top:0;width:{W}px;height:{H}px;background-size:256px 256px}}
.panel-area{{left:0;top:0;width:{W}px;height:{SEAM}px;overflow:hidden}}
.vis{{left:0;top:0;width:{W}px;height:{H}px;opacity:0;z-index:3}}
.card{{border-radius:{R}px;overflow:hidden;background:{theme["card"]};box-shadow:0 0 0 1.5px rgba(255,255,255,.75),0 2px 0 1.5px rgba(0,0,0,.04),0 50px 90px -30px rgba(26,18,48,.55),0 18px 36px -12px rgba(26,18,48,.28)}}
.card-in{{position:absolute;inset:0;overflow:hidden;border-radius:{R}px}}
.media{{position:absolute;left:0;top:0;width:100%;height:100%;display:block}}
.media.backdrop{{filter:blur(40px) brightness(.6);transform:scale(1.15)}}
.lab-wrap{{z-index:2}}
.label{{display:block;font-family:'{theme["labelFont"]}',monospace;font-size:24px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:{theme["onInk"]};background:{theme["ink"]};padding:11px 20px 10px;border-radius:999px;white-space:nowrap;box-shadow:0 10px 24px -8px rgba(0,0,0,.4)}}
.cut{{opacity:0;z-index:6;filter:drop-shadow(0 30px 50px rgba(20,14,40,.35))}}
.cut video{{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain;object-position:50% 0%}}
#spk{{left:0;top:0;width:{W}px;height:{H}px;overflow:hidden;z-index:5}}
#spk-zoom{{position:absolute;inset:0}}
#spk-v{{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;object-position:50% 50%}}
#seam{{left:0;top:{SEAM}px;width:{W}px;height:30px;background:linear-gradient(rgba(20,14,40,.28),rgba(20,14,40,0));z-index:6;opacity:0}}
#roadmap{{opacity:0;z-index:4}}
.row-bg,.row-fg,#slab{{position:absolute;border-radius:{R - 4}px}}
.row-bg{{background:{theme["stepBg"]};box-shadow:0 0 0 1.5px rgba(255,255,255,.8),0 14px 30px -14px rgba(26,18,48,.25)}}
#slab{{background:{theme["ink"]};box-shadow:0 24px 50px -16px rgba(20,14,40,.55);opacity:0;z-index:2}}
.row-fg{{display:flex;align-items:center;gap:26px;padding:0 30px 0 22px;z-index:3;color:{theme["ink"]}}}
.row-fg .rt{{font-weight:700;letter-spacing:-.02em;line-height:1.05;white-space:nowrap}}
.badge{{position:relative;flex:none;display:flex;align-items:center;justify-content:center;border-radius:50%;background:{theme["ink"]};color:{theme["onInk"]};font-family:'{theme["labelFont"]}',monospace;font-size:27px;font-weight:700}}
.badge .bc{{display:none;font-family:'{theme["font"]}',sans-serif;font-size:30px}}
.badge.done{{background:{theme["accent"]};color:{theme["accentInk"]}}}
.badge.done .bn{{display:none}} .badge.done .bc{{display:block}}
.row-fg.on{{color:{theme["onInk"]}}}
.row-fg.on .badge{{background:{theme["accent"]};color:{theme["accentInk"]}}}
.title,.words{{z-index:4;display:flex;align-items:center;justify-content:center;text-align:center}}
.title{{padding:190px 60px 70px}}
.t-in{{display:flex;flex-direction:column;align-items:center}}
.chip{{display:block;font-family:'{theme["labelFont"]}',monospace;font-size:30px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:{theme["onInk"]};background:{theme["ink"]};padding:13px 24px 12px;border-radius:999px;margin-bottom:34px}}
.t-line{{display:block;white-space:nowrap;font-weight:800;line-height:.98;letter-spacing:-.035em;color:{theme["ink"]}}}
.mark{{position:relative;display:inline-block}}
.mark-bg{{position:absolute;left:-.1em;right:-.1em;top:.12em;bottom:0;background:{theme["accent"]};border-radius:.14em;transform-origin:0% 50%}}
.mark-t{{position:relative}}
.words{{padding:190px 60px 70px}}
.w-in{{display:flex;flex-direction:column;align-items:center;gap:6px;width:100%}}
.w{{display:block;white-space:nowrap;font-weight:800;letter-spacing:-.04em;line-height:1;color:{theme["ink"]}}}
.cap{{left:0;width:{W}px;height:100px;display:flex;align-items:center;justify-content:center;z-index:20}}
.cap-in{{display:block;font-size:{theme["captionSize"]}px;font-weight:800;letter-spacing:-.015em;line-height:1.1;color:{theme["captionText"]};background:{theme["captionBg"]};padding:12px 28px 15px;border-radius:24px;white-space:nowrap;box-shadow:0 14px 34px -10px rgba(0,0,0,.45)}}
#prog{{left:0;top:0;width:{W}px;height:8px;background:rgba(0,0,0,.18);z-index:21}}
#prog-in{{position:absolute;inset:0;background:{theme["accent"]};transform-origin:0% 50%}}
"""
    page = f"""<!doctype html>
<html lang="en" data-resolution="portrait">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width={W}, height={H}">
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>{css}</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{num(dur)}" data-width="{W}" data-height="{H}">
{chr(10).join(body)}
</div>
<script>
const tl = gsap.timeline({{ paused: true }});
{chr(10).join(js)}
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body>
</html>
"""
    Path(a.out).write_text(page)
    print(f"Wrote {a.out}: {len(beats)} beats, {len(caps)} captions, {dur:.2f}s")


if __name__ == "__main__":
    main()
