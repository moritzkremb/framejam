---
name: slopcore-music-video
description: >
  Slopcore Music Video: a lyric music video the way anabology and Claude made ESCAPE VELOCITY, CLODYSSEY and BLISS
  (claudia.gallery). A song about a scene's memes (the AI timeline by default), one photographic lead (Claudia, the
  open character, or the user's own) held by identity text in every prompt, Midjourney plates, Seedance 2.5 shots with
  lip sync measured from the soundtrack, and a layer of motion design drawn in code: every sung word on screen at its
  time, one graphic per line that explains it, and a through-line device that escalates. Works in the project's own
  video tool (Hyperframes by default); every version is reviewed in FrameJam. For the stills-only cartoon version use
  the Slopcore Cartoon playbook.
---

# Slopcore Music Video

> **How to use this playbook.** It's a recipe, not a set of rules: every format, length, pace and formula below is a
> default, and whatever the user asks for wins. Don't open with questions: use the defaults, build, and mention the
> defaults you chose in one line when you share the first render (ask only if something essential is missing, like the
> footage itself). The first render is the proposal, so there's no plan to approve first. Storyboards only when the
> user asks to see the shots first. Planning files the method mentions (`BRIEF.md`, `PLAN.md` and the like) are your
> own working notes: write them when they help you, never as a step for the user.
>
> This playbook spends real money (Midjourney, Seedance, Suno), so it keeps the original's one hard rule: **nothing is
> spent until the user has seen what it will be spent on.** Its few reviews are where only a person can judge.

A song full of a scene's in-jokes goes in; a music video that explains every one of them comes out. The method is the
one behind anabology's three films with Claudia, made with Claude as the production team: ESCAPE VELOCITY (5:06, 141
shots, a techwear fashion show where every look is a Silicon Valley meme, under a split-flap countdown to "escape the
permanent underclass"), CLODYSSEY and BLISS. Their wiki and every prompt they ran are at https://claudia.gallery; this
playbook condenses it. `<playbook>` below means this folder (the local path `get_playbook` returned).

Five things carry the quality:
1. **Every sung word is on screen when it is sung**, at its measured time (a check prints N of N).
2. **Every lyric line gets a graphic that explains it**: the chart a number implies, the label, the counter, the
   interface the joke is about. Animated lyrics alone are not the product.
3. **A through-line device in every shot** that escalates: ESCAPE VELOCITY's split-flap countdown, CLODYSSEY's rope-load
   readout, BLISS's XP desktop.
4. **Measured, not eyeballed:** word times from forced alignment checked by ear, cuts on a beat map, lip sync from
   comparing audio, spend from the provider's bill.
5. **A person's attention only where it counts** (below); everything between runs without asking.

## What goes in, what comes out
- **In:** a topic or story (default: the AI timeline), a song or the wish to make one, optionally the lead (Claudia by
  default), a look, an accent colour, a budget.
- **Out:** a 16:9 1080p music video as long as the song (2:30–5:00), every sung word on screen at its time, a CRF 16
  master tagged BT.709, plus a 9:16 cut if asked. Reviewed in FrameJam.

## Defaults (the user's request overrides any of them)

- **Scale** (`references/method.md` has the table): **Quick** ($3–20 of video, a few hours: an API image model, a few
  cheap clips, 2.5D plates, a default renderer), **Studio** ($50–110, 1–2 days: Midjourney, Suno, sung Seedance clips
  with measured lip sync, one graphic per line), **Full** ($90–250, 19–41 hours: multi-agent boards and per-chapter
  motion design). When unsure, start Quick; every file carries over.
- **Lead:** Claudia, the open character (credit "Claudia by anabology" if you can), held by her identity text pasted
  word for word into every image prompt (`references/generation.md`); or the user's own character, written the same
  way. Never a real person or someone else's character.
- **Song:** the user's, or written together and made in Suno (2:30–3:30): the topic obvious in the first two lines,
  every reference landing in one listen, verse lines of 10–13 syllables (`references/song.md`). The user picks the
  take by ear.
- **Look:** the image model's own colour (never a monochrome grade over the footage), one accent (default clay
  `#D97757`), a style family of words at the end of every plate prompt. Density: budgeted (one hero device per shot)
  unless the user wants every line dense. A FrameJam style sets the type, graphics and accent of the overlay.
- **Concept:** taken from the request. Only when it's open ("make one about AI"), write three pitches of ≤ 120 words
  (premise, through-line device, lead, arc, one risk) and go with the strongest unless the user picks.
- **Tool:** an existing project keeps its tool; a new one uses Hyperframes (its skills if installed).
- **The Claudia gallery:** connect it for her canon, every prompt the films ran and the guides
  (`claude mcp add --transport http claudia https://claudia.gallery/mcp`, or its skill). Free, optional.

## Where the user decides (as FrameJam reviews, nothing else waits)

| When | Show | Ask |
|---|---|---|
| The song | the takes (they listen) | which take, or which line is wrong |
| Her face | four test plates of the lead, as a storyboard project | is this her? (flag any wrong face) |
| Before any spend | the storyboard (one panel per shot, its lyric and graphic in the caption) and the prompt book with its cost | "These N prompts cost about $X. Go?" |
| v1 | a 20–40 s excerpt first, then the full render | accept, or what's wrong |

