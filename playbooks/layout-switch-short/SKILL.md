---
name: layout-switch-short
description: Turn a raw talking-head recording into a vertical short that switches layout with the speech every few seconds - speaker alone, split screen with the thing being described, full-screen visual with the speaker cut out in front, and a step roadmap that returns at every new step. Includes the cut (pauses and earlier takes removed), short captions placed per layout, and a Hyperframes starter template. Works with the project's own video tool too.
---

# Dynamic Layout Short

**In:** a raw recording of someone talking to camera (best: a how-to or list with clear steps), plus screen
recordings, screenshots, product photos or footage of what they talk about.
**Out:** a 1080×1920 short where every beat of the speech gets the layout that fits it, hard-cut every ~3 s:

| Layout | When |
| --- | --- |
| **speaker**: the speaker alone, wide or punched in | claims, numbers, opinions, the payoff, the call to action |
| **split**: the thing on top, the speaker below | a concrete thing is named (a site, a product, a document) |
| **visual**: the thing full-screen, the speaker cut out in front | a process or a tool doing something, in motion |
| **roadmap** (split): the step list, current step boxed | every new step ("Step two...") and a recap at the end |
| **title** (split): the hook headline | from frame 0 until the first idea lands |
| **words** (split): 1–3 big words landing as spoken | an abstract idea with no picture |

Short captions (1–3 words) sit where each layout leaves room. The pattern comes from a reel by @itsolelehmann;
`references/reference-breakdown.md` has its full timeline and the rules derived from it.

## Before you start

Decide once, write it in `BRIEF.md`, ask only what can't be worked out:

- **Is the speech right for it?** It works best with a structure (steps, a list, a before/after). If there's none,
  use the speaker, split and visual layouts only and skip the roadmap.
- **Steps.** Name the steps in 2–5 words each, from the speaker's own words (max 6). These become the roadmap.
- **Visuals.** List what the user supplied. Every split and visual beat needs a real picture of the thing being
  said. Missing ones: a web screenshot of a public page or a product photo (record the URL and terms), or switch that
  beat to speaker or words. Never fake a product screen or a result.
- **Tool.** If the project already renders with another tool, follow this method there, using the geometry in
  `references/layouts.md`; never convert the project. Say what the bundled template would have added (the
  data-driven build and checks). For a fresh project, use Hyperframes with the template in `template/`.
- **Look.** If the user picked a FrameJam style (`get_selected_preset`), map it onto `theme` in edit.json: gradient
  colors, fonts, accent, caption pill and card look. Layouts, timing and caption positions stay as described.
- **Transcription.** Free and local by default (`references/transcription.md`); paid only with the user's OK.
- **Music.** None unless asked. If asked: licensed or generated, 18–24 dB under the voice.
- **Rights.** Only the user's own footage and media they may use. Don't reuse the reference reel's footage, titles or
  exact colors.
- A request to make the video already allows local renders; don't ask again.

Requirements: Python 3 with NumPy, ffmpeg, Node 22 (for `npx hyperframes`).

## Setup

```bash
npx -y hyperframes init my-short --example blank --resolution portrait --non-interactive
cp -R <playbook>/template/. my-short/          # build.py, edit.example.json, assets/fonts
cp -R <playbook>/scripts my-short/scripts
mkdir -p my-short/{source,transcripts,working,assets/vis,renders}
```

Put the raw recording in `source/` (never modify it) and the user's media in `source/` too. If the Hyperframes
skills are installed use them for anything not covered here; otherwise `npx hyperframes docs`.

## Workflow

### 1. Look at everything

`ffprobe` every file. Contact sheets of the talking head and of every supplied file
(`ffmpeg -i in.mp4 -vf "fps=1/5,scale=320:-1,tile=6x6" -frames:v 1 sheet.jpg`), then 1 s sheets and full-resolution
frames of promising parts. Note what each file can show and where.

### 2. Cut the speech

Same as a clean talking-head edit (details in `references/clean-cuts.md`):

1. Transcribe the raw recording (`references/transcription.md`).
2. `python3 scripts/prepare_edit.py --input source/raw.mp4 --transcript transcripts/source.words.json --out working/edit-01`
   (silence pass, fast settings).
3. Find earlier takes: read `working/edit-01/silence.transcript.json`, then the partial-retake audit (3–6 s excerpts
   around every sentence start and removed pause). Keep the last take; write `working/removals-01.json`.
4. `python3 scripts/prepare_edit.py ... --removals working/removals-01.json --out working/edit-02 --render`.
5. Check the joins (transcribe the cut and 3–6 s around each join; frames on both sides).
6. Copy `speech.mp4` to `assets/speech.mp4`; normalise the narration:
   `ffmpeg -i working/edit-02/speech.wav -af loudnorm=I=-15:TP=-1.5:LRA=11 -ar 48000 assets/speech-norm.wav`.
7. Transcribe `speech.wav` for edited-time words: `transcripts/edited.words.json`.

