"""Shared geometry, defaults and filter graphs for the anchor-overlay scripts (render.py, check_plan.py,
check_render.py). Python 3 and ffmpeg; Pillow measures text here when it is installed and draws it in render.py (textlayer.py).

Everything numeric here is a default: `edit.json` -> `theme` and `edit.json` -> `checks` override it, and the user's
request overrides both.
"""
import json, math, re, subprocess
from pathlib import Path

W, H = 1080, 1920
KINDS = ("thumb", "card", "tall")
VIDEO_EXT = (".mp4", ".webm", ".mov", ".m4v", ".mkv")

DEFAULT_THEME = {
    "captionFont": "Inter ExtraBold", "captionFontFile": "fonts/inter.ttf", "captionSize": 64,
    "captionColor": "#FFFFFF", "captionStroke": "#000000", "captionStrokeWidth": 5,
    "captionCase": "asis", "captionY": 1230, "captionMaxWords": 1, "captionMaxChars": 16, "captionMaxWidth": 840,
    "bigFont": "Anton", "bigFontFile": "fonts/anton.ttf", "bigSize": 170, "bigCase": "upper", "bigY": 780,
    "bigMaxWidth": 960,
    "labelFont": "Anton", "labelFontFile": "fonts/anton.ttf", "labelSize": 52, "labelCase": "upper", "labelY": 400,
    "asideFont": "Inter ExtraBold", "asideFontFile": "fonts/inter.ttf", "asideSize": 44, "asideY": 330,
    "overlayBorder": None,
}

DEFAULT_CHECKS = {
    "minCoverage": 0.35, "maxCoverage": 0.55,
    "stillMin": 0.6, "stillMax": 2.5, "clipMax": 4.0, "maxArollOnly": 3.0,
    "maxGap": 1.5, "pictureMedianMin": 0.8, "pictureMedianMax": 1.5, "maxPictureGap": 3.0,
    "sideMargin": 86, "edgeMargin": 120, "maxOverlaysAtOnce": 2, "eyeClear": 40,
    "onWordEarly": 0.10, "onWordLate": 0.05,
    "captionMaxChars": 16, "captionMin": 0.2, "captionMax": 1.2,
    "calmDb": [-24, -20], "driveDb": [-18, -14], "musicToleranceDb": 3.0,
    "uiTop": 220, "uiBottomY": 1540, "uiRightX": 960, "uiRightY": [1100, 1700], "textMinX": 60, "textMaxX": 1020,
    "maxPunchPerMinuteHard": 2, "hardZoom": 1.25,
    "armsStripPx": 60, "armsMaxDiff": 8.0, "spikeMin": 6.0, "loudness": [-16.0, -14.0],
}


def load_plan(path):
    p = Path(path)
    plan = json.loads(p.read_text())
    plan["_root"] = p.resolve().parent
    plan["theme"] = {**DEFAULT_THEME, **(plan.get("theme") or {})}
    plan["checks"] = {**DEFAULT_CHECKS, **(plan.get("checks") or {})}
    plan.setdefault("fps", 30)
    plan.setdefault("punches", [])
    plan.setdefault("overlays", [])
    plan.setdefault("big", [])
    plan.setdefault("labels", [])
    plan.setdefault("asides", [])
    aroll = plan.setdefault("aroll", {})
    aroll.setdefault("origin", [0.5, 0.36])
    aroll.setdefault("eyeY", 720)
    plan["punches"] = sorted(plan["punches"], key=lambda x: x["at"])
    plan["overlays"] = sorted(plan["overlays"], key=lambda x: x["at"])
    return plan


def num(x):
    return f"{float(x):.3f}".rstrip("0").rstrip(".")


def even(x):
    return max(2, int(round(x / 2.0)) * 2)


def is_video(src):
    return str(src).lower().endswith(VIDEO_EXT)


def srcs(o):
    s = o["src"]
    return list(s) if isinstance(s, (list, tuple)) else [s]


_sizes = {}


def media_size(plan, o, i=0):
    """Pixel size of overlay o's i-th source: from its own `size` field, else ffprobe."""
    if o.get("size"):
        sz = o["size"]
        return tuple(sz[i]) if isinstance(sz[0], (list, tuple)) else tuple(sz)
    src = srcs(o)[i]
    path = plan["_root"] / src
    key = str(path)
    if key not in _sizes:
        out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                              "-of", "csv=p=0", key], capture_output=True, text=True).stdout.strip()
        try:
            w, h = (int(x) for x in out.split(",")[:2])
        except ValueError:
            raise SystemExit(f"Can't read the size of {src}: is the file there and ffprobe installed? (or give the overlay a \"size\": [w, h])")
        _sizes[key] = (w, h)
    return _sizes[key]


