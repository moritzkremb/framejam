---
name: anchor-overlay
description: Turn a raw talking-head recording into a vertical reel where the speaker stays full-frame the whole time and a scaled-down picture pops in for every concrete thing they name - small pictures above the head, big ones in the middle that still leave the speaker's sides showing. One-word captions in the speaker's own case follow the voice, big all-caps words land on the claims, numbered labels and little asides sit at the top, punch-ins mark emphasis, and a music bed turns at the pivot. Hard cuts only, something changes about every second. Includes the cut, a plan checker, an ffmpeg-only renderer, a render checker and a free offline music maker. Works with the project's own video tool too.
---

# Anchor and Overlay Reel

> **How to use this playbook.** It's a recipe, not a set of rules: every format, length, pace and formula below is a
> default, and whatever the user asks for wins. Don't open with questions: use the defaults, build, and mention the
> defaults you chose in one line when you share the first render (ask only if something essential is missing, like the
> footage itself). The first render is the proposal, so there's no plan to approve first. Storyboards only when the
> user asks to see the shots first. Planning files the method mentions (`BRIEF.md`, `PLAN.md` and the like) are your
> own working notes: write them when they help you, never as a step for the user.

**In:** a raw recording of someone talking to camera, plus as many photos, screenshots and short clips of the things
they mention as the user has.
**Out:** a 1080×1920 reel where the speaker never leaves the frame, a picture pops in for every concrete thing they
name, and something on screen changes about every second:

| Layer, bottom to top | What it is |
| --- | --- |
| **Anchor** | the speaker, full frame, all the time; punch-ins re-frame it on stressed words |
| **Overlays** | a `thumb` (small, in the band above the head, the face stays visible), a `card` (big, centred, covers the face but leaves the anchor showing at both sides) or a `tall` card for portrait material |
| **Labels and asides** | a numbered label at top centre ("1. First thing"), a little bracketed aside at the top or on a card's corner |
| **Big word** | one or two big all-caps words over the upper face on the claims that carry weight |
| **Captions** | one word at a time, as spoken, at chest height |

"The anchor never leaves" means its edges are always visible: a card may cover the face, but the speaker's sides and
shoulders show around it. `scripts/check_render.py` proves that from pixels.

## Defaults (the user's request overrides any of them)

Work these out from the request and the files. Where nothing is said, use the default and keep going.

- **Format.** 9:16, 1080×1920, 30 fps. Length: the story as told; don't cut content to hit a length.
- **Pictures.** The user's media first. For gaps use public web screenshots and maps (record the URL and terms;
  OpenStreetMap needs attribution). Never fake a personal photo, a product screen or a result; generated images only
  when the user says so, and never for things that really happened. A thing with no picture gets a punch-in or a big
  word. In the share note list the 3–8 pictures that would help most ("a photo of your first office at 0:12").
- **Captions: one word at a time, in the speaker's own case, at chest height (`captionY` 1230); big words in their own
  all-caps tier.** The renderer drops a trailing full stop and keeps commas. Three-word all-caps captions are a different
  taste, not the default: `theme.captionCase: "upper"` and `theme.captionMaxWords: 3` in `edit.json`, then
  `make_captions.py --case upper --max-words 3`.
- **Music: on.** A free two-part bed from `scripts/make_music.py`, calm until the pivot and driving after it, unless the
  user brings a track. "No music" is respected: set `"music": false`.
- **Renderer: ffmpeg only**, no browser and no Node. If the project already renders with another tool, follow the
  same geometry and rules there (`references/format.md`); never convert the project.
- **Look.** Neutral defaults in `theme` (Inter for captions and asides, Anton for big words and labels, white with a
  black stroke, square pictures). A picked FrameJam style or the user's own skill maps onto `theme`: fonts and colours
  change, geometry and timing don't.
- **Transcription.** Free and local (`references/transcription.md`); paid only with the user's OK.
- **Rights.** Only media the user may use.
- A request to make the video already allows local renders; don't ask again.

Requirements: Python 3 with NumPy and Pillow (`python3 -m pip install numpy pillow`), and any ffmpeg with libx264 and
AAC (Homebrew, apt, a static build). The renderer draws text with Pillow, so ffmpeg needs no libass, drawtext or freetype.

## Setup

```bash
mkdir my-reel && cd my-reel
cp -R <playbook>/template/. .            # fonts, edit.example.json, words.example.json, captions.example.json
cp -R <playbook>/scripts scripts
mkdir -p source transcripts working renders assets/vis
```

Put the raw recording in `source/` (never modify it) and the user's pictures in `source/` too.

## Workflow

### 1. Look at everything

