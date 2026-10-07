---
name: math-animation
description: >
  Math Animation: turn a math, science or CS idea into a calm, narrated explainer in the visual language made famous
  by 3Blue1Brown: a dark ground, precise shapes and graphs, equations that morph term by term, and a voice paced to
  every move. Built with Manim Community from a bundled starter project (palette, helpers, narration timing, render
  and mix scripts); every version is reviewed in FrameJam. Use for a visual proof, "explain this formula/theorem/
  algorithm", a lecture clip, a concept explainer with equations or graphs, or revising one of these.
---

# Math Animation

A concept goes in; a short film where the viewer *sees* why it's true comes out. One insight per video, shown as a picture before it's written as a formula, with narration that never runs ahead of the animation.

The look is Manim's: the open-source library 3Blue1Brown's Grant Sanderson wrote for his videos, in its community edition. The starter project in `template/` sets up the palette, fonts, helpers that work with or without LaTeX, a `NarratedScene` that paces each scene to its spoken lines, a free local voice, and scripts that render, join and mix everything. `<playbook>` below means this folder (the local path `get_playbook` returned).

Reference build: the template's own example, **"Why odd numbers add up to squares"** (26 s, two scenes, Kokoro voice, no LaTeX): the sums 1, 1+3, 1+3+5 turn into 1², 2², 3²; then each odd number arrives as a row of dots and bends into the L that grows the square, and the general equation lands in a yellow box. It's the bar for clarity and pacing; your scenes will be longer and richer.

## What goes in, what comes out
- **In:** the idea (a proof, formula, algorithm, phenomenon), the audience, optionally notes, a source text, a script or the user's own voice recording.
- **Out:** a 16:9 1080p60 mp4 (60 s to 5 min), narrated, -16 LUFS, plus the Manim project that re-renders it. Reviewed and approved in FrameJam.

## Before you start (decide once, then run)

Resolve from the request and the environment; ask only what can't be resolved, in one round:
- **Idea and audience:** what should the viewer understand at the end, and what do they already know? If the request is a whole topic ("explain Fourier series"), propose the one insight you'll build the video around.
- **Length:** 60–90 s for one visual proof; 3–5 min for a concept with a build-up. Default 90 s.
- **Voice:** the user's own recording, or a free local voice (Kokoro via `scripts/tts.py`, default `am_michael`), or a paid voice (ElevenLabs, OpenAI) only with their OK. Silent with on-screen text is fine for social clips.
- **LaTeX:** run `latex --version`. With LaTeX, `Eq()` makes real typeset math (`MathTex`). Without it, everything still works with Unicode text (see `references/setup.md` for what needs LaTeX and the fallbacks). Installing it is free but large (MacTeX ~5 GB, BasicTeX ~100 MB, TeX Live on Linux); offer it, don't require it.
- **Style:** call `get_selected_preset`. A FrameJam style sets only the colours and fonts: map its palette onto the roles in `template/palette.py` (ground, ink, dim, primary, secondary, highlight) and its fonts onto `TEXT_FONTS`. Keep the dark ground unless the style is light on purpose; keep the motion and pacing rules below either way. No style: the template's palette is the default.
- **Music:** none by default (narration carries it). If wanted: a licensed or generated quiet bed, mixed under the voice by `render_all.py --music`.
- **Machine:** Python 3.10+, ffmpeg, Cairo and Pango (`references/setup.md`). Keep the project in a path without spaces if you can (Kokoro's speech engine can't read paths with spaces; `tts.py` works around it).

**Paid steps:** only a paid voice or paid music cost money. Stop before either unless the user stated a budget; the free routes are their own voice, Kokoro, and no music.

**Rights:** don't use 3Blue1Brown footage, music, intros or his pi creature characters (his IP), and don't call the result a 3Blue1Brown video. "In the style of" is fine. Check every fact and formula against a real source before it goes in the script.

**Existing project made with another tool** (Remotion, Motion Canvas, Hyperframes…): don't convert it. Follow the same method there (one insight, picture before formula, step-by-step derivations, narration-paced scenes, the palette roles) using `references/other-tools.md`, reuse `scripts/tts.py`'s approach for the voice, and tell the user what Manim would have added (true morphing between equations, exact geometry and graphs from code, LaTeX typesetting, camera moves in 2D and 3D).

## Workflow

### 1. Find the insight
- Write down the one sentence the viewer should believe at the end (`insight` in `script.json`), and the question that makes them want it ("Why is every total a square?").
- Find the picture that makes it obvious: a rearrangement, a geometric meaning, a graph that moves, a transformation of the plane, a small worked example that generalizes. If you can't draw it, you don't have the video yet.
- Earn the formula: question first, picture second, formula last. The formula should arrive as a caption for what the viewer already saw.

### 2. Plan the visual proof (PLAN.md)
- A table of scenes: id (the Scene class name), what's on screen, what changes, the line(s) said, rough seconds. One idea per scene, 8–40 s each.
- Pick 1–3 **persistent objects** that carry through (the dot square, the axes, the unit circle) so the viewer never has to re-orient.
- Mark each scene's technique from `references/visual-language.md`: build-up, morph, rearrange, highlight, zoom, sweep a parameter.
- Pass example numbers before the general case (1+3+5 = 9, then n²).

