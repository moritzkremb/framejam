"""Example video: why the odd numbers add up to squares. Replace these scenes with your own.

One Scene class per scene in script.json, same names, same order. Render a draft of one scene with
    manim -ql scenes.py Proof
and the whole video with
    python scripts/render_all.py
"""
from manim import (
    DOWN, LEFT, RIGHT, UP, Create, Dot, FadeIn, FadeOut, LaggedStart, Square, VGroup, Write, smooth,
)

import palette as P
from helpers import Eq, Words, box, dim, look_here, morph
from narration import NarratedScene


class Pattern(NarratedScene):
    tail = 0.2

    def construct(self):
        sums = ["1", "1 + 3", "1 + 3 + 5", "1 + 3 + 5 + 7"]
        totals = ["1", "4", "9", "16"]
        squares = ["1^2", "2^2", "3^2", "4^2"]

        rows = VGroup()
        for i, (s, t) in enumerate(zip(sums, totals)):
            lhs = Eq(s)
            eq = Eq("=")
            tot = Eq(t, color=P.YELLOW)
            eq.move_to(RIGHT * 1.5 + UP * (1.95 - i * 1.3))
            lhs.next_to(eq, LEFT, buff=0.35)
            tot.next_to(eq, RIGHT, buff=0.35)
            rows.add(VGroup(lhs, eq, tot))

        with self.line("sum") as d:
            self.play(LaggedStart(*[Write(r[0]) for r in rows], lag_ratio=0.6), run_time=d * 0.85)

        with self.line("totals") as d:
            for r in rows:
                self.play(FadeIn(r[1]), FadeIn(r[2], shift=LEFT * 0.2), run_time=d / 4.6)

        with self.line("squares") as d:
            new = []
            for r, sq in zip(rows, squares):
                target = Eq(sq, color=P.YELLOW, italic="").next_to(r[1], RIGHT, buff=0.35)
                new.append(target)
            self.play(LaggedStart(*[morph(r[2], n) for r, n in zip(rows, new)], lag_ratio=0.25),
                      run_time=d * 0.45)
            why = Words("why?", size=P.TITLE, color=P.YELLOW).next_to(rows, RIGHT, buff=1.0)
            self.play(*dim(*[r[0] for r in rows], *[r[1] for r in rows]), Write(why), run_time=d * 0.3)
        self.play(FadeOut(*self.mobjects), run_time=0.5)


class Proof(NarratedScene):
    lead_in = 0.2
    S = 1.0                           # dot spacing
    O = LEFT * 5.3 + DOWN * 1.9       # centre of the bottom-left dot
    R = 0.17                          # dot radius
    COLORS = [P.BLUE, P.TEAL, P.GREEN, P.GOLD]

    def cell(self, c, r):
        return self.O + RIGHT * c * self.S + UP * r * self.S

    def ell(self, k):
        """Cells of the k-th odd number: the L that turns a (k-1) square into a k square."""
        top = [(c, k - 1) for c in range(k)]
        side = [(k - 1, r) for r in range(k - 2, -1, -1)]
        return top + side

    def outline(self, k):
        sq = Square(side_length=k * self.S, color=P.DIM, stroke_width=2)
        return sq.move_to(self.O + (RIGHT + UP) * (k - 1) * self.S / 2)

    def grow(self, k, run_time):
        """The k-th odd number arrives as a row of dots, then bends into its L."""
        cells = self.ell(k)
        color = self.COLORS[k - 1]
        dots = VGroup(*[Dot(radius=self.R, color=color) for _ in cells]).arrange(RIGHT, buff=0.4)
        dots.move_to(RIGHT * 2.4 + DOWN * 2.6)
        self.play(LaggedStart(*[FadeIn(d, scale=0.3) for d in dots], lag_ratio=0.15),
                  run_time=run_time * 0.35)
        self.play(*[d.animate.move_to(self.cell(*c)) for d, c in zip(dots, cells)],
                  self.frame.animate.become(self.outline(k)), run_time=run_time * 0.5, rate_func=smooth)
        return dots

    def construct(self):
        eq_pos = RIGHT * 2.6 + DOWN * 0.4
        steps = [("1 = 1^2", "1 = 1²"), ("1 + 3 = 2^2", "1 + 3 = 2²"),
                 ("1 + 3 + 5 = 3^2", "1 + 3 + 5 = 3²"), ("1 + 3 + 5 + 7 = 4^2", "1 + 3 + 5 + 7 = 4²")]
        eqs = [Eq(t, plain=p).move_to(eq_pos) for t, p in steps]
        ells = []

        with self.line("one") as d:
            first = Dot(radius=self.R, color=self.COLORS[0]).move_to(self.cell(0, 0))
            self.frame = self.outline(1)
            self.play(FadeIn(first, scale=0.2), Create(self.frame), run_time=d * 0.35)
            self.play(Write(eqs[0]), run_time=d * 0.35)
            ells.append(VGroup(first))
        current = eqs[0]

        with self.line("three") as d:
            ells.append(self.grow(2, d * 0.85))
            self.play(morph(current, eqs[1]), run_time=d * 0.2)
            current = eqs[1]

        with self.line("more") as d:
            for k in (3, 4):
                ells.append(self.grow(k, d * 0.38))
                self.play(morph(current, eqs[k - 1]), run_time=d * 0.1)
                current = eqs[k - 1]

        with self.line("why") as d:
            inner = VGroup(*ells[:3])
            last = ells[3]
            top = Words("4", size=P.SMALL, color=P.GOLD).next_to(VGroup(*last[:4]), UP, buff=0.55)
            side = Words("3", size=P.SMALL, color=P.GOLD).next_to(VGroup(*last[4:]), RIGHT, buff=0.6)
            sum_lbl = Eq("4 + 3 = 7", plain="4 + 3 = 7", color=P.GOLD, size=P.BODY).next_to(current, DOWN, buff=0.7)
            self.play(*dim(inner), run_time=d * 0.15)
            self.play(look_here(last, color=P.GOLD), run_time=d * 0.25)
            self.play(FadeIn(top, shift=DOWN * 0.15), FadeIn(side, shift=LEFT * 0.15), run_time=d * 0.2)
            self.play(Write(sum_lbl), run_time=d * 0.25)

        with self.line("result") as d:
            general = Eq(r"1 + 3 + 5 + \cdots + (2n - 1) = n^2", plain="1 + 3 + 5 + ⋯ + (2n − 1) = n²",
                         italic="n")
            general.scale_to_fit_width(min(general.width, 7.4)).move_to(eq_pos)
            self.play(inner.animate.set_opacity(1), FadeOut(top, side, sum_lbl), run_time=d * 0.15)
            self.play(morph(current, general), run_time=d * 0.35)
            frame = box(general)
            self.play(Create(frame), run_time=d * 0.25)
