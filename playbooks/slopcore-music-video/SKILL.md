---
name: slopcore-music-video
description: >
  Slopcore Music Video: turn a song about a scene's current memes (AI by default) into a reference-dense music video.
  One generated muse from a moodboard, image-to-video clips cut on every sung line, and a sharp code overlay of
  lyrics, citations, labels, charts, a countdown and a news ticker on top. After @anabology's "Slopcore: Escape
  Velocity". Works in whatever video tool the project uses (Hyperframes by default). Every version is reviewed in
  FrameJam. Use for "make a video like anabology's / donald's", a meme-dense lyric video, a fashion-film or K-pop style
  AI music video, or a song about the AI timeline. Not for narrated explainers or product demos.
---

# Slopcore Music Video

> **How to use this playbook.** It's a recipe, not a set of rules: every format, length, pace and formula below is a
> default, and whatever the user asks for wins. Don't open with questions: use the defaults, build, and mention the
> defaults you chose in one line when you share the first render (ask only if something essential is missing, like the
> footage itself). The first render is the proposal, so there's no plan to approve first. Storyboards only when the
> user asks to see the shots first. Planning files the method mentions (`BRIEF.md`, `PLAN.md` and the like) are your
> own working notes: write them when they help you, never as a step for the user.

A song goes in; a dense, internet-literate music video comes out. A generated protagonist (the muse) walks through a
season of looks, each shot a lyric's joke, while a pin-sharp overlay annotates everything: the sung line, a giant hook
word, a citation for the meme, a price tag, a chart, a countdown that escalates, a ticker of timeline news.

Inspired by @anabology's "Slopcore: Escape Velocity" (https://x.com/anabology/status/2103534482930491441), which
Claude Opus 5.5 made overnight from @donaldjewkes' long prompt, Midjourney and a moodboard, with a Suno song.
`references/style_anatomy.md` breaks down exactly what defines the look. Read it first.

How the work splits:
- **Song:** the user's, or written from the timeline's memes and generated (`references/song.md`).
- **Imagery:** a moodboard → a muse sheet → one still per shot → image-to-video clips (`references/generation.md`).
- **Edit:** `shot_plan.py` cuts on each sung line's pickup; `base_edit.py` assembles clips into a frame-exact base
  with the untouched song.
- **Overlay:** code, in the project's video tool, specified in `references/overlay_system.md`.
- **Review:** FrameJam, after every render (and the stills first, if the user wants to see them).

`references/pipeline.md` has every command. `<playbook>` = this folder (the local path `get_playbook` returned).

## What goes in, what comes out
- **In:** a topic or scene (default: the AI timeline), a song or the wish to write one, a moodboard or a direction for
  one, optionally a muse based on the user (own photos, consent) and brand colours/fonts for the overlay.
- **Out:** a 16:9 1080p music video (~2:20 for X; as long as the song otherwise), every sung word on screen on time,
  reviewed and approved in FrameJam.

## Defaults (the user's request overrides any of them)

Work these out from the request and the files. Where nothing is said, use the default and keep going; ask only if something essential is missing.
- **Topic and device.** The scene whose slang drives the lyrics, and the frame device that numbers the shots
  (fashion collection with looks, keynote with slides, countdown, trial with exhibits, training run with steps).
- **Song.** Supplied (its lyrics win) or written and generated. Music generation usually costs money.
- **Moodboard.** The user's board, or one you assemble from the premise for their approval.
- **Muse.** Fictional (default) or the user from their own photos. Never a celebrity or other real person.
- **Generators.** What the runtime can already use (an image tool, MCP connectors, API keys, the user's Midjourney
  account) and the user's preference. Midjourney has no API and its terms don't allow automating the website: the user
  runs those prompts from a sheet you prepare. Image and video generation usually cost money.
- **Budget.** A number for generation, or the zero-spend route: stills with slow push-ins instead of clips (say it
  will look like a lyric video over a photo shoot), the runtime's own image tool, the user's song.
- **Video tool.** The project's existing tool (Remotion, Hyperframes, Motion Canvas, an editor's timeline). No project
  yet: Hyperframes (if its skills are installed use them, otherwise `npx hyperframes docs` / `npx hyperframes init`).
  Don't convert an existing project to another tool.
- **Style.** Use the style picked for this video, if any (from `wait_for_pick`, or `get_preset` when the user names one). A FrameJam style sets the overlay's fonts, colours and label voice; the
  moodboard sets the imagery. No style: use the defaults in `overlay_system.md`.
- **Machine.** Python 3.11 (via `uv` or python3.11), ffmpeg, git, Node for the video tool.

Stop before the first paid generation unless the user gave a budget. Keep `analysis/ledger.md` of every paid call.
When nothing is said, choose defaults (and still stop at the first paid step without a budget). Name the defaults you used when you share the first render.

## Workflow

### 1. Research
- If the user names a reference video, study it: frames every 2 s as contact sheets, then every 0.2 s on the hook and
  one chorus; measure the cut rhythm (`ffmpeg … select='gt(scene,0.3)'`) and the tempo. Note device, muse, acts,
  overlay vocabulary.
- List 25-40 phrases the audience repeats about the topic, each with its source, in `analysis/references.md`
  (`song.md`). These feed the lyrics, looks, ticker and citations. Quote only what you can source.

