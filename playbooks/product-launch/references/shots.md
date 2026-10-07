# Shots: how each frame looks and moves

Write every frame as a time-coded shot list against the beat grid. The failure that makes agent videos look like
PowerPoint is front-loading: the whole frame appears in the first quarter, then sits. A shot list written beat by beat
makes that impossible.

```
Scene 1 (0.0–0.5s): only the first thing enters
Scene 2 (0.5–2.0s): the next piece arrives on its beat (a word, a window, a chip)
...
Scene N (…–end):   everything has landed; hold the read
```

Each Scene line says what is on screen, where it sits, and how it moves. No pixel recipes in the storyboard unless a
seam needs exact numbers (see handoffs below).

## Shot shapes for launch frames

Pick a shape per frame, fill it with this product, keep its signature move.

| Shape | Signature move | Good for |
| --- | --- | --- |
| Kinetic beat slam | short lines slam in one per beat, then resolve | hook, pain, benefit montage |
| Option cycle | one slot swaps words on the beat, then a hero claim crashes in | hook, brand line |
| Fixed anchor cycle | one pinned line, the next line hard-cycles use cases | breadth, use-case roll |
| Logo bloom lockup | the mark springs in on the drop, glides up, headline builds | product intro, CTA |
| Floating window settle | real UI rises with a 3D tilt and lands flat, then plays | product hero, features |
| Prompt → result | an input types, submit press, the result fans out behind it | AI features, search |
| Agent at work | trigger → status "Working…" → check → the board changes | automation features |
| Layered surfaces | a window plus a smaller real component floating in front | features with two parts |
| Cursor demo | a drawn cursor moves, clicks, a ripple, the UI responds | workflows, CTA button |
| Grid assemble | tiles or logos build row by row, then compress for stats | breadth, proof |
| Count-up | a number counts up, size grows with it | proof, hook stat |
| Titlecard | 2–3 near-still cards, one phrase each | calm benefit, end card |

## Layout

- **Framing:** centered (hero, climax), split 42/58 (headline left, UI right), layered depth, full-width strip. Vary
  across the video.
- **Density:** the main visual takes ≥ 40% of the frame; 3 depth layers (ground, window, floating chip).
- **Hierarchy:** one element clearly dominates (size 3:1, weight 700 vs 500, the accent color).
- **Margins:** 96 px sides at 1080p; keep content in the top ~85% if captions or a player bar will sit at the bottom.
- **Don't show:** browser chrome, real OS cursors (draw one), scrollbars, notification badges, bokeh, purple "AI"
  gradients, generic shapes standing in for the product.

## Product windows

- White or dark surface by the product's theme, brand radius (12–20 px), 1–2 px hairline border, layered soft shadow.
- Optional title bar with three hairline dots; never a full browser.
- Entry: rotateX 18–30° → 0, y +80…+300 → 0, scale 0.94 → 1, blur 8 px → 0, `expo.out` 0.8–1.5 s. The shadow
  deepens as it lands.
- Camera moves happen inside the window on a wrapper (zoom to the comment box, the answer, the button). Max 2.4x on
  2x captures.
- A real video plays only once the window is parked flat; until then show its first frame as a still.

## Motion rules

1. **Smooth beats bouncy.** Arrivals `expo.out` 0.5–0.7 s, settles `power3.out`, exits `power2.in` 0.3 s. Overshoot
   only for one deliberately playful pop.
2. **Reveal on the beat or the spoken word**, spread across the frame, especially the back half.
3. **No lazy breathing, no slow drift on a held frame.** A held read is fine. At most a tiny jitter (≤ 2 px).
4. **Seams are velocity-matched**: cut at peak speed, same direction on both sides.
5. **Seek-safe**: explicit from-states, no infinite loops, no randomness, no CSS animations (the renderer seeks).

## Seams inside a frame

- **Zoom-through** (state change, e.g. hook → brand): outgoing scales 1 → 1.2 with blur to 10 px and opacity to 0.15
  in 0.2 s (`power3.in`); hard swap; incoming scales 0.75 → 1 from the same blur and opacity in 0.5 s (`expo.out`).
- **Inverse zoom** (payoff): outgoing shrinks to 0.8, incoming arrives at 1.25 and settles to 1.
- **Cut the curve** (between scenes): outgoing moves 230 px left on `power4.in`, fades by 30% of the way; incoming
  starts 230 px right and continues left on `power4.out`. Same distance and duration on both sides.
- **Waterfall** (line to line): cut the curve per word with a ~0.02 s stagger, the last word dying at the cut.
- Blur peaks: 10 px for text, 18–20 px for full-frame surfaces.

## Handoffs

When an element continues across a frame boundary (the dot that becomes the next frame's circle, a window that stays),
write the exact state at the cut in both frames: x, y, scale, opacity, direction. Parallel builders must not invent
two versions of one seam.

## Video direction block (write once, top of STORYBOARD.md)

- Palette roles (ground, ink, muted, hairline, the one accent) and when the dark register is used.
- Type roles (display, display-xl, one serif or italic flourish word max per frame, mono kicker, body).
- Product surface spec (window look, entry move).
- Motion grammar (eases above, beat-locked reveals, final beat of each frame is a still hold).
- Rhythm: which frames are tight and dark, which are the breather before a drop.
- Negative list: front-loading, floating screensaver motion, breathing, bokeh, neon, glassmorphism, browser chrome,
  invented numbers, em dashes in copy.

## Worked shot list (from the Notion demo, frame 5)

```
Frame 5 — Find answers (6 s, bars 11–13), prompt → result
Scene 1 (0.0–2.0s): centered input pill with the product's AI icon; the question types in 0.2–1.8 with a caret.
Scene 2 (2.0–2.5s): send button press (scale 0.88 → 1); the input glides up to 18% and shrinks to 0.8.
Scene 3 (2.5–4.0s): the real answer cards rise and fan in beneath (y +100 → 0, blur → 0); a small dashboard window
                    slides in behind for depth; three source chips pop one per beat at 3.0 / 3.5 / 4.0 with
                    connector lines drawing to them.
Scene 4 (4.0–6.0s): "Get answers, instantly." lands bottom-left per word, "With citations." at 4.5 (accent on the
                    last word). Hold still from 5.0.
```