Silence never approves spending. A quality complaint stops every paid job at once. Log every note verbatim against its
shot id in `DECISIONS.md` and apply every note; a later note wins. Fix the source (the prompt or the plate), never the
frame.

## Workflow

### 1. Brief and research
`BRIEF.md`: the ask verbatim, then the look, accent, density, taboos and budget (a target and a cap per service).
Research a bank of the scene's live memes and events with sources (a separate pass verifies each fact). Obscure
references go into the graphics, not the lyric.

### 2. Song
Lyrics, then Suno takes round by round (`references/song.md`: style fields, pronunciation, section cues). The user
picks by ear and hands over the WAV.

### 3. Listening
`bash <playbook>/scripts/setup.sh audio/master.wav`, then `references/pipeline.md`: stems, a beat map on the kick
(Suno takes speed up: never a fixed BPM), every word's time by forced alignment, a list of hits. Check every flagged
word by ear (or ask the user) before boarding: a delay throw once got aligned 2.6 s early.

### 4. The lead
Her identity text, the looks for this world (wardrobe per look, described as garments, never designers), four test
plates. Review them (the table above).

### 5. The board
`references/board.md`. First the treatment, the through-line device, the chapter map, plants and payoffs. Then every
shot: time (on beats), lyric and how it's typed, set, framing, action, camera on a hit, what moves (still, 2.5D,
motion clip or sung clip), the plate prompt, the explaining graphic. `scripts/shot_plan.py` drafts the cuts from the
beat map and word times. Run the audit until every gate passes: the shots tile the song, cuts within 0.03 s of a beat,
every line typed and explained, the lead on screen ≥ 70%, clips within budget and their windows, no plate used twice.

### 6. Plates and the prompt book
Midjourney prompts in the fixed order (framing → her identity text → wardrobe → action and place → empty space for
type → style family → "no text, no letters, no logos"), `--ar 16:9 --v 8.2 --raw --hd`. Midjourney has no API: the
user runs the batches from your prompt sheet and saves picks as `assets/plates/<shot>.png`. Pick from contact sheets,
one image per shot; check every face large. Then write every clip prompt yourself, in one context
(`references/generation.md`), estimate the cost (planned seconds × price × 2) and show the board and the book (the
table above).

### 7. Clips and lip sync
After the go: a three-clip pilot, then the rest. Sung windows of 4–8 s with a clean vocal of only her words; compare
each take's own soundtrack with the real vocal, keep it up to the last eighth note before they diverge, cover the rest
with a new clip from that frame, and cut away after three failures. No lip-sync models. Quote spend from the provider's
bill.

### 8. Edit and motion design
`references/overlay_system.md`. Every frame a pure function of song time; stills stand in for missing clips so the film
renders end to end at every stage. Lyrics live on surfaces in the scene (subtitles, tags, split-flap rows, title bars),
never karaoke alone; type tucks behind her with a matte; one graphic per line on the word that names it; the device
escalates. Render a 30 s excerpt early and show it before building the rest.

### 9. Checks, render, review
The lyric gate (N of N words on screen at their time), contact sheets of every chapter, 100% crops of her face, the
flash test (≤ 3 full-frame flashes a second), then a CRF 16 BT.709 master. `open_review` with `videoPath`,
`wait_for_feedback`, apply every note, `add_version`. Scrub what you publish (no job ids in metadata, no private names),
and say it's AI-made with the tools named.

## Quality bar
- N of N sung words on screen at their measured time; type composed into the scene, readable on a phone.
- One explaining graphic per line, at least six kinds in the film, never the same kind three lines in a row.
- Every cut within 0.03 s of a beat or a declared hit; the cut rate follows the song section by section.
- The lead recognisable on screen ≥ 70% of the runtime, singing on camera for most sung words; on model in every
  plate (identity text unchanged); an adult face.
- The hook: at 1.0 s her face, her accent and one readable line of the premise; the premise by 3 s; the first joke by
  10 s; no black frames or slow title first.
- The image model's colour kept; one accent; no text from the generator (all type in code).
- Spend: nothing before the go; real spend from the bill.

## Files in this playbook
- `references/method.md`: scales, the reviews, spending, accounts, the order of work, publishing and credit norms.
- `references/board.md`: the device, the shot fields, the explaining graphics, the hook, the cut rhythm, the lead's
  share, what moves and what it costs, the audit.
- `references/generation.md`: the lead's identity text, Midjourney plates, Seedance prompt templates (sung and motion),
  measured lip sync, providers and costs.
- `references/song.md`: lyric rules, Suno style fields, pronunciation, takes, listening.
- `references/overlay_system.md`: the motion design layer: engine, lyric surfaces, graphics, tucks, colour, checks.
- `references/style_anatomy.md`: what ESCAPE VELOCITY looks like, measured, as the reference for the default.
- `references/pipeline.md`: every command.
- `scripts/`: `setup.sh`, `audio_analysis.py` (stems, beat map, onsets), `lyrics_align.py`, `lyrics_fix.py`,
  `plot_lyrics.py` (word times and the ear-check plots), `shot_plan.py` (cuts on beats at each line's pickup),
  `base_edit.py` (clips and plates cut to their slots), `sheet.py` (contact sheets).
- The tools the films used but didn't publish (the board audit, the sync check, covers, the renderer, the lyric gate)
  are specified, with their constants, at https://claudia.gallery/wiki/toolkit/.