`ffprobe` every file, contact sheets of the recording and of every picture
(`ffmpeg -i in.mp4 -vf "fps=1/5,scale=320:-1,tile=6x6" -frames:v 1 sheet.jpg`), then one full-resolution frame of the
speaker: write down the eye line (y in 1080×1920 after cropping to 9:16). That number is `aroll.eyeY`; thumbs stay 40 px
above it.

### 2. Cut the speech

Same as a clean talking-head edit (details in `references/clean-cuts.md`):

1. Transcribe the raw recording (`references/transcription.md`).
2. `python3 scripts/prepare_edit.py --input source/raw.mp4 --transcript transcripts/source.words.json --out working/edit-01`
   (silence pass, fast settings).
3. Find earlier takes: read `working/edit-01/silence.transcript.json`, then the partial-retake audit (3–6 s excerpts
   around every sentence start and removed pause). Keep the last take; write `working/removals-01.json`.
4. `python3 scripts/prepare_edit.py ... --removals working/removals-01.json --out working/edit-02 --render`.
5. Check the joins (transcribe the cut and 3–6 s around each join; frames on both sides).
6. Level the voice and keep the picture: `ffmpeg -i working/edit-02/cut.mp4 -c:v copy -af loudnorm=I=-15:TP=-1.5:LRA=11 -c:a aac -b:a 192k -ar 48000 assets/speech.mp4`
   (`cut.mp4` carries picture and sound together; this file is the anchor and the only voice in the reel).
7. Transcribe `assets/speech.mp4` for edited-time words: `transcripts/edited.words.json`.

### 3. The noun pass

Go through the edited words and mark every concrete, picturable thing: places, people, objects, brands, numbers worth
showing, named events. Each becomes an overlay that starts on the first frame of its word. Pick enough to reach the
coverage target below, preferring what the story depends on. Then mark the other beats: stressed words (punch-ins),
claims that carry weight (big words), list items (numbered labels, only if the speech has a list), and the speaker's
own wry remarks (asides, at most 2–3 a minute, their tone, nothing invented). The arc of the story is the user's: the
only parts of it the format uses are where the music turns and whether there is a list.

### 4. Plan it and check it

Write `edit.json` (start from `edit.example.json`; the shape is in `references/format.md`), then:

```bash
python3 scripts/check_plan.py edit.json --words transcripts/edited.words.json
```