### 3. Storyboard in FrameJam
Draw each planned scene's key frame as code, so the storyboard becomes the first draft:
- Copy the template: `cp -R <playbook>/template <project>` and set up the venv (`references/setup.md`).
- In `storyboard.py`, one small `Scene` per planned scene, named `Panel01_<SceneId>`, `Panel02_<SceneId>`…, that just `self.add(...)`s the key layout with real positions, colours and labels (the template has two examples).
- `manim -qm -s -a storyboard.py && python scripts/panels.py`: copies the stills to `storyboard/01-<SceneId>.png`… and prints the `panelsDir` and `panels` (title = scene, caption = its narration from `script.json`, so write a first draft of the lines before this step).
- `open_review({ title, panelsDir, panels })`, open the URL, `wait_for_feedback`. Revise and `add_version({ reviewId, note })` until approved.

### 4. Write the narration and make the voice
- `script.json`: scenes in order, each with `lines` (`id`, `text`, optional `tts` for pronunciation). 1–2 short sentences per line, each line one beat of animation. Write it to be heard: numbers as said ("two n minus one"), no parentheses, no "as we can see".
- Calm, curious, precise. Short sentences. Pause before the reveal (a short line of its own).
- Make the audio: `python scripts/tts.py` (Kokoro, free, downloads its model once). Their own voice: they record `audio/<Scene>/<line>.wav` per line (any quiet room, phone is fine), then `python scripts/tts.py --provider record`. Paid: `--provider openai|elevenlabs --paid-ok` after their OK.
- This writes `audio/durations.json`; scenes read their timing from it. Re-run a single line with `--only Scene/line --force`.

### 5. Animate each scene
- `scenes.py`: one `NarratedScene` subclass per scene id, in script order. Wrap each beat in `with self.line("id") as d:` and give its animations fractions of `d` (they must add up to ≤ 0.9 · d; the scene waits out the rest). Animating before the voice exists works too: lengths are estimated from word count.
- Use `palette.py` roles (never raw hex), `helpers.py` (`Eq`, `Words`, `morph`, `box`, `look_here`, `dim`, `tick_labels`, `number`), and the patterns in `references/manim-cookbook.md`.
- Draft fast: `manim -ql scenes.py Proof` and look at the last frame with `-s`. Keep text inside the 16:9 frame (x ±6.5, y ±3.6) and away from the bottom edge.
- If the project has many scenes, they're independent files of work: build them in parallel (subagents, one scene each, same palette/helpers, "don't edit other scenes"), then review all together.

### 6. Render, join, mix
- `python scripts/render_all.py --out renders/v1.mp4` renders every scene at 1080p60, joins them, places every line on its cue, adds `--music` if given (ducked under the voice), and normalizes to -16 LUFS. It prints where each scene starts (also `build/timeline.json`).
- Check before showing anyone: `bash scripts/sheet.sh renders/v1.mp4 2` and Read the sheet; Read a full-size frame at each scene's key moment; optionally transcribe it (`whisper-cli`) to confirm every line is there and in order. Nothing overlaps, nothing is cut off, every highlight lands on the thing being said.

### 7. Review in FrameJam
- `open_review({ title, videoPath: "<abs>/renders/v1.mp4" })`, open the URL, `wait_for_feedback` in the same turn.
- Map each comment's time to a scene with `build/timeline.json`; frame comments (with the pin) tell you which object. Fix, re-render only the touched scenes (`--only Scene`), write `renders/v2.mp4`, `add_version({ reviewId, videoPath, note })`, wait again. Stop when the comments say it's done.

## Quality bar
- **One insight.** The viewer can say what they learned in one sentence. Everything else is cut.
- **Picture before formula.** Each formula labels something the viewer already saw.
- **Voice and picture agree.** Every object appears, moves or lights up as it's named, never before; nothing important happens while the voice talks about something else.
- **One thing moves at a time** (or one group). Earlier steps dim, they don't vanish, so the derivation stays readable.
- **Equations morph, they don't swap.** Matching terms stay put (`morph`, `TransformMatchingTex`); new terms write on.
- **Colour means something.** The same quantity keeps its colour across scenes and in the equations; yellow is only for "look here".
- **Calm pacing.** Smooth rate functions, ~0.5–1.5 s per move, a short hold after each reveal. No bounces, no shakes, no flashing.
- **Readable at phone size:** body text ≥ 40 (Manim font size), equations ≥ 48, at most ~12 words on screen.
- **Correct.** Every statement checked; examples actually compute.

## Files in this playbook
- `template/`: the starter project to copy. `manim.cfg` (dark ground, media in `build/`), `palette.py` (colour and font roles, sizes), `helpers.py` (LaTeX-or-text equations, morph, highlight, dim, text tick labels, numbers), `narration.py` (`NarratedScene` and line timing), `scenes.py` (the example: `Pattern`, `Proof`), `storyboard.py` (key-frame panels), `script.json` (the example narration), `requirements.txt`.
- `template/scripts/`: `tts.py` (narration per line: kokoro, say, piper, record, or paid openai/elevenlabs), `render_all.py` (render, join, place voice on cues, music, loudness, timeline), `panels.py` (storyboard stills for FrameJam), `sheet.sh` (contact sheet).
- `references/`: `visual-language.md` (the look, the moves and when to use them), `manim-cookbook.md` (code for derivations, graphs, plane transforms, trackers, camera, 3D), `setup.md` (install, LaTeX or not, troubleshooting), `other-tools.md` (the same method in Remotion, Motion Canvas or Hyperframes).
