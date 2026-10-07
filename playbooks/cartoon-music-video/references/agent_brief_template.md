# Scene-agent brief (template)

Copy to `AGENTS_BRIEF.md` in the project and fill in every `<…>`. Delete lines that don't apply. Each scene agent gets a short prompt (project path, its files, times, lyrics, must-haves, stills/clips, report format) and is told to read this brief first. Reference: `examples/which-frame/` was built from this brief by 6 agents in parallel.

You are one of <N> motion designers. Each of you builds one or two sections of a <duration> music video, "<song>", <what it is for / about>. It is rendered entirely in JavaScript (three.js + Canvas2D) by a deterministic frame-stepping engine at 1080p60, over AI-generated stills of <cast> that we cut out with mattes<, plus real screen recordings of <product>><, plus generated clips of …>.

**The director's brief, in their words:** "<key adjectives and asks: energy, pace, references, looks, what to avoid>". Treat this as your showreel.

## Read first (in this order)
1. `STYLE.md`: the law (looks, palette, type, motion grammar, bans).
2. `TREATMENT.md`: your section(s), lyrics, must-haves, the footage map.
3. `ENGINE_API.md`: the full engine API. `KIT_API.md`: the kit.
4. `engine/lib.js`: the project kit (puppet cut-outs, placement, line boil, review-app UI pieces: pin, cursor, commentCard, timeline, button, statusPill, sticker, slam, confetti, tileChrome, callBar, coverIn for windows). USE IT, don't rebuild UI pieces.
5. `engine/scenes/_smoke.js`: a working example: field → giant type behind the subject → `K.puppet` cut-out → front UI. Render it: `node tools/still.mjs --only _smoke,hud --t <t> --scale 0.5 --dir out/smoke_check`. `<engine/scenes/_kittest.js: every UI helper in one frame>`
6. Look at your stills: `assets/gen/<name>.jpg` (Read them) and a matte `assets/video/<name>/m_00001.png`.

## Kit essentials
- Stills: in `prepare()`: `await v.frame(K.boil(t))` for every still you draw this frame (3-frame line boil at 8 fps). App footage: `await v.frame(localT)` with localT inside the clip.
- Place a character: `K.puppet(E, v, t, { place: { cx, bottom, h }, enter: t0, bob, sway, mirror })` (1080 units). It hops on beats and pops on kicks. Returns the drawPlate opts; with them, `E.plateToScreen(E, v, uv, opts)` gives screen px (divide by `E.SCALE` for 1080 units) of an image point, e.g. a fingertip, the top of the head (`v.trackAt(K.boil(t)).top`) or a prop.
- 2D: `g = E.makeG2D(E.W, E.H)` in load; per draw `g.clear(); c.setTransform(E.SCALE,0,0,E.SCALE,0,0)`, draw in 1920×1080 units, `g.commit(); E.blitG2D(E, g, 1)`. Layer order inside a scene = draw order: BACK 2D → plate/puppet → FRONT 2D. You can blit the same G2D several times per frame (clear/draw/commit/blit each time), but at most 2 full-res canvases.
- Windows of app footage: `const o = K.coverIn(v, [x, y, w, h]); E.drawPlate(E, v, o)`, then draw a window frame/rounded corners with `K.roundCorners(c, rect, r, bgColor)` and a title bar. 
- Type: `E.drawText`, `E.popScale`, `E.wordAlpha`, `K.slam`, `E.drawStagger`, `E.drawKaraoke`; fonts: Archivo (hero), Geist (UI), Geist Mono (system), Instrument Serif italic (soft), Doto (LED), Archivo Black / Anton (3D via `E.text3D`).
- Words: `E.words` (each `{w, s, e, section, line}`); find words by section + text, e.g. `E.words.find(w => w.section === 'verse1' && w.w.startsWith('pop'))`. Beats/downbeats: `E.A.beats`, `E.A.downbeats`, `E.beat(t)`, `E.pulse('kicks', t)`.

