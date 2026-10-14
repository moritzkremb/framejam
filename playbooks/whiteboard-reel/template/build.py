#!/usr/bin/env python3
"""Build index.html (a Hyperframes composition) from edit.json and captions.json.

edit.json has the edited talking-head video, its beats and the graphics that sit on top of them.

Beats (one layout each, hard cut at "start"):

  speaker   the talking head full frame ("zoom": 1.0 wide, 1.1-1.25 punched in; "punches" re-frame inside the beat)
  board     a white board fills the top of the frame and the talking head slides down under it; graphics draw on the
            board ("height" of the board, default 900; "shift" moves the speaker down, default 260; "media" fills
            the board with a picture or clip instead of white)
  cutaway   a full-frame picture or clip over the speaker ("media", "mediaStart", "fit")

Graphics ("pops", absolute times, each from "at" to "until"). On a board beat they sit on the board; on a speaker
beat they float over the video as white cards:

  steps     a numbered list card; items land one by one, an optional handwritten note beside it, "strikeAt" crosses
            the list out
  tree      a root (pill or card) whose lines draw down to 2-4 child cards (pictures or blank documents)
  mindmap   a centre pill whose lines draw out to 3-6 idea nodes
  fan       3-4 cards in a fan; "focus" lifts one card at a time, outlines it and reveals its title
  title     a heavy two-line title, the second line in the accent colour with a hand-drawn underline
  badge     a series badge: a heavy white word with a tilted handwritten tag (over a full-frame speaker)
  profiles  stacked profile cards (avatar, name, handle and stats, a button) landing one after another
  stats     an analytics panel whose numbers count up, with a marker sweep on the ones that matter
  thumbs    2-4 thumbnails land in a grid, with an optional prompt bar under them that types
  keyword   the CTA in the caption spot: a small lead word and the keyword in big quotes

Every graphic and board entrance gets its sound effect from assets/sfx (scripts/make_sounds.py) unless "sfx": false.

Run `python3 build.py` (defaults: edit.json, captions.json, index.html in this folder), then `npx hyperframes check`,
`npx hyperframes snapshot --at ...` and `npx hyperframes render`.
"""
import argparse, html, json, re, wave
from pathlib import Path

W, H = 1080, 1920
DEFAULT_THEME = {
    "board": "#F6F6F4",
    "boardEdge": "#E3E4E8",
    "card": "#FFFFFF",
    "ink": "#16171B",
    "muted": "#6B707C",
    "line": "#D5D8E0",
    "accent": "#3550F0",
    "tag": "#2C4BC0",
    "pop": "#E2533B",
    "marker": "#DDF45B",
    "captionColor": "#FFFFFF",
    "captionSize": 46,
    "captionY": 1180,
    "captionCase": "lower",
    "boardHeight": 900,
    "shift": 260,
    "sans": "Inter",
    "sansFile": "assets/fonts/inter.woff2",
    "mono": "Geist Mono",
    "monoFile": "assets/fonts/geist-mono-latin-wght-normal.woff2",
    "hand": "Caveat",
    "handFile": "assets/fonts/caveat.woff2",
}
LAYOUTS = ("speaker", "board", "cutaway")
VIDEO_EXT = (".mp4", ".webm", ".mov", ".m4v")
SFX_GAIN = {"pop": 0.5, "whoosh": 0.4, "click": 0.55, "scribble": 0.4, "tick": 0.3, "swipe": 0.45, "thud": 0.6, "typing": 0.3}
# Node positions around a mind map's centre for 1-6 nodes, in the order nodes are listed.
MIND_POS = {
    1: [(0, -200)],
    2: [(-290, -130), (290, 130)],
    3: [(-300, -120), (300, -120), (0, 200)],
    4: [(-300, -130), (300, -130), (-290, 140), (290, 140)],
    5: [(0, -200), (-300, -100), (300, -100), (-260, 150), (260, 150)],
    6: [(0, -200), (-300, -110), (300, -110), (-290, 130), (290, 130), (0, 215)],
}


def esc(s):
    return html.escape(str(s), quote=True)


def num(x):
    return f"{float(x):.3f}".rstrip("0").rstrip(".")


def is_video(src):
    return str(src).lower().endswith(VIDEO_EXT)


def media_el(el_id, src, start, dur, media_start=0, fit="cover", cls="media"):
    style = f"object-fit:{fit}"
    if is_video(src):
        return (f'<video id="{el_id}" class="clip {cls}" src="{esc(src)}" data-start="{num(start)}" data-duration="{num(dur)}" '
                f'data-media-start="{num(media_start)}" muted playsinline style="{style}"></video>')
    return f'<img id="{el_id}" class="clip {cls}" src="{esc(src)}" data-start="{num(start)}" data-duration="{num(dur)}" alt="" style="{style}">'


def fit_px(lines, max_px, width, em):
    longest = max((len(x) for x in lines), default=1)
    return int(min(max_px, width / (em * max(longest, 1))))


def count_steps(value, steps, start=None):
    """'1.8M' -> ['0.0M', '0.3M', ..., '1.8M']: the frames of a count-up, keeping the value's format."""
    m = re.match(r"^([^\d]*)([\d,]*\.?\d+)(.*)$", str(value))
    if not m:
        return [str(value)]
    pre, digits, post = m.groups()
    target = float(digits.replace(",", ""))
    dec = len(digits.split(".")[1]) if "." in digits else 0
    s0 = float(start) if start is not None else 0.0
    out = []
    for i in range(steps):
        v = s0 + (target - s0) * (1 - (1 - i / (steps - 1)) ** 2)
        txt = f"{v:,.{dec}f}" if "," in digits else f"{v:.{dec}f}"
        out.append(f"{pre}{txt}{post}")
    out[-1] = str(value)
    return out


