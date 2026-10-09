---
name: layout-switch-short
description: Turn a raw talking-head recording into a fast-cut vertical short that switches layout with the speech every two seconds or so - speaker alone with punch-ins, split screen with the thing being described, full-screen visual with the speaker cut out in front, and a step roadmap that returns at every new step. Includes the cut (pauses and earlier takes removed), short captions placed per layout, and a Hyperframes starter template. Works with the project's own video tool too.
---

# Dynamic Layout Short

> **How to use this playbook.** It's a recipe, not a set of rules: every format, length, pace and formula below is a
> default, and whatever the user asks for wins. Don't open with questions: use the defaults, build, and mention the
> defaults you chose in one line when you share the first render (ask only if something essential is missing, like the
> footage itself). The first render is the proposal, so there's no plan to approve first. Storyboards only when the
> user asks to see the shots first. Planning files the method mentions (`BRIEF.md`, `PLAN.md` and the like) are your
> own working notes: write them when they help you, never as a step for the user.

**In:** a raw recording of someone talking to camera (best: a how-to or list with clear steps), plus screen
recordings, screenshots, product photos or footage of what they talk about.
**Out:** a 1080×1920 short where every beat of the speech gets the layout that fits it and something on screen
changes every 1.5–2.5 s:

| Layout | When |
| --- | --- |
| **speaker**: the speaker alone, wide or punched in | claims, numbers, opinions, the payoff, the call to action |
| **split**: the thing on top in a framed card, the speaker below | a concrete thing is named (a site, a product, a document) |
| **visual**: the thing in a big card, the speaker cut out in front | a process or a tool doing something, in motion |
| **roadmap** (split): the step list, a highlight sliding to the current step | every new step ("Step two...") and a recap at the end |
| **title** (split): the hook headline with one phrase highlighted | from frame 0 until the first idea lands |
| **words** (split): 1–3 big words landing as spoken | an abstract idea with no picture, the CTA keyword |

The look: a slowly drifting colour-field background with grain, screenshots in rounded cards with a soft shadow and
a small label chip, a bold display font with a mono label font, and big 1–3 word captions on a dark pill where the
word being spoken turns the accent colour. The pattern comes from a reel by @itsolelehmann (cut faster here);
`references/reference-breakdown.md` has its timeline and the rules derived from it.

## Defaults (the user's request overrides any of them)

Work these out from the request and the files. Where nothing is said, use the default and keep going; ask only if something essential is missing.

- **Is the speech right for it?** It works best with a structure (steps, a list, a before/after). If there's none,
  use the speaker, split and visual layouts only and skip the roadmap.
- **Steps.** Name the steps in 2–5 words each, from the speaker's own words (max 6). These become the roadmap.
- **Visuals.** List what the user supplied. Every split and visual beat needs a real picture of the thing being
  said. Missing ones: a web screenshot of a public page or a product photo (record the URL and terms), or switch that
  beat to speaker or words. Never fake a product screen or a result.
- **Tool.** If the project already renders with another tool, follow this method there, using the geometry in
  `references/layouts.md`; never convert the project. Say what the bundled template would have added (the
  data-driven build and checks). For a fresh project, use Hyperframes with the template in `template/`.
- **Look.** The template's default look is ready to use. If the user picked a FrameJam style
  (from `wait_for_pick`, or `get_preset` when the user names one), map it onto `theme` in edit.json (fields in `references/layouts.md`, "Look"): background
  colours, ink and accent, fonts (bundle the files and their license), caption pill, card radius. Layouts, timing and
  caption positions stay as described.
- **Transcription.** Free and local by default (`references/transcription.md`); paid only with the user's OK.
- **Music.** None unless asked. If asked: licensed or generated, 18–24 dB under the voice.
- **Rights.** Only the user's own footage and media they may use. Don't reuse the reference reel's footage, titles or
  exact colors.
- A request to make the video already allows local renders; don't ask again.

Requirements: Python 3 with NumPy, ffmpeg, Node 22 (for `npx hyperframes`).

## Setup

```bash
npx -y hyperframes init my-short --example blank --resolution portrait --non-interactive
cp -R <playbook>/template/. my-short/          # build.py, edit.example.json, assets/fonts, assets/grain.png
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

- **Pace: something changes every 1.5–2.5 s** (about 30–40 beats a minute); nothing static longer than ~2.5 s. A
  beat may run to ~4 s only if something moves inside it: a `focus` zoom, a second word landing, gallery cards
  landing, a screen recording playing. A long sentence about one thing gets two pictures (the overview, then the
  detail) or a picture with a focus zoom on the word that names the detail.
- **Switch on the first word** of the phrase that motivates the change (its start time in the edited transcript).
- Open with **title** (the promise, with a number if the speech has one) from 0 s to the end of the first sentence;
  set `mark` to the key phrase and `markAt` to when it's spoken.
- Every "step N" → **roadmap** with that step (1.3–2.5 s), then the beat that explains it.
- Named thing → **split**; process in motion → **visual**; several results ("five new ads") → split with a
  `gallery`; claim, number, joke, payoff → **speaker**.
- **Punch-ins:** speaker beats alternate wide (`"zoom": 1.0`) and punched in (1.12–1.18), so two speaker beats in a
  row never share a framing. A speaker stretch over ~2.5 s gets `"punches"` on sentence or clause starts. Hard cuts,
  face always fully in frame.
- Never the same layout with the same picture twice in a row; roughly 40–50% split/roadmap/words, 25–30% speaker,
  15–25% visual.
- End with **roadmap** `"step": 0, "check": true` (recap), then the CTA (a **words** beat with the keyword works
  well) and **speaker** to finish.

Write the plan as `edit.json` (start from `template/edit.example.json`; every beat has `start` in edited seconds,
`layout` and its fields; visual options are listed at the top of `build.py`). Check it:
`python3 scripts/check_pacing.py edit.json` lists every hold over 2.5 s; fix them before building.

Then prepare each visual. Cards take the media's own shape, so crop each screenshot to the one panel or section
that's being talked about (`ffmpeg -ss T -i screen.mp4 -frames:v 1 -vf crop=w:h:x:y assets/vis/name.png`): text
should end up at least ~22 px tall in the 960 px wide card, and wide crops (1.3:1 to 2:1) read best. Remove stray
mouse cursors and anything private (account IDs, tokens, emails). Trim clips to the beat length plus a little and
mute them. Give cards a 2–3 word `label` and the UI's own `bg` colour.

If the user wants to see the plan first, show it: one still per beat in
`working/storyboard/01-....png` (a snapshot or the picture with the layout name written on it), `open_review` with
`panelsDir`, and adjust before building.

### 4. Cut-outs and captions

```bash
python3 scripts/make_cutouts.py --edit edit.json          # visual beats only; local background removal
python3 scripts/make_captions.py --words transcripts/edited.words.json --breaks edit.json \
  --out captions.json --fix "cloud code=Claude Code"
