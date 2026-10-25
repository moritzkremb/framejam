---
name: talking-head-short
description: Turn a raw talking-head recording into a vertical split-screen short - the speaker in the bottom 60%, animated scenes in the top 40% that show what is being said as it is said (the real product, logos, results, typed prompts, steps), a title and captions on the seam. Removes dead air and earlier takes (keeps the last take). Works with whatever video tool the project uses; Hyperframes is the default for new projects.
---

# Split Screen Short

> **How to use this playbook.** It's a recipe, not a set of rules: every format, length, pace and formula below is a
> default, and whatever the user asks for wins. Don't open with questions: use the defaults, build, and mention the
> defaults you chose in one line when you share the first render (ask only if something essential is missing, like the
> footage itself). The first render is the proposal, so there's no plan to approve first. Storyboards only when the
> user asks to see the shots first. Planning files the method mentions (`BRIEF.md`, `PLAN.md` and the like) are your
> own working notes: write them when they help you, never as a step for the user.

**In:** one or more raw recordings of someone talking to camera, plus optional screen recordings, images or clips.
**Out:** a finished short (default 1080×1920, 30 fps) split 40/60: animated scenes on top that show each idea as
it's said, the speaker below with a face-centred crop, the title and then captions on the seam. Tight cuts with the
speaker's natural delivery and the last take of every line. The playbook's example and every number for it are in
`references/layout.md`.

The speaker's meaning and voice come first. Make it fast by removing dead air, not by speeding the voice up. For
repeated takes, **keep the last take**.

## Defaults (the user's request overrides any of them)

Work these out from the request and the files. Where nothing is said, use the default and keep going; ask only if something essential is missing.

- **Format.** 9:16 at 1080×1920 unless the user or the project says otherwise. Keep the source frame rate if it's
  a standard one (24/25/30/60), else 30.
- **Length.** Keep the whole story the speaker tells. Don't cut content to hit an arbitrary length; say so if it's
  far over the platform's limit and propose what to drop.
- **Tool.** If the project already renders with something (Hyperframes, Remotion, Motion Canvas, ffmpeg scripts),
  use it and never convert the project. For a fresh project use Hyperframes:
  `npx -y hyperframes init <name> --example blank --resolution portrait --non-interactive`. If the Hyperframes skills
  are installed, use them; otherwise `npx hyperframes docs` explains the composition rules.
- **Look.** The default look is in `references/layout.md` (light ground, white pills, a blue-cyan accent, Inter).
  Two styles are made for this playbook (Midnight Glow, Paper Marker): when one is picked, `get_playbook` returns it
  as `styleForThisPlaybook` with ready values for every look role. For any other FrameJam style (from
  `wait_for_pick`, or `get_preset` when the user names one), map its palette and fonts onto the same roles.
- **Transcription.** Free and local by default (`npx hyperframes transcribe`, whisper.cpp). Use a paid service only if
  the user asks or gave a budget; say the cost first. See `references/transcription.md`.
- **Music.** None unless asked or already part of the project.
- **Renders.** A request to make the video already allows local draft and final renders. Don't ask again.
- **Rights.** Only the user's own footage, media they're allowed to use, and web images whose terms allow it. No
  third-party logos or real people beyond what the user supplied or the story needs.

Requirements: Python 3 with NumPy, ffmpeg and ffprobe (plus Node 22 for Hyperframes).

## Project layout

Copy `scripts/` from this playbook into the project, then keep everything for this video inside the project:

```
source/        originals, never modified
transcripts/   source words, edited words, captions.json/.srt
working/       edit-01/, edit-02/ ... (one folder per cut), removals-NN.json, crops, contact sheets
assets/        crops and clips used in the video, fonts
renders/       draft-01.mp4, final-01.mp4 ... (never overwrite an earlier render)
BRIEF.md  EDIT_PLAN.md  VERIFY.md
```

## Workflow

### 1. Look at everything

- `ffprobe` every file: size, rotation, frame rate (variable?), audio streams, duration.
- Contact sheets of the talking head (early, middle, late) and of **every** supplied file, including camera and screen
  pairs: `ffmpeg -i in.mp4 -vf "fps=1/5,scale=320:-1,tile=6x6" -frames:v 1 sheet.jpg`. Then look at promising parts
  at 1 s intervals and at full resolution. File names are not enough to pick a shot.

### 2. Transcribe the raw recording

Follow `references/transcription.md`. Keep raw, silence-cut and final edited-time transcripts as separate files.

### 3. Remove dead air

Read `references/clean-cuts.md` first.

```bash
python3 scripts/prepare_edit.py --input source/talking-head.mp4 --transcript transcripts/source.words.json \
  --out working/edit-01 --fps 30
```

This writes `silence.edl.json` and `silence.transcript.json` (no video yet). Check `silences.log` and the kept ranges
against the waveform; adjust `--threshold-db` / `--min-silence` if speech was cut or long gaps survived.

### 4. Find earlier takes

Read the silence-cut transcript for false starts and double takes, then do the **partial-retake audit**: transcribe
3–6 s excerpts around every sentence start and every removed pause, because full-clip transcripts hide short
restarts. Keep the last version of each line; keep intentional repetition; flag an incomplete last take instead of
swapping in an earlier one. Write `working/removals-01.json` (source times, the take that replaces it, the reason).

