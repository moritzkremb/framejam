# Anchor and overlay: format reference

Geometry and rules for the format, for `edit.json`, for `render.py` and for anyone rebuilding it in another tool.
Everything is in 1080×1920 pixels; scale linearly for other sizes. Every number here is a default that the user's
request, their own skills or a picked style can change; the ones in `theme` and `checks` are read from `edit.json`.

## Layers, bottom to top

1. **Anchor.** The speaker, full frame (`cover`), always. A punch-in scales the frame around `aroll.origin` (default
   50% across, 36% down) so the face stays in; it holds until the next punch.
2. **Overlays.** Pictures or clips, switched on and off with hard cuts: no fade, slide, scale or spring.
3. **Asides and labels.**
4. **Big word.**
5. **Caption.**

Platform-UI zones stay clear of text: the top 220 px, everything below y 1540, and the right-hand strip x > 960 between
y 1100 and 1700. Text stays inside x 60–1020.

## Overlay kinds

| Kind | Geometry | Use |
| --- | --- | --- |
| `thumb` | centred in x, top at y 230, at most 860 px wide and 400 px high (less if the eyes are high: the bottom edge stays `eyeClear` = 40 px above `aroll.eyeY`). `src` may list two pictures: they sit side by side with a 24 px gap, each at most 418 px wide | the face matters at that moment: a claim, a reaction, a short aside |
| `card` | fitted inside a box at x 108–972, y 290–1590 (864×1300), centred | the picture carries the story |
| `tall` | fitted inside x 108–972, y 120–1800 | portrait material (phone recordings, long pages); at most twice a minute |

Pictures keep their own shape (fitted, never stretched or cropped). `box: [x, y, w, h]` on an overlay replaces the
default box. Whatever the kind, at least 86 px of anchor must show at the left and the right, and a non-`tall` overlay
leaves at least 120 px at the top or the bottom. At most two overlays at once.

## Text

| Element | Default |
| --- | --- |
| Caption | Inter ExtraBold 64 px, white, black stroke 5 px, centred at y 1230, one line at most 840 px wide, **one word at a time in the speaker's own case**, shown 0.2–1.2 s, never across a sentence end, hidden while a big word is up. At most 16 characters per chunk |
| Big word | Anton 170 px, all caps, white with a black stroke, centred at y 780, at most 960 px wide (the size shrinks to fit), 1–2 words, 0.6–1.5 s, exactly on its word |
| Label | Anton 52 px, all caps, centred at y 400: "1. First thing". Stays up from its item's first word to the next item's first word; hidden while an overlay covers it |
| Aside | Inter ExtraBold 44 px in parentheses, centred at y 330, or on a card's top-left corner 12 px above it (`aside` on the overlay) |

Caption, big word, label and aside text is drawn by Pillow (`scripts/textlayer.py`) into transparent PNGs, so fonts must
be TrueType or OpenType files (`theme.captionFontFile` and the others). A size is the height of the line box (ascent plus
descent), as in subtitle files, and the stroke is drawn outside the glyphs. `theme.captionFont` and the other family
names are only labels; the file decides the look.

A different caption taste is a theme change, not a different format: for three-word all-caps captions set
`"captionCase": "upper"` and `"captionMaxWords": 3` in `theme` and run
`make_captions.py --case upper --max-words 3`.

## Rhythm

- Overlays are on screen 35–55% of the runtime (about 15–25 a minute); stills last 0.6–2.5 s, clips up to 4 s; no more
  than 3 s of bare anchor without a punch-in or a big word.
- Counting every change including captions, no gap is longer than 1.5 s. Counting picture changes only (overlay in or
  out, punch, big word, label), the median gap is 0.8–1.5 s and the longest is at most 3 s.
- Overlays, punches, big words and labels begin on the first frame of their word (0.10 s before to 0.05 s after its
  start). Nothing switches mid-word.
- Punch-ins: 1.08–1.15 on a stressed word; 1.25–1.40 at most twice a minute; consecutive stretches alternate framing;
  never above 1.5×.

## Music

On by default. A calm bed `calmDb` (default −22) under the voice until `music.turnAt`, a driving one `driveDb` (default
−16) under it after, switched on a hard cut, then a short button and a fade over the last 1.2 s. The renderer measures
the voice and each part of the music separately and applies static gains, so the dB values hold whatever the files'
own levels. `music: false` turns it off. Put `turnAt` on the first word of the speech's turning point.

