---
name: editorial-reel
description: Turn a raw talking-head recording into a 9:16 Instagram-style reel wrapped in editorial motion graphics - a hook of giant serif headlines behind the cut-out speaker, simulated UI pop-ups (a prompt box that types, app icons struck out, comment threads, a flip counter, a file drop), a magazine-cover moment, PiP and screen windows, a 3x3 grid, giant serif words behind the head, word-by-word serif captions, a lo-fi beat with sound effects, and a comment-keyword CTA with a follow button. Includes the cut (pauses and earlier takes removed), a Hyperframes template with a runnable starter scene, and scripts for cut-outs, captions, pacing and sound. Works with the project's own video tool too.
---

# Editorial Reel

> **How to use this playbook.** It's a recipe, not a set of rules: every format, length, pace and formula below is a
> default, and whatever the user asks for wins. Don't open with questions: use the defaults, build, and mention the
> defaults you chose in one line when you share the first render (ask only if something essential is missing, like the
> footage itself). The first render is the proposal, so there's no plan to approve first. Storyboards only when the
> user asks to see the shots first. Planning files the method mentions (`BRIEF.md`, `PLAN.md` and the like) are your
> own working notes: write them when they help you, never as a step for the user.

**In:** a raw recording of someone talking to camera (a plain background makes the cut-out cleaner), plus any screen
recordings, screenshots or clips of what they talk about, and the word people should comment for the CTA.
**Out:** a 1080×1920 reel, 30–60 s, where something changes every 1–1.5 s:

| Piece | When |
| --- | --- |
| **hook**: the speaker cut out on deep green, serif and sans headline cards behind the head, an italic payoff | from frame 0 through the first sentence |
| **speaker**: the talking head, wide or punched in, with pop-ups on top | most of the reel |
| **pop-ups**: prompt box, struck-out app icons, floating cards, screen window, PiP, flip counter, file drop, comment thread, two-block stack | whenever the speech names a thing, a prompt, a number or a change |
| **word**: one giant serif word behind the head | the word that carries the feeling, 2–4 times |
| **magazine**: masthead behind the head, issue line, cover lines, barcode | once, on a claim about how it looks |
| **grid**: 3×3 tiles of results, the speaker in one cell | social proof, "lots of …" |
| **comment + follow**: the keyword typed as a comment, a heart, a reply, then Follow → Following | the CTA, last 8–12 s |

The look: deep forest green, cream type and a muted gold accent; a tall high-contrast serif (Playfair Display, italic
for payoffs) with a heavy sans (Inter) for contrast cards and a mono for small labels; plain paper-coloured UI boxes
with soft shadows; serif captions on a small green box with each word lighting up as it's spoken; a quiet lo-fi beat
under the voice and a sound effect on every pop-up. The pattern comes from a reel by @justyn.ai;
`references/reference-breakdown.md` has its timeline and the rules taken from it.

## Defaults (the user's request overrides any of them)

Work these out from the request and the files. Where nothing is said, use the default and keep going; ask only if something essential is missing.

- **Format.** 9:16 at 1080×1920, 30 fps. Keep the source frame rate if it's 24, 25 or 60.
- **Length.** Keep the whole story the speaker tells; no cutting content to hit a length. Say so if it runs far
  over the platform's limit.
- **Visuals.** List what the user supplied. Every `screen`, `pip`, `cards` and `grid` moment needs real pictures of
  the thing being said. Missing ones: a web screenshot of a public page (record the URL), or use `chat`, `icons`,
  `stack` or a big `word` instead. Never fake a product screen, a result or someone else's post.
- **CTA.** If the user gave a keyword, end with `comment` and `follow`; otherwise use the last line they say, with
  `follow` only. The handle comes from the user or is left out.
- **Tool.** If the project already renders with another tool, follow this method there using the geometry in
  `references/graphics.md`; never convert the project. Say what the bundled template would have added (the
  data-driven build, sounds and checks). For a fresh project, use Hyperframes with the template in `template/`.
- **Look.** The template's default look is ready to use. For a FrameJam style (from `wait_for_pick`, or `get_preset`
  when the user names one), map its colours and display font onto `theme` in edit.json (fields in
  `references/graphics.md`, "Look") and bundle the font files with their license. Layouts, timing and positions stay.
- **Transcription.** Free and local by default (`references/transcription.md`); paid only with the user's OK.
- **Music and sound.** Make the lo-fi bed and the sound effects with `scripts/make_sounds.py` (free, made on the
  computer) unless the user brings a licensed track. Music 18–24 dB under the voice.
