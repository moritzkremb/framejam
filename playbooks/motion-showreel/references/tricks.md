# Trick library

Each trick is 1–3 s (2–6 beats) and is something the **hero object** does. Pick 5–8 that suit the subject, order them
by energy (small → big → biggest → calm lockup), and give each a one-word label for the HUD index. GSAP/CSS notes
apply to Hyperframes and any browser renderer; the Remotion column is the same idea with `interpolate`/`spring`.

| Trick | Beats | How (GSAP / CSS) | Remotion / other |
| --- | --- | --- | --- |
| **UI micro-interaction opener** (toggle, Send button, slider, checkbox) | 4 | Type text per character with `tl.set` per char; cursor path `power3.inOut`; press = scale 0.86 for 0.07 s then `elastic.out(1,0.35)`; the control becomes the hero. | `spring()` on scale; per-char `opacity` by frame. |
| **Letter physics** (a word breaks, letters fall) | 2–4 | Split into spans; each gets its own `y`, `rotation`, `x` tween with `power2.in`, staggered; precompute random values with a seeded function, never `Math.random()` at render. | Same, with a seeded PRNG. |
| **Squash and stretch bounce** | 2 | `scaleX 1.25 / scaleY 0.78` on contact (0.08 s), back with `elastic.out`; `y` with `bounce.out`. | `spring({damping: 8})`. |
| **Easing as data** (the hero rides a curve, overshoot labelled) | 4 | Draw an SVG path with `stroke-dashoffset`; move the hero along it (sample `path.getPointAtLength` into a lookup array once, tween a progress proxy and place from the array). Label the overshoot ("+22%"). | Same SVG maths per frame. |
| **Onion skin / motion trail** | 4 | 2–3 copies of the hero at 26% and 56% opacity follow it one step behind (`+0.06 s` per ghost) on stepped moves (`power4.out`, 0.16 s per eighth note). | Render ghosts at `frame - k*2`. |
| **Shape morph on beats** | 4 | Tween `width/height/borderRadius/skewX/rotation` on each beat (`expo.out` 0.3 s); leave a 1 px outline of the previous shape for one beat. For true path morphs use flubber/MorphSVG-style interpolation of equal-point paths. | `interpolate` the same properties. |
| **Colour flood / ground flip** | 1 on a hit | The hero scales past the frame edges (`expo.out` 0.4 s) and becomes the new ground; flip the HUD colour on the same frame. Reverse by contracting it back into a shape. | Same. |
| **One word per beat** | 3–4 | On the flood: a 300 px word per beat, in from `y:160 scale:0.9` with `expo.out` 0.35 s, out up after 0.75 beat. Use `immediateRender:false` on every `fromTo` after the first. | `Sequence` per word. |
| **Filmstrip / timeline** (product UI as motion) | 4–6 | A row of skewed thumbs staggers in; the hero glides over them as the playhead (`power2.inOut`); pins or markers drop on beats with `back.out(3)` + `bounce.out`. | Same. |
| **3D type ring** | 6–8 | Perspective parent (1600 px); ring `transform-style: preserve-3d` tilted `rotateX(-14deg)`; each letter `rotateY(i*step + a) translateZ(R)`; drive `a` with a proxy tween and set transforms in `onUpdate`; back letters dimmer. **Never put opacity or filter on the ring itself** (it flattens 3D): fade and blur the parent. | CSS 3D works in Remotion; or three.js text on a cylinder. |
| **3D spin of the hero** | 2–4 | `rotateY: 360` with `transformPerspective: 1600`, `power3.inOut`. | Same. |
| **Grid ripple** (styles, features, a halftone field) | 4 | Cells `scale 0 → 1` with `stagger: {grid: [rows, cols], from: <hero index>, amount: 0.7}`; a second wave (`y -26` yoyo, or colour) from the same index; collapse with `from: "edges"`. Halftone: a canvas or SVG dot grid whose radius = f(distance to hero − wave front). | `stagger` maths by hand: `delay = dist * k`. |
| **Counter / stat slam** | 2 | Count a number with a proxy tween and `Math.round` in `onUpdate`, land on a downbeat with a scale punch. | Same. |
| **Lockup** | 6–10 | The hero lands as the logo (or the full stop of the name); ghosts slam in from the side; name letters rise from a mask (`yPercent: 110`, stagger 0.045); tagline after 1.5 beats; a slow 1.00 → 1.035 push on the whole stage; fade or loop. | Same. |
| **Rewind loop** (optional end) | 1–2 | Replay earlier shots at 4–8× in reverse with heavy blur (seek a copy of the timeline backwards), cut to frame 0. | Render the reverse section in the edit. |

## Transitions between tricks
- **Match-morph** (default): the hero's last state in shot N is its first state in shot N+1. No cuts needed.
- **Hit cut:** a hard cut on a drum hit, the hero in the same screen position before and after.
- **Flood:** the hero fills the frame and becomes the next ground.
- **Whip:** 0.15 s `x` move with blur on the outgoing and incoming layers.

## Motion grammar
- Ease out for arrivals (`expo.out`, `power3.out`), ease in for exits, `inOut` for travel, `back`/`elastic` only for
  impacts and presses. Never linear except spins and HUD clocks.
- Arrivals 0.3–0.5 s, exits 0.15–0.3 s, so the frame is always settling on the beat.
- Blur sells speed: a 6–12 px blur during the fastest 0.1 s of a big move (a parent `filter` or a stretched copy).
- At most 3 full-frame luminance flips per second (photosensitivity).

## Determinism (renders must match previews)
- No `Math.random()`, `Date.now()` or network at render time. Precompute random values with a seeded PRNG.
- One paused timeline; `fromTo` tweens later in time need `immediateRender: false` or they show at frame 0.
- Drive anything computed (rings, curves, counters) from a tween's `onUpdate` so seeking redraws it.
