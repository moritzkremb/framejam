# Kit API (`engine/lib.js`, imported as `K`)

`import * as K from "../lib.js";` The kit turns generated stills into living cut-out characters and gives scenes ready-made UI and type moves. Only the lead edits it; scene agents report gaps.

## Coordinates
Every 2D helper draws in 1080p units (1920 × 1080). Before calling them: `g.clear(); c.setTransform(E.SCALE, 0, 0, E.SCALE, 0, 0)`, draw, `g.commit(); E.blitG2D(E, g, 1)`. Plate helpers take 1080p units and handle `E.SCALE`.

## Stills as characters
- `K.boil(t)`: local time for a still's 3 line-boil frames at 8 fps. In `prepare()`: `await v.frame(K.boil(t))` for every still drawn this frame. Stills come from `tools/prep_stills.py`.
- `K.loadAll(E, names)`: load several clips into an object.
- `K.puppet(E, v, t, o)`: draw the matte cut-out (or `full:true` for the whole plate), alive on the beat. Returns the `drawPlate` opts, so `E.plateToScreen(E, v, uv, opts)` (divide by `E.SCALE` for 1080 units) locates an image point such as a fingertip, a prop or `v.trackAt(K.boil(t)).top`.
  - `place: { cx, bottom | cy, h }`: fit the subject's matte box (from `track.json`) so its centre x is `cx`, its bottom (or centre) sits at `bottom` (`cy`) and its height is `h`. Easier than `x`/`y`/`zoom`.
  - `x, y, zoom, rot, mirror`: manual layout like `drawPlate`.
  - `bob` (px hop per beat, default 10), `sway` (rad, default 0.012), `phase`.
  - `enter` (time it springs in from 0.82 with overshoot), `exit` (snaps out over 0.08 s), `opacity`.
  - `feather` (matte edge softness, default 0.08; ~0.015 for crisp pixel art; raise slightly if a halo of the generated backdrop shows on contrasting fields).
  - Scaling pivots on the subject's feet (matte box bottom centre), so kick pulses and entries don't drift off-centre subjects.
- `K.placeOpts(v, place, mirror)`: the placement maths alone, for graphics that must follow the subject before it is drawn.

## Windows and plates in rectangles
- `K.coverIn(v, [x, y, w, h], { focus: [u, v], zoom })`: `{ rect, crop }` opts for `E.drawPlate` that cover-crop a plate into any rectangle (call tiles, app windows, thumbnails). `zoom > 1` crops tighter around `focus`.
- `K.uvToRect(opts, uv)`: image UV to 1080 units for a plate drawn with `coverIn` opts.
- `K.roundCorners(c, rect, r, bgColor)`: paint the plate's square corners in the background colour so the window reads rounded.

## Primitives
`K.rrect(c, x, y, w, h, r)` path · `K.fill(c, color, a)` full-frame fill · `K.dotGrid(c, t, { color, step, r, drift })` drifting dot grid · `K.loadImage(src)` (official logo files, thumbnails; draw with `c.drawImage`).

## UI pieces (review-app look, retheme via PAL)
- `K.pin(c, x, y, n, { s, sent, alpha })`: numbered accent pin, tip at (x, y); `sent` turns it to `PAL.agent`.
- `K.cursor(c, x, y, { s, press })`: mouse pointer; `press` 0..1 adds a click ring.
- `K.commentCard(c, x, y, w, { n, time, text, typed, sent, s, alpha, light })`: comment with number, mono timestamp and text; `typed` 0..1 types it with a block cursor. Returns its height.
- `K.timeline(c, x, y, w, { p, range, rangeP, pins, h, light, thumbs })`: track, ticks, accent range drawn up to `rangeP`, pins, playhead at `p`.
- `K.button(c, x, y, label, { primary, s, press, size, alpha })`: pill button, e.g. "Finish review · 3".
- `K.statusPill(c, x, y, label, t, { s, color, alpha, align })`: status with a breathing dot, e.g. "Agent listening".
- `K.tileChrome(c, rect, { label, speaking, muted, color, bg, r })` + `K.callBar(c, t, { y, alpha, s })`: video-call tile name tag, speaking ring and control bar (draw after the tile's plate).

## Type and effects
- `K.slam(c, text, x, y, t, s, o)`: smear slam from 1.6× with 3 collapsing ghosts (`o.dir` −1/1, plus `drawText` options).
- `K.typeOn(text, t, t0, cps)`: typed substring.
- `K.sticker(c, text, x, y, { rot, size, bg, fg, font, weight, s, pad })`: white-bordered label with a hard shadow.
- `K.confetti(c, t, t0, { n, x, y, spread, up, seed, colors, life })`: closed-form burst (deterministic, no state).

## Constants
`K.W = 1920`, `K.H = 1080`, `K.FONT = "Geist"`, `K.MONO = "Geist Mono"`.
