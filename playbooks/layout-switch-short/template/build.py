#!/usr/bin/env python3
"""Build index.html (a Hyperframes composition) from edit.json and captions.json.

edit.json lists the beats of the edited talking-head video. Each beat picks one layout:

  speaker   the speaker fills the frame ("zoom": 1.0 wide, about 1.2 for a punch-in)
  split     a visual on top (0-960), the speaker below (960-1920)
  visual    a visual fills the frame, the speaker is cut out and stands at the bottom ("cutout": transparent webm)
  roadmap   split, with the step list on top; "step": n highlights step n, "step": 0 shows them all
  title     split, with the big hook title on top (static from the first frame)
  words     split, with one to three big words on top that land one by one

Run `python3 build.py` (defaults: edit.json, captions.json, index.html in this folder), then
`npx hyperframes check`, `npx hyperframes snapshot --at ...` and `npx hyperframes render`.
"""
import argparse, html, json
from pathlib import Path

W, H, SEAM = 1080, 1920, 960
DEFAULT_THEME = {
    "base": "#11143A",
    "blobs": ["#3B44D6", "#7E36D9", "#1484B8"],
    "title": "#FFFFFF",
    "accent": "#FFD84D",
    "text": "#FFFFFF",
    "panelBg": "#0F1020",
    "captionBg": "rgba(12,12,16,0.62)",
    "captionText": "#FFFFFF",
    "font": "Geist",
    "fontFile": "assets/fonts/geist-latin-wght-normal.woff2",
}
# Caption centre line per layout, in px from the top.
CAPTION_Y = {"split": SEAM, "roadmap": SEAM, "title": SEAM, "words": SEAM, "speaker": 1215, "visual": 1130}


def esc(s):
    return html.escape(str(s), quote=True)


def num(x):
    return f"{float(x):.3f}".rstrip("0").rstrip(".")


def media_tag(tag_id, src, start, dur, media_start=0, fit="cover", pos="50% 50%", extra=""):
    style = f"object-fit:{fit};object-position:{pos}"
    if src.lower().endswith((".mp4", ".webm", ".mov", ".m4v")):
        return (f'<video id="{tag_id}" class="clip media" src="{esc(src)}" data-start="{num(start)}" data-duration="{num(dur)}" '
                f'data-media-start="{num(media_start)}" data-track-index="2" muted playsinline style="{style}"{extra}></video>')
    return (f'<img id="{tag_id}" class="clip media" src="{esc(src)}" data-start="{num(start)}" data-duration="{num(dur)}" '
            f'data-track-index="2" alt="" style="{style}">')