- **Rights.** Only the user's own footage and media they may use. Don't reuse the reference reel's footage, lines or
  exact colours.
- A request to make the video already allows local renders; don't ask again.

Requirements: Python 3 with NumPy and Pillow, ffmpeg, Node 22 (for `npx hyperframes`).
GSAP and the fonts ship with the template. If `npx hyperframes render` can't download its browser (a sandbox with
limited network), set `HYPERFRAMES_BROWSER_PATH` to an installed Chrome.

## Setup

```bash
npx -y hyperframes init my-reel --example blank --resolution portrait --non-interactive
cp -R <playbook>/template/. my-reel/          # build.py, edit.example.json, fonts, gsap.min.js
cp -R <playbook>/scripts my-reel/scripts
mkdir -p my-reel/{source,transcripts,working,assets/vis,renders}
```

Put the raw recording and the user's media in `source/` (never modify them). If the Hyperframes skills are installed
use them for anything not covered here; otherwise `npx hyperframes docs`.

## Starter scene

`template/edit.example.json` is a 24 s reel that uses the hook, speaker, magazine, grid and word layouts and seven
pop-up types. `scripts/make_starter.py` makes placeholder media for it (a drawn stand-in presenter and its cut-out,
a computer voice, word times, placeholder pictures), so the template renders before the real footage is in:

```bash
cd my-reel
python3 scripts/make_starter.py
python3 scripts/make_sounds.py --sfx assets/sfx --music assets/music.wav --duration 24.2
python3 scripts/make_captions.py --words transcripts/edited.words.json --breaks edit.json --out captions.json --fix "real=REEL"
python3 build.py && npx hyperframes render -o renders/starter.mp4
```

Use it to check the setup, to show the user the look before their footage arrives, or as a pattern to copy beats
from. Then delete the placeholder files and `edit.json` and build the real reel below.

## Workflow

### 1. Look at everything

`ffprobe` every file. Contact sheets of the talking head and every supplied file
(`ffmpeg -i in.mp4 -vf "fps=1/5,scale=320:-1,tile=6x6" -frames:v 1 sheet.jpg`), then 1 s sheets and full-resolution
frames of promising parts. Note where the face sits (the hook text and big words go around it), what each file can
show, and where the room or angle changes.

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

### 3. Plan the reel

Read the edited transcript and write `edit.json` (start from `template/edit.example.json`; every field is in
`references/graphics.md`):

- **Hook** from 0 s through the first sentence: 2–4 `cards`, each landing on the word it shows. Serif caps first,
  sans caps second, an italic payoff with one `accent` word last.
- **One graphic per phrase.** Go through the speech phrase by phrase: a named app or tool → `icons` (struck out for
  "no X, no Y"); a prompt or instruction → `chat`; a screen, document or result → `screen` or `pip` with the real
  recording; several results → `cards` or `grid`; a number or time saved → `timer`; a change request and its answer
  → `thread`; a short punchy pair ("bigger captions") → `stack`; the word that carries the feeling → `word`; a claim
  about how it looks → `magazine`. Nothing fits → a punch-in or a cut to another angle.
- **Pace:** something changes every 1–1.5 s, nothing static over ~2 s unless a clip is playing. Consecutive speaker
  beats alternate wide (1.0) and punched in (1.1–1.2); `in: "blur"` where the room or angle changes.
- **CTA** with the CTA sentence: `comment` with the keyword, then `follow` to the end.
- `emphasis`: 4–8 words that light up gold in the captions (the payoff, key nouns, the keyword).

Check it: `python3 scripts/check_pacing.py edit.json` lists every hold over 2 s; fix them before building.

Prepare each visual: crop screenshots to the one panel being talked about
(`ffmpeg -ss T -i screen.mp4 -frames:v 1 -vf crop=w:h:x:y assets/vis/name.png`), trim clips to the moment and mute
them, and remove anything private (account IDs, tokens, emails). Grid tiles and PiP clips are 9:16.

If the user wants to see the plan first, show it: one still per beat in `working/storyboard/01-....png`,
`open_review` with `panelsDir`, and adjust before building.

### 4. Cut-outs, captions and sound

```bash
python3 scripts/make_cutouts.py --edit edit.json          # hook, word and magazine beats; local background removal
python3 scripts/make_captions.py --words transcripts/edited.words.json --breaks edit.json \
  --out captions.json --fix "cloud code=Claude Code"
python3 scripts/make_sounds.py --sfx assets/sfx --music assets/music.wav --duration <reel length>
```

