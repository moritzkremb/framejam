---
name: slopcore-cartoon
description: >
  Slopcore Cartoon: turn a song about a scene's memes (the AI timeline, a job market, any in-jokes) into a cartoon
  music video for a few dollars. One illustrated character lives through the song's story in one locked 2000s-TV
  cartoon style, a still per line with push-ins cut on the beat, every lyric on screen, and stamps, counters and a
  running HUD that explain each joke. Stills only, no video generation. Works in the project's own video tool
  (Hyperframes by default); every version is reviewed in FrameJam. For the photographic, generated-video version use
  the Slopcore Music Video playbook.
---

# Slopcore Cartoon

> **How to use this playbook.** It's a recipe, not a set of rules: every format, length, pace and formula below is a
> default, and whatever the user asks for wins. Don't open with questions: use the defaults, build, and mention the
> defaults you chose in one line when you share the first render (ask only if something essential is missing, like the
> footage itself). The first render is the proposal, so there's no plan to approve first. Storyboards only when the
> user asks to see the shots first. Planning files the method mentions (`BRIEF.md`, `PLAN.md` and the like) are your
> own working notes: write them when they help you, never as a step for the user.

A song full of a scene's in-jokes goes in; a cartoon music video that explains every joke comes out. It's the
Slopcore method on a small budget: the density, the one recurring character and the explaining graphics stay, the
generated video goes. Every frame is a still illustration moved and cut in code. Example: "So Over (We're So Back)",
2:38, a 22-year-old's first job hunt in the AI economy, 22 stills, about $5 of images and a free local song
(`references/example.md`).

`<playbook>` below means this folder (the local path `get_playbook` returned).

## What goes in, what comes out
- **In:** a topic or a story, a song or the wish to write one, optionally a look, colours or a character idea.
- **Out:** a 16:9 1080p mp4, 2–3 min (as long as the song), every sung word on screen at its time, reviewed in
  FrameJam.

## Defaults (the user's request overrides any of them)

- **The story:** one character, one situation that gets worse and funnier through the song (a graduate's job hunt, an
  intern replaced by agents). The topic is obvious in the first two lines; every reference lands in one listen.
- **Song:** the user's, or written together and generated. Verse lines are natural sentences of 10–13 syllables with a
  rhyme on the last word; the chorus is a chant everyone can repeat ("It's so over, we're so back"). Generators: ACE-Step
  run locally (free), MiniMax Music or Suno (paid). Make 2+ takes and let the user pick by ear.
- **Look:** one style block, written once and pasted at the top of every image prompt: the era, the line, the fill, the
  texture, a strict palette of 5–6 hex colours, "no text, letters, words or logos". Default: a bold flat early-2000s
  TV cartoon on warm paper (the example's block is in `references/example.md`). A FrameJam style sets the on-screen
  type, stamps and colours; take the palette into the style block too.
- **Cast:** the main character and at most one sidekick, each one paragraph of fixed traits (age as a number, hair,
  one signature garment, one prop). Fictional by default; never a real person or someone else's character.
- **Images:** an image model that takes reference images (GPT Image by default via `scripts/gen_stills.py`, Nano
  Banana, Midjourney); about $3–6 for a whole video. Stop before the first paid call if the user hasn't said it's fine.
- **Tool:** an existing project keeps its tool; a new one uses Hyperframes (if the Hyperframes skills are installed,
  use them for composition details).

## Workflow

### 1. Story and references
- Write `BRIEF.md`: the premise in one sentence, the character, the arc in 3–4 beats, the running number that gets
  worse (the HUD: "P(HIRED) 12.0% → 0.3%", "DAY 001 → 214 OF JOB HUNT"), and 20–30 phrases the audience already
  repeats about the topic, each with its source.

### 2. Song and timing
- Lyrics from the references, then takes (`references/example.md` has the example's generator prompt). The user picks.
- Time every word: copy the Slopcore Music Video playbook's analysis scripts (`get_playbook("slopcore-music-video")`,
  its `scripts/`): `audio_analysis.py` for the beat map, `lyrics_align.py` and `lyrics_fix.py` for word times. Check
  flagged words by ear (or ask the user to) before planning shots on them.

### 3. Character sheet and stills
- `stills.json` in the project: the style block, the cast paragraphs, the sheet id, and one shot per lyric line (or per
  two short lines): framing, what the character does, the joke prop, and where the empty space for type is ("left half
  empty cream space").
- `python3 <playbook>/scripts/gen_stills.py` makes the character sheet first, then every shot with the sheet as its
  reference. Look at every still large: the character on model (hair, garment, age), no text in the image, room for the
  type. Delete and re-roll the misses.
- Only if the user wants to see them first: `open_review` with `panelsDir` = `assets/img`, then `wait_for_feedback`.

### 4. Build
- One composition, driven by the word times (never hand-typed). Cuts on the half-beat at or just before each line's
  first word; every still moves (a slow push, a pan, a punch-in on the hook word), never a dead hold.
- **Lyrics:** every sung word on screen at its time: a subtitle line with the sung word lit, plus 1–2 big punch words
  per chorus line in the negative space.
- **Explaining graphics, one per line,** drawn in code over the still: a stamp ("AUTOMATED", "100% BOTS"), a counter
  that rolls ("cover letters sent: 300"), a progress bar ("escape progress 3%"), a job post, a chat bubble. Use at
  least five kinds and never the same kind three lines in a row.
- **The HUD:** two corner cards for the whole video carrying the running numbers, updated at the planned beats, paid off
  in the last chorus.
- **End card:** the title in the big display font and one credit line.

### 5. Render, check, review
- Render to `renders/v1.mp4`. Contact sheet at 2 frames a second: a cut on every line, no still on screen without
  movement, every punch word on its word, nothing over the character's face.
- `open_review` with `videoPath`, `wait_for_feedback`, apply each note (a still note: re-roll that still; a type note:
  change the code), render `v2`, `add_version`, wait again.

## Quality bar
- **Every sung word on screen at its time,** checked against the word times.
- **Every line explains its joke** with a graphic, not just the lyric.
- **One character, held:** same hair, garment and age in every still; the style block unchanged in every prompt.
- **Something moves in every frame;** cuts on the beat; at most three full-frame flashes a second.
- **The running number escalates** and pays off at the end.
- **Readable on a phone:** subtitle ≥ 40 px, punch words large, stamps and counters short.
- **Rights:** the song is the user's or generated under a plan that allows the use; no logos or real people in the
  images; real names only as quoted text with a source.

## Files in this playbook
- `scripts/gen_stills.py`: the character sheet, then one still per shot with the sheet as reference, from
  `stills.json` (GPT Image; needs `OPENAI_API_KEY`).
- `references/example.md`: "So Over (We're So Back)": its style block, cast, song prompt, HUD, stamps and counters.
- Timing uses the Slopcore Music Video playbook's `scripts/` (beat map, word alignment, fixes).
