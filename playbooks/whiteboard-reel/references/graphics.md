# Layouts, graphics, captions, sound and pacing (1080×1920)

All numbers are pixels on a 1080×1920 canvas, origin top-left. `template/build.py` builds every piece below from
`edit.json`; in another tool (Remotion, Motion Canvas, ffmpeg) build the same boxes. Scale linearly for 2160×3840.

Platform UI covers roughly the top 170 px, the bottom 380 px and the right 120 px between y 1100 and 1700. Keep
faces, captions and key text out of those areas.

## Pacing

- **Something changes every 1–2 s** on average. A change is a cut, a punch-in, the board coming or going, a graphic
  landing, or something inside it (a list item, a mind-map node, a card coming into focus, a number finishing its
  count, the prompt sending). `scripts/check_pacing.py` counts them all.
- **Speaker-only stretches up to ~3 s**, held by a punch-in or an angle change; the board comes back within a few
  seconds. `check_pacing.py --max-hold 3` is the default.
- Graphics start on the **first word of the phrase that motivates them** (word start times from the edited
  transcript), and each item inside lands on the word it shows.
- Rough mix over a 45–60 s reel: 40–60% of the time on the board, one series `badge` early, one `title` for the thing
  being shared, one proof moment (`stats` or `profiles`), the `keyword` CTA in the last 4–6 s.

## Beats (`beats`, one layout each, hard cut at `start`)

Every beat has `start` (edited seconds) and `layout`. Optional on any beat: `zoom` (1.0 wide, 1.1–1.25 punched in),
`origin` (zoom centre, default "50% 35%"), `punches` (`[{"at", "zoom"}]`, hard re-frames inside the beat),
`captionY` (caption centre for this beat).

### speaker

The talking head full frame (`object-fit: cover`). Alternate wide and punched in on consecutive speaker beats. Any
graphic shown during a speaker beat floats over the video as a white card (`stats`, `profiles` and `badge` work well
here; keep them above or below the face).

### board

