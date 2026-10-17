"""Text for the anchor-overlay render without libass or drawtext: Pillow draws every caption, big word, label and
aside into transparent full-frame PNGs, and ffmpeg overlays them as one image sequence (concat demuxer) with hard
cuts. It works with any ffmpeg, including builds with no freetype at all. Needs Pillow: python3 -m pip install pillow.
"""
from pathlib import Path

import anchorlib as L


def need_pillow():
    try:
        from PIL import Image, ImageDraw, ImageFont  # noqa: F401
    except ImportError:
        raise SystemExit("Text is drawn with Pillow: run `python3 -m pip install pillow`, then render again.")


class Fonts:
    """Fonts sized the way a subtitle renderer does it: `size` is the height of the line box (ascent + descent),
    so the same theme numbers give the same text size as the checker's width estimate."""

    def __init__(self, root):
        self.root = Path(root)
        self._cache = {}

    def get(self, file, size):
        from PIL import ImageFont
        key = (file, round(size, 2))
        if key not in self._cache:
            path = self.root / file
            try:
                probe = ImageFont.truetype(str(path), 200)
            except OSError:
                raise SystemExit(f"Can't open the font {file}: theme.*FontFile must be a TrueType or OpenType file.")
            asc, desc = probe.getmetrics()
            em = size * 200.0 / (asc + desc)
            f = ImageFont.truetype(str(path), max(1, int(round(em))))
            self._cache[key] = (f, f.getmetrics())
        return self._cache[key]


def sprite(fonts, text, file, size, fill, stroke, sw):
    """(RGBA image, origin) for a block of centred lines; origin is the sprite's own centre point."""
    from PIL import Image, ImageDraw
    f, (asc, desc) = fonts.get(file, size)
    lines = str(text).split("\n")
    lh = asc + desc
    widths = [f.getlength(s) for s in lines]
    pad = int(sw) + 4
    w = int(max(widths)) + 2 * pad + 2
    h = lh * len(lines) + 2 * pad
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i, s in enumerate(lines):
        x = pad + 1 + (max(widths) - widths[i]) / 2
        d.text((x, pad + i * lh + asc), s, font=f, fill=fill, stroke_width=int(sw), stroke_fill=stroke, anchor="ls")
    return img, (w / 2.0, h / 2.0), (w, h)


def sprite_bl(fonts, text, file, size, fill, stroke, sw):
    """Same as sprite() but the origin is the bottom-left of the text (the aside on a card's top-left corner)."""
    img, _, (w, h) = sprite(fonts, text, file, size, fill, stroke, sw)
    pad = int(sw) + 4
    return img, (pad + 1, h - pad), (w, h)


def hex_rgba(h):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


def put(canvas, img, x, y):
    """alpha_composite that tolerates a sprite hanging over the frame edge."""
    l, t = max(0, -x), max(0, -y)
    r, b = min(img.width, canvas.width - x), min(img.height, canvas.height - y)
    if r > l and b > t:
        canvas.alpha_composite(img.crop((l, t, r, b)), (x + l, y + t))


def write_sequence(events, duration, fps, root, tmp):
    """events: [{start, end, layer, text, kind, x, y, anchor, size, theme}] -> concat list file for ffmpeg.

    The text layer changes at every frame where an event starts or ends; each stretch between changes is one PNG.
    """
    from PIL import Image
    need_pillow()
    tmp = Path(tmp)
    (tmp / "text").mkdir(exist_ok=True)
    fonts = Fonts(root)
    total = max(1, int(round(float(duration) * fps)))

    for e in events:
        e["f0"] = min(total, max(0, int(round(float(e["start"]) * fps))))
        e["f1"] = min(total, max(0, int(round(float(e["end"]) * fps))))
    events = [e for e in events if e["f1"] > e["f0"]]
    cuts = sorted({0, total} | {e["f0"] for e in events} | {e["f1"] for e in events})

    sprites = {}

    def get_sprite(e):
        key = id(e)
        if key not in sprites:
            t = e["theme"]
            k = e["kind"]
            fill = hex_rgba(t.get(k + "Color", "#FFFFFF"))
            stroke = hex_rgba(t.get(k + "Stroke", "#000000"))
            sw = t.get(k + "StrokeWidth", {"caption": 5, "big": 6, "label": 4, "aside": 3}[k]) if k != "caption" else t["captionStrokeWidth"]
            make = sprite_bl if e["anchor"] == "bl" else sprite
            sprites[key] = make(fonts, e["text"], t[k + "FontFile"], e["size"], fill, stroke, sw)
        return sprites[key]

    blank = tmp / "text" / "blank.png"
    Image.new("RGBA", (L.W, L.H), (0, 0, 0, 0)).save(blank, compress_level=1)
    made = {}
    lines = []
    last = blank
    for a, b in zip(cuts, cuts[1:]):
        active = sorted((e for e in events if e["f0"] <= a and e["f1"] >= b), key=lambda e: e["layer"])
        if not active:
            path = blank
        else:
            key = tuple(id(e) for e in active)
            if key not in made:
                canvas = Image.new("RGBA", (L.W, L.H), (0, 0, 0, 0))
                for e in active:
                    img, (ox, oy), _ = get_sprite(e)
                    put(canvas, img, int(round(e["x"] - ox)), int(round(e["y"] - oy)))
                p = tmp / "text" / f"t{len(made):04d}.png"
                canvas.save(p, compress_level=1)
                made[key] = p
            path = made[key]
        lines.append(f"file '{path.as_posix()}'\nduration {(b - a) / fps:.6f}")
        last = path
    lines.append(f"file '{last.as_posix()}'")
    out = tmp / "text.txt"
    out.write_text("\n".join(lines) + "\n")
    return out
