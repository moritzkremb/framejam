# Layouts, look and pacing (1080×1920)

All numbers are pixels on a 1080×1920 canvas, origin top-left. `template/build.py` implements every layout with
these values; in another tool (Remotion, Motion Canvas, ffmpeg) build the same boxes. Scale linearly for 2160×3840.

The seam between top and bottom halves is at **y = 960**. Platform UI covers roughly the top 220 px, the bottom
380 px and the right 120 px between y 1100 and 1700: no captions, faces or key text there.

## Pacing

- Something changes every **1.5–2.5 s** (average beat ~2 s, about 30–40 beats a minute). A change is a layout
  switch, a new picture, a punch-in on the speaker, a zoom inside a card or a word landing.
- **Nothing static longer than ~2.5 s.** A beat may run to ~4 s only if something moves or changes inside it: a focus
  zoom, a second word landing, a gallery card landing, the roadmap highlight moving, a screen recording playing.
- Every switch lands on the **first word of the phrase that motivates it** (word start time from the edited
  transcript, not a round number). Never switch in the middle of a word.
- Rough mix: 40–50% split/roadmap/words, 25–30% speaker alone, 15–25% visual with the cut-out.

## speaker

The speaker fills the frame.

- Video: 1080×1920, `object-fit: cover`.
- Framing: `zoom` 1.0 (wide) or 1.12–1.18 (punched in), scaled around `origin` "50% 30%" so the eyes stay at
  ~y 600–750 and the whole face stays in frame. **Alternate wide and punched in** on consecutive speaker beats; a long
  speaker beat gets `"punches": [{"at": t, "zoom": z}]` on sentence boundaries (hard cut, no zoom animation).
- Caption centre: y = 1410 (chest), clear of the mouth even when punched in.
- Use for: claims, numbers, opinions, the payoff, the call to action.

## split

A visual on top on the animated background, the speaker below.

- Media box: x 60–1020, y 205–895. The card takes the media's own aspect ratio, as large as fits, centred
  (`"fit": "cover"` fills the whole box and crops instead). Crop source screenshots to the part that matters first:
  aim for text that is at least ~22 px tall after scaling. Wide crops (≥ 1.3:1) of one panel or section read best.
