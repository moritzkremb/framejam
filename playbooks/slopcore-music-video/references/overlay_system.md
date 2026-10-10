# The motion design layer: specs at 1920×1080

The generated footage is only the plate. Everything that carries meaning (every lyric on its word, the graphics that
explain each joke, the through-line device) is drawn in code on top, so it is exact and lands on the beat
(https://claudia.gallery/wiki/motion/). It's code in the project's tool (HTML/CSS/JS in Hyperframes, React in Remotion),
drawn over the base edit (`out/base.mp4`). Everything here is a default for the ESCAPE VELOCITY look; a FrameJam style
or the user's brand replaces the fonts and colours, never the structure. Scale all numbers by width/1920; for 9:16 move
the subtitle up to y ≈ 1500 and stack the HUD labels.

## The engine

- **Every frame is a pure function of song time.** No frame depends on the one before, so any frame renders alone, out
  of order, on any number of workers. Check it: render a few frames out of order and compare.
- **Chapters are separate files** with one contract: draw footage, draw lyrics, draw graphics, draw transitions. In a
  long film, one animator per chapter and a reviewer who looks at real rendered frames.
- **Stills stand in for missing clips**, so the film renders end to end at every stage.

## Lyrics are composition, not karaoke

Every sung word is on screen at its aligned time (the lyric gate prints N of N before any render), but the words live
on surfaces in the scene: subtitles, model cards, garment tags, mastheads and split-flap rows in ESCAPE VELOCITY; a type
system in CLODYSSEY (DINish Condensed Black for the shouted lines, Nimbus Sans Bold for hers, IBM Plex Mono for
readouts); title bars, balloons, Notepad and dialogs in BLISS.

## Tucks and depth

- **Type behind her:** per-frame mattes (BiRefNet, SAM 2) let type pass behind her hair or a prop. Tuck an edge, never
  lose a glyph.
- **2.5D:** a depth map (Depth Anything V2) splits a still into layers for parallax; each 2.5D shot gets its own
  treatment, never a still with a slow zoom.
- **Inserts sit in the scene,** on a screen or a surface, depth-matched, never floating in a box on a flat background.

## Colour and texture

Keep the image model's colour. ESCAPE VELOCITY's first cut ran a monochrome xerox look and came back "way too.. gray
… loses the Midjourney magic"; the print pass became a colour halftone with line screens, grain, dither transitions and
misregistration, with clay `#D97757` as the graphics accent. CLODYSSEY ran clean ("keep it clean so it feels like imax")
with every plate graded toward one hero plate. Decide texture per film.

## Tokens

| Role | Default | Notes |
|---|---|---|
| Ink | `#F2EFE8` (warm white) | text and hairlines on dark footage |
| Ink on light | `#141414` | for the white-studio act |
| Accent | `#D97757` (clay) | current lyric word, counter digits, stamps, chart lines; one accent only |
| Paper | `#F4F1EA` | tags, labels, receipts |
| Shade | `rgba(0,0,0,.35)` | soft panel behind small text when the image is busy |
| Hairline | 1.5 px | borders, brackets, chart axes |

Fonts (all free, Google Fonts / OFL): **Inter** 400-800 (subtitles, labels, hero grotesk), **Bebas Neue** or
**Oswald** 500 (condensed hero words), **JetBrains Mono** or **IBM Plex Mono** 400-500 (HUD, ticker, data),
**Archivo Black** (boxed punch words). Load them locally in the composition; never rely on system fonts.

## Layer order (bottom to top)

1. Base edit video (untouched pixels; no grade, no filters on the generated footage beyond what's below).
2. Texture: a fixed fine scanline or halftone at 4-6 % opacity, plus 2-3 % film grain. Same for the whole video.
3. Tracked graphics (brackets on the face, leader lines to props).
4. Data viz and artifacts.
5. Hero words.
6. Subtitle line.
7. Frame HUD and ticker (always on top, always present except the hook's first second and the end card).

## Frame HUD

- Inset border: 1.5 px Ink at 40 % opacity, inset 28 px; corner brackets 22 px long at 100 %.
- Corner labels, JetBrains Mono 15 px, letter-spacing .12em, uppercase, Ink at 80 %:
  top-left `LOOK 06 / 11` (the device counter), top-right `ESCAPE VELOCITY · SS27` (title · season) with a 120×18 px
  live audio meter under it (bars from the vocal envelope), bottom-left `L19 · 01:27:17` (lyric line number · song
  timecode), bottom-right the running timecode `01:29:12`.
- Spine counter (top-right under the title): flip-digits in Accent, 44 px mono digits in 1 px boxes, label beside it
  `MONTHS / TO ESCAPE` 15 px, sub-label 10 px. It changes only at story beats, with a 6-frame split-flap flip and one
  click sound if the mix has room.

## Ticker

- Bottom strip, full width, 30 px tall, 1 px rule above, Mono 14 px uppercase, Ink 85 %, items separated by `◆` or `·`.
- Scrolls right-to-left at a constant 90 px/s for the whole video (one continuous ticker, seeded with ~25 items).
- Items are timeline facts and jokes with numbers and arrows: `TOKENS BURNED 275,335,000 ▲`, `MAC MINIS 13`,
  `UNDERCLASS −38 MO`, `CONTEXT 1,110,443 TOK`. Numbers tick up over the video (tokens burned grows every frame).
- Keep invented numbers clearly comic; don't present made-up figures about real companies as news.

## Subtitle line (every sung line)

- Bottom-left at x = 64, baseline y = 1000; Inter 500, 38 px, Ink; max width 1100 px, one line if possible.
- Appears on the line's first word onset (frame-exact from `analysis/lyrics.json`), whole line at once, 4-frame fade.
- Karaoke: each word turns Accent at its onset and stays Accent until the next word starts, then back to Ink.
- Clears 6 frames after the line's last word ends, or when the next line starts.
- Ad-libs and backing vocals in brackets and Ink at 60 %: `(It's so over?)`.
- Hidden only when a hero treatment shows the whole line.

## Hero words (1-2 per line, not every line)

Choose the word that carries the joke or the hook. Peak on the onset frame of that word; hold to the end of the shot
or the line; exit in ≤ 6 frames (cut, wipe or fade). Rotate the treatments; never the same one on two lines in a row.

| Treatment | Spec | When |
|---|---|---|
| Condensed slam | Bebas/Oswald 220-260 px, Ink, tracking 0; scale 1.06 → 1 over 5 frames | single words on the chorus ("AGI,") |
| Grotesk title + rule | Inter 800 110 px with a 6 px Accent rule drawing on under it, small kicker above ("Ladies. Gentlemen.") | announcements ("AGENTS.") |
| Spaced mono | Mono 64-80 px, letter-spacing .3em, types on one letter per frame | phrases ("ESCAPE VELOCITY") |
| Boxed punch | Archivo Black 150 px, black on a Paper box with 24 px padding, slight 1-2° tilt | shouts ("BACK!", "NERF.") |
| Stacked statement | Inter 700 72 px, 2-3 lines left-aligned in the negative space, one word in Accent | full jokes ("THIS IS NOT AN AI BILLBOARD.") |
| Ghost | Bebas 400 px at 12 % opacity behind the lead (tucked behind her with a matte, or behind a dark area) | section titles ("UNDERCLASS") |

Position: in the negative space the still left for it, opposite her face; never across the face or hands.

## Annotations (the citation layer)

For each lyric that quotes or references something real, one annotation block near the thing it labels:
- Header: Mono 13 px uppercase, Accent, e.g. `SEISMOGRAPH · AGI · FELT INTENSITY`.
- Visual: a small live chart (seismograph, sine, bar sparkline) 360×90 px, 1.5 px Ink lines, drawn on over 12 frames.
- Value: Mono 44 px Accent (`M 9.0`), then the source in quotes with attribution, Mono 13 px: `"FEEL THE AGI" – ILYA`.
- Only cite what is real and attributable; when unsure, label it as a joke (`EST.`, `VIBES`) instead of inventing a quote.

## Artifacts (paper objects)

Paper colour, 1 px darker edge, 6 px radius or a die-cut notch, a soft 12 px shadow at 25 %, slight 1-3° rotation.
Enter with a 6-frame drop and 2 % overshoot, or slide in from the frame edge. Types:
- Price tag / receipt: title Inter 700 22 px ("PHONES DOWN. TOKENS UP."), mono line items, a barcode (generated bars),
  a punched hole and string.
- Care label: "SHELL: 100 % optimism. LINING: doom." then care symbols with jokes ("Wash cold. Do not iron. Do not nerf.").
- ID badge / ticket / boarding pass: name, role, gate, a QR-like block.
- Stamp: Archivo Black 40 px, Accent outline 3 px box, rotated −6°, lands on a beat with a 2-frame scale 1.2 → 1.
- Checklist: three mono lines, boxes tick one per beat.

## Data viz

Line chart (`VIBES · SF · 2019–NOW`), gauge/speedometer (needle eases to a value on the downbeat), flip-clock digits
(one flip per beat in countdowns), split-flap boards (each character flips 3-5 random glyphs before settling, staggered
1 frame per character), progress bars, scatter fields. Axes 1 px Ink 50 %, data 2 px Accent, labels Mono 12 px.

## Tracked graphics

Corner brackets (4 × 18 px L-shapes) around the face with a 10 px label `FACE · SINGING`; leader lines from a label to
a prop. Track by hand with 3-6 keyframes per shot (clips are short) or with any point tracker; ease between keys.

## Timing rules

- Lyrics: every sung word is on screen at its onset. Hero words peak on the onset frame.
- Graphics enter on the word that names them and animate in beats: counters roll on sixteenths, rows type one per
  sixteenth, detections land on thirty-seconds, crops cut on eighths.
- Cuts land within 0.03 s of a beat (a sound-event map from the stems: kicks, snares, hats, impacts, risers); camera
  moves ride risers into their hits. Mostly hard cuts on the beat, a motivated device every few shots ("edgar wright
  level … but also not overdone").
- Photosensitivity: at most 3 full-frame flashes a second, checked with a WCAG-style flash test before delivery.
- The hook: at 1.0 s her face, her accent and one readable line of the premise; the premise by 3 s.

## Delivery

A CRF 16 master tagged BT.709 (untagged streams look washed out in QuickTime). Gates: the lyric gate (N of N), contact
sheets of the whole film, chapter seams, 100% crops of her face, the flash test. Map a new mix through time, not
through a re-edit.
