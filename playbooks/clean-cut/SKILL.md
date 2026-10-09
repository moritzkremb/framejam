---
name: clean-cut
description: Clean up a raw recording without adding anything. Removes dead air, false starts and repeated takes (keeps the last take) and returns the same video, shorter, plus an edit decision list and cut lists for Resolve, Premiere or Final Cut. No captions, graphics or music unless asked. Any length, any format, plain ffmpeg.
---

# Clean Cut

> **How to use this playbook.** It's a recipe, not a set of rules: every format, length, pace and formula below is a
> default, and whatever the user asks for wins. Don't open with questions: use the defaults, build, and mention the
> defaults you chose in one line when you share the first render (ask only if something essential is missing, like the
> footage itself). The first render is the proposal, so there's no plan to approve first. Storyboards only when the
> user asks to see the shots first. Planning files the method mentions (`BRIEF.md`, `PLAN.md` and the like) are your
> own working notes: write them when they help you, never as a step for the user.

**In:** a raw recording of someone talking: a talking head, a screen recording with voice, a talk, an interview or
podcast video. Any length, any aspect ratio.
**Out:** the same video with the dead air, false starts and earlier takes removed (the last take of every line
stays), at the source's size and frame rate, plus:
- `final.edl.json`: every kept range with source and edited times, and every removed take with its reason;
- `clean-cut.edl` (CMX3600), `clean-cut.fcpxml` and `clean-cut.csv`, so the cut opens in the user's editor on top of
  the untouched original.

Nothing is added: no captions, graphics, music, color or zooms, unless the user asks. The speaker should sound like
themselves on a good day, just without the waiting.

## Defaults (the user's request overrides any of them)

Work these out from the request and the files. Where nothing is said, use the default and keep going; ask only if something essential is missing.

- **How tight.** Pick from the table in `references/clean-cuts.md`: fast for shorts and reels, natural for YouTube and
  tutorials (the default for anything over ~3 minutes), gentle for talks, interviews and podcasts. If the user says
  "tight" or "keep it natural", follow that.
- **What counts as a mistake.** Default: dead air, false starts, repeated takes, abandoned sentences. Leave "um"s,
  breaths and natural pauses between thoughts unless the user asks for a harder cut; removing every filler word
  makes people sound robotic.
- **Sound.** Keep the source's channels (`--keep-channels`) when it's stereo with music, a second mic or room tone that
  matters; mono narration is fine for a single voice. Don't change loudness unless asked; offer -14 LUFS for social.
- **Frame rate.** Pass the source's own rate (`--fps 25`, `--fps 60`); for variable frame rate phone footage use the
  nearest standard rate.
- **Transcription.** Free and local by default; paid only with the user's OK (`references/transcription.md`).
- **Several files.** Clean each one separately, then join them in the order the user gives (ffmpeg concat of the
  `cut.mp4` files), unless they're two angles of the same take: then cut the main angle and apply the same
  `final.edl.json` to the other.

Requirements: Python 3 with NumPy, ffmpeg and ffprobe. No other tool is needed.

## Project layout

Copy `scripts/` into the project. Never modify the original.

```
source/      original recording(s)
transcripts/ source.words.json, edited.words.json
working/     edit-01/ (silence pass), edit-02/ (final cut), removals-NN.json, checks
renders/     clean-01.mp4, clean-02.mp4 ... and the cut lists
BRIEF.md  VERIFY.md
```

## Workflow

### 1. Probe