## Ownership
- You own ONLY your `engine/scenes/<id>.js` file(s) (they currently hold a placeholder), plus optional `engine/scenes/<id>/` helpers and `assets/<id>/` data.
- Don't edit `engine/main.js`, `core.js`, `plate.js`, `typekit.js`, `lib.js`, `timeline.js`, `scenes/hud.js` or anyone else's files. If you need a kit change or hit an engine bug, work around it locally and report it.
- **Deterministic only:** no `Math.random`, `Date`, `performance.now` or rAF timing. Use `E.rng(seed)`, `E.hash1`, `E.noise1/2`.
- **Performance:** ≤ ~35 ms/frame at 1080p. Cache in `load()`, no allocation in hot loops, ≤ 2 full-res 2D canvases redrawn per frame.
- Don't generate new AI images or footage unless the lead asks. Procedural graphics in code are welcome.
- No third-party logos (cover any a generated still carries); brand marks only from `assets/brand/`.

## Footage rules
- Stills are shown clean: no filters, glow, outline, tint or grade on their pixels. Reframe, crop, mirror, mask into shapes, tile, put on 3D cards, cut, and move them as cut-outs.
- **Integration:** every character moment has at least one graphic that is tracked to it, comes out of a prop or gesture (fingertip, megaphone, card, roller, stopwatch), or sits behind it via the matte. "Still + caption" is a failure.
- **Never a dead frame:** something always moves; characters are always puppets (hop/sway) or in moving windows.
- Clips: <name · slot (song time at clip frame 1, if generated against the song) · content with key moments in clip seconds · matte quality>.
- Never cover the face. No cut-off heads (except deliberate ECUs).

## Lyric rules
- Every sung word is visible at its onset, as a designed hero or in the HUD subtitle (on by default). Set `E.hud.sub=false` only while your scene shows the full line itself.
- Impact on the onset frame `w.s`; anticipation ≤ 4 frames earlier; nothing lands late. Hold until at least `w.e`, then exit 3× faster or hard-cut on the next beat.
- 1-3 hero words per line. Never the same treatment on two consecutive lines.

## Motion rules
- Springs with overshoot for pops, ease-out for arrivals, in-out for morphs, linear for counters. UI never scales from 0 (from 0.94).
- Kicks → camera punch (`E.post.punch` 0.02-0.035) or shape hits; snares → colour/shape events; vocals → type. 1-2 sync layers per moment.
- At least one "how did they do that" moment per section (type behind the subject, a line leaving a prop and becoming type, a match cut on shape, a tile explosion, a 3D object out of a 2D drawing).
- `E.hud.theme = 'light'` on light or bright colour frames, `'dark'` otherwise.

## Tools (run from the project root; other agents render too, so stay at scale 0.5)
- Stills + sheet: `node tools/still.mjs --only <id>,hud --range <a>:<b>:<step> --scale 0.5 --dir out/<id>/it1 --sheet sheet --cols 4`, then Read `out/<id>/it1/sheet.jpg`. `--t 1.2,3.4` for exact times. Use a fresh `--dir` per iteration.
- Preview with audio: `node tools/render.mjs --only <id>,hud --from <a> --to <b> --fps 30 --scale 0.5 --out out/<id>/preview.mp4 --force`.
- Perf: `node tools/render.mjs --only <id> --from <a> --to <a+2> --fps 60 --scale 1 --out out/<id>/perf.mp4 --force` and read the printed fps (≥ 25 fps per worker is fine).
- Freeze check: `ffmpeg -i out/<id>/preview.mp4 -vf "freezedetect=n=0.003:d=0.25" -map 0:v -f null - 2>&1 | grep freeze_`.

## Required verification loop
1. Plan first: a beat-by-beat plan comment at the top of your file (each word + onset from `engine/data/lyrics.json`, the visual event, layer, cut points on downbeats from `engine/data/audio.json`).
2. Build, then contact-sheet your whole section at 0.25 s steps and critique it (Read the sheet).
3. Onset check: stills at `w.s + 0.03` for every hero word and at `w.s − 0.10`.
4. Preview mp4 at 30 fps; run the freeze check.
5. Iterate at least 3 times on the look: would a top motion designer repost this? One focal point? Faces clear? Strong type hierarchy? Too empty / too busy / generic? Is the joke readable in half a second?
6. Boundaries: the first frame of your section is a hard cut in and must be striking; check the first and last 3 frames.

## Final report (to the lead), concise
- What you built, moment by moment (time → visual), and which stills/clips you used.
- Measured 1080p fps.
- Paths to your 4 best stills (`--scale 1`).
- Any engine/kit issues, lyric-timing doubts, freeze-check result.
