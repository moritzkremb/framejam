"""Storyboard panels: one still per planned scene, drawn with the same code the scenes will use.

    manim -qm -s -a storyboard.py        # one PNG per panel in build/media/images/storyboard/
    python scripts/panels.py             # copies them to storyboard/01-Pattern.png, ... for FrameJam

Name panels Panel01_<SceneId>, Panel02_<SceneId>, ... so they sort in order.
"""
from manim import DOWN, LEFT, RIGHT, UP, Dot, Scene, Square, VGroup

import palette as P
from helpers import Eq, Words, box


class Panel01_Pattern(Scene):
    def construct(self):
        rows = VGroup(*[Eq(s, plain=p) for s, p in [
            ("1 = 1^2", "1 = 1²"), ("1 + 3 = 2^2", "1 + 3 = 2²"),
            ("1 + 3 + 5 = 3^2", "1 + 3 + 5 = 3²"), ("1 + 3 + 5 + 7 = 4^2", "1 + 3 + 5 + 7 = 4²")]])
        rows.arrange(DOWN, buff=0.5, aligned_edge=RIGHT)
        why = Words("why?", size=P.TITLE, color=P.YELLOW).next_to(rows, RIGHT, buff=1.0)
        self.add(rows, why)


class Panel02_Proof(Scene):
    def construct(self):
        s, o = 1.0, LEFT * 5.3 + DOWN * 1.9
        colors = [P.BLUE, P.TEAL, P.GREEN, P.GOLD]
        dots = VGroup(*[Dot(o + RIGHT * c * s + UP * r * s, radius=0.17, color=colors[max(c, r)])
                        for c in range(4) for r in range(4)])
        frame = Square(4 * s, color=P.DIM, stroke_width=2).move_to(o + (RIGHT + UP) * 1.5 * s)
        eq = Eq(r"1 + 3 + 5 + \cdots + (2n - 1) = n^2", plain="1 + 3 + 5 + ⋯ + (2n − 1) = n²", italic="n")
        eq.scale_to_fit_width(min(eq.width, 7.4)).move_to(RIGHT * 2.6 + DOWN * 0.4)
        self.add(dots, frame, eq, box(eq))