def fit(w, h, bw, bh):
    s = min(bw / w, bh / h)
    return even(w * s), even(h * s)


def overlay_rects(plan, o):
    """The pixel rectangles (x, y, w, h) an overlay occupies, one per source."""
    c = plan["checks"]
    kind = o.get("kind", "card")
    box = o.get("box")
    if kind == "thumb":
        maxh = min(400, plan["aroll"]["eyeY"] - c["eyeClear"] - 230)
        n = len(srcs(o))
        bw, bh, gap = (860, maxh, 0) if n == 1 else ((860 - 24) // 2, maxh, 24)
        if box:
            bw, bh = box[2], box[3]
        sizes = [fit(*media_size(plan, o, i), bw, bh) for i in range(n)]
        total = sum(s[0] for s in sizes) + gap * (n - 1)
        x = (W - total) // 2 if not box else box[0]
        y = 230 if not box else box[1]
        out = []
        for sw, sh in sizes:
            out.append((x, y, sw, sh))
            x += sw + gap
        return out
    if kind == "tall":
        bx, by, bw, bh = box or (108, 120, 864, 1680)
    else:
        bx, by, bw, bh = box or (108, 290, 864, 1300)
    sw, sh = fit(*media_size(plan, o, 0), bw, bh)
    return [(bx + (bw - sw) // 2, by + (bh - sh) // 2, sw, sh)]


def overlay_span(o, plan):
    return float(o["at"]), float(o["end"])


# ---------- text measurement ----------

class Measurer:
    """Width of a text in the theme font. Uses Pillow when it can open the font, else a character estimate."""

    def __init__(self, plan):
        self.root = plan["_root"]
        self._fonts = {}
        try:
            from PIL import ImageFont  # noqa: F401
            self.pil = True
        except ImportError:
            self.pil = False

    def _font(self, file, size):
        from PIL import ImageFont
        key = (file, size)
        if key not in self._fonts:
            try:
                f = ImageFont.truetype(str(self.root / file), 200)
            except OSError:
                f = None
            self._fonts[key] = f
        return self._fonts[key]

    def width(self, text, file, size, stroke=0):
        """`size` is the height of the line box (as in subtitle files), so scale the em to match it."""
        if self.pil:
            f = self._font(file, size)
            if f is not None:
                asc, desc = f.getmetrics()
                em = size * 200.0 / (asc + desc)
                return f.getlength(text) * em / 200.0 + 2 * stroke
        return len(text) * size * 0.56 + 2 * stroke


def style_text(theme, kind, text):
    case = theme.get(kind + "Case", "asis")
    return text.upper() if case == "upper" else text.lower() if case == "lower" else text


def text_rect(plan, m, kind, text, center_x=W / 2, size=None, width_cap=None):
    t = plan["theme"]
    size = size or t[kind + "Size"]
    stroke = t.get(kind + "StrokeWidth", 5 if kind != "caption" else t["captionStrokeWidth"])
    txt = style_text(t, kind, text)
    w = m.width(txt, t[kind + "FontFile"], size, stroke)
    if width_cap and w > width_cap:
        size = size * width_cap / w
        w = width_cap
    y = t[kind + "Y"]
    return (center_x - w / 2, y - size / 2, w, size), size


def rects_hit(a, b, pad=0):
    return not (a[0] + a[2] <= b[0] - pad or b[0] + b[2] <= a[0] - pad or a[1] + a[3] <= b[1] - pad or b[1] + b[3] <= a[1] - pad)


# ---------- time helpers ----------

def zoom_spans(plan):
    """[(start, end, zoom)] for every stretch where the A-roll is punched in (zoom > 1)."""
    ps = plan["punches"]
    out = []
    for i, p in enumerate(ps):
        end = float(ps[i + 1]["at"]) if i + 1 < len(ps) else float(plan["duration"])
        if float(p["zoom"]) > 1.0001:
            out.append((float(p["at"]), end, float(p["zoom"])))
    return out


def picture_events(plan):
    """Times where the picture changes (overlay in/out, punch, big word, label), as (time, kind, ref)."""
    ev = []
    for o in plan["overlays"]:
        ev.append((float(o["at"]), "overlay-in", o))
        ev.append((float(o["end"]), "overlay-out", o))
    for p in plan["punches"]:
        if float(p["at"]) > 0.05:
            ev.append((float(p["at"]), "punch", p))
    for b in plan["big"]:
        ev.append((float(b["at"]), "big-in", b))
        ev.append((float(b["end"]), "big-out", b))
    for l in plan["labels"]:
        ev.append((float(l["at"]), "label-in", l))
        ev.append((float(l["end"]), "label-out", l))
    d = float(plan["duration"])
    return [e for e in sorted(ev, key=lambda e: e[0]) if 0 < e[0] < d - 0.05]


def gaps(times, duration):
    ts = sorted(set([0.0] + [round(t, 3) for t in times] + [round(float(duration), 3)]))
    return [b - a for a, b in zip(ts, ts[1:])]


def median(xs):
    xs = sorted(xs)
    n = len(xs)
    if not n:
        return 0.0
    return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2


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


def norm_word(t):
    return re.sub(r"[^\w']", "", t).lower()


def load_captions(path):
    return json.loads(Path(path).read_text())


# ---------- sample window ----------

def window(plan, caps, a, b):
    """The plan and captions restricted to [a, b] seconds and shifted to start at 0."""
    import copy
    p = copy.deepcopy(plan)
    p["duration"] = b - a

    def clip(items, key_at="at", key_end="end", keep_start=False):
        out = []
        for it in items:
            s, e = float(it[key_at]), float(it[key_end])
            if e <= a or s >= b:
                continue
            n = dict(it)
            if keep_start and is_video(srcs(n)[0]) and s < a:
                n["start"] = float(n.get("start", 0)) + (a - s)
            n[key_at], n[key_end] = round(max(s, a) - a, 4), round(min(e, b) - a, 4)
            out.append(n)
        return out

    p["overlays"] = clip(plan["overlays"], keep_start=True)
    p["big"] = clip(plan["big"])
    p["labels"] = clip(plan["labels"])
    p["asides"] = clip(plan["asides"])
    zs, cur = [], 1.0
    for q in plan["punches"]:
        if float(q["at"]) <= a:
            cur = float(q["zoom"])
        elif float(q["at"]) < b:
            zs.append({**q, "at": round(float(q["at"]) - a, 4)})
    p["punches"] = ([{"at": 0.0, "zoom": cur}] if cur > 1.0001 else []) + zs
    m = p.get("music")
    if isinstance(m, dict):
        m = dict(m)
        m["turnAt"] = float(m["turnAt"]) - a
        m["offset"] = float(m.get("offset", 0)) + a
        p["music"] = m
    p["aroll"] = {**plan["aroll"], "offset": float(plan["aroll"].get("offset", 0)) + a}
    c2 = None
    if caps is not None:
        c2 = []
        for c in caps:
            if c["end"] <= a or c["start"] >= b:
                continue
            n = dict(c)
            n["start"], n["end"] = round(max(c["start"], a) - a, 4), round(min(c["end"], b) - a, 4)
            n["words"] = [{**w, "start": round(max(w["start"], a) - a, 4)} for w in c.get("words", [])]
            c2.append(n)
    return p, c2


# ---------- ffmpeg graphs ----------

def aroll_input_args(plan):
    a = plan["aroll"]
    off = float(a.get("offset", 0))
    args = []
    if off:
        args += ["-ss", num(off)]
    args += ["-t", num(plan["duration"]), "-i", str(plan["_root"] / a["src"])]
    return args


def aroll_graph(plan, label="aroll", src_label="0:v", fps=None):
    """Filters that turn input 0 into the 1080x1920 anchor with punch-ins, ending in [label]."""
    fps = fps or plan["fps"]
    ox, oy = plan["aroll"]["origin"]
    spans = zoom_spans(plan)
    zooms = sorted(set(z for _, _, z in spans))
    f = [f"[{src_label}]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1,fps={fps},format=yuv420p"
         + (f",split={len(zooms) + 1}[base]" + "".join(f"[z{i}]" for i in range(len(zooms))) if zooms else f"[{label}]")]
    if not zooms:
        return f
    cur = "base"
    for i, z in enumerate(zooms):
        zw, zh = int(math.ceil(W * z / 2) * 2), int(math.ceil(H * z / 2) * 2)
        x, y = int((zw - W) * ox), int((zh - H) * oy)
        f.append(f"[z{i}]scale={zw}:{zh},crop={W}:{H}:{x}:{y}[zz{i}]")
        en = "+".join(f"between(t,{num(s)},{num(e)})" for s, e, zz in spans if zz == z)
        out = label if i == len(zooms) - 1 else f"zc{i}"
        f.append(f"[{cur}][zz{i}]overlay=0:0:enable='{en}'[{out}]")
        cur = out
    return f


def music_active(plan):
    m = plan.get("music")
    return isinstance(m, dict) and bool(m.get("src"))


_lufs_cache = {}


def lufs(path, start=None, end=None):
    """Integrated loudness (LUFS) of a stretch of an audio or video file, or None if it's too short or silent."""
    key = (str(path), start, end)
    if key in _lufs_cache:
        return _lufs_cache[key]
    cmd = ["ffmpeg", "-hide_banner", "-nostats", "-v", "info"]
    if start:
        cmd += ["-ss", num(start)]
    if end is not None:
        cmd += ["-t", num(end - (start or 0))]
    cmd += ["-i", str(path), "-vn", "-af", "ebur128=framelog=quiet", "-f", "null", "-"]
    err = subprocess.run(cmd, capture_output=True, text=True).stderr
    vals = re.findall(r"\n\s*I:\s+(-?[\d.]+|-inf)\s+LUFS", err)
    v = None
    if vals and vals[-1] != "-inf":
        v = float(vals[-1])
        v = None if v < -69 else v
    _lufs_cache[key] = v
    return v


def music_windows(plan):
    m = plan["music"]
    turn, d = float(m["turnAt"]), float(plan["duration"])
    calm = (max(0.0, turn - 8), max(0.6, turn - 0.3))
    drive = (turn + 0.3, min(d - 1.3, turn + 8))
    return calm, drive


def music_gains(plan):
    """dB to add to the music so it sits calmDb under the voice before turnAt and driveDb under it after.

    Each part of the music is measured on its own (the driving part is intrinsically louder than the calm one) and
    the voice is measured over the same reel, so the result doesn't depend on how loud either file happens to be.
    """
    m = plan["music"]
    off = float(m.get("offset", 0))
    d = float(plan["duration"])
    a0 = float(plan["aroll"].get("offset", 0))
    voice = lufs(plan["_root"] / plan["aroll"]["src"], a0, a0 + d)
    voice = (-15.0 if voice is None else voice) + float(plan["aroll"].get("gainDb", 0))
    (c0, c1), (d0, d1) = music_windows(plan)
    mc = lufs(plan["_root"] / m["src"], off + c0, off + c1)
    md = lufs(plan["_root"] / m["src"], off + d0, off + d1) if d1 - d0 > 0.5 else None
    mc = mc if mc is not None else md if md is not None else -20.0
    md = md if md is not None else mc
    calm, drive = float(m.get("calmDb", -22)), float(m.get("driveDb", -16))
    return voice + calm - mc, voice + drive - md


def audio_graph(plan, music_index=None, voice_label="voice", music_label="music"):
    """Voice and gained music as separate labelled streams; the caller mixes (or measures) them."""
    gain = float(plan["aroll"].get("gainDb", 0))
    f = [f"[0:a]aresample=48000,asetpts=PTS-STARTPTS" + (f",volume={gain:.2f}dB" if gain else "") + f"[{voice_label}]"]
    if music_active(plan) and music_index is not None:
        m = plan["music"]
        gc, gd = music_gains(plan)
        turn = float(m["turnAt"])
        d = float(plan["duration"])
        fade = min(1.2, d / 4)
        f.append(
            f"[{music_index}:a]aresample=48000,"
            f"volume='if(lt(t,{num(turn)}),{10 ** (gc / 20):.5f},{10 ** (gd / 20):.5f})':eval=frame,"
            f"afade=t=out:st={num(max(0, d - fade))}:d={num(fade)},atrim=0:{num(d)},asetpts=PTS-STARTPTS[{music_label}]"
        )
    return f


def music_input_args(plan):
    m = plan.get("music")
    if not music_active(plan):
        return []
    args = []
    off = float(m.get("offset", 0))
    if off:
        args += ["-ss", num(off)]
    args += ["-i", str(plan["_root"] / m["src"])]
    return args
