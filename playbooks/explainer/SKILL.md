---
name: explainer
description: >
  Explainer: turn a topic, article, notes or script into a narrated faceless explainer video (60 s to 3 min) where
  every picture is invented per scene (big type, diagrams, metaphors drawn as objects, data, an optional original
  mascot) and lands on the exact word that names it. Voice first (the user's own, a free local voice or a paid
  one), word-level timing, scenes placed on named cues, captions, ducked music and sound effects; storyboard and every
  render reviewed in FrameJam. Works in the project's own video tool; new projects use Hyperframes and the bundled
  starter scene. Use for concept explainers, how-it-works videos, listicles, story explainers, or revising one.
---

# Explainer

A body of text goes in; a short film that makes one idea click comes out. Nothing is filmed: a voice explains, and drawings, words, diagrams and numbers appear exactly as they're named. The method is the one behind Moritz's own explainers ("AI video under the hood", "Agent Civilizations", "Pace the Frontier", "How the YouTube Upload skill works"): **script → voice → word times → named cues → scenes on cues → sound on the same clock → review.**

Reference build: **"AI video under the hood"** (2:54, 16:9): eleven scenes with numbered chapter labels (1 · the plan, 2 · the voice, …), an original orange block mascot who holds each step's prop, hand-drawn paper and night grounds with line boil, a prism that turns the script into a voice wave with word-time flags, burned-in captions in sketch cards, a recap card with every step's icon. The template's example ("Why the sky is blue", 31 s) is the same method at its smallest. `<playbook>` below means this folder (the local path `get_playbook` returned).

## What goes in, what comes out
- **In:** a topic, article, notes, transcript or finished script; optionally the user's voice, brand colours and facts that must appear.
- **Out:** a 16:9 1080p mp4 (60 s–3 min; vertical 9:16 if asked), voiceover, burned-in captions, optional music, sound effects, -16 LUFS. Plus the project that re-renders it. Reviewed and approved in FrameJam.

## Before you start (decide once, then run)

Resolve from the request and the environment; ask only what can't be resolved, in one round:
- **Audience and angle:** who's it for and what should they understand at the end? If the source is long, propose the thesis you'll build around.
- **Length and format:** default ~90 s, 16:9. ≤ 2:20 for X. 9:16 only when it's for Reels/Shorts/TikTok.
- **Script:** written by you from the source (default), or the user's script kept word for word, or restructured. Ask once if they pasted one.
- **Voice:** the user's own recording, Kokoro (free, local, default), or a paid voice (OpenAI with tone instructions, ElevenLabs) only with their OK. See `references/sound.md`.
- **Style:** call `get_selected_preset`. The style sets the whole look (palette, fonts, ground, texture, motion feel): apply it to the template's `:root`, fonts and card styles, or to the project's own theme. No style: use the template's paper-and-ink look, or offer a few styles from `list_presets` that fit the topic.
- **Tool:** an existing project keeps its tool (Remotion, Motion Canvas, Manim, ffmpeg edits…); follow `references/other-tools.md` and never convert it. A new project uses Hyperframes (`references/hyperframes.md`). If the Hyperframes agent skills are installed, use them for composition details.
- **Music:** none, a free library track, or generated (paid) with their OK.
- **Machine:** Node 20+ (for `npx hyperframes`), Python 3 with numpy, ffmpeg; whisper.cpp for word timing (optional but recommended, free).

**Paid steps:** only a paid voice, generated music or paid sound libraries cost money. Stop before any of them unless the user stated a budget; the free route (their voice or Kokoro, no music or a free library track, the synthesized effects kit) always exists.

**Rights:** facts only from the source or verified sources; no third-party logos, product screenshots, real people or existing characters without permission; music must be licensed or generated.

## Workflow

### 1. Brief and teaching truth
- Save the source text verbatim (`source.md`). Write `BRIEF.md`: audience, gap, thesis, spine (3–6 ideas), evidence, landing, length, voice, style, tool (`references/story.md` §1).
- Pick one structure (concept, how it works, list, story) and one hook (§2–3).

### 2. Script and plan
- `script.json` (copy `<playbook>/template/script.json` as the shape): `title`, `thesis`, `voice`, and `scenes[]` with `id` (`01-hook`, `02-plan`…), optional `chapter` (`1 · the plan`), `text` (the narration, written in cues), `tts` (pronunciation version), and `cues` (`{"v_whisper": "Whisper"}`) for every word something should happen on.
- `PLAN.md`: per scene its job, key message, visual idea, technique, and the time-coded build cued by the narration (`references/visuals.md`). Choose the persistent stage or mascot and the scene-change style once for the whole video.
- Read the narration aloud in your head against the target length (~2.5 words per second).

