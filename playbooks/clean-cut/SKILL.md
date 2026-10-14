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

- **How tight.** A tight jump cut, fast-paced, for every length: every pause becomes ~0.09 s (the script's
  defaults), so one thought runs straight into the next. Natural or gentle (`references/clean-cuts.md`) only when the
  user asks for it ("keep it natural", a podcast or talk they want to breathe).
- **What counts as a mistake.** Dead air, false starts, repeated takes, abandoned sentences, and the filler that slows
  it down: "um", "uh", "so, uh", audible breaths between sentences. Keep breaths and short words inside a phrase, and
  never cut into a word.
- **Sound.** Keep the source's channels (`--keep-channels`) when it's stereo with music, a second mic or room tone that
  matters; mono narration is fine for a single voice. Don't change loudness unless asked; offer -14 LUFS for social.
- **Frame rate.** Pass the source's own rate (`--fps 25`, `--fps 60`); for variable frame rate phone footage use the
  nearest standard rate.
- **Transcription.** Free and local by default; paid only with the user's OK (`references/transcription.md`). For
  recordings over ~10 minutes use whisper.cpp `large-v3-turbo`: fast, and it keeps the retakes smaller models hide.
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

`references/transcription.md`. For long files transcription takes a while; start it so it keeps running after your
command returns, check on it every 30–60 s, and do the probe and contact sheet meanwhile.

**Long recordings (20 minutes and more).** The time goes into finding retakes and into review rounds, not into the
first render. Find retakes on audio, not on renders: a turbo transcript of `speech.wav` plus `find_retakes.py`
(step 6) takes about a minute for 20 minutes of cut. Rendered clips are cached across cuts, so a fix round only
renders the clips that changed (seconds, not a full re-render). Run one heavy job at a time and tell the user how
long it should take.

### 3. Silence pass

```bash
python3 scripts/prepare_edit.py --input source/raw.mp4 --transcript transcripts/source.words.json \
  --out working/edit-01 --fps 30
```

The defaults are the tight jump cut. Only for a natural cut the user asked for, add
`--threshold-db -40 --min-silence 0.45 --pre-roll 0.12 --post-roll 0.18`.

Writes `silence.edl.json` and `silence.transcript.json`. Check `silences.log`: if the room is noisy and almost
nothing was found, measure the noise floor and raise `--threshold-db`; if soft word endings were cut, lower it to
-40 or raise the rolls.

### 4. Find false starts, earlier takes and fillers

Read `silence.transcript.json` from start to end and mark: lines said twice (keep the **last**), sentences abandoned
halfway, setup chatter ("is this recording?"), fillers ("um", "uh", a stray "so" or "like" that starts a sentence) and
audible breaths between sentences, long off-topic asides only if the user asked for that. Transcripts often drop
fillers: find them on the waveform and in the excerpts below, and cut each in its own quiet gap. Then do the
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
Each kept clip is rendered once into `working/part-cache/` (keyed by its source range), so the next cut into
`working/edit-03` reuses every unchanged clip; `--jobs` sets how many render at once (default 3).
Copy it to `renders/clean-01.mp4`. For a lossless-looking master from 4K or log footage, re-encode the parts at a
lower CRF or as ProRes from the same `final.edl.json`; never cut from a previous render.

### 6. Check

- Transcribe the cut's audio (`speech.wav`, with `large-v3-turbo` when you can) and run
  `python3 scripts/find_retakes.py --transcript transcripts/edited.words.json --edl working/edit-02/final.edl.json`.
  It lists repeats ("or, or", "of the of the"), restarts ("it's, it is", "the, this"), cut-off words and fillers
  with edited and source times. Listen to or excerpt-transcribe each one, cut the real ones, and run it again; on a
  23-minute test it found five of the seven stumbles a reviewer later pinned. Do this before every review round, so
  the user's comments go to taste, not to stumbles a script can find.
- Read the cut's transcript against the intended lines: nothing missing, no half sentence.
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
`edited_start`..`edited_end` contains the time, add the offset to its `source_start`; if the render is sped up,
multiply the comment time by the speed first). Fix by editing the removals (or the tightness settings), cut again
into a new folder, render `clean-02.mp4`, export the cut lists again and send it with `add_version` and a note of
what changed. When a comment points at a stumble, look for the same kind of stumble in the rest of the cut
(`find_retakes.py`) and fix those too, so the next round doesn't find them one by one. Repeat until approved.

## Quality bar

- No dead air longer than the chosen tightness, no doubled phrase, no half sentence, no clipped first or last sound.
- The last take of every line, every time; an incomplete last take is flagged, not swapped.
- Picture and sound in sync to the frame from first to last cut; same size, frame rate and channel layout as the
  source.
- Fast-paced: no gap between phrases longer than ~0.12 s, no "um" or "uh" left, and still no clipped sound; it
  should feel like a tight YouTube jump-cut edit, not a rushed one.
- `VERIFY.md` lists source and cut durations, number of cuts, every removed take with its reason, what was checked
  and what wasn't (e.g. no listening).

## Files in this playbook

- `scripts/prepare_edit.py`: silence pass, then removals, then a frame-accurate render (`cut.mp4`, plus `speech.mp4`
  and `speech.wav` separately), with rendered clips cached across cuts. `--keep-channels` keeps stereo sound.
  `--help` lists the transcript formats it reads.
- `scripts/find_retakes.py`: lists repeats, restarts, cut-off words and fillers left in a cut, with edited, source
  and review times.
- `scripts/export_cutlist.py`: `final.edl.json` to CMX3600 EDL, FCPXML 1.9 and CSV.
- `references/clean-cuts.md`: cut boundaries, tightness presets, retake rules and the partial-retake audit with a
  real example.
- `references/transcription.md`: free and paid transcription, short-window checks and what transcripts get wrong.
