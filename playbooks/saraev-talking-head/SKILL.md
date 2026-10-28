---
name: saraev-talking-head
description: Turn a raw 16:9 talking-head recording into a tight, enhanced, captioned edit inspired by the public Nick Saraev workflow. Uses voice activity detection around 0.5 s silence, configurable spoken markers for bad takes, an auditable EDL, audio cleanup, a neutral configurable grade, an optional opening teaser, simple graphics, short comparison renders and optional hardware encoding. It does not claim or reproduce Nick's undisclosed private stack or exact look.
---

# Saraev-like Talking Head

> **How to use this playbook.** It is a reusable open implementation of the stages Nick Saraev describes publicly,
> not a copy of his private setup. The user's request wins. Build a first render instead of asking for approval of a
> plan; ask only for missing essentials such as the footage or a marker phrase the user says they use.

**In:** raw talking-head footage, a word-timed transcript, and optionally the exact phrase the speaker deliberately
says after a bad take.

**Out:** a 16:9 edit with auditable source ranges, tight speech, enhanced narration, a configurable neutral grade,
captions, optional simple graphics and an optional opening teaser. The scripts can use a supported hardware encoder,
but software H.264 remains the portable fallback.

Read `references/public-evidence.md` before describing the method. It separates public evidence from open
substitutes. Never claim that Silero, an ffmpeg filter, a trigger phrase, a grade value or a particular GPU encoder
is Nick's private choice unless later evidence in `STYLE_BIBLE.md` supports that exact claim.

## Defaults

- **Shape:** 16:9, source frame rate when it is 24/25/30/50/60; otherwise 30 fps.
- **Silence:** split speech when VAD sees about 0.5 s of silence. Use Silero VAD when installed. The included
  ffmpeg amplitude detector is a deterministic fallback, not a neural VAD and not an equivalent in noisy rooms.
- **Bad-take marker:** no default phrase. The user supplies it with `--trigger`. Matching is exact after punctuation
  and case normalization. The entire VAD speech island containing the marker is excluded, so the speaker should
  pause before the failed take and after the marker. Review every marker decision.
- **Audio:** conservative high/low-pass filtering, denoise, compression and -14 LUFS normalization. Turn down or
  disable a stage if it damages the voice.
- **Grade:** neutral by default. Apply only measured values from the footage or documented findings copied into
  `edit.json`; do not infer a private LUT.
- **Teaser:** off until a strong later moment is selected. When enabled it repeats that source range at the start,
  adds a small `COMING UP` label and a configurable lateral swivel motion. This is an open approximation of the
  publicly named “swivel teaser,” not a reverse-engineered effect.
- **Captions and graphics:** short captions from edited-time words. Graphics are explicit timed text entries in the
  plan; do not invent results, metrics or product screens.
- **Export:** `libx264` by default. `--encoder auto` selects a usable platform encoder only when a matching device
  is visible. The exact hardware stack in the reference is not public.

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
STYLE_BIBLE.md           verified look findings; starts pending
VERIFY.md
```

Start with `template/edit.example.json` only as a field reference. `plan_edit.py` writes the real plan.

## Workflow

### 1. Inspect and transcribe

Probe every source with ffprobe. Confirm dimensions, rotation, frame rate, duration and audio streams. Make a contact
sheet and inspect the start, middle and end. Transcribe with word timestamps, then correct names and the configured
marker phrase in the transcript before automating any cut.

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

No marker phrase:

```bash
python3 scripts/plan_edit.py --input source/raw.mp4 --vad working/vad.json \
  --words transcripts/source.words.json --out working/edit-01
```

With a speaker-chosen phrase (repeat `--trigger` for aliases):

```bash
python3 scripts/plan_edit.py --input source/raw.mp4 --vad working/vad.json \
  --words transcripts/source.words.json --trigger "<exact phrase>" --out working/edit-01
