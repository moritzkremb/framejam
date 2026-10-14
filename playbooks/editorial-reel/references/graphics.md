# Graphics, captions, sound and pacing (1080×1920)

All numbers are pixels on a 1080×1920 canvas, origin top-left. `template/build.py` builds every piece below from
`edit.json`; in another tool (Remotion, Motion Canvas, ffmpeg) build the same boxes. Scale linearly for 2160×3840.

Platform UI covers roughly the top 170 px, the bottom 380 px and the right 120 px between y 1100 and 1700. Keep
faces, captions and key text out of those areas.

## Pacing

- **Something changes every 1–1.5 s** on average (40–60 changes a minute). A change is a cut, a punch-in, a headline
  card replacing the last one, a pop-up landing, something inside a pop-up (a message, a strike, the chat sending) or
  a big word landing. `scripts/check_pacing.py` counts them all.
- **Nothing static longer than ~2 s**, unless a screen recording or PiP clip is playing.
- Beats and pop-ups start on the **first word of the phrase that motivates them** (word start times from the edited
  transcript). A word that the graphic shows ("huge", "magazine", the app's name) lands on that word.
- Rough mix over a 45 s reel: one hook (3–7 s), 60–70% speaker beats with pop-ups on top, 2–4 big words, one
  magazine, one grid, 2–4 screen or PiP moments, the CTA in the last 8–12 s.

## Beats (`beats`, one layout each, hard cut at `start`)

Every beat has `start` (edited seconds) and `layout`. Optional on any beat: `zoom` (1.0 wide, 1.1–1.2 punched in),
`origin` (zoom centre, default "50% 32%"), `punches` (`[{"at", "zoom"}]`, hard re-frames inside the beat), `in`
("blur": a 0.3 s blur-in with a whoosh, good when the shot or room changes), `captionY` (caption centre for this beat).

### speaker

The talking head full frame (`object-fit: cover`). Alternate wide and punched in on consecutive speaker beats so two
in a row never share a framing; a speaker stretch over ~2 s gets a punch or a pop-up.

### hook

The speaker cut out on the ground colour, with headline cards behind them. The cards replace each other as the hook
sentence is spoken, so the text changes every ~1 s.

- `cards`: `[{"at", "lines", "font", "accent", "timecode", "size", "y"}]`. `font` is `serif` (tall caps, the default),
  `sans` (heavy caps) or `italic` (serif italic, for the payoff). `accent` is a word shown in the accent colour.
  `timecode: true` adds a running timecode under the card. `y` is the top of the text (default 330).
- Text sits behind the speaker: the top line clears the head, the next line runs behind it ("EDIT" behind the cap).
  Keep the payoff line clear of the head (one line, or move `y` up).
- Needs `cutout` (and `cutoutStart`, the second in the cutout file where this beat starts). Without one, the speaker
  shows full frame and the text sits in front.
- 2–4 cards, 1–2 lines each, 1–3 words per line. Mix fonts: serif caps, then sans caps, then the italic payoff.

### word

One giant serif word behind the speaker (`word`, upper-cased), with an optional small sans `lead` above it.

- `at`: when the word lands (its spoken start). `leadAt`: when the lead appears. `y`: top of the text (default 330).
- Needs `cutout` for the behind-the-head look. Use it on the one word in a sentence that carries the feeling ("huge",
  "never", "free"), 2–4 times a reel, never twice in a row.

### magazine

The frame becomes a magazine cover over the speaker: a thin cream frame, a masthead behind the head, an issue line,
a kicker and cover lines on the left, a barcode at the bottom left.

- `masthead` (one word or two, upper-cased), `issue` ("No. 01 · October 2026 · Edited by …"), `kicker` (2 words),
  `coverlines` (2–3 short lines; the second is serif italic). `at`: when it lands. Needs `cutout`.
- Use it once, when the speech is about how something looks or about a big claim.

### grid

A 3×3 grid of tiles on the ground colour (`tiles`: up to 9 images or clips, 9:16). `"speaker"` as a tile puts the
talking head in that cell (the centre works best). Tiles land one after another from `at`.

- Use it for social proof or "lots of …": several results, posts, clients, versions. Real pictures only.

## Pop-ups (`pops`, absolute times from `at` to `until`)

Pop-ups sit on top of whatever beat is playing and can run across cuts. Each gets its sound unless `"sfx": false`.

| type | fields | where | sound |
| --- | --- | --- | --- |
| `chat` | `text`, `label` ("TO YOUR AGENT"), `cps` (typing speed, 20–30), `done` (text shown after sending, with a check) | prompt box, x 60–1020, y 200 | typing, click, ding |
| `icons` | `items` `[{src or text, label, at, strikeAt}]`, `strike`, `size` (150) | centred row, y 230 | pop per icon, swipe per strike |
| `cards` | `srcs` (1–3 images or clips) | tilted cards floating up, y 220–660 | whoosh |
| `screen` | `src`, `title`, `focus` `[{at, x, y, zoom}]`, `box` ([60, 190, 960, 560]), `fit`, `mediaStart` | dark window card | whoosh |
| `pip` | `src`, `label`, `width` (320), `height` (540), `side` (center, left, right), `y` (200), `mediaStart` | tall card with a chip under it | pop |
| `timer` | `from`, `to` (m:ss), `label`, `steps` (7) | flip counter, top centre | tick per step |
| `drop` | `name`, `meta` | a file chip drops into a dashed card | whoosh, pop |
| `thread` | `messages` `[{name, text, at}]` | comment rows in a paper card, y 200 | pop per message |
| `stack` | `top` (sans caps), `bottom` (serif italic) | two blocks, top centre | two hits |
| `comment` | `headline`, `keyword`, `handle`, `reply` | CTA headline, comment input, heart, reply | typing, click, pop, ding |
| `follow` | `handle`, `sub`, `y` (1180) | profile pill whose button flips to Following | pop, click |

Rules:

- One or two pop-ups on screen at once, never covering the face for more than a beat. The top band (y 190–800) is
  theirs; the face usually sits at y 500–1000, so a `screen` or `thread` that covers it should be short.
- `chat`, `icons` and `stack` say things that have no picture. Everything that names a real thing (a site, an app, a
  result, the raw footage) gets the real picture: a screen recording in `screen`, the clip in `pip`, real thumbnails
  in `cards` or `grid`. Never fake a product screen or a result in a real reel.
- Show a pop-up for at least 1.2 s; text-heavy ones (thread, screen) 2–3 s.
- `strike` is for "no X, no Y" lines: the icons of the things you don't need, crossed out as each is named.
- The CTA (`comment`) arrives with the CTA sentence and stays to the end, with `follow` near the end.

## Captions

- Serif (Playfair Display), 50 px, on a small rounded box in the caption colour (`captionBg`), centred at y 1350.
- 2–4 words per caption (`make_captions.py` defaults: 4 words, 24 characters), never across a beat start.
- Words not yet spoken are dim (`dim`), spoken words turn cream (`ink`), and words in `emphasis` turn the accent
  colour as they're spoken. Pick 4–8 emphasis words: the hook payoff, the key nouns, the CTA keyword.
- Move a caption with `captionY` on its beat if it would cover a pop-up (`follow` sits at y 1180).

## Look (`theme` in edit.json)

| field | default | used for |
| --- | --- | --- |
| `ground` | `#1B3A2E` (deep forest green) | hook and grid background, window cards, buttons |
| `ink` | `#F3EEE1` (cream) | headlines, spoken caption words |
| `dim` | `#8FAA98` | unspoken caption words, window labels |
| `accent` | `#C9A86A` (muted gold) | accent words, emphasis caption words, timecode, kicker |
| `strike` | `#E5484D` | the strike slash, the heart |
| `paper`, `paperInk` | `#F6F2E8`, `#1B2A23` | chat box, thread, icons, file chip |
| `captionBg`, `captionSize`, `captionY` | `rgba(27,58,46,0.92)`, 50, 1350 | caption box |
| `serif`, `serifFile`, `serifItalicFile` | Playfair Display | headlines, big words, masthead, captions |
| `sans`, `sansFile` | Inter | sans cards, UI text |
| `mono`, `monoFile` | Geist Mono | timecode, labels, issue line |

For another FrameJam style, map its background to `ground`, its text colour to `ink`, its accent to `accent` and its
display font to `serif` (bundle the font files and their license next to the others in `assets/fonts`). Keep a dark
`ground` with light `ink`, or a light `ground` with dark `ink` and a darker `captionBg`; check contrast with
`npx hyperframes check`.

## Motion

- Hard cuts between beats; `in: "blur"` when the room or angle changes.
- Pop-ups land with a spring (back-out ease, 0.3–0.4 s) or slide up 100–260 px; they leave with a quick fade.
- Headline cards and big words land in 0.3 s: serif cards rise and settle, the big word zooms down out of a blur.
- Typing runs at 20–30 characters a second with a blinking caret; the send button presses before the check.

## Sound

- **Voice** at -14 to -16 LUFS (normalise the narration, see SKILL.md).
- **Music:** a lo-fi boom-bap bed, 80–95 BPM, at volume 0.08–0.14, so it sits 18–24 dB under the voice.
  `scripts/make_sounds.py --music` makes one; or the user's own licensed track.
- **Sound effects** are essential in this style: whoosh on panels and big moves, pop on UI landing, click on
  sends and buttons, ding on success, typing under type-ons, tick on counters, hit on big words. `build.py` places
  them automatically; turn one off with `"sfx": false` on its pop-up, or all with `"sfx": false` at the top level.
  `sfxVolume` scales them all (default 1).
