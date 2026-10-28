---
name: saraev-talking-head
description: Turn a raw 16:9 talking-head recording into a tight, voice-led edit inspired by observed public Nick Saraev videos. Uses Silero VAD around 0.5 s silence, Whisper word times and the observed "cut cut" marker, an auditable EDL, high-pass/EQ/compression/-16 LUFS audio, a low-saturation grade, an optional eight-card swivel teaser, editorial graphics, short comparison renders and hardware encoding with a software fallback. No word-by-word captions by default, and no invented private settings.
---

# Saraev-like Talking Head

> **How to use this playbook.** It is a reusable open implementation of the stages Nick Saraev describes publicly,
> not a copy of his private setup. The user's request wins. Build a first render instead of asking for approval of a
> plan; ask only for missing essentials such as the footage or a marker phrase the user says they use.

**In:** raw talking-head footage, a word-timed transcript, and optional real screenshots, articles, charts or screen
recordings for graphics.

**Out:** a 16:9, usually 1080p30 edit with auditable source ranges, tight speech, enhanced narration, a neutral
low-saturation grade, optional evidence-backed graphics and an optional opening swivel teaser. There are no
word-by-word captions or music by default. A supported Mac uses `h264_videotoolbox`; software H.264 is the portable
fallback.

Read `references/public-evidence.md` before describing the method. It separates public evidence from open
substitutes. `template/STYLE_BIBLE.md` records observed public-video DNA and its evidence IDs. It does not expose
private EQ values, LUTs, compressor settings or 3D implementation details.

## Defaults

- **Shape and framing:** 16:9, usually 1920×1080 at 30 fps. Centered medium close-up; the observed room is a cool-grey
  wall with a plant at bottom right, black top and soft window key. Treat those as reference traits, not assets to
  fake.
- **Opening:** no title card; open mid-thought. Retain up to 1.2 s before the first main word, which typically lands
  around 1.2–2.0 s.
- **Silence:** Silero VAD splits speech around 0.5 s of silence. The included ffmpeg amplitude detector is a
  deterministic fallback, not a neural VAD and not equivalent in noisy rooms.
- **Bad-take marker:** Whisper word times find the exact observed phrase `cut cut` by default. Matching ignores case
  and punctuation. The VAD speech island containing it is excluded. Use `--no-trigger` when the speaker did not use
  markers, or `--trigger` to replace it; review every decision.
- **Audio:** voice only, no music. High-pass → footage-specific EQ → compression → about -16 LUFS, true peak about
  -0.4 dB. `audio.eq` is empty until the recording is heard; the public slide does not expose EQ bands.
- **Grade:** neutral, very low saturation (`0.10`, observed range 0.05–0.12) and mild contrast (`1.05`). An optional
  LUT is a hook, not a guessed private LUT.
- **Teaser:** optional, about 8 s. Start with roughly 3 s of the head, then about eight 0.3–1.1 s micro-clips as
  tilted screen cards over the blurred continuing shot; the voice continues underneath. No `COMING UP` title.
  The ffmpeg renderer supplies an open 2D-tilt fallback; use the project's 3D tool when available.
- **Pace:** 200–260 wpm and speech across about 99–100% of runtime. The teaser runs about 52 cuts/min in the first
  15 s; after it, about 7/min.
- **Modes:** raw jump-cuts (~13 cuts/min, median shot ~3.3 s), graphics explainer (~6.6 cuts/min), or news reaction
  (full-frame article/tweet with webcam PiP). Choose by section; do not mix every mode into every beat.
- **Text and graphics:** no word-by-word captions. Text is a graphic label, headline, citation or real UI element.
- **Export:** `auto` prefers the observed `h264_videotoolbox` route on a supported Mac and falls back to `libx264`;
  other hardware encoders remain available when their device exists.

Requirements: Python 3, ffmpeg and ffprobe. Optional Silero backend:
`python3 -m pip install "silero-vad[audio]"`. This is an open alternative; do not install it without checking the
project's environment policy.

## Set up

Copy `scripts/` and `template/` into a new project. Keep source footage untouched.

```
source/                 original recording
transcripts/            source.words.json, edited.words.json
working/                vad.json, edit.json, decisions.json, short comparisons
renders/                draft-01.mp4, final-01.mp4
STYLE_BIBLE.md           observed DNA, evidence IDs and remaining parity work
VERIFY.md
```

Start with `template/edit.example.json` only as a field reference. `plan_edit.py` writes the real plan.

## Workflow

### 1. Inspect and transcribe

Probe every source with ffprobe. Confirm dimensions, rotation, frame rate, duration and audio streams. Make a contact
sheet and inspect the start, middle and end. Extract WAV for analysis, transcribe with Whisper-compatible word
timestamps, then correct names and the observed `cut cut` marker before automating any cut.

### 2. Detect speech

Silero, when installed:

```bash
python3 scripts/detect_speech.py source/raw.mp4 --backend silero \
  --min-silence 0.5 --out working/vad.json
```

Portable fallback:

```bash
python3 scripts/detect_speech.py source/raw.mp4 --backend ffmpeg \
  --min-silence 0.5 --noise-db -40 --out working/vad.json
```

Read `working/vad.json`. Listen around every boundary. Speech probability and amplitude are not editorial judgment:
restore breaths or intentional pauses when the delivery needs them.

### 3. Build the cut

Observed default (`cut cut`):