A white board covers the top of the frame (`height`, default 900, from the top edge) and the speaker video slides
down by `shift` (default 260) so the face sits just under the board's edge. Graphics sit on the board, between y 180
and the board's edge. Set `shift` per recording: the top of the head may tuck under the edge, the eyes never do.
`media` fills the board with a picture or clip instead of white (the hook's "topic picture"), with `mediaStart` and
`fit`. The board slides in with a swipe sound when the previous beat wasn't a board; consecutive board beats just
change the speaker framing underneath.

### cutaway

A full-frame picture or clip over the speaker (`media`, `mediaStart`, `fit`): B-roll, an earlier video, a screen
recording. Keep it short (0.8–2 s) unless the clip itself is the point.

## Graphics (`pops`, absolute times from `at` to `until`)

Graphics sit on top of whatever beat is playing and can run across beats. Every one fades out over 0.16 s at
`until`. Each gets its sounds unless `"sfx": false`.

| type | fields | where (defaults) | sound |
| --- | --- | --- | --- |
| `steps` | `label` ("STEPS"), `items` `[{text, at}]`, `note` `{text, at}` (handwritten card beside it), `strikeAt` (red line through every item), `x`, `y`, `width` | card at x 100, y 220, 560 wide; note to its right | pop per item and note, scribble per strike |
| `tree` | `root` `{text, kind: "pill" or "card", icon: "folder"}`, `children` `[{src or title, label, at}]` (2–4), `y`, `width`, `childWidth`, `childHeight` | root centred at y 200, children 224 px below; pictures are 9:16, blank documents 1:1.15 | whoosh, scribble for the lines, pop per child |
| `mindmap` | `center`, `nodes` `[{text, at}]` (1–6), `y` (centre, 520) | nodes placed around the centre for their count | pop on the centre, scribble, pop per node |
| `fan` | `cards` `[{title, n}]` (1–4), `focus` `[{card, at}]`, `y` (190) | 250×300 cards, overlapping, tilted; titles blurred until focused | whoosh, click per focus |
| `title` | `lines` (1–2 words each), `accentLine` (last), `underline` (true), `size` (140), `y` (540) | centred, heavy sans | thud, scribble for the underline |
| `badge` | `word` (one short word, caps), `tag` (2–3 words, handwritten), `x` (60), `y` (230) | top-left over the speaker | whoosh, pop |
| `profiles` | `people` `[{name, handle, stats, bio, src, button, at}]` (1–4), `y` (180) | 740-wide cards, each 175 px lower and nudged sideways | whoosh per card |
| `stats` | `title` ("Insights"), `range`, `rows` `[{label, value, from, delta: "up", highlight, highlightAt, count, at}]` (1–5), `y` (200) | 780-wide panel at x 150 | whoosh, ticks while counting, swipe per marker |
| `thumbs` | `srcs` (2–4 pictures or clips, 16:9), `input` `{placeholder, text, at, cps}`, `y` (190) | 2×2 grid of 420×236, prompt bar under it | pop per thumbnail, typing, click on send |
| `keyword` | `lead` ("comment"), `keyword`, `y` (the caption spot) | replaces the caption while it shows | thud |

Rules:

- One board graphic at a time, two at most (a `fan` with a `title` under it, `steps` then `tree` on the same board).
  Floating graphics on a speaker beat stay off the face.
- Diagrams are for ideas: `steps` for a method, `tree` for "it turns into…", `mindmap` for "how to think about…",
  `fan` for "three principles / rules / tips", `title` for a name. Things that exist get their real picture:
  `thumbs`, `profiles` (real avatars and real numbers), `stats` (the user's real analytics), a `tree` whose children
  are real thumbnails, a `cutaway` with the real clip. Never invent a profile, a result or a number in a real reel.
- Show a graphic for at least 1.2 s; text-heavy ones (profiles, stats) 2–3 s.
- `strikeAt` is for "stop doing X": the old method crossed out before the new one appears.
- The CTA (`keyword`) arrives with the CTA sentence and stays to the end.

## Captions

- Geist Mono, 46 px, weight 650, white, lowercase (`captionCase`: "lower" or "as-is"), no box, a dark soft shadow.
- Centred at y 1180 on speaker beats and at y 1180 + `shift` on board beats (the chest, under the chin); move one with
  `captionY` on its beat.
- 2–3 words per caption (`make_captions.py` defaults: 3 words, 22 characters), never across a beat start.
- Words in `emphasis` turn the marker colour as they're spoken. Pick 2–5: the key idea, the name of the thing, the
  keyword.
- White captions over a white shirt rely on the shadow: look at the snapshots, and if a caption is hard to read
  there set `captionY` for that beat or a darker `captionColor`.

## Look (`theme` in edit.json)

| field | default | used for |
| --- | --- | --- |
| `board`, `boardEdge`, `card` | `#F6F6F4`, `#E3E4E8`, `#FFFFFF` | the board (white centre, faint vignette), cards |
| `ink` | `#16171B` | text on cards and the board |
| `muted` | `#6B707C` | labels, struck-out items |
| `line` | `#D5D8E0` | placeholder bars, rules in the stats panel |
| `accent` | `#3550F0` (electric blue) | pills, diagram lines, focus outline, title accent line, numbers |
| `tag` | `#2C4BC0` | the badge's handwritten tag |
| `pop` | `#E2533B` | strike lines, the badge icon |
| `marker` | `#DDF45B` (lime) | marker sweep on stats, emphasis caption words |
| `captionColor`, `captionSize`, `captionY`, `captionCase` | `#FFFFFF`, 46, 1180, "lower" | captions and the keyword |
| `boardHeight`, `shift` | 900, 260 | board size and how far the speaker slides down |
| `sans`, `sansFile` | Inter | everything on the board |
| `mono`, `monoFile` | Geist Mono | captions, labels, numbers on cards |
| `hand`, `handFile` | Caveat | note cards and the badge tag |

For a FrameJam style, map its background to `board`, its text colour to `ink`, its accent to `accent` (and `tag` a
shade darker), and its display font to `sans` (bundle the font file and its license in `fonts/`). Keep the board
light and the cards lighter still; check contrast with `npx hyperframes check`.

## Motion

- Hard cuts between beats; the board drops in from 60 px above in 0.22 s.
- Cards land with a spring (back-out ease, 0.3–0.35 s); list items slide in from the left; diagram lines draw on
  (0.25–0.4 s) just before the node or card at their end lands.
- A focused fan card lifts 24 px, scales to 1.1, gets a blue outline and its title un-blurs; the previous one settles
  back but stays readable.
- Numbers count up over ~0.8 s; the marker sweeps left to right after the count.

## Sound

- **Voice** at -14 to -16 LUFS. The Hyperframes mixer limits peaks, so do a final loudness pass on the render
  (SKILL.md, step 6); `narrationVolume` 1.2–1.4 in edit.json gets close before it.
- **Music:** a light, plucky bed at 90–104 BPM, at volume 0.08–0.12, so it sits ~20 dB under the voice.
  `scripts/make_sounds.py --music` makes one; or the user's own licensed track.
- **Sound effects** stay quiet and small: pop on cards and nodes, a pen scribble on diagram lines, underlines and
  strikes, whoosh on panels and stacked cards, click on focus and send, ticks while counting, a swipe on the marker
  and the board, a soft thud on titles and the keyword. `build.py` places them; turn one off with `"sfx": false` on
  its graphic, or all with `"sfx": false` at the top level. `sfxVolume` scales them all (default 1).