- Card: radius 30, a 1.5 px light ring, a deep soft shadow (`0 50px 90px -30px` + `0 18px 36px -12px`), `bg` behind
  any letterbox (use the UI's own colour: white, or `#1E1E1E` for a dark editor).
- Label chip (optional `"label"`): mono, uppercase, 24 px, ink pill, sitting 58 px above the card's top-left corner.
  2–3 words naming the thing ("Meta Ad Library", "SKILL.md").
- Speaker: a 1080×960 box, `object-fit: cover`, `object-position: 50% Y%`; Y ≈ 38–45 puts the eyes ~250–350 px below
  the seam. Tune once per recording (`speakerY`) and check a snapshot. A soft 30 px shadow falls from the seam.
- Caption centre: y = 960, straddling the seam.
- Motion: images push in 1.00→1.04 over the beat (`"motion": "push"`, default); tall images can `"scroll"`; videos
  play. `"focus": [{"at": t, "x": 0–1, "y": 0–1, "zoom": 1.4–2.0}]` zooms into a point of the card in 0.5 s
  (`power3.inOut`) at a spoken word: the way a long screenshot beat keeps moving. Don't zoom text documents so far
  that lines get cut on both sides; crop tighter instead.
- Gallery (`"gallery": [a, b, c]`, `"at": [t1, t2, t3]`): 2–3 images as fanned cards (−8°, 0°, 8°; the middle one
  on top and largest), each landing at a spoken word with a short overshoot. For "five new versions", "these ads".
- Use for: a named, concrete thing (website, product, document, result) shown while it's described.

### split + roadmap

The step list on the background.

- Rows: x 70–1010, 118 px tall (less for 6 steps), 14 px apart, centred in y 205–895. Each row: translucent white
  card (`stepBg`, light ring) with a round ink badge "01" (mono) and the step text (50 px / 700, one line).
- Current step: an ink slab **slides** from the previous step to the current one (0.4 s, `power3.inOut`); its text
  turns white and the badge turns accent. Other rows: 55% (card) / 50% (text) opacity, text blurred 2.5 px.
- Entrance at each roadmap beat: rows rise 18 px and un-blur, 0.3 s, 0.04 s apart.
- `"step": 0` shows every step sharp (overview). `"check": true` adds the recap: badges flip to accent check marks
  one after another (0.22 s apart).
- Keep step texts to 2–5 words; at most 6 steps.

### split + title

The hook, on screen from frame 0.

- A mono chip (30 px, uppercase, ink pill) with the concrete numbers ("5 steps · every week"), then up to 3 lines at
  ≤ 128 px / 800, line-height 0.98, tracking −0.035 em, never wrapping (the size shrinks to the longest line).
- `"mark"`: a phrase that gets an accent highlighter bar swiping in at `"markAt"` (the moment it's spoken).
- No entrance on the text: frame 0 must already read as a cover.

### split + words

One to three big words that land as they're spoken.

- ≤ 150 px / 800, tracking −0.04 em, centred; the last word gets the highlighter after it lands.
- Each word appears at its spoken time (`"at"`, edited transcript) with a 0.26 s `back.out` scale-in.
- Use for: an abstract idea with no picture ("pain / desire", "same desire, fresh creative") and the CTA keyword
  ("Comment / AgentOS").

## visual

The visual in a big card on the background; the speaker is cut out and stands in front of it.

- Media box: x 40–1040, y 225–925, card fitted like in split (`"backdrop": true` instead puts a blurred, darkened
  copy of the media behind it, full frame).
- Cut-out speaker: the full 1080×1920 frame with the background removed, scaled 0.70 (756×1344), centred
  (x = 162), top at y = 640, so the head starts around y 1050 and the body leaves the frame at the bottom. Soft drop
  shadow. Tune with `cutoutScale` / `cutoutTop`; `cutoutStart` offsets into the file.
- Caption centre: y = 1010, between the card and the head; check it doesn't touch the hair in a snapshot.
- Cut-outs come from `scripts/make_cutouts.py` (`npx hyperframes remove-background`, local and free, about 20 s per
  2 s beat on a laptop). Only visual beats need them.
- Use for: a process or a tool doing something, best a screen recording in motion.

## Transitions

Hard cuts between layouts, on the first frame of the phrase that motivates the change. No wipes, slides or zoom
transitions between layouts. All motion lives inside a layout (background drift, card push and focus zooms, roadmap
slab, word landings, gallery landings, scrolling, footage).

## Captions

- One to three words, balanced (`scripts/make_captions.py --max-words 3 --max-chars 18 --breaks edit.json`), never
  across a beat start, no trailing punctuation, names fixed.
- 62 px / 800, white on an ink pill (92% opacity), radius 24, padding 12×28 px, `white-space: nowrap`, soft shadow,
  a 0.12 s pop on entry. **The word being spoken turns accent** (per-word start times in `captions.json`).
- Position by the layout under the caption's midpoint: split 960, speaker 1410, visual 1010 (override per beat with
  `"captionY"`).
- Keep text inside x 60–1020 and above y 1540.

## Look (the part a FrameJam style replaces)

Default theme in `build.py`, all overridable in `edit.json` → `theme`:

| Field | Default | What it is |
| --- | --- | --- |
| `base` | `#EEE6DA` | paper colour under the background |
| `blobs` | coral `#FF7A59`, mint `#4FD8B0`, periwinkle `#7D8CFF`, pink `#FFB0D0` | 2–5 colour fields that drift slowly (radial gradients, 8.5–12 s cycles) |
| `grain` | `1.0` | opacity of the bundled grain texture (`assets/grain.png`), 0 turns it off |
| `ink` | `#121317` | text on the background, badges, slab, chips |
| `onInk` | `#FFFFFF` | text on ink surfaces (chips, labels, the current step) |
| `accent` / `accentInk` | `#FFDD3C` / `#121317` | highlighter, active caption word, current badge, check marks |
| `card`, `radius` | `#FFFFFF`, `30` | card fill behind contained media, corner radius |
| `stepBg` | `rgba(255,255,255,.62)` | roadmap row cards |
| `captionBg`, `captionText`, `captionActive`, `captionSize` | ink 92%, white, accent, 62 | caption pill |
| `font`, `fontFile` | Bricolage Grotesque (bundled, OFL) | titles, words, steps, captions |
| `labelFont`, `labelFontFile` | Geist Mono (bundled, OFL) | chips, labels, step numbers |
| `progress` | `false` | thin accent progress bar at the top |

Old field names still work (`text`, `title` → `ink`; `panelBg` → `card`). Mapping a style: its background colours →
`blobs` + `base` (light, airy fields read best with dark `ink`; for a dark style use a dark `base`, deep `blobs`,
a light `ink` and a dark `onInk`), its accent → `accent`, its fonts → `font` / `labelFont` (bundle the files with their license).
Keep ink on the background at 4.5:1 or better; `npx hyperframes check` reports contrast.
