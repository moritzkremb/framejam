# Layout catalogue (1080×1920)

All numbers are pixels on a 1080×1920 canvas, origin top-left. `template/build.py` implements every layout with
these values; in another tool (Remotion, Motion Canvas, ffmpeg) build the same boxes. Scale linearly for 2160×3840.

The seam between top and bottom halves is at **y = 960**.

## speaker

The speaker fills the frame.

- Video: 1080×1920, `object-fit: cover`.
- Framing: `zoom` 1.0 (wide) or 1.2–1.3 (punch-in), scaled around `origin` ≈ "50% 28%" so the eyes stay at
  ~y 600–700 and the chin above the caption. Two speaker beats near each other alternate wide and punched in.
- Caption centre: y = 1215 (chest / mic height). Check it doesn't sit on the mouth after a punch-in.
- Use for: claims, numbers, opinions, the payoff, the call to action.

## split

A visual on top, the speaker below.

- Top panel: x 0–1080, y 0–960. The visual is `cover` when it's portrait-ish or full of detail you can crop, or
  `contain` on a matching background color (white for white UIs, the UI's own dark color for dark ones) when it must
  be seen whole. Crop source screenshots to the part that matters before placing them; aim for at least 60% of the
  panel width filled with readable content.
- Bottom: the speaker video in a 1080×960 box, `object-fit: cover`, `object-position: 50% Y%`. Y (≈ 35–45 for a
  typical desk shot) puts the eyes ~300–380 px below the seam and keeps the chin inside the frame. Tune once per
  recording (`speakerY` in edit.json) and check with a snapshot.
- Caption centre: y = 960, straddling the seam.
- Motion: still images push in 1.00→1.06 over the beat; tall screenshots can scroll (`"motion": "scroll"`);
  videos play.
- Use for: a named, concrete thing (website, product, document, result) shown while it's described.

### split + roadmap

The step list on the animated gradient.

- Panel padding 40 / 120 / 80 px (top / sides / bottom); steps stacked and centred, 18 px apart. Each step:
  "Step N" at 30 px / 700 over the step text at 40 px / 700, line-height 1.15, centred, padding 14×34 px.
- Current step: 2 px border `rgba(255,255,255,.75)`, fill `rgba(255,255,255,.10)`, radius 22 px, full opacity,
  no blur. Other steps: opacity 0.42, `blur(5px)`. `"step": 0` shows every step sharp (overview and recap).
- Entrance at each roadmap beat: every line fades in from `blur(14px)` / opacity 0, 0.32 s, 0.05 s apart.
- Keep step texts to 2–5 words; at most 6 steps (more do not fit legibly; group them).

### split + title

The hook, on screen from frame 0, static.

- Up to 3 lines, 84 px, weight 900, uppercase, line-height 1.02, centred, padding 0 70 px; a dark drop shadow.
  A sub-line at 38 px / 700 in the accent color with the concrete numbers ("5 steps, every week").
- Optional stickers: 3–5 transparent cut-outs of things from the video pop in around the speaker at ~1.5–2.5 s
  (scale 0→1 with `back.out`, 0.1 s apart), sized 140–220 px, kept off the face.

### split + words

One to three big words that land as they're spoken.

- 120 px / 900, letter-spacing -3 px, centred, 10 px apart; the last word in the accent color.
- Each word appears at its spoken time (`"at": [...]` from the edited transcript) with a 0.22 s `back.out` scale-in.
- Use for: an abstract idea with no picture ("pain / desire", "same desire, fresh creative").

## visual

A visual fills the frame; the speaker is cut out of the background and stands in front of it.

- Visual: 1080×1920, `cover`. For landscape media use `"fit": "contain"` with `"box": [x, y, w, h]` (e.g.
  [60, 240, 960, 507] for a 16:9-ish image) and `"backdrop": true` (the same media, blurred 40 px and darkened, behind
  it), so it fills the frame without being cropped.
- Cut-out speaker: the full 1080×1920 frame with the background removed, scaled 0.62 (670×1190), centred
  horizontally (x = 205), top at y = 900, so the head sits at about y 1150–1250 and the chest leaves the frame at the
  bottom. Soft shadow `drop-shadow(0 24px 40px rgba(0,0,0,.35))`.
- Caption centre: y = 1130, just above the head; check it doesn't overlap the hair in a snapshot.
- Cut-outs come from `scripts/make_cutouts.py` (`npx hyperframes remove-background`, local and free, ~7 frames/s on a
  laptop, about 1 minute per 10 s of cut-outs). Only the visual beats need them.
- Use for: a process or a tool doing something, shown in motion (screen recording, footage).

## Transitions

Hard cuts between layouts, on the first frame of the phrase that motivates the change. No wipes, slides or zoom
transitions. All motion lives inside a layout (gradient drift, roadmap blur-in, word landings, image push-in,
scrolling, footage).

## Captions

- One to three words, balanced (`scripts/make_captions.py --max-words 3 --max-chars 18 --breaks edit.json`), never
  across a beat start, no trailing punctuation, names fixed.
- 44 px / 650, white, on a pill `rgba(12,12,16,.62)`, radius 14 px, padding 8×20 px, `white-space: nowrap`,
  slight text shadow. Highest layer.
- Position by the layout under the caption's midpoint: split 960, speaker 1215, visual 1130.
- Platform safe zone: keep text inside x 60–1020 and above y 1650; nothing important in the right 120 px between
  y 1100 and 1700 (like/comment buttons).

## Color and type (the part a FrameJam style replaces)

Default theme in `build.py`: gradient base `#11143A` with blobs `#3B44D6`, `#7E36D9`, `#1484B8`; title white; accent
`#FFD84D`; caption pill `rgba(12,12,16,.62)`; font Geist (bundled, OFL). A style sets `theme` in edit.json:
`base`, `blobs` (three colors), `title`, `accent`, `text`, `panelBg`, `captionBg`, `captionText`, `font`, `fontFile`.
Keep white text on the gradient readable: blobs dark enough for 4.5:1 against white (`npx hyperframes check` reports
contrast).
