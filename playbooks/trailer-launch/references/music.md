# Trailer music

The bed has to do one job the launch-teaser groove doesn't: climb, vanish, and hit.

## Stages

| Section | Feel | Default (52 s) |
| --- | --- | --- |
| `atmosphere` | Low drone, sparse heartbeat, filtered pads | 0–5 s |
| `build` | Filter opens, ticks denser, riser into the gap | 5–21.5 s |
| `silence` | Nothing. Not a pad, not a tail | 21.5–23 s (1.5 s) |
| `climax` | Drop on the first frame: kick, boom, wide minor pads | 23–34 s |
| `hero` | Driving, a bit cleaner so the VO sits | 34–49 s |
| `outro` | One boom, ring-out, fade | 49–52 s |

120 BPM is a fine grid (beat 0.5 s, bar 2 s) even when section times don't land on a bar. 90–100 BPM also works if
the VO is slower. The silence is a time, not a bar: 1–1.5 s of digital black.

## The free route: trailer_bed.py

```bash
uv run <playbook>/scripts/trailer_bed.py cues.json --out assets/bed.wav
# or: python3 -m pip install numpy scipy soundfile && python3 trailer_bed.py cues.json --out bed.wav
```

Start from `scripts/cues.example.json` and move the times to the voiceover.

Sections take `t` + `dur` (seconds) or `bars` (1-indexed, 4 beats). Time is easier on this playbook because the
silence is 1.5 s. `mood` is `night` (minor, default) or `bright`.

```json
{
  "bpm": 120,
  "duration": 52,
  "mood": "night",
  "sections": [
    {"t": 0, "dur": 5, "type": "atmosphere"},
    {"t": 5, "dur": 16.5, "type": "build"},
    {"t": 21.5, "dur": 1.5, "type": "silence"},
    {"t": 23, "dur": 11, "type": "climax"},
    {"t": 34, "dur": 15, "type": "hero"},
    {"t": 49, "dur": 3, "type": "outro"}
  ],
  "hits": [
    {"t": 0.4, "sfx": "tick"},
    {"t": 5.0, "sfx": "whoosh", "dur": 0.5},
    {"t": 17.0, "sfx": "riser", "dur": 4.5},
    {"t": 23.0, "sfx": "boom"},
    {"t": 23.0, "sfx": "whoosh", "dur": 0.4},
    {"t": 34.0, "sfx": "swoosh", "dur": 0.8},
    {"t": 49.0, "sfx": "boom"}
  ]
}
```

- A `climax` or `hero` after `silence` or `build` starts with a drop (big kick + impact) unless you set
  `"drop": false`.
- `build` puts its own riser on the last 2.5 s; add a `riser` hit if you want it longer or louder.
- Sound effects: `boom` (logo / drop), `impact`, `slam`, `whoosh` (reverse, ends at `t`), `swoosh` (forward, starts
  at `t`), `tick`, `glitch`, `riser` (`dur`). Optional `gain` on any hit.
- `--no-sfx` / `--sfx-only` split the layers. `--print-sections` dumps start/end/RMS so you can check the gap.

## Checks

```bash
for s in 0 5 17 21.5 23 34 49; do
  printf "%s: " $s
  ffmpeg -hide_banner -ss $s -t 1.4 -i assets/bed.wav -af volumedetect -f null - 2>&1 | grep -o 'mean_volume: .*'
done
```

Expect atmosphere well under the climax, the 21.5 s window near −70 dB or "n/a", climax and the logo boom the
loudest. Duck 6–9 dB under the VO in the video tool. You can't hear it: ask the user to listen.

## A real track

- User-owned or licensed trailer music (YouTube Audio Library, Epidemic Sound, Musicbed, Artlist). Measure tempo
  and cut the grid to it.
- Many trailer cues already have a near-silence then a hit. Line that hit up with your reveal; don't layer a second
  drop on top.
- If the cue has no gap, dip it to zero yourself for 1–1.5 s (volume keyframes), then let it slam.
- Generated music (Suno, ElevenLabs Music) is paid; ask first.
