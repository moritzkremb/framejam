# Teaser craft

## Shapes that work

| Shape | How it goes | Seen in |
| --- | --- | --- |
| Words over textures | single serif words fade in over slow macro or abstract footage; the mark on black at the end | Claude Opus 5.5 |
| Calm reveal | one quiet visual system (particles, a field), one word per section, the version number in a frame | ElevenLabs v4 |
| Problem → glimpses → name | a two-line problem on black, a drop into fast real glimpses with one word each, the name on the second drop | FrameJam teaser |
| Pure type | a word morphs, an accent shape (dot, pill) travels between moments, a stat counts | motion-designer showreels |
| Countdown | date or "3 days" ticks down between glimpses; ends on the date | "launching Tuesday" posts |

Pick one. Don't mix two shapes in 18 seconds.

## Words

- 6–20 words in total. Write them before anything else and count the beats they need.
- One word or a very short phrase per beat. Two lines maximum on screen.
- The problem or a question first, verbs in the middle ("Point. Comment. Ship."), the name last.
- The promise line under the name: 3–6 words.
- Sentence case, a period for weight ("Intent."), no exclamation marks.

## Glimpses

- 0.5–1 s each on the drop; one glimpse can run 2 s if something happens in it.
- Color and contrast vary between neighbours (light, dark, saturated) so each cut reads.
- A caption pill over a glimpse stays in the same spot for the whole run; chips and pins go to the corners.
- One real product moment of 2–4 s, pushed in so its detail reads.

## The cue sheet

Write the scenes and the cue sheet from the same table. Example (FrameJam teaser, 120 BPM, 18 s):

```json
{
  "bpm": 120, "duration": 18, "mood": "bright",
  "sections": [
    {"bars": [1, 2], "type": "intro"}, {"bars": [3, 5], "type": "groove"},
    {"bars": [6, 6], "type": "breakdown"}, {"bars": [7, 8], "type": "groove"}, {"bars": [9, 9], "type": "outro"}
  ],
  "hits": [
    {"t": 0.25, "sfx": "tick"}, {"t": 2.0, "sfx": "slam"}, {"t": 3.0, "sfx": "pop", "freq": 1200},
    {"t": 4.0, "sfx": "whoosh", "dur": 0.5}, {"t": 4.5, "sfx": "pop"}, {"t": 8.0, "sfx": "swoosh", "dur": 0.8},
    {"t": 10.25, "sfx": "tick"}, {"t": 16.0, "sfx": "click"}
  ]
}
```

A groove after an intro or breakdown starts with an automatic drop (big kick + impact). `mood: "night"` gives a
minor, darker bed for moody teasers. Full format in the docstring of `scripts/launch_bed.py`.

## Music checks

```bash
for s in 0 2 4 6 8 10 12 14 16; do printf "%s: " $s; ffmpeg -hide_banner -ss $s -t 2 -i assets/bed.wav -af volumedetect -f null - 2>&1 | grep -o 'mean_volume: .*'; done
```

Expect the intro and breakdown ~4–6 dB under the drops (FrameJam teaser: intro −19 dB, drops −13 dB, breakdown
−18 dB). With a user track: measure its tempo, start it at a strong section, and align the drops to its downbeats.

## Motion

- Words: rise 50 px with blur 10 px → 0 on `expo.out` 0.45 s, one per beat.
- Line to line: waterfall cut (words leave left on `power4.in` with a 0.02 s stagger, new words enter from the right
  on `power4.out`).
- Into a drop: zoom-through (scale to 1.25, blur 10 px, opacity 0.15 in 0.3 s), hard cut on the downbeat.
- Captions over glimpses: hard swap on the bar; each enters from scale 0.75 with blur, settles in 0.5 s.
- Product window: rotateX 18° → 0, y +220 → 0, scale 0.9 → 1 on `expo.out` 0.8 s; then push in on a wrapper.
- Name: letters rise 120 px with a 4° tilt, 0.035 s stagger, the word settling from scale 1.08; a radial glow
  blooms behind it over 2.5 s.
- Holds are still. No breathing, no slow drift.

## Pitfalls (from building the FrameJam teaser)

- Every timed `<video>` needs an id, or it renders frozen.
- Transforming a `<video>` directly didn't apply in the render; wrap it in a `div` and move the wrapper.
- `transform: translate(-50%, -50%)` centering fights GSAP; use `gsap.set(el, { xPercent: -50, yPercent: -50 })`.
- Chips placed near the center collided with caption pills on some glimpses; put them in the corners.
- Gray text over a fading window read poorly; dim the window to ≤ 10% and blur it, use full-white text.
- A full UI recording shown whole is unreadable at 1080p; push into the part that matters.
- `freezedetect` flags small UI changes (typing) and intentional holds; check those by eye.
