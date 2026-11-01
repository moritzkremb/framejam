#!/usr/bin/env python3
"""Build index.html (a Hyperframes composition) from edit.json and captions.json.

edit.json has the edited talking-head video, its beats and the pop-ups that sit on top of them.

Beats (one layout each, hard cut at "start"):

  speaker   the talking head full frame ("zoom": 1.0 wide, 1.1-1.2 punched in; "punches" re-frame inside the beat)
  hook      the speaker cut out on the ground colour, big headline cards behind them that replace each other
            ("cards": [{"at", "lines", "font": serif|sans|italic, "accent", "timecode"}])
  word      one giant serif word behind the speaker ("word", optional small "lead" line above it)
  magazine  the frame turns into a magazine cover: masthead behind the speaker, issue line, cover lines, barcode
  grid      a 3x3 grid of tiles on the ground colour ("tiles": up to 9 images or videos; "speaker" is the talking head)

hook, word and magazine need "cutout" (a transparent webm of the speaker, from scripts/make_cutouts.py) for the text to
sit behind the speaker; without one the text sits in front. Any beat can start with "in": "blur" (a fast blur-in).

Pop-ups ("pops", absolute times, each from "at" to "until"):

  chat      a prompt box types "text", sends, and shows "done" with a check
  icons     app icons or words land one by one; "strike": true slashes each one
  cards     1-3 tilted cards (images or clips) float in
  screen    a screen recording or screenshot in a dark window card ("title", "focus" zooms)
  pip       a tall picture-in-picture card with a label chip under it
  timer     a flip counter running from "from" to "to" (m:ss)
  drop      a file chip drops into an empty card ("name", "meta")
  thread    comment rows that pop in one by one ("messages": [{"name", "text", "at"}])
  stack     two stacked blocks: a sans word and a serif italic word ("top", "bottom")
  comment   the CTA: a headline, the keyword typed as a comment, a heart, a reply
  follow    a profile pill whose Follow button flips to Following

Every pop-up and layout change gets its sound effect from assets/sfx (scripts/make_sounds.py) unless "sfx": false.

Run `python3 build.py` (defaults: edit.json, captions.json, index.html in this folder), then `npx hyperframes check`,
`npx hyperframes snapshot --at ...` and `npx hyperframes render`.
"""
import argparse, html, json, re, subprocess, wave
from pathlib import Path

W, H = 1080, 1920
DEFAULT_THEME = {
    "ground": "#1B3A2E",
    "ink": "#F3EEE1",
    "dim": "#8FAA98",
    "accent": "#C9A86A",
    "strike": "#E5484D",
    "paper": "#F6F2E8",
    "paperInk": "#1B2A23",
    "captionBg": "rgba(27,58,46,0.92)",
    "captionSize": 50,
    "captionY": 1350,
    "serif": "Playfair Display",
    "serifFile": "fonts/playfair-display.woff2",
    "serifItalicFile": "fonts/playfair-display-italic.woff2",
    "sans": "Inter",
    "sansFile": "fonts/inter.woff2",
    "mono": "Geist Mono",
    "monoFile": "fonts/geist-mono-latin-wght-normal.woff2",
}
LAYOUTS = ("speaker", "hook", "word", "magazine", "grid")
CUT_LAYOUTS = ("hook", "word", "magazine")
VIDEO_EXT = (".mp4", ".webm", ".mov", ".m4v")
SFX = {
    "chat": [("typing", 0.15), ("click", "send"), ("ding", "done")],
    "icons": [("pop", "items"), ("swipe", "strikes")],
    "cards": [("whoosh", 0)],
    "screen": [("whoosh", 0)],
    "pip": [("pop", 0)],
    "timer": [("tick", "ticks")],
    "drop": [("whoosh", 0), ("pop", 0.45)],
    "thread": [("pop", "messages")],
    "stack": [("hit", 0), ("hit", 0.25)],
    "comment": [("typing", 0.3), ("click", "send"), ("pop", "heart"), ("ding", "reply")],
    "follow": [("pop", 0), ("click", 0.9)],
}
SFX_GAIN = {"typing": 0.35, "click": 0.6, "ding": 0.5, "pop": 0.55, "swipe": 0.5, "whoosh": 0.45, "tick": 0.35, "hit": 0.6}


def esc(s):
    return html.escape(str(s), quote=True)


def num(x):
    return f"{float(x):.3f}".rstrip("0").rstrip(".")


def is_video(src):
    return str(src).lower().endswith(VIDEO_EXT)


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


def media_el(el_id, src, start, dur, media_start=0, fit="cover", cls="media"):
    style = f"object-fit:{fit}"
    if is_video(src):
        return (f'<video id="{el_id}" class="clip {cls}" src="{esc(src)}" data-start="{num(start)}" data-duration="{num(dur)}" '
                f'data-media-start="{num(media_start)}" muted playsinline style="{style}"></video>')
    return f'<img id="{el_id}" class="clip {cls}" src="{esc(src)}" data-start="{num(start)}" data-duration="{num(dur)}" alt="" style="{style}">'


def fit_px(lines, max_px, width, em):
    longest = max((len(x) for x in lines), default=1)
    return int(min(max_px, width / (em * max(longest, 1))))


def accent_html(text, accent):
    if accent and accent.lower() in text.lower():
        i = text.lower().index(accent.lower())
        return f'{esc(text[:i])}<span class="acc">{esc(text[i:i + len(accent)])}</span>{esc(text[i + len(accent):])}'
    return esc(text)


def mmss(t):
    t = max(0, int(round(t)))
    return f"{t // 60}:{t % 60:02d}"


def secs(s):
    m, _, ss = str(s).partition(":")
    return int(m) * 60 + int(ss) if ss else int(m)


