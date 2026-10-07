# Manim cookbook

Patterns for Manim Community (v0.19+), written to work inside the template (`palette as P`, `helpers`, `NarratedScene`). Snippets marked **LaTeX** need a LaTeX install; each has a text fallback. Full docs: https://docs.manim.community (Reference → Mobjects / Animations).

```python
from manim import *
import palette as P
from helpers import Eq, Words, morph, box, look_here, dim, tick_labels, number
from narration import NarratedScene
```

## A derivation that morphs step by step

```python
class Derive(NarratedScene):
    def construct(self):
        steps = [Eq("(a+b)^2", plain="(a + b)²"),
                 Eq("(a+b)(a+b)", plain="(a + b)(a + b)"),
                 Eq("a^2 + 2ab + b^2", plain="a² + 2ab + b²")]
        cur = steps[0]
        with self.line("start") as d:
            self.play(Write(cur), run_time=d * 0.5)
        for i, nxt in enumerate(steps[1:], start=1):
            with self.line(f"step{i}") as d:
                self.play(look_here(cur), run_time=d * 0.2)
                self.play(morph(cur, nxt), run_time=d * 0.5)
                cur = nxt
        with self.line("result") as d:
            self.play(Create(box(cur)), run_time=d * 0.4)
```

Colour the parts (**LaTeX**): `MathTex("a^2", "+", "2ab", "+", "b^2")` gives separate parts; `eq[0].set_color(P.BLUE)`, or `MathTex(r"a^2+2ab+b^2", substrings_to_isolate=["a", "b"]).set_color_by_tex("a", P.BLUE)`. `TransformMatchingTex` matches parts with the same tex string, so split equations into the pieces you want to keep.
Text fallback: `Text("a² + 2ab + b²", t2c={"a": P.BLUE, "b": P.TEAL})`; `morph` uses `TransformMatchingShapes`, which matches identical glyphs.

Keep earlier lines visible:

```python
history = VGroup()
# after each step:
old = cur.copy()
history.add(old)
self.play(history.animate.arrange(DOWN, aligned_edge=LEFT).to_edge(UP).set_opacity(0.35), morph(cur, nxt))
```

## Graphs

```python
ax = Axes(x_range=[0, 4, 1], y_range=[0, 8, 2], x_length=7, y_length=4.5,
          axis_config={"color": P.DIM, "stroke_width": 2}).to_edge(LEFT, buff=0.8)
labels = ax.get_axis_labels(Words("x", size=P.SMALL), Words("y", size=P.SMALL))   # default labels need LaTeX
ticks = tick_labels(ax.x_axis, range(1, 5))                                      # include_numbers needs LaTeX
f = ax.plot(lambda x: x**2 / 2, color=P.BLUE, stroke_width=4)
self.play(Create(ax), FadeIn(labels, ticks))
self.play(Create(f), run_time=1.5)
area = ax.get_area(f, x_range=[0, 3], color=P.BLUE, opacity=0.3)
rects = ax.get_riemann_rectangles(f, x_range=[0, 3], dx=0.5, color=[P.BLUE, P.TEAL], fill_opacity=0.6)
self.play(Create(rects))
self.play(Transform(rects, ax.get_riemann_rectangles(f, x_range=[0, 3], dx=0.1, color=[P.BLUE, P.TEAL])))
```

Tangent / secant: `ax.get_secant_slope_group(x, f, dx=..., secant_line_color=P.YELLOW)`. Point on the graph: `ax.c2p(x, y)` (coords to point), `ax.i2gp(x, f)` (input to graph point).

## Sweep a parameter

```python
t = ValueTracker(0.5)
dot = always_redraw(lambda: Dot(ax.i2gp(t.get_value(), f), color=P.YELLOW))
v_line = always_redraw(lambda: ax.get_vertical_line(ax.i2gp(t.get_value(), f), color=P.DIM))
readout = always_redraw(lambda: number(t.get_value(), size=P.BODY).next_to(ax, UP).align_to(ax, RIGHT))
self.add(dot, v_line, readout)
self.play(t.animate.set_value(3.5), run_time=3, rate_func=linear)
```

`number()` is `DecimalNumber` with LaTeX and `Text` without (`DecimalNumber`, `Integer` and `Variable` need LaTeX).

## Number line and braces