### 2. Song and setup
- In a new folder (or a subfolder of the user's project): `bash <playbook>/scripts/setup.sh <song>` in the
  background.
- No song: write lyrics (`song.md`), generate 2+ takes with the user's tool, pick by transcript completeness,
  `audio/master.mp3`. You can't hear it; the user judges the sound.

### 3. Analysis and shot plan
- `audio_analysis.py`, `lyrics_align.py transcribe` (background), hand-correct `analysis/lyrics.txt` with
  `# section:` headers, `align`, `lyrics_fix.py`, `plot_lyrics.py` and Read the plots.
- `shot_plan.py --flurry chorus`: a cut on each line's pickup, splits on downbeats, ~1 bar median.
  Check `analysis/shots.md`: median 1.2-2 s, no shot over ~4 s except deliberate holds.

### 4. Style bible and treatment
- **STYLE.md:** premise and device, spine counter (start → end values and the beats where it changes), muse traits
  (4 locked words), 3-4 acts with location, light and palette, the one accent colour, overlay fonts, bans (logos,
  real people, made-up quotes).
- **TREATMENT.md:** the hook (first 3 s, works muted), the arc, one row per section, then fill `shots.json` per
  shot: `look`, `prompt`, `hero`, `overlay` (which annotation, artifact or chart). Give each act a different light,
  vary shot sizes (close, medium, full, insert), and leave the hero word's space in the prompt.

### 5. Moodboard and muse
- Collect or build the moodboard (`generation.md` §1), write its adjectives into STYLE.md.
- Muse sheet and crops (§2). Get the user's OK on the muse before generating shots; it's in every frame.

### 6. Stills
- One still per planned shot (40-60 unique for ~2:30; reuse close-ups across chorus shots), in batches, Read each at
  full size, regenerate misses (drifted muse, garbled signage, logos, no room for the hero word).
- Midjourney: write `analysis/prompts.md` for the user to paste; they save picks as `assets/stills/sNNN_<desc>.jpg`.
- **Only if the user wants to see the stills first** (worth offering before paying for clips): copy the stills to `out/storyboard/`, `open_review` with `panelsDir` (absolute path), open
  the URL, `wait_for_feedback`. Fix the flagged panels; `add_version` if many changed.

### 7. Clips and base edit
- Image-to-video for each approved still within the budget (§4): one action, one slow camera move, 4-6 s.
  Record `clip`, `in` (best moment) per shot. Singing close-ups first; inserts last.
- `base_edit.py` → `out/base.mp4`. Watch it at 2 fps contact sheets: the cut rhythm alone should already feel like
  the song.

### 8. Overlay and render
Build the overlay over the base edit in the video tool, from `overlay_system.md`, driven by `analysis/lyrics.json`
and `analysis/shots.json` (never hand-typed times):
1. Frame HUD, ticker and spine counter (constant layer; counter changes at the planned beats).
2. Subtitle line with karaoke highlight for every sung line.
3. Hero words, rotating treatments, in the negative space.
4. Annotations, artifacts and data viz per shot's `overlay`, moving on beats.
5. Hook card and end card (signature accent macro, counter's final state, one credit line).
Render `out/final/v1.mp4` with the master as the only audio.

### 9. Watch, then review in FrameJam
- Verify (`pipeline.md`): duration matches the song, 0.5 s contact sheets of everything (Read them all), hero words
  at their onset frames, the first 3 seconds, every act change. Fix before showing it.
- `open_review` with `videoPath` (absolute path to the render), open the URL, loop `wait_for_feedback` until the user
  presses Finish review. Map each timestamped note to its shot (`shots.md`) or overlay element, fix (new still or clip
  for an image note, code for an overlay note), re-run `base_edit.py --only` when footage changed, render
  `out/final/v2.mp4`, verify, `add_version` with a one-line note, wait again. Stop when the user approves.
- Deliver `<slug>-v<N>.mp4` where the user keeps finished videos (else `out/final/`); X cut per `pipeline.md`.
- Report what was verified, which lyric words were guessed, what was spent on which tool, and the limits (you can't
  hear the song; generated motion vs stills).

## Quality bar
- **Every sung word is on screen at its onset** (the subtitle at least); hero words peak on the onset frame.
- **Dense but readable:** at most one hero treatment, one annotation and one artifact per shot, plus the constant
  HUD; nothing over the muse's face; one accent colour.
- **Every line is a reference** and the overlay proves it: citations are real and attributed, invented numbers read
  as jokes.
- **One muse, held:** same 4 traits in every shot; the signature accent returns at the end.
- **Soft footage, sharp overlay:** never grade or filter the generated pixels to "fix" them; replace weak shots.
- **The counter escalates** and pays off in the last chorus.
- **Hook in 3 s, muted.** The premise sentence and the muse's face.
- **Rights:** the song is the user's, licensed, or generated under a plan that allows the use; no logos or real
  people in the imagery; real names appear only as cited quotes in text.
- **Photosensitivity:** at most 3 full-frame flashes per second.
- **Watch it yourself** before every FrameJam round.

## Files in this playbook
- `scripts/setup.sh`: project folders, copies the helpers to `tools/`, builds the Python env.
- `scripts/shot_plan.py` (new): cut plan from lyrics and beats → `analysis/shots.json` / `shots.md`.
- `scripts/base_edit.py` (new): clips/stills cut to their slots + the song → `out/base.mp4`.
- `scripts/audio_analysis.py`, `lyrics_align.py`, `lyrics_fix.py`, `plot_lyrics.py`, `sheet.py`: copied from the
  Cartoon Music Video playbook (MIT, derived from Scenario's kinetic music video skill), writing to `analysis/`.
- `references/`: `style_anatomy.md` (what defines the look, measured), `overlay_system.md` (specs),
  `generation.md` (moodboard, muse, stills, clips, song contracts), `song.md`, `pipeline.md`.
- `THIRD_PARTY_LICENSE`: MIT, Scenario (the copied analysis scripts).
