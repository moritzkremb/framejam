# Transcription

The cut needs word timings for the raw recording, and the captions need word timings for the final edited audio.
Use the free local route unless the user already has a transcript or asks for a paid service.

## Free: whisper on this computer

Hyperframes ships a local whisper.cpp runner. It downloads the model once and never uploads audio:

```bash
ffmpeg -v error -y -i source/talking-head.mp4 -vn -ac 1 -ar 16000 working/source-16k.wav
npx -y hyperframes transcribe working/source-16k.wav --dir transcripts --model small.en --json
# -> transcripts/transcript.json: [{"text","start","end"}, ...]  (rename it, e.g. source.words.json)
```

Use `--model medium.en` for accents or noisy rooms, `--language de` (and a non-`.en` model) for other languages.

**Long recordings (over ~10 minutes), and any transcript you check for retakes:** whisper.cpp with
`large-v3-turbo` and DTW word timing. It is free, local and fast (a 37-minute recording in 85 s on an M-series Mac),
and it keeps far more retakes than `small.en`: on that recording `small.en` merged most restarts into clean
sentences, turbo kept every one the reviewer later pointed at.

```bash
# once: brew install whisper-cpp; model ~1.6 GB
curl -L -o ~/.cache/whisper-large-v3-turbo.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin
whisper-cli -m ~/.cache/whisper-large-v3-turbo.bin -dtw large.v3.turbo -f working/source-16k.wav \
  -ojf -ml 1 -sow -t 8 -np -of transcripts/source.words
# -> transcripts/source.words.json, one word per entry; prepare_edit.py and find_retakes.py read it as is
```

Word times from a whole-file pass still drift 0.5–1.5 s on long files: good enough to find a spot, never to place a cut.
Other free routes that give word timings: `whisper-cli -m ggml-small.en.bin -f clip.wav -ojf` (whisper.cpp),
`whisper clip.wav --word_timestamps True --output_format json` (openai-whisper), or faster-whisper with
`word_timestamps=True`. The scripts in this playbook accept all of these formats (see `prepare_edit.py --help`).

## Paid (only with the user's OK or a stated budget)

- **ElevenLabs Scribe** (`scribe_v1`): very good word timings and keeps filler words and repeats more often than
  whisper. Save the JSON response as is; `words` entries with `"type": "spacing"` are skipped automatically.
- **OpenAI** (`whisper-1` with `response_format=verbose_json` and `timestamp_granularities[]=word`): save the JSON as is.

Never send a file to a paid API without saying what it costs first.

## Things transcripts get wrong

- **They hide retakes.** Every ASR model smooths "So the first thing I do is... So the first thing I do is I need"
  into one clean sentence. In testing, a 163 s recording with four retakes transcribed fluently with local whisper,
  and a paid cloud model also hid them. Short excerpts (2–6 s) around each pause exposed all four. Do the
  partial-retake audit in `clean-cuts.md` every time; a clean transcript is not evidence of clean audio.
  `large-v3-turbo` hides far fewer (see above), which makes `find_retakes.py` on the cut worth running.
- **Timings smear across pauses.** A word can start inside a pause, last a second, or have zero length. Use the
  waveform for cut points, never word timings alone.
- **Names.** Product and people names come out wrong ("cloud code" for Claude Code, "Higgs field" for Higgsfield).
  Fix them in captions from what's on screen, the script or the user's notes. Keep a list of fixes in EDIT_PLAN.md.
- **Captions come from the edited audio.** After the final cut, transcribe `speech.wav` again rather than reusing
  retimed source words when timings look wrong.

## Short-window check (for the retake audit)

```bash
for r in 16:6 60:7 92.5:6; do s=${r%%:*}; d=${r##*:}
  ffmpeg -v error -y -ss $s -t $d -i working/source-16k.wav /tmp/ex.wav
  echo "== $s +$d: $(npx -y hyperframes transcribe /tmp/ex.wav --dir /tmp/ex --json >/dev/null 2>&1; \
    python3 -c "import json;print(' '.join(w['text'] for w in json.load(open('/tmp/ex/transcript.json'))))")"
done
```

`whisper-cli -m <model> -f /tmp/ex.wav -nt -np` does the same in one line if whisper.cpp is installed
(Hyperframes keeps its model in `~/.cache/hyperframes/whisper/models/`).
