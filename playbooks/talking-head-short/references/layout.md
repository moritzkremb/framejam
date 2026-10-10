# Layout, look and timing (1080×1920)

The playbook's example ("AI can now create professional animated videos", 48 s) is built exactly like this. All
numbers are pixels on a 1080×1920 canvas, origin top-left. In another tool (Remotion, Motion Canvas, an editor) build
the same boxes.

## The frame: 40/60 split

- **Top panel, y 0–768:** the animated scenes, on a soft ground that always moves.
- **Bottom panel, y 768–1920:** the speaker, full width, no side crop.
- **The seam at y = 768:** a soft 40 px shadow falls from it (`linear-gradient(rgba(0,0,0,.28), transparent)`). The
  title and the captions sit on the seam, so they never cover the face or the scene.

Platform UI covers roughly the top 220 px and the bottom 380 px: keep scene text inside y 200–740 and the face above
y 1500.

## Bottom: the speaker

- The cut talking-head video at full 1080×1920 inside a 1080×1152 window, moved and scaled per frame so the face
  centre sits at about y 540 of the panel (face tracking on the edited video, e.g. from `npx hyperframes`
  face detection or any face detector, smoothed; store it as a per-frame table and apply it with one tween).
- A small punch-in (scale ~1.0 ↔ 1.08) on every jump cut, so each cut reads as intentional.

## Top: the ground and the stage

- Ground: a flat light colour (default `#f3f4f7`) with a dot grid (2.4 px dots, 34 px apart, `#c7ccd8`, 70%) that
  drifts up slowly over the whole video, and two large blurred colour blobs (620 px, `blur(90px)`, 38% opacity; default
  `#60a5fa` and `#2dd4bf`) that drift on slow sine loops. Something always moves.
- Scenes are designed on a 1080×960 stage scaled to 0.8 and centred (`left: 108px`, `transform: scale(.8)`), so a
  design at full size fits the 768 px panel.

## Scene vocabulary

One scene per idea, changing every 2–5 s on the first word of the sentence that motivates it. Build each from these
pieces; every one lands with a short `back.out` pop (0.3–0.4 s) on the word that names it.

- **Step pill** for a list: "STEP 01" in white on an ink pill, top-left of the stage (60, 118), 30 px / 800, tracked.
  The first time the list is named, show all steps as rows that drop in one by one.
- **Real thing in a card:** the product, the post, the result, a screen recording, a clip, in a rounded card (radius
  28, deep soft shadow). Crop to what matters. Images can sit in a white frame (8 px border) and fan out (2–4 at
  slight angles) for "results like these".
- **Tiles:** app icons and logos on white rounded squares (radius 48, soft shadow); connect two tiles with a dashed
  line and a small chip ("tool access") for "X can use Y".
- **Chips:** a white pill with a round accent check and a short claim ("Best taste"), 44 px / 800.
- **Big words:** 1–4 words, 800, centred; the key word in the accent gradient (text clipped).
- **Interfaces drawn in HTML:** a prompt bar that types, a code window that writes, a waveform that moves, a comment
  bar that types the CTA keyword. Only for things that work this way; never fake a product screen or a result.
- **Small illustrations** for abstract lines ("not even that expensive": a swinging price tag and coins).

Show the real thing whenever something is named. Designed pieces are for ideas without a picture.

## Title and captions

- **Title:** the hook in 1–2 lines, on white pills (56 px / 800, radius 26, padding 14×30) stacked on the seam, from
  frame 0 until the first idea is said (about 4 s). It pops in (scale 0.9 → 1, a slight tilt), grows to 1.05 while
  it holds, then leaves in 0.16 s. Frame 0 must already read as a cover.
- **Captions:** after the title, 2–4 words at a time on one white pill (50 px / 800, radius 22, padding 12×28)
  centred on the seam. The word being spoken turns the accent colour. Never across a cut where the sentence changes.

## Sound

- The voice, normalised, is the only music-free track by default.
- Quiet sound effects (volume 0.09–0.13): a soft whoosh on each scene change, a pop on chips and stickers, coins,
  a ding on the CTA, an impact on frame 0. Generated (e.g. ElevenLabs sound effects) or from a licensed library.
- Final mix: -14 LUFS integrated, -1.5 dBTP.

## Look: the part a FrameJam style replaces

| Role | Default | Used for |
| --- | --- | --- |
| `ground` | `#f3f4f7` | top panel background |
| `dots` | `#c7ccd8` | the drifting dot grid |
| `blobA`, `blobB` | `#60a5fa`, `#2dd4bf` | the two blurred glows |
| `ink` | `#0b0b0f` | text, step pills |
| `surface` | `#ffffff` | tiles, chips, cards, title and caption pills |
| `accentA`, `accentB` | `#2563eb`, `#06b6d4` | gradient words, checks, the spoken caption word, waveforms |
| `font` | Inter 500–800 | everything |

Keep these as CSS variables (or one theme object) from the start, so a style is one swap. For a dark style swap
`ink` and `surface` (light text on dark pills), use a dark `ground` and deep `blobA`/`blobB`. Colours that carry
meaning stay as they are: red for "wrong" or a strike-through, green for money or success, a code editor's colours,
brand colours of logos.
