# Music and sound

Launch videos are cut to music. Decide the tempo before the first frame and keep everything on one grid.

## Beat grid

- 120 BPM is the easy default: 1 beat = 0.5 s, 1 bar = 2 s. 110–128 BPM all work.
- Every frame starts on a downbeat and lasts whole bars (2, 4, 6 s at 120 BPM).
- Reveals inside a frame land on beats (multiples of 0.5 s) unless they follow a voiceover word.
- Drops (big kick + impact): on the product name, and again where proof or the climax starts.
- A 1–2 bar breakdown (no drums, riser, snare roll) before the second drop gives the video a breath.
- The last 2–4 s: final hit and ring-out under the end card, then a short fade.

## The free route: launch_bed.py

`scripts/launch_bed.py` synthesizes a bright electronic bed (drums, offbeat bass, pads, plucked arp, a bell hook)
plus sound effects, from a JSON cue sheet. No samples, no service, no licence questions. Same seed, same file.

```bash
uv run <playbook>/scripts/launch_bed.py cues.json --out assets/music/bed.wav
# or: python3 -m pip install numpy scipy soundfile && python3 launch_bed.py cues.json --out bed.wav
```

```json
{
  "bpm": 120,
  "duration": 46,
  "mood": "bright",
  "sections": [
    {"bars": [1, 2], "type": "intro"},
    {"bars": [3, 16], "type": "groove"},
    {"bars": [17, 18], "type": "breakdown"},
    {"bars": [19, 21], "type": "groove"},
    {"bars": [22, 23], "type": "outro"}
  ],
  "hits": [
    {"t": 0.5, "sfx": "slam"}, {"t": 1.5, "sfx": "slam"}, {"t": 2.5, "sfx": "slam"},
    {"t": 4.0, "sfx": "whoosh", "dur": 0.5},
    {"t": 8.5, "sfx": "swoosh", "dur": 1.2},
    {"t": 16.0, "sfx": "pop"}, {"t": 17.0, "sfx": "tick"}, {"t": 17.5, "sfx": "chime"},
    {"t": 20.2, "sfx": "typing", "dur": 1.6, "chars": 41},
    {"t": 22.0, "sfx": "click"},
    {"t": 44.0, "sfx": "click"}
  ]
}
```

- Section types: `intro` (filtered pads, heartbeat kick, drone), `groove` (full beat; a groove after an intro or
  breakdown starts with an automatic drop), `breakdown` (pads open, riser and snare roll into the next bar), `outro`
  (final impact and ring-out, no drums).
- Sound effects: `impact`, `slam` (word slam), `whoosh` (reverse, ends at `t`, into a cut), `swoosh` (forward,
  starts at `t`, a window flying in), `pop` (chip, tile, pin), `tick` (swap, row), `click` (button, send), `chime`
  (done, check), `typing` (`dur`, `chars`), `riser` (`dur`). Optional `gain` on any hit.
- `mood: "night"` switches to a minor progression for dark, moody launches.
- `--no-sfx` / `--sfx-only` render the two layers separately if you want to mix them in the video tool.
- Check the result: `ffmpeg -ss 0 -t 4 -i bed.wav -af volumedetect -f null -` per section; the intro should sit a
  few dB under the groove. You can't hear it: tell the user to listen and offer to change tempo or mood.

## Using a real track

- The user's own or a licensed library track (YouTube Audio Library, Epidemic Sound, Artlist, Musicbed).
- Measure the tempo (librosa `beat_track`, or tap it out against the waveform) and cut the grid to it.
- Many library tracks open on a slow build. Start the track at the strongest clean section, fade in over 0.3 s,
  and make sure it doesn't end before the video (fade out 1–2 s at the end).
- Generated music (Suno, ElevenLabs Music, Udio) is paid; ask before using it and check the plan allows commercial use.

## Voiceover with music

- Voice first: its real duration sets frame lengths. Then pick a tempo and round frames to bars, adding silent beats
  at the ends rather than squeezing words.
- Duck music 6–9 dB under the voice. Keep sound effects; drop the busiest ones under dense speech.
