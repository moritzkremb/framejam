---
name: launch-teaser
description: >
  Launch Teaser: turn a product name, one promise and a few real glimpses (UI clips, renders, product shots) into a
  10–20 s teaser for X or a launch-day post: big typography and fast glimpses on a music grid, building to the name on
  the drop and a date, link or install command. Mostly type and mood, little explaining. Works in whatever video tool
  the project uses; Hyperframes when starting fresh, with a ready starter. A free local script makes the music.
  Every version is reviewed in FrameJam. Use for "coming soon" / "launching Tuesday" teasers, model or version reveals,
  a 15 s cut-down of a launch, or an end-of-thread clip. Not for full feature walk-throughs (product-launch) or
  founder-on-camera videos (founder-launch).
---

# Launch Teaser

> **How to use this playbook.** It's a recipe, not a set of rules: every format, length, pace and formula below is a
> default, and whatever the user asks for wins. Don't open with questions: use the defaults, build, and mention the
> defaults you chose in one line when you share the first render (ask only if something essential is missing, like the
> footage itself). The first render is the proposal, so there's no plan to approve first. Storyboards only when the
> user asks to see the shots first. Planning files the method mentions (`BRIEF.md`, `PLAN.md` and the like) are your
> own working notes: write them when they help you, never as a step for the user.

A name, a promise and a handful of real glimpses go in; a 10–20 s teaser comes out. It doesn't explain the product.
It makes you curious, lands the name hard, and says when or where.

Seen in the teasers that worked: Claude Opus 5.5 (macro textures under single serif words, "There's more to
discover", the mark on black), ElevenLabs v4 (calm particle portraits, one word "Intent.", the version number in a
rounded frame), and short motion-designer pieces built entirely from type and one accent shape. The shared recipe:
few words, one per beat, a single strong visual idea, and the name on the drop.

Reference build: the **FrameJam teaser** (18 s, 16:9, 120 BPM), made with this playbook. A problem in two lines on
black, a drop into a 0.5 s-per-shot montage of real FrameJam style previews with captions "Point. Comment. Finish
review. Next version." and comment pins, the real review page with a push into a comment being typed, a breakdown
("every timestamp / every pin / every version"), the wordmark on the second drop, and the install command. Its
composition is `template/hyperframes/` and its plan is in `references/example-framejam.md`.

The method is fixed; the tool is not. In an existing project, use its tool. Starting fresh: Hyperframes
(`npx hyperframes init`) and the starter in `template/hyperframes/`.

`<playbook>` below means this folder (the local path `get_playbook` returned).

## What goes in, what comes out
- **In:** the name, the one-line promise, the date / link / command, 3–10 real glimpses (short UI recordings,
  screenshots, renders, product photos, earlier videos). Optional: brand files, a music track.
- **Out:** a 10–20 s mp4 (16:9 default; 9:16 or 1:1 on request), music and sound effects on one grid, reviewed and
  approved in FrameJam.

## Defaults (the user's request overrides any of them)
- **The idea:** one visual idea that carries the whole teaser (FrameJam: comment pins landing on frames; Claude:
  horizons of textures; ElevenLabs: voices as particle faces). Pick it from the product's own world.
- **Words:** 6–20 words total. Write them first; they set the beats.
- **Glimpses:** real material only. Short and tight beats long and wide. If nothing real exists yet, make it a
  pure-type teaser rather than mocking a UI.
- **Ending:** name + one of: date ("Oct 14"), link, install command, "Available now".
- **Style:** Use the style picked for this video, if any (from `wait_for_pick`, or `get_preset` when the user names one). A FrameJam style sets the whole look. No style: the product's brand, with
  one accent color and one display typeface.
- **Music:** `scripts/launch_bed.py` (free) by default; the user's track or a licensed one if they have it.
- **Length:** 15–18 s default (X autoplay loops short clips); ≤ 10 s for an end-of-thread sting.

**Existing project made with another tool:** stay in that tool; the beat plan, cue sheet and checks apply unchanged.

When nothing is said: 16:9, 18 s, 120 BPM, the brand's look. Name the defaults you used when you share the first render.

## Workflow

### 1. Beat plan
Read `references/teaser.md`. Pick a tempo (120 BPM: beat 0.5 s, bar 2 s) and lay the teaser on bars. Default 9 bars
(18 s):

