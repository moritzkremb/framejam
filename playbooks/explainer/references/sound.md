# Sound: voice, word timing, music, effects

The voice is the clock: record or generate it first, measure when every word is said, then place every picture and every sound on those times.

## Voice (`scripts/tts.py`)

| Route | Cost | Notes |
| --- | --- | --- |
| The user's own voice | free | Best for their channel. They record `assets/vo/<scene id>.wav` per scene (phone or any mic, quiet room, one take per scene). `tts.py --provider record` lists what's missing. |
| Kokoro (default) | free, local | `pip install kokoro-onnx soundfile`; model downloads once (~330 MB). Voices: `am_michael`, `am_adam`, `af_heart`, `af_nova`, `af_sky`, `bm_george`, `bf_emma`. Clear and natural, a bit flat on jokes. |
| Piper | free, local | Many languages; `voice.model` = path to a `.onnx` voice. |
| macOS `say` | free | Robotic; for drafts and timing tests only. |
| OpenAI `gpt-4o-mini-tts` | paid (cents per video) | Takes `voice.instructions` (tone, pacing). Voices: `ash`, `coral`, `sage`, `ballad`… Needs `OPENAI_API_KEY` and `--paid-ok`. |
| ElevenLabs | paid (free tier exists) | Most natural; cloned voices. `voice.voice_id`, `ELEVENLABS_API_KEY`, `--paid-ok`. |

- Ask before any paid route; default to Kokoro or the user's voice.
- `voice.speed` 1.05–1.15 tightens a slow voice (ffmpeg `atempo`, pitch unchanged). Moritz's explainers run at 1.08–1.15×.
- One file per scene keeps re-takes cheap: fix one sentence, regenerate one scene, re-run the clock.
- Listen-check you can't do: transcribe the final mix (`whisper-cli`) and compare with the script; check loudness (`ffmpeg -af ebur128`).

## Word timing (`scripts/word_times.py`, `scripts/build_timing.py`)
- `word_times.py` transcribes each scene with whisper.cpp (`whisper-cli`, free; `brew install whisper-cpp`) into word-level times. Without it, times are estimated (good enough for drafts).
- `build_timing.py` lays the scenes end to end (lead-in 0.6 s on the first, 0.3 s on the rest, 0.5 s tail, an end hold on the last), aligns the transcript back to the script words, and resolves every named cue. Output `assets/timing.json` (and `timing.js` for HTML):
  - `scenes[]`: `id, start, dur, vo, voDur, chapter`
  - `cues{}`: name → seconds; plus `<id>` (scene start) and `<id>.vo` (voice start)
  - `captions[]`: `text, t0, t1`; `words[]`: every word with its time
- Name cues after what they trigger (`v_whisper`, `a_bounce`). If a word appears twice in a scene, `["word", 2]`.

## Captions
Burned-in by default (most viewers watch muted): one short chunk at a time, bottom centre, in the video's card style, ≤ 2 lines. They come from the script text, timed by the transcript, so spelling is always right. Turn them off only if the user asks.

## Music (optional)
- Default: a quiet bed under the voice, ducked ~8 dB while the voice speaks (`mix.py` does it). Or none: a clean voice with effects works.
- **Free:** YouTube Audio Library or another royalty-free library (check the licence allows your use), or a local generator (ACE-Step runs on a Mac/GPU; MusicGen), or a simple synthesized bed (a few chords in numpy).
- **Paid:** ElevenLabs Music, Suno, Udio (generate an instrumental to the video's mood and length).
- Never use commercial songs. Note the source and licence in BRIEF.md.
- `script.json`: `"music": {"file": "assets/music.mp3", "db": -20, "start": 0}`.

## Sound effects
- `scripts/sfx.py` synthesizes a free kit: `pop`, `whoosh`, `click`, `tick`, `ding`, `thud`, `sparkle`, `riser`. Library sounds (freesound.org with a licence that allows it, or a paid library) drop into `assets/sfx/` and are used by name.
- Place them on cues in `script.json` `sfx` (`{"at": "h_blue", "sound": "pop", "offset": -0.05, "gain": -14}`) and set `scene_sfx: "whoosh"` for every scene change.
- One sound per visual event at most, quieter than you think (-14 to -20 dB). A pop for things appearing, a whoosh for wipes and fast moves, a tick for counters, a ding or sparkle for the payoff, a thud for a stamp or "no".

## Mix (`scripts/mix.py`)
Voice at full level, effects on their cues, music ducked, loudness normalized to -16 LUFS (fine for YouTube, X, Instagram). Output `assets/soundtrack.wav`, which the composition plays from 0 to the end.
