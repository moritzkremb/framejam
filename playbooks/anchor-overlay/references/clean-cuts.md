# Speech cut boundaries

ASR word timestamps are approximate: a word may begin in a preceding pause, end far into silence, or have zero
duration. A low-amplitude consonant is speech even when a silence detector says otherwise. Do not promise
sample-exact linguistic boundaries from ASR alone.

## Practical method

1. Extract mono PCM at 16–48 kHz while preserving time zero. Inspect the noise floor and speech levels. Detect
   candidate silence runs around 250–350 ms or longer; for a clean close-mic recording -40 dBFS is a useful
   starting point, not a universal setting. For a noisy room, measure the floor first
   (`ffmpeg -i in.wav -af astats -f null -`) and set `--threshold-db` about 6 dB above it.
2. Merge candidate silences separated by tiny isolated clicks only after checking they are not speech. Inspect
   ambiguous spans against the transcript and waveform. Shorten larger pauses to roughly 100–180 ms total by
   retaining ~50–80 ms before onset and ~70–100 ms after offset. Keep smaller natural articulation gaps. Prefer a
   little room over a clipped consonant.
3. For cut boundaries, search a low-energy region beyond the protected speech envelope. Snap picture cuts outward to
   video frame boundaries. Audio may cut at a nearby zero crossing or receive a 3–5 ms edge ramp within retained
   non-speech. Never use a long crossfade across syllables.
4. Recheck words touching every boundary. Play joins with 0.5–1 s of context on both sides when audio listening is
   available; otherwise inspect waveform/spectrogram and retranscribe cut audio, and disclose that listening was not
   performed. Transcript equality alone does not prove intact pronunciation.
5. Handle variable frame rate with a constant-frame-rate derived working assembly. Derive sound and picture from one
   range map to avoid accumulated sync drift. Use frequent keyframes (about one per second) in the derived H.264
   footage so editors and previews can seek reliably. Source files remain unchanged.

## How tight

| Use | Settings for `prepare_edit.py` |
| --- | --- |
| Shorts, reels (fast) | defaults: `--min-silence 0.28 --pre-roll 0.065 --post-roll 0.085` |
| YouTube, tutorials (natural) | `--min-silence 0.45 --pre-roll 0.12 --post-roll 0.18` |
| Talks, interviews, podcasts (gentle) | `--min-silence 0.8 --pre-roll 0.2 --post-roll 0.3` |

Don't speed the voice up to make it feel faster; remove dead air instead. Only speed up (e.g. 1.1x with
`setpts`/`atempo`) when the user asks.

## Retry decisions

Maintain entries such as:

```json
[{"source_start":125.0,"source_end":130.0,"replacement_source_start":148.0,"reason":"Earlier abandoned version of the weekly-automation line; keep final take."}]
```

The helper intersects this removal with the already silence-cut ranges; it emits a second-stage map, rather than
applying raw timestamps to edited media. Review the exact semantic span yourself. Local repairs such as removing a
false-start preposition need independent boundary evidence and a reason; do not let fuzzy text matching delete
ordinary repeated words.

Rules:
- Keep the **last** version of the same intended line, even if an earlier one sounds more fluent. A later paraphrase
  replaces an earlier take even if the words differ.
- Keep intentional repetition ("step one... step two..."; a repeated phrase for emphasis).
- If the last take is incomplete, keep it, flag it to the user and don't secretly swap in an earlier take.
- Record every removal with the source range, the take that replaces it and the reason.

## Meaningful verification

- Kept source ranges are ordered, non-overlapping, positive, and within the media.
- Every final word maps to retained source speech; earlier retry words disappear and replacement words remain.
- The sum of final clip frame counts equals expected output duration to one frame.
- Audio and video durations agree to one frame; cut-edge ramps do not extend into speech.
- Use a boundary contact sheet/waveform report plus a rendered draft, not only a passing structural check.

## Detecting short retakes that ASR hides

A real test recording (163 s, four retakes) showed this clearly. Cloud and local transcripts of the whole clip both
read fluently. Excerpts of 2–6 s exposed every retake:

| Excerpt | Heard in the excerpt | Decision |
| --- | --- | --- |
| 17.0–20.0 s | "So the first thing I do is" | earlier take, removed |
| 19.8–22.8 s | "So the first thing I do is I need to hook up..." | last take, kept |
| 61.0–63.0 s | "and who is" | earlier fragment, removed ("and" kept) |
| 62.7–66.7 s | "Who is it calling out?" | kept |
| 94.0–96.0 s | "templates that" | cut after "templates" |
| 95.9–98.9 s | "that are already set up to generate" | kept |
| 122–132 s / 140–152 s | "a weekly routine, a weekly automate." / "...run as a weekly automation and don't need to do anything" | abandoned line removed, final complete take kept |

Use overlapping 3–6 second review windows around every removed pause and sentence start, plus a pass over the full
retained narration in 5 s windows that overlap by 1 s. A monosyllable assigned one or more seconds, or a word
stretching across a removed pause, is a review signal rather than a literal word boundary. Do not cut merely because
one ASR pass proposes a repeated word: corroborate with a second overlapping excerpt, waveform/phonetic boundaries,
or direct listening when available.

Verify both halves of a repair independently. For example, a trial boundary after "templates" still transcribed an
extra "that"; moving it into the earlier low-energy gap preserved "templates" and removed the entire first fragment.
Then recheck the joined phrase and rebuild all caption/overlay times through the edit map.