def main():
    here = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--edit", default=str(here / "edit.json"))
    ap.add_argument("--captions", default=str(here / "captions.json"))
    ap.add_argument("--out", default=str(here / "index.html"))
    a = ap.parse_args()

    root = Path(a.edit).resolve().parent
    e = json.loads(Path(a.edit).read_text())
    T = {**DEFAULT_THEME, **e.get("theme", {})}
    dur = float(e["duration"])
    beats = sorted(e["beats"], key=lambda b: b["start"])
    for i, b in enumerate(beats):
        b.setdefault("id", f"b{i + 1:02d}")
        b.setdefault("end", beats[i + 1]["start"] if i + 1 < len(beats) else dur)
        if b["layout"] not in LAYOUTS:
            raise SystemExit(f"Beat {b['id']}: unknown layout {b['layout']} (use {', '.join(LAYOUTS)})")
    pops = sorted(e.get("pops", []), key=lambda p: p["at"])
    caps = json.loads(Path(a.captions).read_text()) if Path(a.captions).exists() else []
    caps = caps["captions"] if isinstance(caps, dict) else caps
    emphasis = {w.lower() for w in e.get("emphasis", [])}
    sfx_dir = e.get("sfxDir", "assets/sfx")
    use_sfx = e.get("sfx", True) and (root / sfx_dir).is_dir()
    sfx_volume = float(e.get("sfxVolume", 1.0))
    BH = int(T["boardHeight"])

    body, js, sounds, init = [], [], [], []

    def shown(el, at, until):
        """Visibility for wrappers that hold videos or nested boxes: those can't be timed clips themselves."""
        if at > 0:
            js.append(f"tl.set('#{el}',{{visibility:'visible'}},{num(at)});")
        js.append(f"tl.set('#{el}',{{visibility:'hidden'}},{num(until)});")
        return "visible" if at <= 0 else "hidden"

    def sound(name, at, length=None):
        if use_sfx and 0 <= at < dur and (root / sfx_dir / f"{name}.wav").exists():
            sounds.append((name, at, length))

    def draw(sel, length, at, d=0.4):
        js.append(f"tl.fromTo('{sel}',{{strokeDashoffset:{length:.0f}}},{{strokeDashoffset:0,duration:{d},ease:'power2.inOut'}},{num(at)});")

    first = beats[0]
    init.append(f"gsap.set('#spk-zoom',{{scale:{first.get('zoom', 1)},transformOrigin:'{first.get('origin', '50% 35%')}'}});")
    if first["layout"] == "board":
        init.append(f"gsap.set('#spk-shift',{{y:{first.get('shift', T['shift'])}}});")
    body.append(
        f'<div id="spk" data-layout-allow-overflow><div id="spk-shift"><div id="spk-zoom"><video id="spk-v" class="clip" src="{esc(e["speaker"])}" '
        f'data-start="0" data-duration="{num(dur)}" muted playsinline></video></div></div></div>'
    )
    body.append(f'<audio id="narration" class="clip" src="{esc(e["narration"])}" data-start="0" data-duration="{num(dur)}" data-volume="{e.get("narrationVolume", 1)}"></audio>')
    if e.get("music"):
        m = e["music"]
        body.append(f'<audio id="music" class="clip" src="{esc(m["src"])}" data-start="0" data-duration="{num(dur)}" '
                    f'data-volume="{m.get("volume", 0.12)}" data-fade-out="{m.get("fadeOut", 1.5)}"></audio>')

    # ---------- beats ----------
    prev = None
    for b in beats:
        s, t, lay, bid = float(b["start"]), float(b["end"]), b["layout"], b["id"]
        d = t - s
        js.append(f"tl.set('#spk-zoom',{{scale:{b.get('zoom', 1)},transformOrigin:'{b.get('origin', '50% 35%')}'}},{num(s)});")
        js.append(f"tl.set('#spk-shift',{{y:{b.get('shift', T['shift']) if lay == 'board' else 0}}},{num(s)});")
        for p in b.get("punches", []):
            js.append(f"tl.set('#spk-zoom',{{scale:{p['zoom']}}},{num(p['at'])});")
        if lay == "board":
            bh = int(b.get("height", BH))
            inner = f'<div class="board-m">{media_el(f"bm-{bid}", b["media"], s, d, b.get("mediaStart", 0), b.get("fit", "cover"))}</div>' if b.get("media") else ""
            body.append(f'<div id="bd-{bid}" class="board" style="height:{bh}px;visibility:{shown(f"bd-{bid}", s, t)}">{inner}</div>')
            if not prev or prev["layout"] != "board":
                js.append(f"tl.fromTo('#bd-{bid}',{{y:-60}},{{y:0,duration:.22,ease:'power3.out'}},{num(s)});")
                sound("swipe", s)
        elif lay == "cutaway":
            body.append(f'<div id="cw-{bid}" class="cutaway" style="visibility:{shown(f"cw-{bid}", s, t)}">'
                        f'{media_el(f"cm-{bid}", b["media"], s, d, b.get("mediaStart", 0), b.get("fit", "cover"))}</div>')
            js.append(f"tl.fromTo('#cw-{bid}',{{scale:1.08}},{{scale:1,duration:.35,ease:'power3.out'}},{num(s)});")
            sound("whoosh", s - 0.06)
        prev = b

    def on_board(time):
        cur = beats[0]
        for b in beats:
            if b["start"] <= time + 1e-6:
                cur = b
        return cur

    # ---------- graphics ----------
    hide_caps = []
    for n, p in enumerate(pops):
        kind, at = p["type"], float(p["at"])
        until = float(p.get("until", at + 2.5))
        pid = p.get("id", f"p{n + 1:02d}")
        inner = ""
        cue = []  # (sound, time)

        def enter(sel, at_, frm="opacity:0,y:30,scale:.96", ease="back.out(1.6)", d=0.32):
            js.append(f"tl.fromTo('{sel}',{{{frm}}},{{opacity:1,x:0,y:0,scale:1,rotation:0,duration:{d},ease:'{ease}'}},{num(at_)});")

        if kind == "steps":
            x, y, w = int(p.get("x", 100)), int(p.get("y", 220)), int(p.get("width", 560))
            rows = ""
            for i, it in enumerate(p.get("items", [])):
                ia = float(it.get("at", at + 0.3 + 0.5 * i))
                rows += (f'<div class="st-i" id="si-{pid}-{i}"><b>{i + 1:02d}</b><span id="sx-{pid}-{i}">{esc(it["text"])}</span>'
                         f'<i class="st-x" id="sk-{pid}-{i}"></i></div>')
                enter(f"#si-{pid}-{i}", ia, "opacity:0,x:-24", "power3.out", 0.26)
                cue.append(("pop", ia))
            inner = (f'<div class="card steps" id="sc-{pid}" style="left:{x}px;top:{y}px;width:{w}px">'
                     f'<span class="lab">&mdash; {esc(p.get("label", "STEPS"))}</span>{rows}</div>')
            enter(f"#sc-{pid}", at)
            if p.get("note"):
                nt = p["note"]
                na = float(nt.get("at", at + 0.6))
                inner += (f'<div class="card note" id="sn-{pid}" style="left:{x + w + 50}px;top:{y + 30}px">'
                          f'<span class="hand">{esc(nt["text"])}</span><i></i><i class="short"></i></div>')
                enter(f"#sn-{pid}", na, "opacity:0,y:20,rotation:6,scale:.9")
                cue.append(("pop", na))
            if p.get("strikeAt") is not None:
                sa = float(p["strikeAt"])
                for i in range(len(p.get("items", []))):
                    js.append(f"tl.fromTo('#sk-{pid}-{i}',{{scaleX:0}},{{scaleX:1,duration:.16,ease:'power2.out'}},{num(sa + 0.14 * i)});")
                    js.append(f"tl.set('#sx-{pid}-{i}',{{color:'{T['muted']}'}},{num(sa + 0.14 * i + 0.08)});")
                    cue.append(("scribble", sa + 0.14 * i))

        elif kind == "tree":
            rt = p.get("root", {})
            y = int(p.get("y", 200))
            kids = p.get("children", [])[:4]
            k = max(1, len(kids))
            avail = int(p.get("width", 900))
            gap = 28
            cw = min(int(p.get("childWidth", 230)), (avail - gap * (k - 1)) // k)
            ch = int(p.get("childHeight", cw * 16 / 9 if any(c.get("src") for c in kids) else cw * 1.15))
            rh = 84 if rt.get("kind", "pill") == "pill" else 120
            ry1, mid, cy = y + rh, y + rh + 70, y + rh + 140
            x0 = (W - (k * cw + (k - 1) * gap)) // 2
            paths, cards = "", ""
            la = at + 0.25
            for i, c in enumerate(kids):
                cx = x0 + i * (cw + gap) + cw // 2
                L = (mid - ry1) + abs(cx - W / 2) + (cy - mid)
                paths += f'<path id="tp-{pid}-{i}" d="M{W // 2},{ry1} V{mid} H{cx} V{cy}" stroke-dasharray="{L:.0f}" stroke-dashoffset="{L:.0f}"/>'
                draw(f"#tp-{pid}-{i}", L, la, 0.35)
                ca = float(c.get("at", la + 0.3 + 0.12 * i))
                chip = f'<span class="chip">{esc(c["label"])}</span>' if c.get("label") else ""
                if c.get("src"):
                    face = f'<div class="kid-m">{media_el(f"km-{pid}-{i}", c["src"], at, until - at, c.get("mediaStart", 0))}</div>'
                else:
                    face = (f'<span class="lab">{esc(c.get("title", f"OUTPUT {i + 1:02d}"))}</span><i class="bar dark"></i>'
                            + "".join(f'<i class="bar" style="width:{w}%"></i>' for w in (82, 64, 74)) + '<i class="bar dark short"></i>')
                cards += (f'<div class="card kid{" pic" if c.get("src") else ""}" id="tk-{pid}-{i}" style="left:{cx - cw // 2}px;top:{cy}px;'
                          f'width:{cw}px;height:{ch}px">{chip}{face}</div>')
                enter(f"#tk-{pid}-{i}", ca, "opacity:0,y:40,scale:.9", "back.out(1.7)", 0.34)
                cue.append(("pop", ca))
            icon = '<i class="folder"></i>' if rt.get("icon") == "folder" else ""
            rcls = "root-pill" if rt.get("kind", "pill") == "pill" else "card root-card"
            inner = (f'<svg class="lines" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{paths}</svg>'
                     f'<div class="tree-root" style="top:{y}px;height:{rh}px"><span class="{rcls}" id="tr-{pid}">{icon}{esc(rt.get("text", ""))}</span></div>{cards}')
            enter(f"#tr-{pid}", at, "opacity:0,y:-20,scale:.9", "back.out(2)")
            cue += [("whoosh", at - 0.04), ("scribble", la)]

        elif kind == "mindmap":
            cy = int(p.get("y", 520))
            lines_, nodes = "", ""
            la = at + 0.3
            nds = p.get("nodes", [])[:6]
            for i, nd in enumerate(nds):
                dx, dy = MIND_POS[len(nds)][i]
                L = (dx * dx + dy * dy) ** 0.5
                lines_ += f'<path id="ml-{pid}-{i}" d="M{W // 2},{cy} l{dx},{dy}" stroke-dasharray="{L:.0f}" stroke-dashoffset="{L:.0f}"/>'
                na = float(nd.get("at", la + 0.25 * i))
                draw(f"#ml-{pid}-{i}", L, na - 0.2, 0.25)
                nodes += f'<div class="mnode" style="left:{W // 2 + dx}px;top:{cy + dy}px"><span id="mn-{pid}-{i}">{esc(nd["text"])}</span></div>'
                enter(f"#mn-{pid}-{i}", na, "opacity:0,scale:.6", "back.out(2.2)", 0.3)
                cue += [("pop", na)]
            inner = (f'<svg class="lines" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{lines_}</svg>{nodes}'
                     f'<div class="mnode" style="left:{W // 2}px;top:{cy}px"><span class="mcenter" id="mc-{pid}">{esc(p.get("center", ""))}</span></div>')
            enter(f"#mc-{pid}", at, "opacity:0,scale:.5", "back.out(2.4)", 0.34)
            cue += [("pop", at), ("scribble", la)]

        elif kind == "fan":
            cards = p.get("cards", [])[:4]
            k = max(1, len(cards))
            y = int(p.get("y", 190))
            cw, ch, step = 250, 300, 230
            x0 = (W - (cw + step * (k - 1))) // 2
            rots = {1: [0], 2: [-4, 4], 3: [-6, -1, 5], 4: [-7, -2, 3, 7]}[k]
            for i, c in enumerate(cards):
                bars = '<i class="bar"></i><i class="bar" style="width:62%"></i>'
                inner += (f'<div class="card fcard" id="fc-{pid}-{i}" style="left:{x0 + i * step}px;top:{y + (0 if i % 2 else 26)}px;width:{cw}px;height:{ch}px;z-index:{i + 1}">'
                          f'<span class="lab">{esc(c.get("n", f"{i + 1:02d}"))}</span><span class="ft" id="ft-{pid}-{i}">{esc(c.get("title", ""))}</span>'
                          f'{bars}<i class="fbar" id="fb-{pid}-{i}"></i></div>')
                js.append(f"tl.fromTo('#fc-{pid}-{i}',{{opacity:0,y:200,rotation:{rots[i] * 3}}},{{opacity:1,y:0,rotation:{rots[i]},duration:.45,ease:'power3.out'}},{num(at + 0.07 * i)});")
            focus = p.get("focus", [])
            for j, f in enumerate(focus):
                i, fa = int(f["card"]), float(f["at"])
                js.append(f"tl.set('#fc-{pid}-{i}',{{zIndex:20,attr:{{class:'card fcard on'}}}},{num(fa)});")
                js.append(f"tl.to('#fc-{pid}-{i}',{{y:-24,scale:1.1,rotation:0,duration:.28,ease:'back.out(1.8)'}},{num(fa)});")
                js.append(f"tl.to('#ft-{pid}-{i}',{{filter:'blur(0px)',opacity:1,duration:.2}},{num(fa)});")
                js.append(f"tl.fromTo('#fb-{pid}-{i}',{{scaleX:0}},{{scaleX:1,duration:.4,ease:'power2.out'}},{num(fa + 0.1)});")
                if j + 1 < len(focus):
                    na = float(focus[j + 1]["at"])
                    js.append(f"tl.set('#fc-{pid}-{i}',{{zIndex:{i + 1},attr:{{class:'card fcard seen'}}}},{num(na)});")
                    js.append(f"tl.to('#fc-{pid}-{i}',{{y:0,scale:1,rotation:{rots[i]},duration:.22,ease:'power2.out'}},{num(na)});")
                cue.append(("click", fa))
            cue.append(("whoosh", at - 0.04))

        elif kind == "title":
            lines = p.get("lines", [])
            acc = int(p.get("accentLine", len(lines) - 1))
            y = int(p.get("y", 540))
            fs = fit_px(lines, int(p.get("size", 140)), 900, 0.6)
            spans = ""
            for i, ln in enumerate(lines):
                spans += f'<span class="tl-l{" acc" if i == acc else ""}" id="tt-{pid}-{i}" style="font-size:{fs}px">{esc(ln)}</span>'
                enter(f"#tt-{pid}-{i}", at + 0.1 * i, "opacity:0,y:40", "power3.out", 0.32)
            under = ""
            if p.get("underline", True) and 0 <= acc < len(lines):
                uw = min(940, int(len(lines[acc]) * fs * 0.58))
                uy = y + int(fs * 1.02 * (acc + 1)) + 6
                ux = (W - uw) // 2
                L = uw * 1.12
                under = (f'<svg class="lines under" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><path id="tu-{pid}" '
                         f'd="M{ux},{uy + 10} C{ux + uw * 0.3},{uy - 6} {ux + uw * 0.7},{uy - 4} {ux + uw},{uy + 4}" '
                         f'stroke-dasharray="{L:.0f}" stroke-dashoffset="{L:.0f}"/></svg>')
                draw(f"#tu-{pid}", L, at + 0.35, 0.4)
                cue.append(("scribble", at + 0.35))
            inner = f'{under}<div class="title" style="top:{y}px">{spans}</div>'
            cue.append(("thud", at))

        elif kind == "badge":
            x, y = int(p.get("x", 60)), int(p.get("y", 230))
            inner = (f'<div class="badge" style="left:{x}px;top:{y}px"><span class="bw" id="bw-{pid}">{esc(p.get("word", ""))}'
                     f'<i class="bow" id="bb-{pid}"></i></span><span class="btag" id="bt-{pid}">{esc(p.get("tag", ""))}</span></div>')
            enter(f"#bw-{pid}", at, "opacity:0,scale:1.4", "power3.out", 0.3)
            js.append(f"tl.fromTo('#bt-{pid}',{{opacity:0,x:120,rotation:-16}},{{opacity:1,x:0,rotation:-6,duration:.34,ease:'back.out(1.6)'}},{num(at + 0.22)});")
            enter(f"#bb-{pid}", at + 0.4, "opacity:0,scale:0,y:-10", "back.out(3)", 0.3)
            cue += [("whoosh", at - 0.04), ("pop", at + 0.4)]

        elif kind == "profiles":
            y = int(p.get("y", 180))
            for i, pr in enumerate(p.get("people", [])[:4]):
                pa = float(pr.get("at", at + 0.45 * i))
                av = (f'<img src="{esc(pr["src"])}" alt="">' if pr.get("src") else esc(pr.get("name", "?")[:1].upper()))
                inner += (f'<div class="card prof" id="pf-{pid}-{i}" style="left:{150 + (i % 2) * 40}px;top:{y + i * 175}px;z-index:{i + 1}">'
                          f'<i class="pav">{av}</i><span class="pn"><b>{esc(pr.get("name", ""))}<i class="tick"></i></b>'
                          f'<em>{esc(pr.get("handle", ""))}{" &middot; " + esc(pr["stats"]) if pr.get("stats") else ""}</em>'
                          f'<span>{esc(pr.get("bio", ""))}</span><u>{esc(pr.get("button", "Follow"))}</u></span></div>')
                enter(f"#pf-{pid}-{i}", pa, "opacity:0,y:60,scale:.92", "back.out(1.5)", 0.34)
                cue.append(("whoosh", pa - 0.04))

        elif kind == "stats":
            y = int(p.get("y", 200))
            rows = ""
            for i, r in enumerate(p.get("rows", [])[:5]):
                ra = float(r.get("at", at + 0.3 + 0.12 * i))
                vals = count_steps(r["value"], 9, r.get("from"))
                frames = "".join(f'<span class="sv" id="sv-{pid}-{i}-{j}">{esc(v)}</span>' for j, v in enumerate(vals))
                arrow = '<i class="up">&#8599;</i>' if r.get("delta") == "up" else ""
                rows += (f'<div class="srow"><span>{esc(r["label"])}</span><b>{arrow}<span class="svs"><i class="mk" id="mk-{pid}-{i}"></i>{frames}</span></b></div>')
                run = float(r.get("count", 0.8))
                for j in range(len(vals)):
                    ta = ra + run * j / max(1, len(vals) - 1)
                    js.append(f"tl.set('#sv-{pid}-{i}-{j}',{{display:'inline'}},{num(ta)});")
                    if j + 1 < len(vals):
                        js.append(f"tl.set('#sv-{pid}-{i}-{j}',{{display:'none'}},{num(ra + run * (j + 1) / max(1, len(vals) - 1))});")
                    if j % 3 == 0:
                        cue.append(("tick", ta))
                if r.get("highlight"):
                    ha = float(r.get("highlightAt", ra + run + 0.15))
                    js.append(f"tl.fromTo('#mk-{pid}-{i}',{{scaleX:0}},{{scaleX:1,duration:.3,ease:'power2.out'}},{num(ha)});")
                    cue.append(("swipe", ha))
            inner = (f'<div class="card stats" id="ss-{pid}" style="top:{y}px"><div class="shead"><b>{esc(p.get("title", "Insights"))}</b>'
                     f'<span>{esc(p.get("range", ""))}</span></div>{rows}</div>')
            enter(f"#ss-{pid}", at, "opacity:0,y:50,scale:.94", "back.out(1.4)", 0.36)
            cue.append(("whoosh", at - 0.04))

        elif kind == "thumbs":
            srcs = p.get("srcs", [])[:4]
            y = int(p.get("y", 190))
            tw, th, gap = 420, 236, 30
            for i, src in enumerate(srcs):
                r_, c_ = divmod(i, 2)
                ta = at + 0.14 * i
                rot = (-2, 2, 1.5, -1.5)[i]
                inner += (f'<div class="thumb" id="th-{pid}-{i}" style="left:{(W - 2 * tw - gap) // 2 + c_ * (tw + gap)}px;top:{y + r_ * (th + gap)}px;'
                          f'width:{tw}px;height:{th}px;transform:rotate({rot}deg)">{media_el(f"tm-{pid}-{i}", src, at, until - at, 0)}</div>')
                js.append(f"tl.fromTo('#th-{pid}-{i}',{{opacity:0,scale:.6,rotation:{rot * 4}}},{{opacity:1,scale:1,rotation:{rot},duration:.32,ease:'back.out(1.8)'}},{num(ta)});")
                cue.append(("pop", ta))
            if p.get("input") is not None:
                ip = p["input"] if isinstance(p["input"], dict) else {"placeholder": str(p["input"])}
                iy = y + 2 * th + gap + 40 if len(srcs) > 2 else y + th + 40
                text = ip.get("text", "")
                ia = float(ip.get("at", at + 0.5))
                chars = "".join(f'<span class="ch" id="ic-{pid}-{i}">{"&nbsp;" if c == " " else esc(c)}</span>' for i, c in enumerate(text))
                cps = float(ip.get("cps", 24))
                for i in range(len(text)):
                    js.append(f"tl.set('#ic-{pid}-{i}',{{display:'inline'}},{num(ia + 0.2 + i / cps)});")
                if text:
                    sent = ia + 0.2 + len(text) / cps + 0.2
                    js.append(f"tl.set('#ip-{pid}',{{display:'none'}},{num(ia + 0.2)});")
                    js.append(f"tl.set('#ps-{pid}',{{backgroundColor:'{T['accent']}'}},{num(sent)});")
                    js.append(f"tl.fromTo('#ps-{pid}',{{scale:1}},{{scale:.8,duration:.08,yoyo:true,repeat:1}},{num(sent)});")
                    sound("typing", ia + 0.2, len(text) / cps)
                    cue.append(("click", sent))
                inner += (f'<div class="card prompt" id="pi-{pid}" style="top:{iy}px"><span class="ph" id="ip-{pid}">{esc(ip.get("placeholder", "Ask anything"))}</span>'
                          f'<span class="ptxt">{chars}</span><i class="psend" id="ps-{pid}"></i></div>')
                enter(f"#pi-{pid}", ia, "opacity:0,y:30", "power3.out", 0.3)

        elif kind == "keyword":
            kb = on_board(at)
            y = int(p.get("y", kb.get("captionY", T["captionY"] + (kb.get("shift", T["shift"]) if kb["layout"] == "board" else 0))))
            inner = (f'<div class="kw" style="top:{y - 60}px"><span class="kl" id="kl-{pid}">{esc(p.get("lead", "comment"))}</span>'
                     f'<span class="kk" id="kk-{pid}">&ldquo;{esc(p.get("keyword", ""))}&rdquo;</span></div>')
            enter(f"#kl-{pid}", at, "opacity:0,y:16", "power2.out", 0.2)
            enter(f"#kk-{pid}", at + 0.12, "opacity:0,scale:1.6", "back.out(2.2)", 0.34)
            hide_caps.append((at, until))
            cue.append(("thud", at + 0.12))
        else:
            raise SystemExit(f"Pop {pid}: unknown type {kind}")

        body.append(f'<div id="pop-{pid}" class="pop" style="visibility:{shown(f"pop-{pid}", at, until)}">{inner}</div>')
        js.append(f"tl.to('#pop-{pid}',{{opacity:0,duration:.16,ease:'power2.in'}},{num(until - 0.16)});")
        if p.get("sfx", True):
            for name, when in cue:
                sound(name, when)

    # ---------- captions ----------
    lower = T["captionCase"] == "lower"
    for i, c in enumerate(caps):
        s, t = float(c["start"]), float(c["end"])
        if any(h0 - 0.05 <= (s + t) / 2 <= h1 for h0, h1 in hide_caps):
            continue
        b = on_board((s + t) / 2)
        y = b.get("captionY", T["captionY"] + (b.get("shift", T["shift"]) if b["layout"] == "board" else 0))
        words = c.get("words") or [{"text": c["text"], "start": s}]
        spans = " ".join(f'<span class="cw" id="cw-{i}-{j}">{esc(w["text"].lower() if lower else w["text"])}</span>' for j, w in enumerate(words))
        body.append(f'<div id="cap-{i}" class="clip cap" data-start="{num(s)}" data-duration="{num(t - s - 0.002)}" '
                    f'style="top:{y - 40}px"><span class="cap-in" id="cp-{i}">{spans}</span></div>')
        js.append(f"tl.fromTo('#cp-{i}',{{opacity:0,scale:.92}},{{opacity:1,scale:1,duration:.1,ease:'power2.out'}},{num(s)});")
        for j, w in enumerate(words):
            key = re.sub(r"[^\w']", "", w["text"]).lower()
            if key in emphasis:
                js.append(f"tl.set('#cw-{i}-{j}',{{color:'{T['marker']}'}},{num(max(s, float(w['start'])))});")

    # ---------- sound effects ----------
    for k, (name, at, length) in enumerate(sounds):
        at = max(0.0, at)
        file = f"{sfx_dir}/{name}.wav"
        with wave.open(str(root / file)) as w:
            full = w.getnframes() / w.getframerate()
        length = min(length or full, full, dur - at)
        vol = SFX_GAIN.get(name, 0.5) * sfx_volume
        body.append(f'<audio id="sfx-{k}" class="clip" src="{esc(file)}" data-start="{num(at)}" data-duration="{num(length)}" data-volume="{vol:.2f}"></audio>')

    # Elements tweened more than once: only the earliest fromTo may render its "from" state up front.
    seen = set()
    for i, line in enumerate(js):
        m = re.match(r"tl\.fromTo\('([^']+)'", line)
        if m:
            if m.group(1) in seen:
                js[i] = line.replace("},{", "},{immediateRender:false,", 1)
            seen.add(m.group(1))

    css = f"""
@font-face{{font-family:'{T["sans"]}';src:url('{T["sansFile"]}') format('woff2');font-weight:100 900;font-style:normal}}
@font-face{{font-family:'{T["mono"]}';src:url('{T["monoFile"]}') format('woff2');font-weight:100 900;font-style:normal}}
@font-face{{font-family:'{T["hand"]}';src:url('{T["handFile"]}') format('woff2');font-weight:400 700;font-style:normal}}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:{W}px;height:{H}px;overflow:hidden;background:#000}}
#root{{position:relative;width:100%;height:100%;overflow:hidden;background:#111;font-family:'{T["sans"]}',sans-serif;color:{T["ink"]}}}
#spk,.clip,.board,.cutaway,.pop{{position:absolute}}
#spk{{left:0;top:0;width:{W}px;height:{H}px;overflow:hidden;z-index:5}}
#spk-shift,#spk-zoom{{position:absolute;inset:0}}
#spk-v{{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover}}
.media{{position:absolute;left:0;top:0;width:100%;height:100%;display:block}}
.board{{left:0;top:0;width:{W}px;z-index:8;overflow:hidden;background:radial-gradient(90% 85% at 50% 42%,{T["card"]} 0%,{T["board"]} 55%,{T["boardEdge"]} 100%);box-shadow:0 10px 30px -12px rgba(0,0,0,.45)}}
.board-m{{position:absolute;inset:0}}
.cutaway{{left:0;top:0;width:{W}px;height:{H}px;z-index:9;overflow:hidden;background:#000}}
.pop{{left:0;top:0;width:{W}px;height:{H}px;z-index:12;pointer-events:none}}
.pop>*{{position:absolute}}
.lines{{left:0;top:0;fill:none;stroke:{T["accent"]};stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round}}
.lines.under{{stroke-width:9}}
.card{{background:{T["card"]};border-radius:18px;box-shadow:0 1px 0 rgba(0,0,0,.04),0 18px 40px -18px rgba(20,24,40,.35),0 0 0 1.5px rgba(20,24,40,.06)}}
.lab{{display:block;font-family:'{T["mono"]}',monospace;font-size:19px;letter-spacing:.14em;color:{T["muted"]};text-transform:uppercase}}
.bar{{display:block;height:12px;border-radius:6px;background:{T["line"]};margin-top:12px;width:100%}}
.bar.dark{{background:{T["ink"]};width:70%;height:16px}}
.bar.short{{width:45%;margin-top:22px}}
.steps{{padding:24px 30px 18px}}
.st-i{{position:relative;display:flex;align-items:baseline;gap:18px;padding:14px 0;font-size:42px;font-weight:700;letter-spacing:-.01em}}
.st-i b{{font-family:'{T["mono"]}',monospace;font-size:24px;font-weight:600;color:{T["accent"]}}}
.st-x{{position:absolute;left:-6px;right:-6px;top:52%;height:5px;border-radius:3px;background:{T["pop"]};transform:scaleX(0);transform-origin:0 50%}}
.note{{width:270px;padding:22px 24px 26px;transform:rotate(2deg)}}
.note .hand{{display:block;font-family:'{T["hand"]}',cursive;font-size:50px;font-weight:600;line-height:.95;color:{T["ink"]}}}
.note i{{display:block;height:10px;border-radius:5px;background:{T["line"]};margin-top:16px}}
.note i.short{{width:60%;margin-top:10px}}
.tree-root{{left:0;width:{W}px;display:flex;align-items:center;justify-content:center}}
.root-pill{{display:flex;align-items:center;gap:14px;padding:0 34px;height:84px;border-radius:42px;background:{T["accent"]};color:#fff;font-size:34px;font-weight:700;box-shadow:0 14px 30px -12px {T["accent"]}}}
.root-card{{display:flex;align-items:center;gap:14px;padding:0 34px;height:120px;font-size:40px;font-weight:800}}
.folder{{width:34px;height:26px;border-radius:4px;background:#fff;position:relative;opacity:.95}}
.kid{{padding:18px 18px;overflow:hidden}}
.kid.pic{{padding:0;border:4px solid {T["accent"]}}}
.kid-m{{position:absolute;inset:0;border-radius:14px;overflow:hidden}}
.chip{{position:absolute;left:50%;top:-20px;transform:translateX(-50%);z-index:2;padding:4px 14px;border-radius:8px;background:{T["accent"]};color:#fff;font-family:'{T["mono"]}',monospace;font-size:16px;letter-spacing:.12em}}
.mnode{{width:0;height:0;display:flex;align-items:center;justify-content:center}}
.mnode span{{flex:none;white-space:nowrap;padding:12px 26px;border-radius:40px;background:{T["card"]};border:2.5px solid {T["ink"]};font-size:30px;font-weight:600;box-shadow:0 10px 24px -14px rgba(0,0,0,.4)}}
.mnode .mcenter{{padding:20px 40px;background:{T["accent"]};border:none;color:#fff;font-size:40px;font-weight:700;box-shadow:0 18px 36px -14px {T["accent"]}}}
.fcard{{padding:22px 22px;transform-origin:50% 100%}}
.fcard .lab{{color:{T["accent"]}}}
.ft{{display:block;margin-top:14px;min-height:118px;font-size:40px;font-weight:800;line-height:1.02;letter-spacing:-.02em;filter:blur(7px);opacity:.55}}
.fcard.seen .ft{{filter:none;opacity:1}}
.fcard.on{{box-shadow:0 0 0 4px {T["accent"]},0 30px 50px -20px rgba(20,24,60,.45)}}
.fbar{{position:absolute;left:22px;right:22px;bottom:24px;height:12px;border-radius:6px;background:{T["accent"]};transform:scaleX(0);transform-origin:0 50%}}
.title{{left:0;width:{W}px;display:flex;flex-direction:column;align-items:center}}
.tl-l{{display:block;font-weight:850;letter-spacing:-.035em;line-height:1.02;color:{T["ink"]}}}
.tl-l.acc{{color:{T["accent"]}}}
.badge{{display:flex;flex-direction:column;align-items:flex-start}}
.bw{{position:relative;font-size:150px;font-weight:900;letter-spacing:-.04em;line-height:.9;color:#fff;text-shadow:0 6px 30px rgba(0,0,0,.35)}}
.bow{{position:absolute;right:-14px;top:-26px;width:58px;height:40px;border-radius:8px;background:{T["pop"]};box-shadow:inset 0 -10px 0 rgba(0,0,0,.12)}}
.bow:before{{content:'';position:absolute;left:24px;top:-8px;width:10px;height:56px;background:#fff;opacity:.85}}
.btag{{margin:-6px 0 0 120px;padding:2px 26px 10px;background:{T["tag"]};color:#fff;font-family:'{T["hand"]}',cursive;font-size:70px;font-weight:700;line-height:1;box-shadow:0 12px 30px -12px rgba(0,0,0,.5)}}
.prof{{width:740px;padding:26px 28px;display:flex;gap:24px;align-items:flex-start}}
.pav{{flex:none;width:118px;height:118px;border-radius:50%;overflow:hidden;background:{T["line"]};display:flex;align-items:center;justify-content:center;font-style:normal;font-size:52px;font-weight:800;color:{T["ink"]}}}
.pav img{{width:100%;height:100%;object-fit:cover}}
.pn{{display:flex;flex-direction:column;gap:6px;min-width:0}}
.pn b{{font-size:42px;font-weight:800;letter-spacing:-.02em;display:flex;align-items:center;gap:10px}}
.pn .tick{{width:24px;height:24px;border-radius:50%;background:{T["accent"]}}}
.pn em{{font-style:normal;font-family:'{T["mono"]}',monospace;font-size:21px;color:{T["muted"]}}}
.pn span{{font-size:24px;color:{T["ink"]};opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
.pn u{{text-decoration:none;align-self:flex-start;margin-top:6px;padding:8px 22px;border-radius:22px;background:{T["ink"]};color:#fff;font-size:22px;font-weight:700}}
.stats{{left:150px;width:780px;padding:22px 30px 10px}}
.shead{{display:flex;justify-content:space-between;align-items:baseline;padding-bottom:10px;border-bottom:1.5px solid {T["line"]}}}
.shead b{{font-size:32px;font-weight:800}}
.shead span{{font-family:'{T["mono"]}',monospace;font-size:20px;color:{T["muted"]}}}
.srow{{display:flex;justify-content:space-between;align-items:center;padding:16px 0;font-size:30px;border-bottom:1.5px solid {T["line"]}}}
.srow:last-child{{border-bottom:none}}
.srow b{{display:flex;align-items:center;gap:10px;font-weight:800}}
.up{{font-style:normal;color:{T["accent"]};font-size:30px}}
.svs{{position:relative;display:inline-block;min-width:110px;text-align:right;padding:2px 8px}}
.sv{{position:relative;display:none;z-index:1}}
.mk{{position:absolute;inset:0 -4px;border-radius:6px;background:{T["marker"]};transform:scaleX(0);transform-origin:0 50%}}
.thumb{{border-radius:16px;overflow:hidden;background:#000;box-shadow:0 18px 36px -16px rgba(0,0,0,.5)}}
.prompt{{left:110px;width:860px;height:118px;border-radius:30px;padding:0 120px 0 34px;display:flex;align-items:center;font-size:34px;font-weight:500}}
.ph{{color:{T["muted"]}}}
.ch{{display:none}}
.psend{{position:absolute;right:26px;top:50%;margin-top:-30px;width:60px;height:60px;border-radius:50%;background:{T["line"]}}}
.kw{{left:0;width:{W}px;display:flex;flex-direction:column;align-items:center;z-index:22}}
.kl{{font-family:'{T["mono"]}',monospace;font-size:52px;font-weight:700;color:{T["captionColor"]};text-shadow:0 2px 10px rgba(0,0,0,.6)}}
.kk{{font-size:132px;font-weight:900;letter-spacing:-.02em;line-height:1;color:{T["captionColor"]};text-shadow:0 0 3px rgba(0,0,0,.6),0 6px 28px rgba(0,0,0,.55)}}
.cap{{left:0;width:{W}px;height:80px;display:flex;align-items:center;justify-content:center;z-index:20}}
.cap-in{{display:block;font-family:'{T["mono"]}',monospace;font-size:{T["captionSize"]}px;font-weight:650;letter-spacing:-.01em;line-height:1.1;color:{T["captionColor"]};white-space:nowrap;text-shadow:0 0 2px rgba(0,0,0,.85),0 2px 12px rgba(0,0,0,.6)}}
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
{chr(10).join(init)}
const tl = gsap.timeline({{ paused: true }});
{chr(10).join(js)}
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body>
</html>
"""
    Path(a.out).write_text(page)
    print(f"Wrote {a.out}: {len(beats)} beats, {len(pops)} graphics, {len(caps)} captions, {len(sounds)} sounds, {dur:.2f}s")


if __name__ == "__main__":
    main()