`ffprobe` the file: size, rotation, frame rate (and whether it's variable), audio channels, duration. Make a contact
sheet (`ffmpeg -i in.mp4 -vf "fps=1/10,scale=320:-1,tile=6x6" -frames:v 1 sheet.jpg`) to spot setup footage at the
start or end (walking to the camera, checking the screen) that should go too.

### 2. Transcribe

`references/transcription.md`. For long files transcription takes a while; start it and keep going.

### 3. Silence pass

```bash
python3 scripts/prepare_edit.py --input source/raw.mp4 --transcript transcripts/source.words.json \
  --out working/edit-01 --fps 30 [--min-silence 0.45 --pre-roll 0.12 --post-roll 0.18]
```

Writes `silence.edl.json` and `silence.transcript.json`. Check `silences.log`: if the room is noisy and almost
nothing was found, measure the noise floor and raise `--threshold-db`; if soft word endings were cut, lower it or
raise the rolls.

### 4. Find false starts and earlier takes

Read `silence.transcript.json` from start to end and mark: lines said twice (keep the **last**), sentences abandoned
halfway, setup chatter ("is this recording?"), long off-topic asides only if the user asked for that. Then do the
partial-retake audit from `references/clean-cuts.md`: transcribe 3–6 s excerpts around every sentence start and every
removed pause. Full-length transcripts hide short restarts; in testing every one of them did.

Write `working/removals-01.json`: one entry per removal with `source_start`, `source_end`,
`replacement_source_start` (where the kept take starts) and `reason`. Put cut points in quiet gaps, checked on the
waveform, never on a word timing alone.

### 5. Cut

```bash
python3 scripts/prepare_edit.py --input source/raw.mp4 --transcript transcripts/source.words.json \
  --removals working/removals-01.json --out working/edit-02 --fps 30 --render [--keep-channels]
```

`working/edit-02/cut.mp4` is the clean video (frame-accurate H.264, CRF 18, one keyframe per second, AAC 192k).
Copy it to `renders/clean-01.mp4`. For a lossless-looking master from 4K or log footage, re-encode the parts at a
lower CRF or as ProRes from the same `final.edl.json`; never cut from a previous render.

### 6. Check

- Transcribe the cut's audio and read it against the intended lines: no doubled phrases, nothing missing.
- Transcribe 3–6 s around every join, and look at the frames on both sides of each cut (a contact sheet of
  `edited_start` frames from `final.edl.json`).
- Durations: video and audio agree to one frame and equal `final.edl.json` duration.
- If you can't listen to the audio, say so in `VERIFY.md`.

### 7. Export the cut lists

```bash
python3 scripts/export_cutlist.py --edl working/edit-02/final.edl.json --source source/raw.mp4 --out renders/cutlist
```

Writes `clean-cut.edl` (CMX3600: import into Resolve or Premiere and relink to the original; the clip name is in
each event), `clean-cut.fcpxml` (Final Cut Pro and Resolve; points at the original file by path) and `clean-cut.csv`.
They reference the original recording, so the user keeps full quality and can adjust any cut.

### 8. Review in FrameJam

`open_review` with `videoPath` set to `renders/clean-01.mp4`, then `wait_for_feedback`. Comments arrive with
timestamps in the **edited** video; map them to source time through `final.edl.json` (find the clip whose
`edited_start`..`edited_end` contains the time, add the offset to its `source_start`). Fix by editing the removals
(or the tightness settings), cut again into a new folder, render `clean-02.mp4`, export the cut lists again and send
it with `add_version` and a note of what changed. Repeat until approved.

## Quality bar

- No dead air longer than the chosen tightness, no doubled phrase, no half sentence, no clipped first or last sound.
- The last take of every line, every time; an incomplete last take is flagged, not swapped.
- Picture and sound in sync to the frame from first to last cut; same size, frame rate and channel layout as the
  source.
- Natural rhythm: the pauses between thoughts are shorter, not gone.
- `VERIFY.md` lists source and cut durations, number of cuts, every removed take with its reason, what was checked
  and what wasn't (e.g. no listening).

## Files in this playbook

- `scripts/prepare_edit.py`: silence pass, then removals, then a frame-accurate render (`cut.mp4`, plus `speech.mp4`
  and `speech.wav` separately). `--keep-channels` keeps stereo sound. `--help` lists the transcript formats it reads.
- `scripts/export_cutlist.py`: `final.edl.json` to CMX3600 EDL, FCPXML 1.9 and CSV.
- `references/clean-cuts.md`: cut boundaries, tightness presets, retake rules and the partial-retake audit with a
  real example.
- `references/transcription.md`: free and paid transcription, short-window checks and what transcripts get wrong.
