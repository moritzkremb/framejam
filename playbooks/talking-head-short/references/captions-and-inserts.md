# Hook, captions and inserts

Everything here is described in pixels on a 1080×1920 canvas so it works in any tool. Scale for other formats.
A FrameJam style (if the user picked one) sets the fonts, colors and card shapes; the positions and timing rules
below stay the same.

## Default look (when no style is picked)

- Palette: off-white `#FAF8F1`, ink `#191B20`, one accent pulled from the footage (e.g. a shirt or brand color).
- Type: a heavy sans (Montserrat 800–900, Inter 800, Geist 800) for hook and captions; a mono for small labels.
  Bundle the font files in the project; don't rely on system fonts.
- Keep the speaker's footage as shot: no color grade, no zoom effects unless they help.

## Hook (first spoken idea)

- One short statement of what the video gives, from the speaker's own first line. No claims the video doesn't make.
- A static block of big text, fully visible from frame 0, held until the first caption starts, then a hard cut to
  captions. No pop-in, no breathing, no exit animation.
- Place it at the top (left/right margins 66 px, top ~90 px), on an opaque card so it reads over any background:
  card `#191B20`, radius 26 px, padding 32×38 px, 70–80 px text, line-height 1.1, the key words in the accent color,
  optional 25 px mono eyebrow above ("MY AI ADS WORKFLOW").
- Keep the face clear: the card ends above the eyes.

## Captions

- Bottom third: centred, top of the caption box at y≈1430 (range 1370–1550), max width 900 px. Keep the bottom
  250 px clear (platform controls) and ~110 px clear on the right (like/comment buttons).
- 2–5 words per caption, at most two lines; 56–60 px bold; light text on an opaque ink pill (radius 18 px,
  padding 13×23 px). The pill guarantees contrast over every shot.
- Verbatim, apart from obvious transcription fixes and correct names.
- Timing from the transcript of the final edited audio. Start and end on the frame grid; no overlaps; no zero-length
  captions; close gaps under ~0.25 s so text doesn't flicker; never let a caption run across a cut where the sentence
  changes. `scripts/make_captions.py --words edited.words.json --max-words 5 --max-chars 28 --fix "cloud code=Claude Code"`
  writes `captions.json` and `captions.srt` with these rules.
- Captions sit above inserts (highest layer).
- An active-word highlight is optional and should stay quiet (accent color on the current word, no bouncing).

## Inserts (supplemental visuals)

Build a shot list in EDIT_PLAN.md before placing anything:

| edited in–out | file | source in–out | crop (x,y,w,h) | phrase it explains | evidence checked |
| --- | --- | --- | --- | --- | --- |

- Show the real thing being talked about: the tool, the result, the example. Inspect every second of the chosen
  range (loading screens, stray cursor moves, private data, sudden scene changes).
- Crop to the region that matters so it reads on a phone. Never squeeze a whole desktop into a strip.
- Default placement: an **upper panel**. Dark (or white, matching the screenshot) background `0..650 px` tall,
  a small mono label at (66, 68) in the accent color, the media at (66, 125), 948×480 px, `object-fit: contain`,
  radius 20 px. While a panel is up, move the speaker down by ~165 px so the face stays visible below it.
- Short and purposeful: 2–6 s per insert, hard cuts in and out (a 0.15 s scale/opacity settle on the card is fine).
  Don't fill every second; the face carries the video.
- Step or list moments: a text card in the hook's position ("01 / FIND THE WINNER", "Pull winning Meta ads").
  Reveal list items exactly when they're said.
- Inserts are muted. The narration keeps playing underneath.
- No supplied media for a beat? Search the web for a real image (record URL and terms in EDIT_PLAN.md; save a local
  copy only if reuse is allowed), or make a small diagram or text animation. Label reconstructions as illustrative,
  never present a mock-up as a real product screen, never invent results.
- Closing call to action: a text card in the hook position with the exact words the speaker says ("Comment AgentOS").

## Building it

### Hyperframes (default for new projects)

One `index.html` composition, 1080×1920, 30 fps:
- the cut speaker video (`working/edit-NN/speech.mp4`) as a muted full-frame `<video class="clip">` for the whole
  duration, inside a wrapper you can move down when a panel is up (`tl.set(".head-wrap",{y:165},t)`);
- the narration (`speech.wav`, loudness-normalised) as an `<audio id="narration" class="clip">`;
- one clip element per hook card, insert, panel background, label and caption, each with `data-start`,
  `data-duration`, `data-track-index`;
- one paused GSAP timeline registered as `window.__timelines["main"]`, used only for small entrances and the
  head moves. Local media and fonts only.

Generate the caption and insert elements from `captions.json` and the shot list with a small script rather than
by hand, so a re-cut only means rerunning it. Run `npx hyperframes check` (0 errors), `npx hyperframes snapshot --at
<times>` for each insert and caption change, then `npx hyperframes render -o renders/draft-01.mp4`. If the Hyperframes
skills are installed, follow them; otherwise `npx hyperframes docs` explains the composition rules.

### Remotion or Motion Canvas (when the project already uses it)

Same layers: `<OffthreadVideo>`/`<Video muted>` for the speaker, `<Audio>` for narration, a `<Sequence from={f}
durationInFrames={n}>` per insert and per caption from `captions.json` (frames = seconds × fps, rounded the same way
as the cut). Keep caption and insert times in one data file so a re-cut only changes the data.

### ffmpeg only

Possible for simple edits: burn `captions.srt` with the `subtitles` filter (needs an ffmpeg built with libass;
`ffmpeg -filters | grep subtitles`) and place inserts with `overlay=enable='between(t,a,b)'`. If libass is missing,
render the caption pills as PNGs (Pillow) and overlay them. Prefer a real composition tool once there are more than a
few inserts.

## Audio finishing

- Normalise the narration before building: `ffmpeg -i speech.wav -af loudnorm=I=-15:TP=-1.5:LRA=11 -ar 48000 speech-norm.wav`.
- Measure loudness on the encoded render (`ffmpeg -i render.mp4 -af ebur128=framelog=quiet -f null -`): aim for
  -14 to -16 LUFS integrated, true peak at or below -1.5 dBTP. A mono voice played as stereo can measure differently
  from the source file.
- No music unless the user asks or the project already has it. If added: licensed or generated, 18–24 dB under the
  voice, never fighting it.