It fails on anything that would hide the anchor, break the rhythm or put text where the app UI sits. Fix every
failure before rendering; each message says what and where. The rules it enforces (all tunable in `edit.json` →
`checks`, so the user's taste moves the checks instead of fighting them):

- **The anchor stays visible.** Every overlay leaves at least 86 px of anchor at the left and the right, and at least
  120 px at the top or the bottom (not `tall`); at most two overlays at once; thumbs end 40 px above the eyes.
- **One picture, one spoken thing.** An overlay starts between 0.10 s before and 0.05 s after its word, and leaves on a
  hard cut. Stills last 0.6–2.5 s (about 1.5 s is typical), clips up to 4 s. No fades, slides or springs: the plan has
  no field for them. The same picture never shows twice in a row.
- **Coverage.** Overlays are on screen 35–55% of the runtime (about 15–25 a minute), and there's never more than 3 s of
  bare anchor without a punch-in or a big word.
- **A change every 0.5–1.5 s.** Counting captions, no gap is longer than 1.5 s. Counting picture changes only (overlay
  in or out, punch, big word, label), the median gap is 0.8–1.5 s and none is over 3 s.
- **Punch-ins.** A slight one (1.08–1.15) on a stressed word, held until the next change; a hard one (1.25–1.40) at
  most twice a minute. Consecutive stretches alternate framing; the face is always fully in frame (never above 1.5×).
- **Big words.** 3–8 a minute, exactly on their word, 0.6–1.5 s; the caption steps aside while one is up.
- **Labels and asides.** Labels stay up through their whole list item and hide while a picture is over them; asides on
  cards go in the overlay's `aside`, others in the top-level `asides`.
- **Platform UI.** Nothing in the top 220 px, below y 1540, or in the right-hand strip between y 1100 and 1700.
- **Music.** On, with `turnAt` inside the reel (put it on the first word of the speech's turn; with none, at the start
  of the list or about 55% in), calm 20–24 dB under the voice before it and 14–18 dB under after it.

### 5. Pictures, captions, music

Crop each picture to its subject (`ffmpeg -ss T -i screen.mp4 -frames:v 1 -vf crop=w:h:x:y assets/vis/name.png`);
text in a picture should be readable on a phone. Trim clips to the overlay length plus a little. Only the anchor is
heard, so pictures need no sound. Remove private details (account IDs, tokens, emails).

```bash
python3 scripts/make_captions.py --words transcripts/edited.words.json --breaks edit.json --hide edit.json \
  --out captions.json --fix "cloud code=Claude Code"
python3 scripts/make_music.py --duration <seconds> --turn <turnAt> --out assets/music.wav
python3 scripts/check_plan.py edit.json captions.json --words transcripts/edited.words.json
```

`make_captions.py` writes one word per caption (kept as spoken, shown 0.2–1.2 s), never across a sentence end or a
`--breaks` time, hides the caption while a big word is up and keeps each word's start so the text can be checked
against the transcript. To keep a track of the user's own, set `music.src` to it and `turnAt` to the time of its lift.

### 6. Render

```bash
python3 scripts/render.py --draft --out renders/draft-small.mp4      # half size, fastest: the first look
python3 scripts/render.py --sample 12:27 --draft                    # just seconds 12-27 of the plan
python3 scripts/render.py --out renders/draft-01.mp4                # full size
```

Everything is one ffmpeg command: the anchor and its punch-in copies, overlays switched on with `enable`, text drawn
by Pillow into transparent PNGs that ffmpeg overlays as one image sequence, voice and music mixed. A 1-minute reel renders in about half a minute on a
laptop. `render.py --quick --input source/raw.mp4 --sample 0:15` skips the cut: it transcribes the window, puts a
punch-in on sentence starts and a grey "PLACEHOLDER" card on every long content word (or your picture, if
`--media pics/` has one named after the word). It is only for judging rhythm before the real plan exists, and
`check_plan.py` rejects placeholders.

### 7. Check the render, look, review

```bash
python3 scripts/check_render.py renders/draft-01.mp4 --edit edit.json
```

On the mp4 it checks: 9:16, duration equals the plan, audio present and in step, no black frames, loudness −16 to
−14 LUFS (it tells you the `aroll.gainDb` to set when it isn't); **the anchor's left and right edges match a clean copy
of the anchor in every frame**; every overlay is on screen from its `at` to its `end` and gone outside it, with a hard
cut; the median and longest gap between picture changes, recomputed from the overlays the render confirms, agree with
the plan; the music sits the planned dB under the voice before and after the turn. Use `--sample A:B` for a render made
with `render.py --sample A:B`.

Then look (this part isn't automatable): snapshots in the middle of every overlay, big word and label, plus contact
sheets at 2 frames a second. The face is fully in frame at every punch; thumbs don't touch the eyes; the caption stroke
reads on bright cards; pictures are cropped to their subject; labels name the right item. Write `VERIFY.md`: the plan
summary, removed takes with reasons, every check and its result, and what wasn't verified (for example, nobody
listened). Then `open_review` with `videoPath`, `wait_for_feedback`, change `edit.json`, captions or pictures, render
`draft-02.mp4` and send it with `add_version` and a note. Comments about the cut itself go back to step 2: new
removals, then every time in the plan moves through the new `final.edl.json` and the captions are regenerated.

## Quality bar

- A picture is on screen when its thing is named, starting on the word, leaving with a hard cut.
- The anchor never leaves: its sides show around every card, and nothing but a picture or a big word ever covers
  the face.
- Something changes about every second; no stretch of bare anchor over 3 s; consecutive punch-ins alternate.
- Captions match the words heard, one at a time, and never sit on top of a big word or in the platform-UI zones.
- It looks designed: pictures cropped to what matters, one consistent type treatment, music that turns when the
  speech does.
- Speech: no dead air, no doubled phrase, last take of every line, −16 to −14 LUFS with the music in.
- `VERIFY.md` says what was checked and what wasn't.

## Files in this playbook

- `scripts/prepare_edit.py`: the cut (silence pass, removals, frame-accurate render, retimed transcripts).
- `scripts/make_captions.py`: edited-time words to captions (`captions.json`, `.srt`); one word, as spoken, by default.
- `scripts/make_music.py`: a two-part music bed with a turn, NumPy only, free and offline.
- `scripts/render.py`: `edit.json` + `captions.json` to an mp4 with ffmpeg; `--draft`, `--sample A:B`, `--quick`.
- `scripts/check_plan.py`: the plan checks above; exits 1 on any failure.
- `scripts/check_render.py`: the checks on the rendered mp4; exits 1 on any failure.
- `scripts/anchorlib.py`: shared geometry, defaults and filter graphs (the defaults for `theme` and `checks` live here).
- `template/edit.example.json`, `words.example.json`, `captions.example.json`: a 26 s plan that uses every element, its
  words and its captions. It points at `assets/speech.mp4`, `assets/vis/*.png` and `assets/music.wav`, which you make.
- `template/fonts/`: Inter and Anton (SIL Open Font License, texts included).
- `references/format.md`: geometry, layers, text rules, `theme` and `checks` fields, `edit.json` shape, the ffmpeg
  recipe for other tools.
- `references/reference-breakdown.md`: the measurements the defaults come from.
- `references/clean-cuts.md`, `references/transcription.md`: cutting and transcription details.