```bash
python3 scripts/plan_edit.py --input source/raw.mp4 --vad working/vad.json \
  --words transcripts/source.words.json --out working/edit-01
```

Disable markers when they were not used:

```bash
python3 scripts/plan_edit.py --input source/raw.mp4 --vad working/vad.json \
  --words transcripts/source.words.json --no-trigger --out working/edit-01
```

`--trigger "<exact phrase>"` replaces the default; repeat it for aliases. The script writes `edit.json`,
`decisions.json` and `edited.words.json`. A matched phrase excludes its whole VAD speech island. Check each decision
against the source. If wanted speech shares the island, edit the source ranges rather than accepting a bad cut.

To prepend an 8 s continuous-voice teaser, add `--teaser SOURCE_START:SOURCE_END`. Add up to eight visual inserts
with repeated `--teaser-card SOURCE_START:SOURCE_END`; each must be 0.3–1.1 s. The first ~3 s stays on the head, then
the cards play over its blurred continuation while the teaser audio remains continuous. Choose moments for meaning,
not merely volume.

### 4. Choose the mode, graphics and look

Copy `template/STYLE_BIBLE.md` into the project and keep its evidence IDs. Set each section's mode in `edit.json`:

- `raw`: centered MCU and tight jump cuts;
- `graphics`: off-white `#fbfdfa` rounded panels, editorial serif headlines, letter-spaced all-caps grey labels,
  black pills, thin olive line icons, real charts/UI and citation strips; webcam small and rounded at the right edge;
- `news`: real tweet/article full-frame with webcam PiP; on screen-share, webcam about 26% width at bottom left over
  bokeh.

There are no spoken captions. `captions.enabled` stays `false`. If the user explicitly asks for accessibility
captions, generate them with `make_captions.py` and render with `--force-captions`. Never fake a UI, result,
citation, quote or chart.

### 5. Short render/compare loop

Render a representative 6–12 s window first:

```bash
python3 scripts/render.py working/edit-01/edit.json --sample 0:8 --out working/sample-01.mp4
```

After changing the cut, grade, graphics or teaser, render the same window and compare it with the previous version:

```bash
python3 scripts/compare_renders.py working/sample-02.mp4 working/sample-01.mp4 \
  --out working/compare-02-vs-01.mp4 --report working/compare-02-vs-01.json
```

The comparison reports technical facts and creates a labelled side-by-side file. It does not score “style parity.”
Only compare against a reference the user has the right to use; the scripts never download the linked YouTube
videos.

### 6. Export and verify

Portable export:

```bash
python3 scripts/render.py working/edit-01/edit.json --out renders/draft-01.mp4
```

Hardware encode when the machine supports it:

```bash
python3 scripts/render.py working/edit-01/edit.json --encoder auto --out renders/draft-01.mp4
```

An explicit encoder (`h264_nvenc`, `h264_qsv`, `h264_vaapi`, `h264_videotoolbox`) is also accepted. Availability in
`ffmpeg -encoders` does not prove a device is usable, so check the command's exit and inspect the rendered file.

Verify:

- every VAD and marker cut by listening around both sides;
- no missing syllables and no unwanted long gaps;
- audio and video duration differ by at most one frame;
- integrated loudness is about -16 LUFS and true peak about -0.4 dB;
- voice is the only audio; no music;
- no black stretches or word-by-word spoken captions;
- first word, WPM, speech coverage, cut rate and median shot length are measured against the mode's targets;
- teaser begins with the head, then uses 0.3–1.1 s cards while voice remains continuous;
- grade and graphics match `STYLE_BIBLE.md` evidence without invented content;
- the selected encoder is recorded in `VERIFY.md`.

Open `renders/draft-01.mp4` in FrameJam with `open_review`, wait for feedback, then render a new numbered version.
Never overwrite an approved render.

## Quality bar

- Every automated removal is reproducible from `vad.json`, the transcript and the configured trigger phrases.
- No `cut cut` marker survives in the cut; use `--no-trigger` when the speaker did not use it.
- The voice remains natural, intelligible and dominant at about -16 LUFS, with no music.
- No title card and no word-by-word captions; graphic labels make only supportable claims.
- The selected mode hits its observed cadence without forcing a cut where the sentence needs to breathe.
- The look is traceable to neutral settings or timestamped evidence, never to an invented private stack.
- `VERIFY.md` records source and output duration, removed islands, teaser source range, audio checks, encoder and
  anything not verified.

## Files

- `scripts/detect_speech.py`: Silero VAD adapter with an ffmpeg fallback; emits a common speech-segment JSON format.
- `scripts/plan_edit.py`: merges speech around the chosen 0.5 s gap, applies exact marker phrases and writes an
  auditable source-to-edited timeline.
- `scripts/make_captions.py`: optional edited-time words to SRT when the user explicitly asks for captions.
- `scripts/render.py`: one ffmpeg filter graph for cuts, ordered audio processing, low-saturation grade, continuous-
  voice teaser cards, graphics and software or hardware encoding.
- `scripts/compare_renders.py`: technical probe plus labelled side-by-side comparison.
- `template/edit.example.json`: neutral configuration and `STYLE_BIBLE.md` hook.
- `template/STYLE_BIBLE.md`: observed public-video DNA, evidence IDs and remaining parity work.
- `references/public-evidence.md`: claims that are safe to make and what remains unknown.
- `references/open-alternatives.md`: open tool choices when an exact component is unavailable.
