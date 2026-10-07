"""Small helpers so scenes stay short and look the same everywhere.

Eq() gives real LaTeX (MathTex) when LaTeX is installed and a plain-text version otherwise, so a project
renders on any machine. morph() picks the matching transform that works for whichever one you got.
"""
import re
import shutil
from functools import lru_cache

from manim import (
    DOWN, LEFT, RIGHT, UP, Circumscribe, Create, FadeIn, FadeOut, Indicate, Line, MarkupText, MathTex,
    ReplacementTransform, SurroundingRectangle, Text, TransformMatchingShapes, TransformMatchingTex,
    VGroup, Dot, Write,
)

import palette as P


@lru_cache(maxsize=None)
def has_latex():
    return shutil.which("latex") is not None and shutil.which("dvisvgm") is not None


_SUPER = str.maketrans("0123456789+-=()n", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿ")
_SUB = str.maketrans("0123456789+-=()", "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎")
_SYMBOLS = {
    r"\cdots": "⋯", r"\ldots": "…", r"\cdot": "·", r"\times": "×", r"\div": "÷", r"\pm": "±",
    r"\le": "≤", r"\ge": "≥", r"\ne": "≠", r"\approx": "≈", r"\infty": "∞", r"\to": "→",
    r"\pi": "π", r"\theta": "θ", r"\alpha": "α", r"\beta": "β", r"\Delta": "Δ", r"\sum": "Σ",
    r"\sqrt": "√", r"\quad": "  ", r"\,": " ", r"\!": "",
}


def tex_to_plain(tex):
    """Best-effort LaTeX -> Unicode for simple expressions. Pass plain= yourself for anything fancy."""
    s = tex
    s = re.sub(r"\\frac\{([^{}]*)\}\{([^{}]*)\}", r"\1/\2", s)
    for k in sorted(_SYMBOLS, key=len, reverse=True):
        s = s.replace(k, _SYMBOLS[k])
    s = re.sub(r"\^\{([^{}]*)\}", lambda m: m.group(1).translate(_SUPER), s)
    s = re.sub(r"\^(.)", lambda m: m.group(1).translate(_SUPER), s)
    s = re.sub(r"_\{([^{}]*)\}", lambda m: m.group(1).translate(_SUB), s)
    s = re.sub(r"_(.)", lambda m: m.group(1).translate(_SUB), s)
    s = s.replace("{", "").replace("}", "").replace("-", "−")
    s = re.sub(r"\s*([=+−×·<>≤≥≈])\s*", r" \1 ", s)
    return re.sub(r"\s+", " ", s).strip()


def Eq(*tex, plain=None, size=P.MATH, color=P.INK, italic="", **kw):
    """An equation. Several tex strings make separate parts (for TransformMatchingTex and colouring).

    Without LaTeX it becomes Text in the math font; `italic` lists single-letter variables to slant.
    """
    if has_latex():
        return MathTex(*tex, font_size=size, color=color, **kw)
    s = plain if plain is not None else tex_to_plain(" ".join(tex))
    if not italic:
        return Text(s, font=P.math_font(), font_size=size * 0.9, color=color)
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    for v in italic.split():
        s = re.sub(rf"(?<![A-Za-z]){re.escape(v)}(?![A-Za-z])", f"<i>{v}</i>", s)
    return MarkupText(s, font=P.math_font(), font_size=size * 0.9, color=color)


def Words(s, size=P.BODY, color=P.INK, **kw):
    return Text(s, font=P.text_font(), font_size=size, color=color, **kw)


def Title(s, color=P.INK):
    """Section title, top left, with a short underline. Use for chapter cards only."""
    t = Words(s, size=P.TITLE, color=color).to_corner(UP + LEFT, buff=0.6)
    start = t.get_corner(DOWN + LEFT) + DOWN * 0.15
    rule = Line(start, start + RIGHT * t.width * 0.5, stroke_width=3, color=P.YELLOW)
    return VGroup(t, rule)


def morph(a, b, **kw):
    """Transform a into b, keeping the parts that match. Works for MathTex and the Text fallback."""
    if isinstance(a, MathTex) and isinstance(b, MathTex):
        return TransformMatchingTex(a, b, **kw)
    return TransformMatchingShapes(a, b, **kw)


def box(mob, color=P.YELLOW, buff=0.15):
    """A highlight frame around the thing being talked about. Animate with Create(box(...))."""
    return SurroundingRectangle(mob, color=color, buff=buff, corner_radius=0.06, stroke_width=3)


def look_here(mob, color=P.YELLOW):
    """Short attention pulse. Use once per idea, not on everything."""
    return Indicate(mob, color=color, scale_factor=1.08)


def circle_it(mob, color=P.YELLOW):
    return Circumscribe(mob, color=color, fade_out=True)


def dim(*mobs, opacity=0.35):
    """Push earlier steps back so the new one reads. Returns animations to pass to play()."""
    return [m.animate.set_opacity(opacity) for m in mobs]


def tick_labels(axis, values, size=P.SMALL, color=P.DIM, side=DOWN, buff=0.25):
    """Number labels for a NumberLine or one axis of Axes (ax.x_axis). include_numbers=True needs LaTeX."""
    return VGroup(*[Words(f"{v:g}", size=size, color=color).next_to(axis.n2p(v), side, buff=buff) for v in values])


def number(value, fmt="{:.2f}", size=P.MATH, color=P.INK):
    """A number as text. For a live value: always_redraw(lambda: number(t.get_value()).move_to(...))."""
    if has_latex():
        from manim import DecimalNumber
        m = re.search(r"\.(\d+)f", fmt)
        return DecimalNumber(value, num_decimal_places=int(m.group(1)) if m else 0, font_size=size, color=color)
    return Text(fmt.format(value), font=P.math_font(), font_size=size * 0.9, color=color)


def dots_row(n, spacing=0.6, radius=0.14, color=P.BLUE):
    return VGroup(*[Dot(radius=radius, color=color) for _ in range(n)]).arrange(buff=spacing - 2 * radius)


__all__ = [
    "has_latex", "tex_to_plain", "Eq", "Words", "Title", "morph", "box", "look_here", "circle_it", "dim",
    "tick_labels", "number", "dots_row", "Create", "FadeIn", "FadeOut", "Write", "ReplacementTransform",
]