def main():
    here = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--edit", default=str(here / "edit.json"))
    ap.add_argument("--captions", default=str(here / "captions.json"))
    ap.add_argument("--out", default=str(here / "index.html"))
    a = ap.parse_args()

    e = json.loads(Path(a.edit).read_text())
    theme = {**DEFAULT_THEME, **e.get("theme", {})}
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
    speaker_y = e.get("speakerY", 28)

    body, js = [], []
    # Shared layers: animated gradient (top panel), roadmap list, speaker video, narration.
    body.append('<div id="grad" class="layer panel-area" data-layout-allow-overflow><div class="blob" id="blob1"></div><div class="blob" id="blob2"></div><div class="blob" id="blob3"></div></div>')
    rm = "".join(
        f'<div class="step" id="step-{i + 1}"><span class="step-n">Step {i + 1}</span><span class="step-t">{esc(t)}</span></div>'
        for i, t in enumerate(steps)
    )
    body.append(f'<div id="roadmap" class="layer panel-area">{rm}</div>')
    body.append(
        f'<div id="spk" class="layer" data-layout-allow-overflow><div id="spk-zoom"><video id="spk-v" class="clip" src="{esc(e["speaker"])}" data-start="0" '
        f'data-duration="{num(dur)}" data-track-index="0" muted playsinline></video></div></div>'
    )
    body.append(f'<audio id="narration" class="clip" src="{esc(e["narration"])}" data-start="0" data-duration="{num(dur)}" data-track-index="10" data-volume="{e.get("narrationVolume", 1)}"></audio>')
    if e.get("music"):
        m = e["music"]
        body.append(f'<audio id="music" class="clip" src="{esc(m["src"])}" data-start="0" data-duration="{num(dur)}" data-track-index="11" data-volume="{m.get("volume", 0.12)}"></audio>')

    # Slow deterministic drift of the gradient blobs for the whole video.
    js.append(f"tl.fromTo('#blob1',{{xPercent:-12,yPercent:-8}},{{xPercent:14,yPercent:10,duration:{num(dur)},ease:'sine.inOut'}},0);")
    js.append(f"tl.fromTo('#blob2',{{xPercent:10,yPercent:6}},{{xPercent:-16,yPercent:-10,duration:{num(dur)},ease:'sine.inOut'}},0);")
    js.append(f"tl.fromTo('#blob3',{{xPercent:-6,yPercent:12}},{{xPercent:8,yPercent:-12,duration:{num(dur)},ease:'sine.inOut'}},0);")

    for b in beats:
        s, t, lay, bid = float(b["start"]), float(b["end"]), b["layout"], b["id"]
        d = t - s
        split = lay in ("split", "roadmap", "title", "words")
        # Speaker geometry for this beat (hard cut at the beat start).
        if lay == "visual":
            js.append(f"tl.set('#spk',{{opacity:0}},{num(s)});")
        elif split:
            js.append(f"tl.set('#spk',{{opacity:1,top:{SEAM},height:{H - SEAM}}},{num(s)});")
            js.append(f"tl.set('#spk-v',{{objectPosition:'50% {b.get('speakerY', speaker_y)}%'}},{num(s)});")
            js.append(f"tl.set('#spk-zoom',{{scale:{b.get('zoom', 1)}}},{num(s)});")
        else:
            js.append(f"tl.set('#spk',{{opacity:1,top:0,height:{H}}},{num(s)});")
            js.append(f"tl.set('#spk-v',{{objectPosition:'50% 50%'}},{num(s)});")
            js.append(f"tl.set('#spk-zoom',{{scale:{b.get('zoom', 1)},transformOrigin:'{b.get('origin', '50% 30%')}'}},{num(s)});")
        js.append(f"tl.set('#grad',{{opacity:{1 if lay in ('roadmap', 'title', 'words') else 0}}},{num(s)});")
        js.append(f"tl.set('#roadmap',{{opacity:{1 if lay == 'roadmap' else 0}}},{num(s)});")

        v = b.get("visual")
        if v and lay in ("split", "visual"):
            area = "panel-area" if lay == "split" else "full-area"
            bg = v.get("bg", theme["panelBg"])
            inner = ""
            if v.get("backdrop"):
                # Blurred, darkened copy of the visual behind a contained one, so landscape media fills a portrait frame.
                inner += media_tag(f"bd-{bid}", v["src"], s, d, v.get("mediaStart", 0), "cover", "50% 50%").replace(
                    'class="clip media"', 'class="clip media backdrop"')
            m = media_tag(f"m-{bid}", v["src"], s, d, v.get("mediaStart", 0), v.get("fit", "cover"), v.get("pos", "50% 50%"))
            if v.get("box"):
                x, y, bw, bh = v["box"]
                m = m.replace('style="', f'style="left:{x}px;top:{y}px;width:{bw}px;height:{bh}px;', 1).replace(
                    'class="clip media"', 'class="clip media boxed"')
            inner += m
            body.append(f'<div id="w-{bid}" class="vis {area}" data-layout-allow-overflow style="background:{esc(bg)}">{inner}</div>')
            js.append(f"tl.set('#w-{bid}',{{opacity:1}},{num(s)});tl.set('#w-{bid}',{{opacity:0}},{num(t)});")
            motion = v.get("motion", "push" if not v["src"].lower().endswith((".mp4", ".webm", ".mov")) else "none")
            if motion == "push":
                js.append(f"tl.fromTo('#m-{bid}',{{scale:1}},{{scale:1.06,duration:{num(d)},ease:'none'}},{num(s)});")
            elif motion == "scroll":
                js.append(f"tl.fromTo('#m-{bid}',{{objectPosition:'50% 0%'}},{{objectPosition:'50% 100%',duration:{num(d)},ease:'sine.inOut'}},{num(s)});")
        if lay == "visual":
            if not b.get("cutout"):
                raise SystemExit(f"Beat {bid}: the visual layout needs a cutout (transparent webm of the speaker for this beat)")
            sc = b.get("cutoutScale", 0.62)
            cw, ch = round(W * sc), round(H * sc)
            top = b.get("cutoutTop", 900)
            body.append(
                f'<div id="c-{bid}" class="cut" style="left:{(W - cw) // 2}px;top:{top}px;width:{cw}px;height:{ch}px">'
                f'<video id="cv-{bid}" class="clip" src="{esc(b["cutout"])}" data-start="{num(s)}" data-duration="{num(d)}" '
                f'data-media-start="0" data-track-index="3" muted playsinline></video></div>'
            )
            js.append(f"tl.set('#c-{bid}',{{opacity:1}},{num(s)});tl.set('#c-{bid}',{{opacity:0}},{num(t)});")
        if lay == "roadmap":
            cur = int(b.get("step", 0))
            for i in range(1, len(steps) + 1):
                on = cur == 0 or i == cur
                js.append(
                    f"tl.fromTo('#step-{i}',{{opacity:0,filter:'blur(14px)'}},{{opacity:{1 if on else 0.42},filter:'blur({0 if on else 5}px)',"
                    f"duration:.32,ease:'power2.out'}},{num(s + 0.05 * (i - 1))});"
                )
                js.append(f"tl.set('#step-{i}',{{attr:{{class:'step{' current' if (on and cur) else ''}'}}}},{num(s)});")
        if lay == "title":
            lines = "".join(f'<span class="t-line">{esc(x)}</span>' for x in b.get("lines", []))
            sub = f'<span class="t-sub">{esc(b["sub"])}</span>' if b.get("sub") else ""
            body.append(f'<div id="t-{bid}" class="clip title panel-area" data-start="{num(s)}" data-duration="{num(d)}" data-track-index="4"><div class="t-in">{lines}{sub}</div></div>')
        if lay == "words":
            ws = b.get("words", [])
            ats = b.get("at") or [s + 0.12 + i * min(0.5, d / max(1, len(ws)) * 0.6) for i in range(len(ws))]
            spans = "".join(f'<span class="w{" accent" if i == len(ws) - 1 else ""}" id="wd-{bid}-{i}">{esc(x)}</span>' for i, x in enumerate(ws))
            body.append(f'<div id="t-{bid}" class="clip words panel-area" data-start="{num(s)}" data-duration="{num(d)}" data-track-index="4"><div class="w-in">{spans}</div></div>')
            for i, at in enumerate(ats):
                js.append(f"tl.fromTo('#wd-{bid}-{i}',{{opacity:0,scale:.86,y:30}},{{opacity:1,scale:1,y:0,duration:.22,ease:'back.out(2)'}},{num(at)});")

    def layout_at(time):
        cur = beats[0]["layout"]
        for b in beats:
            if b["start"] <= time + 1e-6:
                cur = b["layout"]
        return cur

    for i, c in enumerate(caps):
        s, t = float(c["start"]), float(c["end"])
        y = CAPTION_Y[layout_at((s + t) / 2)]
        body.append(
            f'<div id="cap-{i}" class="clip cap" data-start="{num(s)}" data-duration="{num(t - s - 0.002)}" data-track-index="5" '
            f'style="top:{y - 40}px"><span>{esc(c["text"])}</span></div>'
        )

    blob = theme["blobs"]
    css = f"""
@font-face{{font-family:'{theme["font"]}';src:url('{theme["fontFile"]}') format('woff2');font-weight:100 900;font-style:normal}}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:{W}px;height:{H}px;overflow:hidden;background:#000}}
#root{{position:relative;width:100%;height:100%;overflow:hidden;background:{theme["base"]};font-family:'{theme["font"]}',sans-serif}}
.layer,.vis,.cut,.clip{{position:absolute}}
.panel-area{{left:0;top:0;width:{W}px;height:{SEAM}px;overflow:hidden}}
.full-area{{left:0;top:0;width:{W}px;height:{H}px;overflow:hidden}}
.vis{{opacity:0}} .cut{{opacity:0;filter:drop-shadow(0 24px 40px rgba(0,0,0,.35))}}
.media,.cut video{{width:100%;height:100%;left:0;top:0}}
.cut video{{object-fit:contain;object-position:50% 0%}}
.media.backdrop{{filter:blur(40px) brightness(.55);transform:scale(1.15)}}
.media.boxed{{border-radius:28px;box-shadow:0 30px 80px rgba(0,0,0,.45)}}
#grad{{background:{theme["base"]};opacity:0}} #roadmap{{opacity:0}}
.blob{{position:absolute;width:900px;height:900px;border-radius:50%;filter:blur(120px);opacity:.85}}
#blob1{{left:-260px;top:-260px;background:{blob[0]}}}
#blob2{{left:420px;top:-120px;background:{blob[1]}}}
#blob3{{left:60px;top:420px;background:{blob[2]}}}
#spk{{left:0;top:0;width:{W}px;height:{H}px;overflow:hidden}}
#spk-zoom{{position:absolute;inset:0}}
#spk-v{{width:100%;height:100%;object-fit:cover;object-position:50% 50%}}
#roadmap{{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:40px 120px 80px}}
.step{{display:flex;flex-direction:column;align-items:center;text-align:center;padding:14px 34px;border-radius:22px;border:2px solid transparent;color:{theme["text"]};width:100%;opacity:0;filter:blur(14px)}}
.step.current{{border-color:rgba(255,255,255,.75);background:rgba(255,255,255,.10)}}
.step-n{{font-size:30px;font-weight:700;opacity:.85}}
.step-t{{font-size:40px;font-weight:700;line-height:1.15;letter-spacing:-.5px}}
.step,.w,.t-line{{text-shadow:0 2px 12px rgba(0,0,0,.35)}}
.title{{display:flex;align-items:center;justify-content:center;text-align:center;padding:0 70px 60px}}
.t-in{{display:flex;flex-direction:column;align-items:center;gap:4px}}
.t-line{{display:block;font-size:84px;font-weight:900;line-height:1.02;letter-spacing:-1px;text-transform:uppercase;color:{theme["title"]};text-shadow:0 6px 0 rgba(0,0,0,.25),0 10px 30px rgba(0,0,0,.3)}}
.t-sub{{display:block;margin-top:22px;font-size:38px;font-weight:700;color:{theme["accent"]}}}
.words{{display:flex;align-items:center;justify-content:center}}
.w-in{{display:flex;flex-direction:column;align-items:center;gap:10px}}
.w{{display:block;font-size:120px;font-weight:900;letter-spacing:-3px;line-height:1;color:{theme["title"]}}}
.w.accent{{color:{theme["accent"]}}}
.cap{{left:0;width:{W}px;height:80px;display:flex;align-items:center;justify-content:center;z-index:20}}
.cap span{{display:block;font-size:44px;font-weight:650;letter-spacing:-.4px;color:{theme["captionText"]};background:{theme["captionBg"]};padding:8px 20px 10px;border-radius:14px;white-space:nowrap;text-shadow:0 2px 6px rgba(0,0,0,.35)}}
#grad{{z-index:1}} #roadmap{{z-index:3}} .vis{{z-index:2}} .title,.words{{z-index:4}} #spk{{z-index:5}} .cut{{z-index:6}}
.vis.full-area{{z-index:2}}
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