### 5. Cut

```bash
python3 scripts/prepare_edit.py --input source/talking-head.mp4 --transcript transcripts/source.words.json \
  --removals working/removals-01.json --out working/edit-02 --fps 30 --render
```

Outputs `final.edl.json` (source ranges and their edited times), `speech.mp4` (silent picture, 1 s keyframes),
`speech.wav` (narration) and `cut.mp4` (both). Check: transcribe `speech.wav` and compare with the intended lines;
transcribe 3–6 s around every join; make a contact sheet of the frames on both sides of each cut. Fix and re-run into
a new folder (`edit-03`...) rather than overwriting.

Then:
- Transcribe the edited audio for caption timing (`transcripts/edited.words.json`) and fix names.
- Normalise the narration: `ffmpeg -i speech.wav -af loudnorm=I=-15:TP=-1.5:LRA=11 -ar 48000 speech-norm.wav`.

### 6. Plan the scenes

Work from the final edited narration. Write a beat sheet in `EDIT_PLAN.md`: one row per idea with its edited time,
the line, what the top panel shows, and the source of every real thing (file, crop, URL). Rules and the scene
vocabulary are in `references/layout.md`:
- One scene per idea, changing every 2–5 s on the first word of the sentence that motivates it; pieces land on the
  word that names them.
- Show the real thing whenever something is named (the product, the post, the result, the logo); designed pieces
  only for ideas without a picture. Never fake a product screen or a result.
- A list gets step pills ("STEP 01"), and all steps as rows the first time it's named.
- The last scene is the call to action with the exact words the speaker says ("comment TOOLS").

If the user wants to see the scenes first, show one still per scene as a storyboard (`working/storyboard/01-...png`,
`open_review` with `panelsDir`) and wait for feedback before animating.

### 7. Build

- **Speaker:** the cut video in the bottom panel with a face-centred crop (face tracked on the edited video,
  smoothed, stored per frame) and a small punch-in on every jump cut.
- **Title:** the hook on 1–2 pills on the seam from frame 0 until the first idea (about 4 s).
- **Captions:** `python3 scripts/make_captions.py --words transcripts/edited.words.json --max-words 4 --max-chars 26
  --out transcripts/captions.json --fix "..."`; on the seam after the title, the spoken word in the accent colour
  (keep word times for that).
- **Scenes:** the beat sheet, built on the scaled stage over the moving ground.
- **Sound:** quiet effects on scene changes and pops; the voice stays on top.

Keep the look roles as CSS variables (or one theme object) and generate captions and timed elements from data files,
so re-cuts and restyles don't mean hand edits. In Hyperframes, use one composition with the GSAP timeline; in
Remotion or Motion Canvas, build the same layers.

### 8. Check, render, review

- Hyperframes: `npx hyperframes check` must show 0 errors; snapshot the start, the end, every insert and a sample of
  captions; fix layout or contrast findings.
- Render a versioned draft (`renders/draft-01.mp4`). Check the encoded file: duration equals the cut to one frame,
  audio and video lengths agree, no black frames (`blackdetect`), loudness -14 to -16 LUFS integrated measured on the
  render, captions never stale across a cut.
- Open it in FrameJam: `open_review` with `videoPath` set to the render, then `wait_for_feedback`. Apply the
  comments, render the next version (`draft-02.mp4`) and send it with `add_version` and a short note of what changed.
  Repeat until the user approves, then copy the approved render to `renders/final-NN.mp4`.
- When a comment asks to change a cut, edit `removals-NN.json`, re-run step 5 into a new folder and remap every
  caption and insert time through the new `final.edl.json`; don't nudge times by hand.

## Quality bar

- No dead air, no doubled phrase, no clipped first or last syllable at any join; the last take of every line.
- Every caption matches the words heard, on time, on the seam, the spoken word lit.
- The top panel always shows the idea being said, and the real thing whenever something is named, readable on a
  phone; nothing sits still longer than ~5 s.
- The face is always fully in the bottom panel, centred, never covered.
- The title is on screen from the first frame. Sound is even and at -14 to -16 LUFS.
- `VERIFY.md` lists: source and cut durations, number of kept ranges, each removed take with its reason, checks run
  (transcripts of joins, contact sheets, loudness, blackdetect) and anything not verified. If you couldn't listen to
  the audio, say so; transcripts and waveforms don't prove a join sounds clean.

## Files in this playbook

- `scripts/prepare_edit.py`: silence-first, retake-second cut with auditable EDLs, retimed transcripts, and a
  frame-accurate render (`speech.mp4`, `speech.wav`, `cut.mp4`). `--help` lists the transcript formats it reads.
- `scripts/make_captions.py`: edited-time words to `captions.json` and `captions.srt` (frame grid, no overlaps,
  balanced phrase lengths, name fixes).
- `references/clean-cuts.md`: cut boundaries, how tight to cut, retake rules and the partial-retake audit.
- `references/transcription.md`: free and paid transcription, and what transcripts get wrong.
- `references/layout.md`: the 40/60 split, the moving ground, the scene vocabulary, title, captions, sound and the
  look roles a style replaces.
