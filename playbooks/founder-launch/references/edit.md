# Edit: from raw takes to the finished launch

## Transcription

Free and local (default):

```bash
# whisper.cpp (fast on Apple Silicon)
ffmpeg -i take.mp4 -ar 16000 -ac 1 take.wav
whisper-cli -m models/ggml-medium.en.bin -f take.wav -ojf -ml 1   # word-level JSON (take.wav.json)

# or openai-whisper (pip install -U openai-whisper)
whisper take.mp4 --model medium --word_timestamps True --output_format json
```

Services the user may already have: ElevenLabs Scribe, OpenAI transcription, Deepgram, AssemblyAI (paid or free tier;
ask first). Whatever the source, normalize to `[{ "word", "start", "end" }]` per take and write a readable
`transcript.md` with a timecode every sentence.

## Cutting from the transcript

1. Mark every sentence as keep / drop. For a line said several times, keep the last complete take unless an earlier
   one is clearly better. Drop false starts, "um"/"so yeah", and asides.
2. Reorder freely: the cold open is usually from the middle or end of the recording.
3. Turn kept sentences into segments: start = first word start − 0.08 s, end = last word end + 0.12 s. Never cut
   inside a word.
4. Write `keep.json` (`{"keep": [[start, end], ...]}` in source seconds, in playback order) and render with
   `scripts/pauses.py take.mp4 --from-json keep.json --render cut.mp4`. `pauses.py` without `--from-json` only
   shortens dead air, which is a good first pass on a single clean take.
5. Several takes: render each take's segments, then concatenate (`ffmpeg -f concat -safe 0 -i list.txt -c copy`
   when the encodes match).
6. For a timeline editor (Resolve, Premiere, Final Cut), export the segments as an EDL or CSV cut list instead.

## Layouts

| Layout | When |
| --- | --- |
| Founder full frame | Cold open, why, CTA |
| Founder full frame + kinetic callout beside them | Key claims, numbers |
| Screen full frame, pushed in on the action | Demo lines |
| Screen in a floating window on a brand or blurred-founder background | Demo when the raw recording is busy or small |
| Split: founder left, screen right (or app + phone) | Two things at once, a reaction to the product |
| Statement card (white on black or brand color) | Section breaks, the problem line |

- Keep the founder's eyes in the top third; callouts and captions never cover the face.
- Push into screen recordings: the cursor, the result, the button. Max 2.4x on 2x captures. Move the camera on a
  beat or a word, then hold.
- Punch-ins on founder-only stretches: alternate 100% and ~115% at cuts.

## Kinetic callouts

- Words the founder says, set exactly as said, 1–3 words (stack up to 3 lines for a phrase).
- Big: 120–200 px at 1080p, display weight, brand color or white with a soft shadow; one accent word.
- Enter on the word's start (rise or slam in 0.12–0.3 s), hold while it's relevant, exit on the next cut.
- Numbers count up as they're said ("10,000+ PEOPLE").
- One every 5–8 s. More becomes noise.

## Lower third, bumper, end card

- Lower third: name (600 weight) and role (muted), small brand mark, slides in 0.4 s, holds 3 s, out 0.3 s.
- Logo bumper on the reveal line: 1–1.5 s, logo blooms in on a brand-color field with a whoosh; then the product.
- End card: logo + link (+ the offer in one short line), holds 2 s, fade at the very end.

## Captions

- Every spoken word, grouped 2–5 words by phrase, from the word timings.
- 16:9: bottom center, ~56 px, white with a dark outline or pill. 9:16: around 65–70% height, clear of the platform
  UI, ~64 px.
- Highlight the current word (accent color) only if it stays readable; never animate every word.
- When a callout shows the same words, hide the caption for that group.

## Sound

- Voice: `ffmpeg -i cut.mp4 -af "highpass=f=80,afftdn=nf=-25,loudnorm=I=-16:TP=-1.5:LRA=11" -c:v copy voice.mp4`.
- Music bed 15–20 dB under the voice; lift it on the cold open, the bumper and the end card. `launch_bed.py` with
  `mood: "night"` and sections matching those moments works; mix it in the video tool at `data-volume` ≈ 0.15–0.25
  (or `-af volume=0.2`).
- A whoosh into the bumper, a soft pop when a callout lands, a click when a button is pressed on screen.

## Hyperframes notes (when starting fresh)

- The cut founder video is one full-frame `<video id="founder" class="clip">` on a low track; screen inserts are
  timed `<video id=…>` clips on higher tracks; callouts, lower third and captions are clips above them.
- Every timed video needs an id or it renders frozen. Move a wrapper `div` for push-ins, not the video itself.
- Keep audio in one place: the founder video's audio (`muted` off on that one clip) or a separate extracted
  `voice.wav`, plus the music bed as an `<audio class="clip">`.
- `npx hyperframes lint`, `npx hyperframes snapshot --at …`, `npx hyperframes render --output renders/v1.mp4`.