```python
nl = NumberLine(x_range=[0, 10, 1], length=11, color=P.DIM)
ticks = tick_labels(nl, range(0, 11, 2))
jump = CurvedArrow(nl.n2p(2), nl.n2p(5), color=P.TEAL, angle=-PI / 2)
br = Brace(VGroup(*row_of_dots), DOWN, color=P.DIM)
label = Words("n", size=P.SMALL).next_to(br, DOWN)                # br.get_text()/get_tex() need LaTeX
```

## Transform the plane

```python
plane = NumberPlane(x_range=[-6, 6], y_range=[-4, 4],
                    background_line_style={"stroke_color": P.BLUE, "stroke_opacity": 0.4})
i_hat = Arrow(ORIGIN, RIGHT, buff=0, color=P.GREEN)
j_hat = Arrow(ORIGIN, UP, buff=0, color=P.RED)
self.add(plane, i_hat, j_hat)
M = [[1, 1], [0, 1]]
self.play(plane.animate.apply_matrix(M), i_hat.animate.apply_matrix(M), j_hat.animate.apply_matrix(M), run_time=2)
```

Non-linear: `plane.prepare_for_nonlinear_transform()` then `plane.animate.apply_complex_function(lambda z: z**2)`. `LinearTransformationScene` does the grid, basis vectors and a ghost of the original for you.

## Rearrangement proofs

Make the pieces once, move them; the motion is the argument.

```python
pieces = VGroup(*[Square(0.5, fill_color=P.SEQUENCE[i % 7], fill_opacity=0.8, stroke_width=1) for i in range(9)])
pieces.arrange_in_grid(3, 3, buff=0)
targets = [...]   # positions in the new arrangement
self.play(LaggedStart(*[p.animate.move_to(tg) for p, tg in zip(pieces, targets)], lag_ratio=0.1), run_time=2)
```

Rotate a group about a point: `Rotate(tri, PI / 2, about_point=corner)`. A copy that slides off while the original stays: `self.play(m.copy().animate.shift(RIGHT * 4))`.

## Camera

```python
class Zoom(MovingCameraScene, NarratedScene):   # MovingCameraScene first
    def construct(self):
        ...
        self.play(self.camera.frame.animate.scale(0.4).move_to(detail), run_time=1.5)
        self.play(Restore(self.camera.frame))   # after self.camera.frame.save_state()
```

## 3D

```python
class Surface3D(ThreeDScene):
    def construct(self):
        self.set_camera_orientation(phi=65 * DEGREES, theta=-45 * DEGREES)
        axes = ThreeDAxes(x_range=[-3, 3], y_range=[-3, 3], z_range=[-1, 2])
        surf = Surface(lambda u, v: axes.c2p(u, v, np.sin(u) * np.cos(v)), u_range=[-3, 3], v_range=[-3, 3],
                       resolution=(24, 24), fill_opacity=0.8, checkerboard_colors=[P.BLUE, P.TEAL])
        self.play(Create(axes), Create(surf), run_time=2)
        self.begin_ambient_camera_rotation(rate=0.15)
        self.wait(4)
```

Text that should face the viewer in 3D: `self.add_fixed_in_frame_mobjects(label)`. 3D renders are slow: draft at `-ql`, keep resolution low.

For a 3D scene with narration, use `class S(ThreeDScene, NarratedScene)` (camera classes first) and the `with self.line(...)` blocks as usual.

## Timing tips
- `LaggedStart(*anims, lag_ratio=0.2)` for "one after another" inside one line.
- `rate_func=smooth` (default) for moves, `linear` for sweeps, `there_and_back` for a pulse. Avoid `rush_into`/`rush_from` on text.
- `self.wait()` inside a line block is rarely needed: the block waits out the rest of the line.
- To start an animation partway into a line, put a short `self.wait(d * 0.3)` first.
- A held silent beat between lines: a line whose text is just "…" won't work; instead pass `gap=1.2` to `self.line(...)`.

## Rendering
- `manim -ql scenes.py Name` draft (480p15), `-qm` 720p30, `-qh` 1080p60, `-qk` 4K. `-s` saves only the last frame (fast layout checks). `-a` renders every scene in the file.
- Manim caches unchanged animations; if something looks stale, `--flush_cache`.
- 9:16: in `manim.cfg` set `pixel_width = 1080`, `pixel_height = 1920`, `frame_width = 8`, `frame_height = 14.2`, then lay out vertically.