## edit.json

```json
{
  "duration": 26.61, "fps": 30,
  "aroll": { "src": "assets/speech.mp4", "eyeY": 720, "origin": [0.5, 0.36], "gainDb": 0 },
  "theme": {}, "checks": {},
  "punches":  [{ "at": 3.261, "zoom": 1.12 }, { "at": 8.268, "zoom": 1.0 }],
  "overlays": [
    { "id": "o1", "kind": "card", "src": "assets/vis/timeline.png", "size": [800, 1000], "at": 4.243, "end": 5.643, "word": "timeline", "aside": "(numbers go up)" },
    { "id": "o2", "kind": "thumb", "src": ["assets/vis/coffee.png", "assets/vis/camera.png"], "size": [[800, 450], [800, 450]], "at": 13.466, "end": 14.348 },
    { "id": "o3", "kind": "thumb", "src": "assets/vis/clip.mp4", "start": 3.2, "at": 21.742, "end": 22.942 }
  ],
  "big":      [{ "text": "slow", "at": 1.895, "end": 2.695 }],
  "labels":   [{ "text": "1. the slow way", "at": 0.3, "end": 3.16 }],
  "asides":   [{ "text": "(yes, really)", "at": 3.36, "end": 4.19 }],
  "music":    { "src": "assets/music.wav", "turnAt": 8.27, "calmDb": -22, "driveDb": -16 }
}
```

- `aroll.src` is picture and sound together (the anchor is the only voice). `aroll.offset` starts it later,
  `aroll.gainDb` sets the voice level, `aroll.eyeY` the eye line.
- `overlays[].word` names the spoken word the overlay belongs to (the checker verifies it starts on it);
  `size` is the picture's pixel size, so plans can be checked before the files exist (otherwise ffprobe reads it);
  `start` is an offset into a clip, which is muted and trimmed to the overlay's length.
- `theme` fields: `captionFont`, `captionFontFile`, `captionSize`, `captionColor`, `captionStroke`,
  `captionStrokeWidth`, `captionCase` (`asis`|`upper`|`lower`), `captionY`, `captionMaxWords`, `captionMaxChars`,
  `captionMaxWidth`; the same for `big…` (`bigY`, `bigMaxWidth`, `bigColor`, `bigStroke`, `bigStrokeWidth`), `label…`
  and `aside…`; `overlayBorder: { "width": 8, "color": "#FFFFFF" }`. Defaults live in `scripts/anchorlib.py`.
- `checks` fields: `minCoverage`, `maxCoverage`, `stillMin`, `stillMax`, `clipMax`, `maxArollOnly`, `maxGap`,
  `pictureMedianMin`, `pictureMedianMax`, `maxPictureGap`, `sideMargin`, `edgeMargin`, `maxOverlaysAtOnce`, `eyeClear`,
  `onWordEarly`, `onWordLate`, `captionMaxChars`, `captionMin`, `captionMax`, `calmDb`, `driveDb`, `musicToleranceDb`,
  the UI zones (`uiTop`, `uiBottomY`, `uiRightX`, `uiRightY`, `textMinX`, `textMaxX`), `hardZoom`,
  `maxPunchPerMinuteHard` and the render checks (`armsStripPx`, `armsMaxDiff`, `spikeMin`, `loudness`).

## The ffmpeg recipe, for another tool

`render.py` builds one `filter_complex` graph. In words: scale and crop the anchor to 1080×1920, split off a copy
per distinct punch-in zoom (`scale` then `crop` around the origin) and overlay each copy with
`enable='between(t,a,b)+between(t,c,d)'`; overlay every picture at its rectangle with `enable='between(t,at,end)'`
(looped stills with `-loop 1`, clips with `-ss start -t length`); draw the text as one transparent full-frame layer
(`-f concat` over PNGs that change on the frames where a text starts or ends, then `overlay=0:0:eof_action=pass`) so
it needs no libass or drawtext; mix the voice and the gained music with `amix=normalize=0` and a limiter. Every text
is centred on its x and y (an aside on a card's corner sits on its left edge). Any tool that follows the geometry above gives the same
reel.
