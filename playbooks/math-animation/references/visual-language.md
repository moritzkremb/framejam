# Visual language

The look this playbook aims for: the calm, precise style of 3Blue1Brown and the many Manim videos it inspired. It comes from a few habits, not from effects. Learn the habits; don't copy any one video.

## The ground and the ink
- **Dark, flat ground** (`BG #1C1C1C`). No gradients, no textures, no vignettes. Everything on it is drawn with thin strokes and solid fills.
- **Light ink** (`INK #ECECEC`) for text and default strokes; **dim grey** (`DIM`) for axes, guides, earlier steps.
- **Colour is meaning, not decoration.** Each quantity gets a colour the first time it appears and keeps it everywhere: in the picture, in the equation, in the labels. `palette.py` roles:

| Role | Colour | Use |
| --- | --- | --- |
| `BLUE` | #58C4DD | the main object or quantity |
| `TEAL` | #5CD0B3 | its partner / the second quantity |
| `GREEN` | #83C167 | a third quantity, growth, "this works" |
| `YELLOW` | #F7D96F | the one thing to look at right now; the result. Never a permanent colour for an ordinary object |
| `BROWN` / `GOLD` | #CD853F / #F0AC5F | a warm contrasting quantity, later sequence items |
| `RED` | #FC6255 | wrong, negative, removed, error |
| `SEQUENCE` | blue → teal → green → yellow → gold → brown → red | 1st, 2nd, 3rd… item of a series |

- In equations, colour the symbols to match the picture (with LaTeX: `MathTex(..., substrings_to_isolate=["a", "b"]).set_color_by_tex("a", BLUE)`; without: `Text(..., t2c={"a": BLUE})`).

## Type
- A serif with a mathematical feel: Computer Modern (CMU Serif) when available, STIX Two or Charter otherwise. Real LaTeX for equations when installed.
- Four sizes only (`TITLE 64`, `MATH 64`, `BODY 48`, `SMALL 40`). No bold body text, no all-caps, no drop shadows.
- Very little text. The narration explains; the screen shows objects, equations and a few labels. A chapter title (`Title()`) only at a real change of topic.

## The moves (and when)

| Move | Manim | Use it when |
| --- | --- | --- |
| Write on | `Write(eq)` | an equation or label is introduced; the hand-written stroke reads as "this is new" |
| Draw | `Create(shape)`, `ax.plot` + `Create` | a curve, line or outline comes into being |
| Fade in with a nudge | `FadeIn(m, shift=UP*0.2)` / `scale=0.5` | small objects, dots, labels |
| Morph an equation | `TransformMatchingTex(a, b)` / `helpers.morph` | a derivation step: matching terms stay, new terms arrive |
| Become | `ReplacementTransform(a, b)` / `Transform` | one object turns into another (a row of dots into an L, a sum into a square) |
| Move the pieces | `m.animate.move_to(...)`, `Rotate`, `.animate.shift` | rearrangement proofs; the motion *is* the argument |
| Highlight | `Indicate`, `Circumscribe`, `SurroundingRectangle` (`box`) | "look here", once per idea, timed to the word |
| Dim | `.animate.set_opacity(0.3)` (`dim`) | push earlier steps back while keeping them readable |
| Sweep a parameter | `ValueTracker` + `always_redraw` | show what changes as x, n, t or θ changes; the moving dot on a graph |
| Transform space | `NumberPlane` + `.animate.apply_matrix` / `apply_function` | linear maps, complex functions, coordinate changes |
| Camera | `MovingCameraScene`: `self.camera.frame.animate.scale(0.5).move_to(m)` | zoom into a detail, pull back to the whole picture |
| 3D | `ThreeDScene`, `set_camera_orientation`, `begin_ambient_camera_rotation` | surfaces, solids, vectors in space (sparingly; slower to render) |

## Step-by-step derivations
- One step per narration line. The equation sits in one place; each step morphs it.
- Before a step, highlight the part that will change (`box` or colour); during the step, matching terms stay still.
- When a derivation gets long, keep the last 2–3 lines stacked and dimmed above the current one; never more than four lines on screen.
- End with the result boxed in yellow and a held beat of silence (0.8–1.5 s).

## Pacing
- A move takes 0.5–1.5 s; a scene 8–40 s. Default rate function `smooth`; `linear` only for sweeps and rotations that should feel mechanical.
- After every reveal, a hold. Silence is part of the rhythm: give the line before a key reveal its own short sentence.
- Animations follow the voice: the object appears as its name is said. In `NarratedScene`, start the animation at the top of the line block, size it as a fraction of `d`.
- Cut between scenes after a fade out (0.4–0.6 s) or keep the persistent object and change what's around it. No flashy transitions.

## Composition
- Frame is 14.2 × 8 units. Main picture left or centre, the equation right or below; keep 0.5 units from every edge.
- One focal point. If two things matter, show them side by side and colour-link them.
- Big enough to read on a phone: a dot grid with 1-unit spacing, curves at stroke width 4+, equations at size 48+.

## Don't
- No pi creatures or other 3Blue1Brown characters, footage, music or logo (his IP). No "3Blue1Brown" branding on the video.
- No stock footage, no emoji, no clip art, no particle effects, no glow, no bouncing or elastic easing.
- No walls of text, no bullet lists on screen, no reading the equation aloud symbol by symbol.
- Don't reveal the answer in the title card; ask the question.
