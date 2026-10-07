# Music and the beat grid

## Sources (in order of preference)
1. **The user's licensed track** (or one from a library they subscribe to). Cut it to 15–25 s on bar lines, ideally
   with a hit where the big flood goes and one where the logo lands.
2. **Generated music** in a tool the user already has (Suno, Udio, ElevenLabs Music). Usually paid; ask first. Brief:
   "instrumental, 115–130 BPM, punchy electronic percussion, a riser into a hit at bar 4 and bar 7, clean ending".
3. **The scratch beat** (`scripts/scratch_beat.py`): free, synthesized on an exact grid, royalty-free. Fine for the
   build and for drafts; offer to replace it for the final cut.

Never use music the user doesn't have rights to (no ripped songs, no "trending audio" downloads).

## Measure
```bash
python3 tools/beat_grid.py assets/music.mp3 --out analysis/beats.json        # tempo, grid origin, downbeats, accents
python3 tools/beat_grid.py assets/music.mp3 --bpm 124 --out analysis/beats.json  # known tempo: phase only
```
Set `BPM` and `OFFSET` (the printed grid origin) at the top of `index.html`. Read the accents list: those are the
moments for the flood and the lockup. The downbeats are picked by low-end energy (kicks); if the track has a kick
on every beat that guess can be a beat off, so compare the accents with the downbeat list and shift `OFFSET` by
whole beats until the big hits fall on bar starts. If the user can listen, ask them to confirm the first downbeat.

## Place everything in beats
- All times in the composition are `at(beat)`; a shot's tricks start on beats or eighths (`at(6.5)`).
- Default 4/4 at ~120 BPM: 32 beats = 16 s. One trick per 4 beats (one bar) is the reference's density; dense
  sections can use 2 beats per trick.
- Arrivals peak on the beat: start a 0.35 s `expo.out` tween **on** the beat (most of the move happens in the first
  0.1 s), or start a 0.5 s `expo.inOut` half a beat early so it lands on it.
- Big events on accents: flood on the first hit (a riser leads into it), the logo on the last.
- The lockup gets 6–10 beats; the music should end or ring out under it.

## Check the sync after rendering
- `python3 tools/sync_check.py renders/v1.mp4 --at 6.0` compares the biggest picture change and the biggest audio
  onset in a 1 s window around each given time (the flood, the logo hit). They should be within 0 to +1 frame.
- Re-run `beat_grid.py` on the rendered mp4: the tempo and origin must match the source track (rendering never
  shifts audio, but a wrong `OFFSET` shows up here).
