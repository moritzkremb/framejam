# Visuals: inventing every picture

Faceless means nothing is filmed or captured: every visual is designed. Typography, diagrams, abstract shapes that embody the idea, data visualisation, and (optionally) an original mascot. The look (palette, fonts, ground, texture) comes from the FrameJam style; this file is about what goes on screen and how it moves, whatever the look.

## Four kinds of picture
- **Type as the subject:** the hero word, a coined term, a big number, a short list. Near full-frame for hooks and landings.
- **A metaphor made into an object:** the prism that splits a script into sound, the pace car, the snowball. Build the thing the narration names; never generic decoration.
- **A diagram that builds:** nodes and arrows, a timeline, a process flow, a before/after split, a formula. Each part appears as it's named; the build is the teaching.
- **Data:** a count-up, bars that grow, a line that draws, a single huge stat. One number per beat.
- Plus, when the topic is software or a product, a **simplified UI mock** (a chat bubble, a file, a terminal line): drawn in the video's own style, never a screenshot of someone else's product or logo.

## Each scene is a shot over time, not a slide
Write each scene in PLAN.md as windows cued by the narration:
```
03-voice (15 s)  chapter "2 · the voice"
  0.0  chapter label rises, underline draws
  cue v_tts      prism pops in, "text-to-speech" label under it
  cue v_loud     the script beam enters the prism, a wave comes out
  cue v_whisper  four word-time flags pop above the wave, one by one
  cue v_clock    "the clock for everything" lands bottom right; hold
```
- **Nothing appears before its word.** At the scene start show only what the voice is saying then. Spread reveals across the whole scene, especially the back half. The failure that makes explainers feel like slides is dumping everything in the first second and freezing.
- **End on a held read.** Once the idea is built, hold it still for the last beat (at most a tiny idle: a blink, a slow rotation of a sun). No slow zooms or drifting cameras in the back half; they tire the eye.
- **One focal point.** The hero element fills 40–60% of the frame. Labels sit around it, not on it.

## Layout
- Canvas 1920×1080 (or 1080×1920 for vertical: stack, don't put things side by side; centre at ~42% height).
- Keep the bottom ~15% free for captions. Chapter label top-left (x 110, y 64).
- Vary framing across the video: centred hero, split (comparison), row of three (steps, recap), wide strip (timeline, flow), asymmetric 60/40 (diagram + notes). Never the same framing three scenes in a row.
- At least three depth layers in busy scenes: ground (texture, faint grid), the diagram, labels/foreground.

## Motion
- **Smooth wins.** Long-tail ease-outs (`power3.out`) for entrances; a small overshoot pop (`back.out(1.6)`) only for small things appearing in a playful register. No elastic, no bounce loops.
- **Vocabulary** (template helpers): `rise` (fade up 40 px), `pop` (scale in), `draw` (stroke draws itself), `title` (chapter label + underline), `shake` (a "no!" or "impossible"), stagger for lists, count-up for numbers, a wipe at scene changes.
- **Character moves** (if there's a mascot): walk in, look at the thing being named, react (happy eyes, sweat drop, jump) on the punchline word. Small, on cue.
- **Line boil** (hand-drawn looks only): swap the turbulence seed 8× per second so outlines wobble like hand animation. It's what makes SVG drawings feel alive without moving them.
- **Within-scene changes** read as one continuous move when they're cut at peak speed: the old element accelerates out, the new one continues in the same direction and settles. Blur ≤ 10 px on text.
- **Scene changes:** pick one or two and repeat them: a coloured wipe (template default), an iris, a push, a hard cut on a beat. Keep the persistent stage (or mascot) across the cut when the steps belong together.
- Deterministic only: no random positions, no clock time, no infinite loops. Every render must be identical.

## When no style is picked
The template's default: warm paper ground with a dot grid, ink outlines, chunky sketch cards with offset shadows, a hand-written display font (Gochi Hand) and a friendly body font (Patrick Hand), one warm accent, line boil, a dark "night" ground for the technical chapter if you want contrast. It's the look of Moritz's own explainers; swap it for any FrameJam style by changing `:root` and the font faces.

## Don't
- No stock footage, stock photos or clip art; no third-party logos or real people without consent; no copied characters.
- No purple-blue "AI" gradients, floating bokeh, glow for its own sake.
- No paragraphs on screen. Text on screen is ≤ 7 words per element, and the caption already carries the sentence.
- No element that the narration never mentions.