`make_cutouts.py` writes `assets/cutouts/<beat>.webm` and fills in each beat's `cutout`; re-run it with `--force`
after a beat's start or end changes. Captions are 2–4 words, never across a beat start, with each word's start time
so it lights up as it's spoken. `make_sounds.py --seed N` gives a different chord loop; skip `--music` if the user
brings a track and set `music.src` to it.

### 5. Build and check

```bash
python3 build.py                # edit.json + captions.json -> index.html
npx hyperframes check           # must show 0 errors; fix contrast and overlap warnings
npx hyperframes snapshot --at <one time inside every beat and pop-up> --describe false
```

Look at every snapshot: the hook's second line actually behind the head and the payoff clear of it, big words and
the masthead behind the head with clean cut-out edges (no room showing around hair), the face never covered by a
pop-up for more than a beat, pop-up text readable on a phone, captions clear of the mouth and of the `follow` pill,
nothing important in the top 170 px, the bottom 380 px or the right 120 px between y 1100 and 1700.

### 6. Render and review

```bash
npx hyperframes render -o renders/draft-01.mp4
```

Check the file: duration equals the cut; audio and video lengths agree; no black frames
(`ffmpeg -i r.mp4 -vf blackdetect=d=0.1 -an -f null -`); loudness -14 to -16 LUFS integrated
(`ffmpeg -i r.mp4 -af ebur128=framelog=quiet -f null -`). Read contact sheets at 2 frames a second
(`ffmpeg -i r.mp4 -vf "fps=2,scale=180:-1,tile=10x6" sheet-%02d.jpg`): the picture should change every 2–3 frames.
Then `open_review` with `videoPath`, `wait_for_feedback`, change `edit.json`, captions or visuals, rebuild, render
`draft-02.mp4` and send it with `add_version` and a note. Comments about the cut itself go back to step 2 (new
removals, new edit folder), after which every time in `edit.json` moves through the new `final.edl.json`, the
cut-outs are re-made and the captions regenerated.

## Quality bar

- The graphic always fits the words: the app is on screen while it's named, the prompt types while it's described,
  the big word lands on its word.
- A change every 1–1.5 s; nothing static over ~2 s unless footage is playing; speaker beats alternate framing.
- It looks designed: one green, one cream, one gold; serif for headlines and captions, sans only for contrast cards
  and UI; every pop-up lands with a spring and a sound.
- Text behind the speaker reads clearly and the cut-out edges are clean.
- Captions match the words heard, 2–4 words, never stale across a cut, the spoken word lit, emphasis words in gold.
- Speech: no dead air, no doubled phrase, last take of every line, -14 to -16 LUFS; music clearly under the voice.
- `VERIFY.md` lists the beat plan, removed takes with reasons, checks run and anything not verified (e.g. no listening).

## Files in this playbook

- `template/build.py`: builds a Hyperframes `index.html` from `edit.json` + `captions.json` (five layouts, eleven
  pop-up types, word-by-word captions, sound effects placed per pop-up, theme, deterministic GSAP timeline).
  `python3 build.py --help`.
- `template/edit.example.json`: the starter scene (24 s, 11 beats, 7 pop-ups) to copy from.
- `template/fonts/`: Playfair Display (roman and italic), Inter and Geist Mono (SIL Open Font License, texts
  included).
- `template/gsap.min.js`: GSAP 3.14.2 (GSAP standard license), loaded locally so renders need no network.
- `scripts/make_starter.py`: placeholder presenter, cut-out, voice, word times and pictures for the starter scene.
- `scripts/prepare_edit.py`: the cut (silence pass, removals, frame-accurate render, retimed transcripts).
- `scripts/make_cutouts.py`: speaker cut-outs for hook, word and magazine beats with `npx hyperframes remove-background`.
- `scripts/make_captions.py`: edited-time words to 2–4 word captions with word times (`captions.json`, `.srt`).
- `scripts/make_sounds.py`: the sound effects and a lo-fi boom-bap music bed, made with NumPy.
- `scripts/check_pacing.py`: changes per second and every hold over 2 s in a plan.
- `references/graphics.md`: every layout and pop-up with its fields and geometry, captions, look, motion, sound.
- `references/reference-breakdown.md`: second-by-second breakdown of the reference reel and the rules taken from it.
- `references/clean-cuts.md`, `references/transcription.md`: cutting and transcription details.