```

The script writes `edit.json`, `decisions.json` and `edited.words.json`. A matched phrase excludes its whole VAD
speech island. Check each decision against the source. If speech shares the same island, edit the source ranges in
`edit.json` rather than accepting a bad automatic cut. A phrase that is not provided is never guessed.

To prepend a later moment as a teaser, add `--teaser SOURCE_START:SOURCE_END`. Keep it short and choose it for
meaning, not merely volume. The selected range is repeated at the start; this is visible in the plan as a clip with
`"role": "teaser"`.

### 4. Add captions, graphics and look

```bash
python3 scripts/make_captions.py --words working/edit-01/edited.words.json \
  --out working/edit-01/captions.srt --max-words 4 --max-chars 30
```

Copy `template/STYLE_BIBLE.md` into the project. Leave unknowns marked pending. When verified findings arrive, put
their numeric grade, caption, graphic and teaser values into `edit.json` and cite source URLs and timecodes in
`STYLE_BIBLE.md`. The renderer reads JSON, never guesses from the prose.

Add graphics only as explicit plan entries:

```json
{"start": 1.2, "end": 3.8, "text": "ONE CLEAR CLAIM", "position": "top"}
```

### 5. Short render/compare loop

Render a representative 6–12 s window first:

```bash
python3 scripts/render.py working/edit-01/edit.json --captions working/edit-01/captions.srt \
  --sample 0:8 --out working/sample-01.mp4
```

After changing the cut, grade, captions or teaser, render the same window and compare it with the previous version:

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
python3 scripts/render.py working/edit-01/edit.json --captions working/edit-01/captions.srt \
  --out renders/draft-01.mp4
```

Hardware encode when the machine supports it:

```bash
python3 scripts/render.py working/edit-01/edit.json --captions working/edit-01/captions.srt \
  --encoder auto --out renders/draft-01.mp4
```

An explicit encoder (`h264_nvenc`, `h264_qsv`, `h264_vaapi`, `h264_videotoolbox`) is also accepted. Availability in
`ffmpeg -encoders` does not prove a device is usable, so check the command's exit and inspect the rendered file.

Verify:

- every VAD and marker cut by listening around both sides;
- no missing syllables and no unwanted long gaps;
- audio and video duration differ by at most one frame;
- integrated loudness is about -14 LUFS and true peak stays below -1.5 dB;
- no black stretches, stale captions or captions covering the face;
- the teaser's repeated source range is intentional and disclosed in the plan;
- grade and graphics match documented `STYLE_BIBLE.md` findings or remain neutral;
- the selected encoder is recorded in `VERIFY.md`.

Open `renders/draft-01.mp4` in FrameJam with `open_review`, wait for feedback, then render a new numbered version.
Never overwrite an approved render.

## Quality bar

- Every automated removal is reproducible from `vad.json`, the transcript and the configured trigger phrases.
- No trigger phrase survives in the cut; no ordinary phrase is treated as a trigger by default.
- The voice remains natural, intelligible and dominant.
- Captions match the heard words and graphics make only supportable claims.
- The look is traceable to neutral settings or timestamped evidence, never to an invented private stack.
- `VERIFY.md` records source and output duration, removed islands, teaser source range, audio checks, encoder and
  anything not verified.

## Files

- `scripts/detect_speech.py`: Silero VAD adapter with an ffmpeg fallback; emits a common speech-segment JSON format.
- `scripts/plan_edit.py`: merges speech around the chosen 0.5 s gap, applies exact marker phrases and writes an
  auditable source-to-edited timeline.
- `scripts/make_captions.py`: edited-time words to short SRT captions.
- `scripts/render.py`: one ffmpeg filter graph for cuts, audio enhancement, grade, teaser motion, captions, graphics
  and software or hardware encoding.
- `scripts/compare_renders.py`: technical probe plus labelled side-by-side comparison.
- `template/edit.example.json`: neutral configuration and `STYLE_BIBLE.md` hook.
- `template/STYLE_BIBLE.md`: evidence-first worksheet for later findings.
- `references/public-evidence.md`: claims that are safe to make and what remains unknown.
- `references/open-alternatives.md`: open tool choices when an exact component is unavailable.
