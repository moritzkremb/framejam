# The same method in the project's own tool

The method is tool-independent: script → voice → word times → named cues → scenes placed on cues → sound on the same clock → review. The scripts in `scripts/` produce `assets/timing.json` and `assets/soundtrack.wav`; any tool can read them. Don't convert an existing project; build the scenes in whatever it uses.

## Remotion (React)
- Read `assets/timing.json` (import it or `staticFile` + fetch in `calculateMetadata`). `durationInFrames = Math.ceil(T.total * fps)`.
- One `<Sequence from={sec(S.start)} durationInFrames={sec(S.dur)}>` per scene; inside, convert cue seconds to frames relative to the scene start.
- Motion: `interpolate(frame, [cue, cue + 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) })`; `spring({ frame, fps, config: { damping: 200 } })` for no-overshoot settles; `@remotion/paths` `evolvePath` for drawn lines.
- Audio: one `<Audio src={staticFile("assets/soundtrack.wav")} />` at the root. Captions from `T.captions`.
- Render: `npx remotion render <Comp> renders/v1.mp4`.

## Motion Canvas
- In each scene, `yield* waitFor(cueTime - elapsed)` before each reveal, or place `waitUntil('cue_name')` events and drag them onto the audio waveform in the editor (import `soundtrack.wav` as the project audio).
- Drawn lines: `line().end(0)` then `yield* line().end(1, 0.6)`.

## Manim
- `self.wait(cue - self.time)` before each reveal; add the soundtrack with `self.add_sound("assets/soundtrack.wav")` at the start of a single long scene, or mux it afterwards with ffmpeg.

## Screen recordings / ffmpeg-only edits
- For a tutorial built from recordings: the voice still comes first; cut the recording to the cues, and add explainer inserts (a diagram, a big number) as short generated clips made with any of the above, overlaid with ffmpeg `overlay=enable='between(t,a,b)'`.
- Captions as an `.ass` file generated from `T.captions` and burned in with `ffmpeg -vf ass=captions.ass`.

## What Hyperframes would have added
Tell the user when they're on another tool: the bundled starter composition (paper look, chapter labels, caption box, line boil, wipes, cue helpers), `lint`/`check` for overlaps and contrast, and frame snapshots for agents that can't watch video.