### 3. Plan the beats

Read the edited transcript and split it into beats at phrase boundaries. Give each beat a layout using the table above
and these rules (`references/reference-breakdown.md` shows them in a real reel):

- Open with **title** (the promise, with a number if the speech has one) from 0 s to the end of the first sentence.
- Every "step N" → **roadmap** with that step boxed, 1.5–3 s, then the beat that explains it.
- Named thing → **split**; process in motion → **visual**; claim, number, joke, payoff → **speaker** (punch-in 1.2–1.3
  for weight; alternate punch-in and wide when two speaker beats are close).
- Beats 1.5–5 s; switch on the first word of the phrase that motivates the change; never the same layout with the
  same content twice in a row; roughly 40–50% split/roadmap, 25–35% speaker, 15–25% visual.
- End with **roadmap** `"step": 0` (recap) and then **speaker** for the call to action.

Write the plan as `edit.json` (start from `template/edit.example.json`; every beat has `start` in edited seconds,
`layout` and its fields). Then prepare each visual: crop screenshots to the part that matters (`ffmpeg -ss T -i
screen.mp4 -frames:v 1 -vf crop=w:h:x:y assets/vis/name.png`), trim clips to the beat length plus a little, mute
them. A visual beat wants portrait-ish media (crop ~9:16) or `"fit": "contain"` + `"box"` + `"backdrop": true`.

If more than ~5 visuals had to be found or made, show the plan first: one still per beat in
`working/storyboard/01-....png` (a snapshot or the picture with the layout name written on it), `open_review` with
`panelsDir`, and adjust before building.

### 4. Cut-outs and captions

```bash
python3 scripts/make_cutouts.py --edit edit.json          # visual beats only; local background removal
python3 scripts/make_captions.py --words transcripts/edited.words.json --breaks edit.json \
  --out captions.json --fix "cloud code=Claude Code"
```

`make_cutouts.py` writes `assets/cutouts/<beat>.webm` and fills in each beat's `cutout`. Re-run it with `--force`
after a beat's start or end changes. Captions are 1–3 words, never across a beat start.

### 5. Build and check

```bash
python3 build.py                # edit.json + captions.json -> index.html
npx hyperframes check           # must show 0 errors; fix contrast and overlap warnings
npx hyperframes snapshot --at <one time inside every beat> --describe false
```

Look at every snapshot: face fully visible and not cut by the seam in split beats (tune `speakerY`), caption clear of
the mouth and the cut-out's hair, visuals readable on a phone, roadmap text sharp on the current step, nothing
important in the right 120 px between y 1100 and 1700.

### 6. Render and review

```bash
npx hyperframes render -o renders/draft-01.mp4
```

Check the file: duration equals the cut; audio and video lengths agree; no black frames
(`ffmpeg -i r.mp4 -vf blackdetect=d=0.1 -an -f null -`); loudness -14 to -16 LUFS integrated
(`ffmpeg -i r.mp4 -af ebur128=framelog=quiet -f null -`). Then `open_review` with `videoPath`, `wait_for_feedback`,
change `edit.json` / captions / visuals, rebuild, render `draft-02.mp4` and send it with `add_version` and a note.
Comments about the cut itself go back to step 2 (new removals, new edit folder), after which every beat time has to be
moved through the new `final.edl.json`, the cut-outs re-made and the captions regenerated.

## Quality bar

- The layout always fits the words: the named thing is on screen while it's named, the step card appears on "step N".
- A change every 1.5–5 s; hard cuts only; nothing stays still longer than ~5 s.
- The speaker's face is never cut by the seam or covered; cut-outs have clean edges (no room showing around the hair).
- Captions match the words heard, 1–3 words, never stale across a cut, readable on every layout.
- Speech: no dead air, no doubled phrase, last take of every line, -14 to -16 LUFS.
- `VERIFY.md` lists the beat plan, removed takes with reasons, checks run and anything not verified (e.g. no listening).

## Files in this playbook

- `template/build.py`: builds a Hyperframes `index.html` from `edit.json` + `captions.json` (all six layouts,
  gradient, roadmap, captions per layout, deterministic GSAP timeline). `python3 build.py --help`.
- `template/edit.example.json`: the beat plan of the preview video (76 s, 23 beats) to copy from.
- `template/assets/fonts/`: Geist (SIL Open Font License, text included).
- `scripts/prepare_edit.py`: the cut (silence pass, removals, frame-accurate render, retimed transcripts).
- `scripts/make_captions.py`: edited-time words to 1–3 word captions (`captions.json`, `captions.srt`).
- `scripts/make_cutouts.py`: speaker cut-outs for visual beats with `npx hyperframes remove-background`.
- `references/layouts.md`: exact geometry of every layout, transitions, captions, theme fields.
- `references/reference-breakdown.md`: second-by-second breakdown of the reference reel and the switching rules.
- `references/clean-cuts.md`, `references/transcription.md`: cutting and transcription details.