def main():
    here = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--edit", default=str(here / "edit.json"))
    ap.add_argument("--captions", default=str(here / "captions.json"))
    ap.add_argument("--out", default=str(here / "index.html"))
    a = ap.parse_args()

    root = Path(a.edit).resolve().parent
    e = json.loads(Path(a.edit).read_text())
    theme = {**DEFAULT_THEME, **e.get("theme", {})}
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
    T = theme

    body, js, sounds, init = [], [], [], []

    def shown(el, at, until):
        """Visibility for wrappers that hold videos or nested boxes: those can't be timed clips themselves."""
        if at > 0:
            js.append(f"tl.set('#{el}',{{visibility:'visible'}},{num(at)});")
        js.append(f"tl.set('#{el}',{{visibility:'hidden'}},{num(until)});")
        return "visible" if at <= 0 else "hidden"

    def sound(name, at):
        if use_sfx and 0 <= at < dur and (root / sfx_dir / f"{name}.wav").exists():
            sounds.append((name, at))

    body.append('<div id="ground"></div>')
    first = beats[0]
    init.append(f"gsap.set('#spk-zoom',{{scale:{first.get('zoom', 1)},transformOrigin:'{first.get('origin', '50% 32%')}'}});")
    spk0 = 0 if first["layout"] == "grid" or (first["layout"] == "hook" and first.get("cutout")) else 1
    body.append(
        f'<div id="spk" data-layout-allow-overflow style="opacity:{spk0}"><div id="spk-zoom"><video id="spk-v" class="clip" src="{esc(e["speaker"])}" data-start="0" '
        f'data-duration="{num(dur)}" muted playsinline></video></div></div>'
    )
    body.append(f'<audio id="narration" class="clip" src="{esc(e["narration"])}" data-start="0" data-duration="{num(dur)}" data-volume="{e.get("narrationVolume", 1)}"></audio>')
    if e.get("music"):
        m = e["music"]
        body.append(f'<audio id="music" class="clip" src="{esc(m["src"])}" data-start="0" data-duration="{num(dur)}" '
                    f'data-volume="{m.get("volume", 0.12)}" data-fade-out="{m.get("fadeOut", 1.5)}"></audio>')

    # ---------- beats ----------
    for b in beats:
        s, t, lay, bid = float(b["start"]), float(b["end"]), b["layout"], b["id"]
        d = t - s
        zoom = b.get("zoom", 1)
        origin = b.get("origin", "50% 32%")
        on_ground = lay in ("hook", "grid")
        js.append(f"tl.set('#spk',{{opacity:{0 if on_ground else 1}}},{num(s)});")
        js.append(f"tl.set('#spk-zoom',{{scale:{zoom},transformOrigin:'{origin}'}},{num(s)});")
        for p in b.get("punches", []):
            js.append(f"tl.set('#spk-zoom',{{scale:{p['zoom']}}},{num(p['at'])});")
        if b.get("in") == "blur" and not on_ground:
            js.append(f"tl.fromTo('#spk',{{filter:'blur(28px)'}},{{filter:'blur(0px)',duration:.32,ease:'power2.out'}},{num(s)});")
            sound("whoosh", s - 0.08)

        cut = b.get("cutout") if lay in CUT_LAYOUTS else None
        if cut:
            body.append(
                f'<div id="cut-{bid}" class="cut" style="visibility:{shown(f"cut-{bid}", s, t)}">'
                f'<div class="cut-zoom" id="cz-{bid}">'
                f'<video id="cv-{bid}" class="clip" src="{esc(cut)}" data-start="{num(s)}" data-duration="{num(d)}" '
                f'data-media-start="{num(b.get("cutoutStart", 0))}" muted playsinline></video></div></div>'
            )
            init.append(f"gsap.set('#cz-{bid}',{{scale:{zoom},transformOrigin:'{origin}'}});")
            for p in b.get("punches", []):
                js.append(f"tl.set('#cz-{bid}',{{scale:{p['zoom']}}},{num(p['at'])});")
        elif lay == "hook":
            # No cut-out: show the speaker under the headline instead of the ground colour.
            js.append(f"tl.set('#spk',{{opacity:1}},{num(s)});")
        z_text = 6 if cut else 9

        if lay == "hook":
            cards = b.get("cards") or [{"at": s, "lines": b.get("lines", [])}]
            for k, c in enumerate(cards):
                ca = float(c.get("at", s))
                cb = float(cards[k + 1]["at"]) if k + 1 < len(cards) else t
                font = c.get("font", "serif")
                lines = c.get("lines", [])
                em = {"serif": 0.62, "sans": 0.66, "italic": 0.5}[font]
                fs = fit_px(lines, int(c.get("size", 220)), 980, em)
                spans = "".join(f'<span class="hl hl-{font}" id="hl-{bid}-{k}-{i}" style="font-size:{fs}px">{accent_html(x, c.get("accent"))}</span>'
                                for i, x in enumerate(lines))
                tc = ""
                if c.get("timecode"):
                    n = int((cb - ca) * 15)
                    tc = '<span class="tc">' + "".join(
                        f'<span class="tcv" id="tc-{bid}-{k}-{j}">00:00:{int((ca - s + j / 15) % 60):02d}:{int((j * 2) % 30):02d}</span>' for j in range(n)) + "</span>"
                    for j in range(n):
                        js.append(f"tl.set('#tc-{bid}-{k}-{j}',{{display:'inline'}},{num(ca + j / 15)});")
                        if j + 1 < n:
                            js.append(f"tl.set('#tc-{bid}-{k}-{j}',{{display:'none'}},{num(ca + (j + 1) / 15)});")
                body.append(f'<div id="hk-{bid}-{k}" class="clip hook" data-start="{num(ca)}" data-duration="{num(cb - ca)}" '
                            f'style="top:{c.get("y", b.get("y", 330))}px;z-index:{z_text}">{tc}{spans}</div>')
                for i in range(len(lines)):
                    js.append(f"tl.fromTo('#hl-{bid}-{k}-{i}',{{opacity:0,y:60,scale:.94}},{{opacity:1,y:0,scale:1,duration:.34,ease:'back.out(1.6)'}},{num(ca + 0.06 * i)});")
                if k:
                    sound("hit", ca)

        if lay == "word":
            at = float(b.get("at", s + 0.04))
            word = str(b.get("word", "")).upper()
            fs = fit_px([word], 330, 1000, 0.66)
            lead = f'<span class="lead" id="ld-{bid}">{esc(b["lead"])}</span>' if b.get("lead") else ""
            body.append(f'<div id="wd-{bid}" class="clip word" data-start="{num(s)}" data-duration="{num(d)}" style="top:{b.get("y", 330)}px;z-index:{z_text}">'
                        f'{lead}<span class="big" id="bw-{bid}" style="font-size:{fs}px">{esc(word)}</span></div>')
            js.append(f"tl.fromTo('#bw-{bid}',{{opacity:0,scale:1.25,filter:'blur(16px)'}},{{opacity:1,scale:1,filter:'blur(0px)',duration:.32,ease:'power3.out'}},{num(at)});")
            if lead:
                js.append(f"tl.fromTo('#ld-{bid}',{{opacity:0,y:20}},{{opacity:1,y:0,duration:.25,ease:'power2.out'}},{num(b.get('leadAt', at + 0.3))});")
            sound("hit", at)

        if lay == "magazine":
            at = float(b.get("at", s + 0.05))
            mast = str(b.get("masthead", "")).upper()
            fs = fit_px([mast], 260, 1000, 0.7)
            body.append(f'<div id="mg-{bid}" class="clip mast" data-start="{num(s)}" data-duration="{num(d)}" style="top:{b.get("y", 330)}px;z-index:{z_text}">'
                        f'<span class="mast-t" id="mt-{bid}" style="font-size:{fs}px">{esc(mast)}</span></div>')
            bars = "".join(f'<i style="width:{w}px"></i>' for w in [3, 1, 2, 1, 3, 2, 1, 1, 3, 1, 2, 3, 1, 2, 1, 3, 1, 2])
            cover = "".join(f'<span class="cl cl-{i}">{esc(x)}</span>' for i, x in enumerate(b.get("coverlines", [])))
            body.append(
                f'<div id="mf-{bid}" class="magfront" style="visibility:{shown(f"mf-{bid}", s, t)}">'
                f'<div class="frame" id="fr-{bid}"></div>'
                f'<div class="issue" id="is-{bid}">{esc(b.get("issue", ""))}</div>'
                f'<div class="cover" id="co-{bid}" style="top:{int(b.get("y", 330) + fs * 1.1 + 40)}px"><span class="kicker">{esc(b.get("kicker", ""))}</span>{cover}</div>'
                f'<div class="barcode" id="bc-{bid}">{bars}</div></div>'
            )
            js.append(f"tl.fromTo('#mt-{bid}',{{opacity:0,y:-40,scale:1.12}},{{opacity:1,y:0,scale:1,duration:.45,ease:'power3.out'}},{num(at)});")
            js.append(f"tl.fromTo('#fr-{bid}',{{opacity:0,scale:1.04}},{{opacity:1,scale:1,duration:.35,ease:'power2.out'}},{num(at)});")
            for j, sel in enumerate([f"#is-{bid}", f"#co-{bid}", f"#bc-{bid}"]):
                js.append(f"tl.fromTo('{sel}',{{opacity:0,y:16}},{{opacity:1,y:0,duration:.3,ease:'power2.out'}},{num(at + 0.2 + 0.12 * j)});")
            sound("whoosh", at - 0.05)

        if lay == "grid":
            at = float(b.get("at", s))
            tiles = b.get("tiles", [])[:9]
            gap, x0, y0 = 18, 48, 300
            tw = (W - 2 * x0 - 2 * gap) // 3
            th = round(tw * 16 / 9)
            if y0 + 3 * th + 2 * gap > H - 160:
                th = (H - 160 - y0 - 2 * gap) // 3
            parts = []
            for i, src in enumerate(tiles):
                r, c = divmod(i, 3)
                x, y = x0 + c * (tw + gap), y0 + r * (th + gap)
                src = e["speaker"] if src == "speaker" else src
                ms = s if src == e["speaker"] else 0
                parts.append(f'<div class="tile" id="tl-{bid}-{i}" style="left:{x}px;top:{y}px;width:{tw}px;height:{th}px">{media_el(f"tm-{bid}-{i}", src, s, d, ms)}</div>')
                js.append(f"tl.fromTo('#tl-{bid}-{i}',{{opacity:0,scale:.7,y:50}},{{opacity:1,scale:1,y:0,duration:.36,ease:'back.out(1.7)'}},{num(at + 0.05 * i)});")
            body.append(f'<div id="gr-{bid}" class="grid" style="visibility:{shown(f"gr-{bid}", s, t)}">{"".join(parts)}</div>')
            sound("whoosh", at - 0.05)

    # ---------- pop-ups ----------
    for n, p in enumerate(pops):
        kind, at = p["type"], float(p["at"])
        until = float(p.get("until", at + 2.5))
        pid = p.get("id", f"p{n + 1:02d}")
        pd = until - at
        inner = ""
        marks = {"send": None, "done": None, "items": [], "strikes": [], "ticks": [], "messages": [], "heart": None, "reply": None}

        def type_on(el, text, start, cps):
            spans = "".join(f'<span class="ch" id="{el}-{i}">{"&nbsp;" if ch == " " else esc(ch)}</span>' for i, ch in enumerate(text))
            for i in range(len(text)):
                js.append(f"tl.set('#{el}-{i}',{{display:'inline'}},{num(start + i / cps)});")
            return spans, start + len(text) / cps

        if kind == "chat":
            text = p.get("text", "")
            spans, typed = type_on(f"ct-{pid}", text, at + 0.35, float(p.get("cps", 20)))
            send = min(typed + 0.25, until - 0.6)
            done = p.get("done")
            inner = (f'<div class="chat" id="cb-{pid}"><span class="chat-l">{esc(p.get("label", "TO YOUR AGENT"))}</span>'
                     f'<span class="chat-t" id="cx-{pid}">{spans}<span class="caret" id="cr-{pid}"></span></span>'
                     + (f'<span class="chat-d" id="cd-{pid}">{esc(done)}</span>' if done else "")
                     + f'<span class="send" id="sb-{pid}"><span class="arw" id="aw-{pid}">&#8593;</span><span class="chk" id="ck-{pid}">&#10003;</span></span></div>')
            js.append(f"tl.fromTo('#cb-{pid}',{{opacity:0,y:-30,scale:.96}},{{opacity:1,y:0,scale:1,duration:.32,ease:'back.out(1.6)'}},{num(at)});")
            js.append(f"tl.to('#cr-{pid}',{{opacity:0,duration:.01,repeat:{int(pd / 0.5)},yoyo:true,repeatDelay:.25}},{num(at)});")
            js.append(f"tl.fromTo('#sb-{pid}',{{scale:1}},{{scale:.82,duration:.08,yoyo:true,repeat:1}},{num(send)});")
            marks["send"] = send
            if done:
                js.append(f"tl.set('#cx-{pid}',{{display:'none'}},{num(send + 0.25)});")
                js.append(f"tl.fromTo('#cd-{pid}',{{display:'none',opacity:0}},{{display:'block',opacity:1,duration:.25}},{num(send + 0.25)});")
                js.append(f"tl.set('#aw-{pid}',{{opacity:0}},{num(send + 0.25)});")
                js.append(f"tl.fromTo('#ck-{pid}',{{opacity:0,scale:.4}},{{opacity:1,scale:1,duration:.3,ease:'back.out(2.5)'}},{num(send + 0.25)});")
                marks["done"] = send + 0.25
            sounds_typing = (at + 0.35, typed)

        elif kind == "icons":
            items = p.get("items", [])
            size, gap = int(p.get("size", 150)), 40
            x0 = (W - (len(items) * size + (len(items) - 1) * gap)) // 2
            for i, it in enumerate(items):
                ia = float(it.get("at", at + 0.45 * i))
                face = (f'<img src="{esc(it["src"])}" alt="">' if it.get("src") else f'<span>{esc(it.get("text", ""))}</span>')
                strike = f'<i class="slash" id="sl-{pid}-{i}"></i>' if p.get("strike") else ""
                inner += (f'<div class="ico" id="ic-{pid}-{i}" style="left:{x0 + i * (size + gap)}px;width:{size}px">'
                          f'<div class="ico-f" style="height:{size}px">{face}{strike}</div><span class="ico-l">{esc(it.get("label", ""))}</span></div>')
                js.append(f"tl.fromTo('#ic-{pid}-{i}',{{opacity:0,scale:.5,y:-20}},{{opacity:1,scale:1,y:0,duration:.34,ease:'back.out(2.2)'}},{num(ia)});")
                marks["items"].append(ia)
                if p.get("strike"):
                    sa = float(it.get("strikeAt", ia + 0.35))
                    js.append(f"tl.fromTo('#sl-{pid}-{i}',{{scaleX:0,rotation:-38}},{{scaleX:1,rotation:-38,duration:.16,ease:'power2.out'}},{num(sa)});")
                    marks["strikes"].append(sa)

        elif kind == "cards":
            srcs = p.get("srcs", [])[:3]
            k = len(srcs)
            cw, ch = 250, 400
            xs = {1: [415], 2: [250, 580], 3: [120, 415, 710]}[k] if k else []
            rots = {1: [0], 2: [-6, 6], 3: [-8, 2, 9]}.get(k, [])
            for i, src in enumerate(srcs):
                ia = at + 0.18 * i
                inner += f'<div class="fcard" id="fc-{pid}-{i}" style="left:{xs[i]}px;top:{220 + (40 if i != 1 else 0)}px;width:{cw}px;height:{ch}px">{media_el(f"fm-{pid}-{i}", src, at, pd)}</div>'
                js.append(f"tl.fromTo('#fc-{pid}-{i}',{{opacity:0,y:260,rotation:{rots[i] * 2.5}}},{{opacity:1,y:0,rotation:{rots[i]},duration:.5,ease:'power3.out'}},{num(ia)});")
                js.append(f"tl.to('#fc-{pid}-{i}',{{y:-24,duration:{num(max(0.5, pd - 0.6))},ease:'sine.inOut'}},{num(ia + 0.5)});")

        elif kind == "screen":
            bx, by, bw, bh = p.get("box", [60, 190, 960, 560])
            src = p["src"]
            body_h = bh - 54
            inner = (f'<div class="win" id="wn-{pid}" style="left:{bx}px;top:{by}px;width:{bw}px;height:{bh}px">'
                     f'<div class="win-bar"><i></i><i></i><i></i><span>{esc(p.get("title", ""))}</span></div>'
                     f'<div class="win-in" style="height:{body_h}px">{media_el(f"wm-{pid}", src, at, pd, p.get("mediaStart", 0), p.get("fit", "cover"))}</div></div>')
            js.append(f"tl.fromTo('#wn-{pid}',{{opacity:0,y:120,scale:.92}},{{opacity:1,y:0,scale:1,duration:.42,ease:'power3.out'}},{num(at)});")
            js.append(f"tl.set('#wm-{pid}',{{scale:1,x:0,y:0}},{num(at)});")
            for f in p.get("focus", []):
                z = float(f.get("zoom", 1.8))
                px, py = float(f.get("x", 0.5)) * bw, float(f.get("y", 0.5)) * body_h
                lx, ly = (z - 1) * bw / 2, (z - 1) * body_h / 2
                tx = max(-lx, min(lx, -z * (px - bw / 2)))
                ty = max(-ly, min(ly, -z * (py - body_h / 2)))
                js.append(f"tl.to('#wm-{pid}',{{scale:{z},x:{tx:.1f},y:{ty:.1f},duration:{f.get('duration', 0.5)},ease:'power3.inOut'}},{num(f['at'])});")

        elif kind == "pip":
            cw, ch = int(p.get("width", 320)), int(p.get("height", 540))
            x = (W - cw) // 2 if p.get("side", "center") == "center" else (60 if p["side"] == "left" else W - cw - 60)
            inner = (f'<div class="pip" id="pp-{pid}" style="left:{x}px;top:{p.get("y", 200)}px;width:{cw}px;height:{ch}px">'
                     f'{media_el(f"pm-{pid}", p["src"], at, pd, p.get("mediaStart", 0))}</div>')
            if p.get("label"):
                inner += f'<div class="pip-l" id="pl-{pid}" style="top:{p.get("y", 200) + ch + 18}px"><span>{esc(p["label"])}</span></div>'
                js.append(f"tl.fromTo('#pl-{pid}',{{opacity:0,y:-10}},{{opacity:1,y:0,duration:.25,ease:'back.out(2)'}},{num(at + 0.25)});")
            js.append(f"tl.fromTo('#pp-{pid}',{{opacity:0,scale:.6,rotation:-4}},{{opacity:1,scale:1,rotation:0,duration:.4,ease:'back.out(1.8)'}},{num(at)});")

        elif kind == "timer":
            a0, a1 = secs(p.get("from", "1:00")), secs(p.get("to", "0:00"))
            steps = int(p.get("steps", 7))
            vals = [mmss(a0 + (a1 - a0) * i / (steps - 1)) for i in range(steps)]
            run = min(pd * 0.6, 0.18 * steps)
            digits = "".join(f'<span class="tv" id="tv-{pid}-{i}">{esc(v)}</span>' for i, v in enumerate(vals))
            inner = f'<div class="timer" id="tm-{pid}"><span class="tlab">{esc(p.get("label", ""))}</span><span class="tvs">{digits}</span></div>'
            js.append(f"tl.fromTo('#tm-{pid}',{{opacity:0,y:-30}},{{opacity:1,y:0,duration:.3,ease:'back.out(1.7)'}},{num(at)});")
            for i in range(steps):
                ta = at + 0.35 + run * i / (steps - 1)
                js.append(f"tl.set('#tv-{pid}-{i}',{{display:'block'}},{num(ta)});")
                js.append(f"tl.fromTo('#tv-{pid}-{i}',{{rotationX:-80}},{{rotationX:0,duration:.12,ease:'power2.out'}},{num(ta)});")
                if i + 1 < steps:
                    js.append(f"tl.set('#tv-{pid}-{i}',{{display:'none'}},{num(at + 0.35 + run * (i + 1) / (steps - 1))});")
                marks["ticks"].append(ta)

        elif kind == "drop":
            inner = (f'<div class="dropz" id="dz-{pid}"><div class="file" id="fl-{pid}"><i></i>'
                     f'<span><b>{esc(p.get("name", "raw-footage.mp4"))}</b><em>{esc(p.get("meta", ""))}</em></span></div></div>')
            js.append(f"tl.fromTo('#dz-{pid}',{{opacity:0,scale:.94}},{{opacity:1,scale:1,duration:.3,ease:'power2.out'}},{num(at)});")
            js.append(f"tl.fromTo('#fl-{pid}',{{opacity:0,y:-160,rotation:-6}},{{opacity:1,y:0,rotation:0,duration:.4,ease:'back.out(1.4)'}},{num(at + 0.3)});")

        elif kind == "thread":
            rows = ""
            for i, m in enumerate(p.get("messages", [])):
                ma = float(m.get("at", at + 0.6 * i))
                rows += (f'<div class="msg" id="ms-{pid}-{i}"><i>{esc(m.get("name", "?")[:1].upper())}</i>'
                         f'<span><b>{esc(m.get("name", ""))}</b>{esc(m.get("text", ""))}</span></div>')
                js.append(f"tl.fromTo('#ms-{pid}-{i}',{{opacity:0,y:24,scale:.96}},{{opacity:1,y:0,scale:1,duration:.3,ease:'back.out(1.8)'}},{num(ma)});")
                marks["messages"].append(ma)
            inner = f'<div class="thread" id="th-{pid}">{rows}</div>'

        elif kind == "stack":
            inner = (f'<div class="stack" id="sk-{pid}"><span class="sk-top" id="st-{pid}">{esc(p.get("top", ""))}</span>'
                     f'<span class="sk-bot" id="sb2-{pid}">{esc(p.get("bottom", ""))}</span></div>')
            js.append(f"tl.fromTo('#st-{pid}',{{opacity:0,scale:1.6}},{{opacity:1,scale:1,duration:.24,ease:'power3.out'}},{num(at)});")
            js.append(f"tl.fromTo('#sb2-{pid}',{{opacity:0,y:40}},{{opacity:1,y:0,duration:.28,ease:'back.out(1.8)'}},{num(at + 0.25)});")

        elif kind == "comment":
            kw = p.get("keyword", "")
            spans, typed = type_on(f"cm-{pid}", kw, at + 0.5, 8)
            send = typed + 0.2
            heart, reply = send + 0.5, send + 0.9
            handle = p.get("handle", "you")
            inner = (f'<div class="cta" id="cta-{pid}">{esc(p.get("headline", ""))}</div>'
                     f'<div class="cin" id="ci-{pid}"><i class="av"></i><span class="cin-t">{spans}<span class="caret" id="cc-{pid}"></span></span>'
                     f'<span class="send small" id="cs-{pid}">&#8593;</span><span class="heart" id="hh-{pid}">&#9829;</span></div>'
                     + (f'<div class="reply" id="rp-{pid}"><i class="av"></i><span><b>{esc(handle)}</b>{esc(p["reply"])}</span></div>' if p.get("reply") else ""))
            js.append(f"tl.fromTo('#cta-{pid}',{{opacity:0,y:-20,scale:.9}},{{opacity:1,y:0,scale:1,duration:.32,ease:'back.out(2)'}},{num(at)});")
            js.append(f"tl.fromTo('#ci-{pid}',{{opacity:0,y:20}},{{opacity:1,y:0,duration:.3,ease:'power2.out'}},{num(at + 0.2)});")
            js.append(f"tl.to('#cc-{pid}',{{opacity:0,duration:.01,repeat:{int(pd / 0.5)},yoyo:true,repeatDelay:.25}},{num(at)});")
            js.append(f"tl.set('#cs-{pid}',{{display:'none'}},{num(send)});tl.set('#cc-{pid}',{{display:'none'}},{num(send)});")
            js.append(f"tl.fromTo('#hh-{pid}',{{display:'none'}},{{display:'block',duration:.01}},{num(send)});")
            js.append(f"tl.fromTo('#hh-{pid}',{{color:'#9a9a9a',scale:1}},{{color:'{T['strike']}',scale:1.35,duration:.16,yoyo:true,repeat:1,ease:'power2.out'}},{num(heart)});")
            js.append(f"tl.set('#hh-{pid}',{{color:'{T['strike']}'}},{num(heart + 0.33)});")
            if p.get("reply"):
                js.append(f"tl.fromTo('#rp-{pid}',{{opacity:0,y:-16}},{{opacity:1,y:0,duration:.3,ease:'back.out(1.8)'}},{num(reply)});")
            marks.update(send=send, heart=heart, reply=reply if p.get("reply") else None)
            sounds_typing = (at + 0.5, typed)

        elif kind == "follow":
            inner = (f'<div class="follow" id="fw-{pid}" style="top:{p.get("y", 1180)}px"><i class="av"></i>'
                     f'<span class="fw-n"><b>{esc(p.get("handle", ""))}</b><em>{esc(p.get("sub", ""))}</em></span>'
                     f'<span class="fbtn" id="fb-{pid}"><span id="f1-{pid}">Follow</span><span class="f2" id="f2-{pid}">&#10003; Following</span></span></div>')
            js.append(f"tl.fromTo('#fw-{pid}',{{opacity:0,y:30,scale:.9}},{{opacity:1,y:0,scale:1,duration:.34,ease:'back.out(1.8)'}},{num(at)});")
            js.append(f"tl.set('#f1-{pid}',{{display:'none'}},{num(at + 0.9)});tl.set('#f2-{pid}',{{display:'inline'}},{num(at + 0.9)});")
            js.append(f"tl.set('#fb-{pid}',{{attr:{{class:'fbtn on'}}}},{num(at + 0.9)});")
            js.append(f"tl.fromTo('#fb-{pid}',{{scale:1}},{{scale:.88,duration:.08,yoyo:true,repeat:1}},{num(at + 0.9)});")
        else:
            raise SystemExit(f"Pop {pid}: unknown type {kind}")

        body.append(f'<div id="pop-{pid}" class="pop" style="visibility:{shown(f"pop-{pid}", at, until)}">{inner}</div>')
        js.append(f"tl.to('#pop-{pid}',{{opacity:0,scale:.97,duration:.18,ease:'power2.in'}},{num(until - 0.18)});")

        if p.get("sfx", True):
            for name, when in SFX.get(kind, []):
                if name == "typing":
                    start_t, end_t = sounds_typing
                    if end_t - start_t > 0.1 and use_sfx:
                        sounds.append(("typing", start_t, end_t - start_t))
                    continue
                if isinstance(when, (int, float)):
                    sound(name, at + when)
                elif isinstance(marks.get(when), list):
                    for x in marks[when]:
                        sound(name, x)
                elif marks.get(when) is not None:
                    sound(name, marks[when])

    # ---------- captions ----------
    def beat_at(time):
        cur = beats[0]
        for b in beats:
            if b["start"] <= time + 1e-6:
                cur = b
        return cur

    for i, c in enumerate(caps):
        s, t = float(c["start"]), float(c["end"])
        b = beat_at((s + t) / 2)
        y = b.get("captionY", T["captionY"])
        words = c.get("words") or [{"text": c["text"], "start": s}]
        spans = " ".join(f'<span class="cw" id="cw-{i}-{j}">{esc(w["text"])}</span>' for j, w in enumerate(words))
        body.append(f'<div id="cap-{i}" class="clip cap" data-start="{num(s)}" data-duration="{num(t - s - 0.002)}" '
                    f'style="top:{y - 45}px"><span class="cap-in" id="cp-{i}">{spans}</span></div>')
        js.append(f"tl.fromTo('#cp-{i}',{{opacity:0,y:10}},{{opacity:1,y:0,duration:.12,ease:'power2.out'}},{num(s)});")
        for j, w in enumerate(words):
            key = re.sub(r"[^\w']", "", w["text"]).lower()
            col = T["accent"] if key in emphasis else T["ink"]
            js.append(f"tl.set('#cw-{i}-{j}',{{color:'{col}'}},{num(max(s, float(w['start'])))});")

    # ---------- sound effects ----------
    for k, snd in enumerate(sounds):
        name, at = snd[0], max(0.0, snd[1])
        length = snd[2] if len(snd) > 2 else None
        file = f"{sfx_dir}/{name}.wav"
        if length is None:
            with wave.open(str(root / file)) as w:
                length = min(w.getnframes() / w.getframerate(), dur - at)
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
@font-face{{font-family:'{T["serif"]}';src:url('{T["serifFile"]}') format('woff2');font-weight:400 900;font-style:normal}}
@font-face{{font-family:'{T["serif"]}';src:url('{T["serifItalicFile"]}') format('woff2');font-weight:400 900;font-style:italic}}
@font-face{{font-family:'{T["sans"]}';src:url('{T["sansFile"]}') format('woff2');font-weight:100 900;font-style:normal}}
@font-face{{font-family:'{T["mono"]}';src:url('{T["monoFile"]}') format('woff2');font-weight:100 900;font-style:normal}}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:{W}px;height:{H}px;overflow:hidden;background:#000}}
#root{{position:relative;width:100%;height:100%;overflow:hidden;background:{T["ground"]};font-family:'{T["sans"]}',sans-serif;color:{T["ink"]}}}
#ground,#spk,.clip,.cut,.grid,.magfront,.pop{{position:absolute}}
#ground{{left:0;top:0;width:{W}px;height:{H}px;background:radial-gradient(120% 80% at 50% 30%,{T["ground"]} 0%,{T["ground"]} 55%,rgba(0,0,0,.35) 100%),{T["ground"]};z-index:1}}
#spk{{left:0;top:0;width:{W}px;height:{H}px;overflow:hidden;z-index:5}}
#spk-zoom,.cut-zoom{{position:absolute;inset:0}}
#spk-v,.cut video{{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover}}
.cut{{left:0;top:0;width:{W}px;height:{H}px;overflow:hidden;z-index:7}}
.media{{position:absolute;left:0;top:0;width:100%;height:100%;display:block}}
.hook{{left:0;width:{W}px;display:flex;flex-direction:column;align-items:center;text-align:center}}
.hl{{display:block;white-space:nowrap;line-height:.92;color:{T["ink"]}}}
.hl-serif{{font-family:'{T["serif"]}',serif;font-weight:500;letter-spacing:-.01em;transform:scaleY(1.18);transform-origin:50% 0%;margin-bottom:.12em}}
.hl-sans{{font-family:'{T["sans"]}',sans-serif;font-weight:850;letter-spacing:-.045em;text-transform:uppercase}}
.hl-italic{{font-family:'{T["serif"]}',serif;font-style:italic;font-weight:500;letter-spacing:-.02em}}
.acc{{color:{T["accent"]};font-style:italic}}
.tc{{display:block;margin-bottom:14px;font-family:'{T["mono"]}',monospace;font-size:34px;letter-spacing:.08em;color:{T["accent"]}}}
.tcv{{display:none}}
.word{{left:0;width:{W}px;display:flex;flex-direction:column;align-items:center}}
.lead{{font-family:'{T["sans"]}',sans-serif;font-size:40px;font-weight:600;color:{T["ink"]};margin-bottom:6px;text-shadow:0 2px 12px rgba(0,0,0,.35)}}
.big{{display:block;font-family:'{T["serif"]}',serif;font-weight:500;line-height:.9;color:{T["ink"]};transform:scaleY(1.35);transform-origin:50% 0%;text-shadow:0 10px 40px rgba(0,0,0,.25)}}
.mast{{left:0;width:{W}px;text-align:center}}
.mast-t{{display:inline-block;font-family:'{T["serif"]}',serif;font-weight:600;line-height:1;color:{T["ink"]};text-shadow:0 8px 30px rgba(0,0,0,.25)}}
.magfront{{left:0;top:0;width:{W}px;height:{H}px;z-index:9}}
.frame{{position:absolute;left:34px;top:150px;right:34px;bottom:120px;border:3px solid {T["ink"]};opacity:.85}}
.issue{{position:absolute;left:0;right:0;top:200px;text-align:center;font-family:'{T["mono"]}',monospace;font-size:24px;letter-spacing:.22em;text-transform:uppercase;color:{T["ink"]}}}
.cover{{position:absolute;left:70px;width:290px;display:flex;flex-direction:column;gap:8px;text-shadow:0 2px 14px rgba(0,0,0,.45)}}
.kicker{{font-family:'{T["mono"]}',monospace;font-size:22px;letter-spacing:.2em;text-transform:uppercase;color:{T["accent"]}}}
.cl{{font-family:'{T["sans"]}',sans-serif;font-size:40px;font-weight:750;line-height:1.05;color:{T["ink"]}}}
.cl-1{{font-family:'{T["serif"]}',serif;font-style:italic;font-weight:500}}
.barcode{{position:absolute;left:70px;bottom:170px;height:84px;display:flex;gap:4px;background:{T["paper"]};padding:10px 12px}}
.barcode i{{display:block;height:100%;background:{T["paperInk"]}}}
.grid{{left:0;top:0;width:{W}px;height:{H}px;background:{T["ground"]};z-index:8}}
.tile{{position:absolute;border-radius:16px;overflow:hidden;background:#000;box-shadow:0 18px 40px -16px rgba(0,0,0,.6)}}
.pop{{left:0;top:0;width:{W}px;height:{H}px;z-index:12;pointer-events:none}}
.pop>*{{position:absolute}}
.ch{{display:none}}
.caret{{display:inline-block;width:3px;height:1.05em;margin-left:3px;vertical-align:-.15em;background:{T["paperInk"]}}}
.chat{{left:60px;top:200px;width:960px;min-height:126px;padding:22px 120px 22px 34px;border-radius:30px;background:{T["paper"]};color:{T["paperInk"]};box-shadow:0 24px 60px -20px rgba(0,0,0,.55)}}
.chat-l{{display:block;font-family:'{T["mono"]}',monospace;font-size:20px;letter-spacing:.18em;opacity:.55;margin-bottom:6px}}
.chat-t{{display:block;font-size:40px;font-weight:500;line-height:1.2}}
.chat-d{{display:none;font-family:'{T["serif"]}',serif;font-style:italic;font-size:44px;line-height:1.15}}
.send{{position:absolute;right:26px;top:50%;margin-top:-34px;width:68px;height:68px;border-radius:50%;background:{T["ground"]};color:{T["ink"]};display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:700}}
.send .chk{{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:50%;background:{T["ground"]};opacity:0}}
.ico{{top:230px;display:flex;flex-direction:column;align-items:center;gap:12px}}
.ico-f{{position:relative;width:100%;border-radius:22%;background:{T["paper"]};color:{T["paperInk"]};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:34px;box-shadow:0 16px 40px -14px rgba(0,0,0,.6)}}
.ico-f img{{width:100%;height:100%;object-fit:cover;border-radius:22%}}
.slash{{position:absolute;left:-8%;top:50%;width:116%;height:12px;margin-top:-6px;background:{T["strike"]};transform-origin:50% 50%;border-radius:6px;box-shadow:0 0 0 4px {T["paper"]}}}
.ico-l{{font-size:26px;font-weight:600;color:{T["ink"]};text-shadow:0 2px 10px rgba(0,0,0,.5)}}
.fcard,.pip,.win,.dropz,.thread{{border-radius:24px;overflow:hidden;box-shadow:0 30px 70px -24px rgba(0,0,0,.7)}}
.fcard{{background:#000;border:4px solid {T["paper"]}}}
.win{{background:{T["ground"]};border:1.5px solid rgba(255,255,255,.14)}}
.win-bar{{height:54px;display:flex;align-items:center;gap:10px;padding:0 20px;background:rgba(0,0,0,.28);font-family:'{T["mono"]}',monospace;font-size:20px;color:{T["dim"]}}}
.win-bar i{{width:14px;height:14px;border-radius:50%;background:rgba(255,255,255,.22)}}
.win-bar span{{margin-left:12px}}
.win-in{{position:relative;overflow:hidden}}
.pip{{background:#000;border:4px solid {T["paper"]}}}
.pip-l{{left:0;width:{W}px;display:flex;justify-content:center}}
.pip-l span{{font-size:30px;font-weight:700;color:{T["paperInk"]};background:{T["paper"]};padding:8px 20px 10px;border-radius:12px;box-shadow:0 12px 30px -12px rgba(0,0,0,.6)}}
.timer{{left:390px;top:210px;width:300px;padding:18px 0 22px;border-radius:22px;background:{T["ground"]};border:1.5px solid rgba(255,255,255,.16);text-align:center;box-shadow:0 24px 60px -20px rgba(0,0,0,.6);perspective:400px}}
.tlab{{display:block;font-family:'{T["mono"]}',monospace;font-size:18px;letter-spacing:.2em;color:{T["dim"]};margin-bottom:4px;text-transform:uppercase}}
.tvs{{display:block;height:120px;position:relative}}
.tv{{display:none;font-family:'{T["serif"]}',serif;font-size:118px;font-weight:500;line-height:1;color:{T["ink"]};transform-origin:50% 50%}}
.dropz{{left:110px;top:220px;width:860px;height:300px;background:{T["ground"]};border:3px dashed rgba(243,238,225,.35);display:flex;align-items:center;justify-content:center}}
.file{{display:flex;align-items:center;gap:20px;padding:20px 30px;border-radius:18px;background:{T["paper"]};color:{T["paperInk"]};box-shadow:0 18px 40px -16px rgba(0,0,0,.6)}}
.file i{{width:56px;height:70px;border-radius:8px;background:{T["ground"]}}}
.file b{{display:block;font-size:30px}}
.file em{{display:block;font-style:normal;font-family:'{T["mono"]}',monospace;font-size:20px;opacity:.6}}
.thread{{left:60px;top:200px;width:960px;padding:20px;background:{T["paper"]};display:flex;flex-direction:column;gap:14px}}
.msg{{display:flex;gap:18px;align-items:flex-start;color:{T["paperInk"]};font-size:32px;line-height:1.25}}
.msg i,.av{{flex:none;width:56px;height:56px;border-radius:50%;background:{T["ground"]};color:{T["ink"]};font-style:normal;font-weight:700;font-size:26px;display:flex;align-items:center;justify-content:center}}
.msg b,.reply b{{display:block;font-size:24px;opacity:.6}}
.stack{{left:0;top:200px;width:{W}px;display:flex;flex-direction:column;align-items:center;gap:10px}}
.sk-top{{font-family:'{T["sans"]}',sans-serif;font-weight:850;font-size:130px;letter-spacing:-.04em;line-height:1;text-transform:uppercase;color:{T["ink"]};background:{T["ground"]};padding:10px 30px 16px}}
.sk-bot{{font-family:'{T["serif"]}',serif;font-style:italic;font-weight:500;font-size:110px;line-height:1;color:{T["accent"]};background:{T["ground"]};padding:6px 30px 20px}}
.cta{{left:140px;top:180px;width:800px;text-align:center;font-size:46px;font-weight:800;line-height:1.15;color:#fff;text-shadow:0 0 2px #000,0 2px 0 #000,0 4px 18px rgba(0,0,0,.6)}}
.cin{{left:110px;top:330px;width:860px;height:96px;padding:0 26px;border-radius:48px;background:#fff;color:#111;display:flex;align-items:center;gap:20px;font-size:38px;font-weight:700;box-shadow:0 20px 50px -18px rgba(0,0,0,.6)}}
.cin .av{{width:52px;height:52px}}
.cin-t{{flex:1}}
.send.small{{position:static;margin:0;width:56px;height:56px;font-size:30px}}
.heart{{display:none;font-size:44px;color:#9a9a9a}}
.reply{{left:150px;top:446px;width:820px;padding:18px 24px;border-radius:26px;background:#fff;color:#111;display:flex;gap:16px;align-items:center;font-size:32px;box-shadow:0 20px 50px -18px rgba(0,0,0,.6)}}
.reply .av{{width:48px;height:48px}}
.follow{{left:130px;width:820px;height:110px;padding:0 20px;border-radius:55px;background:#fff;color:#111;display:flex;align-items:center;gap:20px;box-shadow:0 20px 50px -18px rgba(0,0,0,.6)}}
.fw-n{{flex:1}}
.fw-n b{{display:block;font-size:34px}}
.fw-n em{{display:block;font-style:normal;font-size:24px;opacity:.55}}
.fbtn{{padding:16px 30px;border-radius:40px;background:{T["ground"]};color:{T["ink"]};font-size:28px;font-weight:700}}
.fbtn.on{{background:#fff;color:{T["paperInk"]};box-shadow:inset 0 0 0 2px {T["ground"]}}}
.f2{{display:none}}
.cap{{left:0;width:{W}px;height:90px;display:flex;align-items:center;justify-content:center;z-index:20}}
.cap-in{{display:block;font-family:'{T["serif"]}',serif;font-size:{T["captionSize"]}px;font-weight:500;line-height:1.15;color:{T["dim"]};background:{T["captionBg"]};padding:6px 18px 10px;border-radius:8px;white-space:nowrap;box-shadow:0 8px 24px -10px rgba(0,0,0,.5)}}
"""
    page = f"""<!doctype html>
<html lang="en" data-resolution="portrait">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width={W}, height={H}">
<script src="gsap.min.js"></script>
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
    print(f"Wrote {a.out}: {len(beats)} beats, {len(pops)} pop-ups, {len(caps)} captions, {len(sounds)} sounds, {dur:.2f}s")


if __name__ == "__main__":
    main()