```

`make_cutouts.py` writes `assets/cutouts/<beat>.webm` and fills in each beat's `cutout`. Re-run it with `--force`
after a beat's start or end changes. Captions are 1–3 words, never across a beat start, and keep each word's start
time so the spoken word lights up in the accent colour.

### 5. Build and check

```bash
python3 build.py                # edit.json + captions.json -> index.html
npx hyperframes check           # must show 0 errors; fix contrast and overlap warnings
npx hyperframes snapshot --at <one time inside every beat> --describe false
```

Snapshot one time inside every beat, plus a moment after each `focus` zoom. Look at every snapshot: face fully
visible and not cut by the seam in split beats (tune `speakerY`), punched-in faces not cropped, caption clear of the
mouth and the cut-out's hair, card text readable on a phone (crop tighter if not), label chips not covering content,
zooms not cutting text lines on both sides, roadmap highlight on the right step, nothing important in the top
220 px, the bottom 380 px or the right 120 px between y 1100 and 1700.

### 6. Render and review

```bash
npx hyperframes render -o renders/draft-01.mp4
```

Check the file: duration equals the cut; audio and video lengths agree; no black frames
(`ffmpeg -i r.mp4 -vf blackdetect=d=0.1 -an -f null -`); loudness -14 to -16 LUFS integrated
(`ffmpeg -i r.mp4 -af ebur128=framelog=quiet -f null -`). Read contact sheets at 2 frames a second
(`ffmpeg -i r.mp4 -vf "fps=2,scale=180:-1,tile=10x6" sheet-%02d.jpg`): the picture should visibly change every few
frames, with no run of identical frames longer than ~5 (2.5 s) unless footage is playing. Then `open_review` with `videoPath`, `wait_for_feedback`,
change `edit.json` / captions / visuals, rebuild, render `draft-02.mp4` and send it with `add_version` and a note.
Comments about the cut itself go back to step 2 (new removals, new edit folder), after which every beat time has to be
moved through the new `final.edl.json`, the cut-outs re-made and the captions regenerated.

## Quality bar

- The layout always fits the words: the named thing is on screen while it's named, the step card appears on "step N".
- A change every 1.5–2.5 s on average; hard cuts only between layouts; nothing static longer than ~2.5 s unless
  footage is playing; consecutive speaker beats alternate framing.
- It looks designed: every screenshot in a card (cropped to what matters, readable on a phone), the background
  moving, one accent colour used for the highlighter, the spoken caption word and the current step.
- The speaker's face is never cut by the seam or covered; cut-outs have clean edges (no room showing around the hair).
- Captions match the words heard, 1–3 words, never stale across a cut, readable on every layout, spoken word lit.
- Speech: no dead air, no doubled phrase, last take of every line, -14 to -16 LUFS.
- `VERIFY.md` lists the beat plan, removed takes with reasons, checks run and anything not verified (e.g. no listening).

## Files in this playbook

- `template/build.py`: builds a Hyperframes `index.html` from `edit.json` + `captions.json` (all six layouts,
  background, cards, focus zooms, galleries, roadmap slab, punch-ins, captions with the spoken word lit, theme,
  deterministic GSAP timeline). `python3 build.py --help`.
- `template/edit.example.json`: the beat plan of the preview video (76 s, 36 beats) to copy from.
- `template/assets/fonts/`: Bricolage Grotesque and Geist Mono (SIL Open Font License, texts included);
  `template/assets/grain.png`: the grain texture.
- `scripts/prepare_edit.py`: the cut (silence pass, removals, frame-accurate render, retimed transcripts).
- `scripts/check_pacing.py`: beats, changes per second and every hold over 2.5 s in a plan.
- `scripts/make_captions.py`: edited-time words to 1–3 word captions with word times (`captions.json`, `.srt`).
- `scripts/make_cutouts.py`: speaker cut-outs for visual beats with `npx hyperframes remove-background`.
- `references/layouts.md`: pacing, exact geometry of every layout, transitions, captions, theme fields.
- `references/reference-breakdown.md`: second-by-second breakdown of the reference reel and the switching rules.
- `references/clean-cuts.md`, `references/transcription.md`: cutting and transcription details.