| Bars | Time | Section | Content |
| --- | --- | --- | --- |
| 1–2 | 0–4 | intro (tension) | 1–2 lines on a quiet ground, one word per beat; the problem or a question |
| 3–5 | 4–10 | drop 1 (energy) | glimpses at 0.5–1 s each with one big word per bar; then one real product moment |
| 6 | 10–12 | breakdown | everything recedes; 2–3 short lines tick in; riser; flash into the drop |
| 7–8 | 12–16 | drop 2 (name) | the name, big; the promise line |
| 9 | 16–18 | outro | date / link / command on the final hit; hold; fade |

Write `STORYBOARD.md` with a time-coded line per scene (what's on screen, where, how it moves, which beat), and the
cue sheet `cues.json` from the same plan. Then build; the first render is the proposal. If the user wants to see the shots first, make 4–6 stills of key
moments and review them in FrameJam (`open_review` with `panelsDir`).

### 2. Prepare glimpses
- Cut each glimpse to a short H.264 clip with frequent keyframes at the target size, from its best moment:
  `ffmpeg -ss 2.2 -t 1.3 -i in.mp4 -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30" -an -c:v libx264 -crf 18 -g 15 clips/name.mp4`
- UI recordings: pick the moment where something happens (a click, a result). Plan a push-in so the key detail is
  readable at 1080p.

### 3. Music
`uv run <playbook>/scripts/launch_bed.py cues.json --out assets/bed.wav` (or `python3` with numpy, scipy,
soundfile). Sections: intro → groove → breakdown → groove → outro; hits for each word (tick or slam), each pin or
chip (pop), each window entrance (swoosh), cuts into drops (whoosh), button presses (click). Check the loudness
shape per section (`references/teaser.md` § Music); you can't hear it, so ask the user to listen.

### 4. Build
Copy `template/hyperframes/` (Hyperframes) or follow the same structure in the project's tool:
- One layer per section, each a timed clip; one paused timeline; every tween with an explicit from-state.
- Words: per-word rise with blur on the beat; line swaps as a waterfall cut; captions over glimpses as dark pills.
- Glimpses: full-bleed timed videos on one track, swapped hard on the beat. Every video gets an id.
- Product moment: a window that rises in 3D, then a push on a wrapper `div` into the detail.
- Name: per-letter rise with a slight scale settle and one soft radial glow. No bounce.
- `references/teaser.md` § Pitfalls lists what broke in our build.

### 5. Check, render, review
- `npx hyperframes lint` (or the tool's check), then a snapshot at every section midpoint and around each drop.
- Render to a new file per version; `bash <playbook>/scripts/sheet.sh renders/v1.mp4` and Read the sheet. Check:
  first frame isn't empty for long, every word lands on a beat, captions never collide with chips, the product moment
  is readable, the name lands exactly on the drop, the end card holds ≥ 1.5 s.
- **Review in FrameJam:** `open_review` with `videoPath` (absolute), open the URL, `wait_for_feedback`. Fix each note
  by timestamp, render `v2`, `add_version` with a one-line note, wait again. Repeat until approved.

## Quality bar
- **Curiosity, not explanation:** ≤ 20 words; one idea; the viewer should want to know more.
- **One word per beat**, and the name on a drop. Music, sound effects and cuts share one grid.
- **Real glimpses only.** No mocked UI, no third-party logos, no real people without consent.
- **Readable on a phone:** words ≥ 96 px at 1080p, one focal point per moment.
- **Premium motion:** smooth settles, hard cuts on the beat, velocity-matched seams; no bounce, no drifting holds.
- **Photosensitivity:** at most 3 full-frame flashes per second; keep flashes short and below full white.
- **Watch it yourself** before every FrameJam round.

## Files in this playbook
- `references/teaser.md`: teaser shapes, word and glimpse rules, the cue sheet, music checks, pitfalls.
- `references/example-framejam.md`: the FrameJam teaser, scene by scene, with its cue sheet.
- `scripts/launch_bed.py`: free local music bed and sound effects from a cue sheet.
- `scripts/sheet.sh`: contact sheet of any render.
- `template/hyperframes/`: the FrameJam teaser composition and cue sheet, ready to re-skin.
