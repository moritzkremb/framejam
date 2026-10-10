---
name: how-to
description: >
  How-to: turn a process (a recipe, a setup guide, an onboarding flow, any task with a handful of steps) into a
  30–90 s step-by-step video. One scene stays on screen and changes in place step by step, a step card and progress
  dots say where you are, and every step shows one action with its exact amount or setting, readable with the sound
  off. Optional voiceover with word timing; every render reviewed in FrameJam. Works in the project's own video tool;
  new projects use Hyperframes.
---

# How-to

> **How to use this playbook.** It's a recipe, not a set of rules: every format, length, pace and formula below is a
> default, and whatever the user asks for wins. Don't open with questions: use the defaults, build, and mention the
> defaults you chose in one line when you share the first render (ask only if something essential is missing, like the
> footage itself). The first render is the proposal, so there's no plan to approve first. Storyboards only when the
> user asks to see the shots first. Planning files the method mentions (`BRIEF.md`, `PLAN.md` and the like) are your
> own working notes: write them when they help you, never as a step for the user.

A process goes in; a short video that a viewer could follow along with comes out. The point is not to explain why
something works (that's the Explainer playbook) but to get someone from the first step to the result without pausing.

## What goes in, what comes out
- **In:** the steps (a recipe, notes, a doc, a transcript or a recording of someone doing it), optionally photos or
  screen recordings of each step, the user's voice, brand colours.
- **Out:** a 16:9 1080p mp4 (30–90 s; 9:16 if asked) with a title, one beat per step, a step card, captions, an
  optional voiceover and a finish card that shows the result. Reviewed and approved in FrameJam.

## Defaults (the user's request overrides any of them)

- **Steps:** 4–8. Each is one action, starting with a verb ("Pour 120 ml of milk"), with the exact amount, setting or
  name. Merge tiny steps, split any step with two actions. If the source has more than 8, group them into stages and
  give each stage its own short run of steps.
- **Length:** ~1.2–1.5 s of silent screen time per step without voice; with voice, the voice sets the length.
  Default ~45 s with voice, ~15 s without.
- **Voice:** none by default (captions and the step card carry it). With narration: the user's recording or Kokoro
  (free, local); paid voices only with their OK.
- **Look:** use the style picked for this video, if any (from `wait_for_pick`, or `get_preset` when the user names
  one). No style: Soft Outline (`get_preset("recipe-steps")`), whose example video is this playbook's example.
- **Tool:** an existing project keeps its tool; never convert it. A new project uses Hyperframes (if the Hyperframes
  skills are installed, use them for composition details).
- **Media:** real photos or screen recordings of a step go inside the scene as framed cards; otherwise draw the
  subject. Never fake a product screen or a result.

## Workflow

### 1. The steps
- Write `STEPS.md`: the title (what you'll have at the end), then each step as `N. Verb + object + exact amount` and
  the one visible change it causes ("the glass fills to the second line").
- Check it against the source: nothing missing that the viewer needs, nothing extra. Note any safety warning; it gets
  its own beat.

### 2. One scene, changing in place
- Plan a single continuous set where the main object (the glass, the device, the screen) stays put and changes with
  each step, rather than a new slide per step. Props or hands enter, do their action and leave the way they came.
- Furniture that stays the whole video: a **step card** (`STEP 3 OF 6`, the step's value big, its label, one short
  note) and **progress dots** (upcoming outlined, current highlighted, done filled with a check).
- Order: title (~1.2 s), the steps, then a **finish card** with the result. Something is always moving.

### 3. Voice and timing (only with narration)
- Copy the Explainer playbook's scripts (`get_playbook("explainer")` returns its folder): `tts.py`, `word_times.py`,
  `build_timing.py`, `sfx.py`, `mix.py`, `sheet.sh`. Write one line of narration per step, generate or record it, and
  place each step's change on the word that names it.
- Without narration, time steps to 1.2–1.5 s each (longer actions get longer slots), or to a music track's bars.

### 4. Build, render, check
- Build the composition from `STEPS.md`; the step card and dots update on each step's start. Captions repeat the
  step's instruction in ≤ 7 words when there's no voice.
- Render to `renders/v1.mp4`. Read a contact sheet at 2 frames a second and full frames at every step: the step card
  and the scene agree, nothing is cut off, text is readable on a phone.

### 5. Review in FrameJam
- `open_review({ title, videoPath })`, open the URL, `wait_for_feedback`. Map each comment's time to its step, fix,
  re-render to `renders/v2.mp4`, `add_version` with a note, wait again. Stop when the comments say it's done.

## Quality bar
- **Followable with the sound off:** every step's action and amount is on screen while it happens.
- **One action per step,** in the source's order, with the exact amount or setting; nothing invented.
- **The step card is always right:** it changes on the step's first frame and never lags the scene.
- **One continuous scene:** the main object stays in place and visibly changes; no slideshow of separate cards.
- **The result is shown** at the end, not just named.
- Readable on a phone: step text ≥ 40 px, ≤ 7 words per caption.

## Files in this playbook
- None besides this method. Narration uses the Explainer playbook's `scripts/`; the default look is the Soft Outline
  style (`get_preset("recipe-steps")`).