### 3. Storyboard in FrameJam (do it; it's the cheapest place to change your mind)
- Build each scene's final layout without animation first (in Hyperframes: the scene's elements placed, entrances can come later), with draft audio so scenes have length (`tts.py --provider say` or Kokoro).
- `python scripts/panels.py` snapshots the end of every scene into `storyboard/` and prints the `open_review` arguments (titles = chapters, captions = narration). Other tools: export one still per scene into `storyboard/`.
- `open_review({ title, panelsDir, panels })`, open the URL, `wait_for_feedback`. Revise the plan and layouts, `add_version({ reviewId, note })`, until approved.

### 4. Voice and the clock
- `python scripts/tts.py` (or the user's recordings + `--provider record`), then `python scripts/word_times.py` and `python scripts/build_timing.py`. The clock is `assets/timing.json`: scene starts and lengths from the real voice, every cue's time, caption chunks.
- A cue that isn't found stops the build and prints the scene's words; fix the cue word or the script.
- Re-voicing a scene later: `tts.py <id> --force`, then `word_times.py` and `build_timing.py` again; everything placed on cues moves with it.

### 5. Animate every scene on its cues
- New project: set up Hyperframes and the template (`references/hyperframes.md`), then build scene by scene in `scripts/index.template.html`. Place every entrance on `C.<cue>` (a little before the word), chapter furniture on `S[id].start`.
- Follow `references/visuals.md`: nothing before its word, one focal point, held read at the end of each scene, smooth eases, captions band kept free, deterministic motion.
- 8+ scenes: build them in parallel with subagents (each owns its scenes' sections), then merge.

### 6. Sound
- `python scripts/sfx.py` (free effects kit), choose effects per cue in `script.json` `sfx` and `scene_sfx`, add `music` if any, then `python scripts/mix.py` → `assets/soundtrack.wav` (voice on its clock, ducked music, effects, -16 LUFS). `references/sound.md`.

### 7. Render and check
- Hyperframes: `python scripts/build_html.py`, `npx hyperframes lint`, `npx hyperframes check`, `npx hyperframes render --quality high --output renders/v1.mp4`. Other tools: their render, with `assets/soundtrack.wav` as the audio.
- `bash scripts/sheet.sh renders/v1.mp4 2` and Read it; Read full-size frames at a few key cues; transcribe the render and compare with the script. Fix what you see before showing it.

### 8. Review in FrameJam
- `open_review({ title, videoPath: "<abs>/renders/v1.mp4" })`, open the URL, `wait_for_feedback` in the same turn.
- Map each comment's time to a scene with `assets/timing.json` (and to a cue: the nearest cue before it); pinned frame comments show the element. Fix, re-render to `renders/v2.mp4`, `add_version({ reviewId, videoPath, note })`, wait again. Stop when the comments say it's done.

## Quality bar
- **The hook works muted** in the first 3 s (big words or a striking picture, captions on).
- **One idea per scene, one thesis per video.** The viewer can repeat the thesis after one watch.
- **Every picture lands on its word** (within ~0.2 s), and every concrete noun said is on screen when it's said.
- **No slideshow:** nothing dumped at a scene's start and then frozen; reveals spread across the scene.
- **Readable on a phone:** captions ≥ 40 px, labels ≥ 40 px, ≤ 7 words per on-screen element, nothing under the caption band.
- **One look:** the style's palette and fonts everywhere; a consistent stage or mascot; 1–2 scene-change styles.
- **Sound:** voice clear above everything, effects quieter than the voice, music ducked, -16 LUFS, no clipping.
- **True:** every fact traced to the source; no third-party logos or real people without permission.

## Files in this playbook
- `scripts/` (any tool): `tts.py` (voice per scene: kokoro, say, piper, record, paid openai/elevenlabs), `word_times.py` (whisper.cpp word times), `build_timing.py` (the clock: scenes, cues, captions), `sfx.py` (free synthesized effects), `mix.py` (voice + effects + ducked music → soundtrack), `fetch_fonts.py` (Google Fonts as local files), `sheet.sh` (contact sheet).
- `template/` (Hyperframes): `index.template.html` (starter composition: paper look, chapter labels, caption box, line boil, wipes, cue helpers, a 4-scene example), `build_html.py` (fills it from the clock), `panels.py` (storyboard stills for FrameJam), `script.json` (the example script with cues and effects).
- `references/`: `story.md` (teaching truth, structures, hooks, techniques, narration), `visuals.md` (inventing the pictures, shots over time, layout, motion), `sound.md` (voices, timing, captions, music, effects, mix), `hyperframes.md` (set up, build loop, template, render rules), `other-tools.md` (the method in Remotion, Motion Canvas, Manim, ffmpeg).
