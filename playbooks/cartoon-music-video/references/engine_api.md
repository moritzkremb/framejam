# Engine API (playbook engine/ → project engine/)

A deterministic three.js + Canvas2D compositor. Every pixel is a pure function of global song time `t`. `tools/render.mjs` and `tools/still.mjs` step frames with `window.renderFrame(frame, fps)` in headless Chrome, and ffmpeg muxes the untouched master audio on top.

## Contents

- [Files](#files)
- [Scene contract](#scene-contract)
- [The E object](#the-e-object)
- [Footage: clean plates, mattes and tracking](#footage-clean-plates-mattes-and-tracking)
- [Keyed footage planes in 3D (roto)](#keyed-footage-planes-in-3d-roto)
- [Post](#post)
- [HUD](#hud)
- [Timeline, variants and project config](#timeline-variants-and-project-config)
- [Fonts and 3D assets](#fonts-and-3d-assets)
- [Commands](#commands)

## Files

| file                                  | role                                                                                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`                          | fonts (@font-face → assets/fonts), importmap for three                                                                                                           |
| `main.js`                             | loads data and scenes, per-frame layer compositing, bloom, final grade shader, `renderFrame` / `grab`                                                            |
| `core.js`                             | math, easing, springs, RNG/noise, palette, audio/lyric timeline helpers, text canvases, 3D type, G2D surfaces, video frame sequences (frames + matte + tracking) |
| `plate.js`                            | `drawPlate`, `plateRect`, `plateToScreen`, `plateMaterialFor`: clean footage with optional matte cut-out                                                         |
| `typekit.js`                          | kinetic type: `popScale`, `wordAlpha`, `drawText`, `drawStagger`, `drawKaraoke`, `drawSubtitle`, `blitG2D`, `stretchKW`                                          |
| `lib.js`                              | the project kit `K`: cut-out puppets with placement, line boil for stills, windows (`coverIn`), UI pieces, type moves, confetti. See KIT_API.md |
| `roto.js`                             | `makeRotoMaterial`: luma-keyed footage planes for clips shot on a black void (stylized redraws only with `{stylized:true}`)                                      |
| `timeline.js`                         | `TIMELINE` (scene ids, [start,end), z, variant), `HUD` config, `POST` project defaults                                                                           |
| `scenes/hud.js`                       | global HUD layer (z=100): corners, title + mark, section code, bar/beat, counters (the spine), progress, subtitle track                                          |
| `data/audio.json`, `data/lyrics.json` | written by `audio_analysis.py` / `lyrics_align.py`                                                                                                               |

## Scene contract

```js
export default {
  async load(E, layer) {}, // build scenes/geometry/materials, load videos (cache everything here)
  async prepare(E, t, layer) {}, // optional: await v.frame(t - SLOT) for every clip drawn this frame
  render(E, t, rt, layer) {
    // t = GLOBAL seconds; window is [layer.start, layer.end)
    E.renderer.setRenderTarget(rt); // rt is pre-cleared transparent; renderer.autoClear is false
    // draw back → plate → mid → matte → front; E.renderer.clearDepth() between 3D passes
    // may set E.post.* and E.hud.* ; may return a number = layer opacity
  },
};
```

- Layers composite premultiplied-normal over black in z order (an entry can set `blend: 'add'|'screen'|'multiply'`). HDR linear color. Values above the bloom threshold (1.05) bloom.
- Previews run at `E.SCALE = 0.5` (E.W = 960). Always size 2D pixels as `px * E.SCALE`. The camera aspect is `E.W/E.H`.
- Deterministic only. No `Math.random`, `Date`, `performance.now` or rAF timing. Use `E.rng(seed)`, `E.hash1`, `E.noise1/2`. Particles use closed-form positions (no accumulated state).
- The budget is about 35 ms/frame at 1080p. Cache text textures, geometry and canvases in `load()`. At most 2 full-res 2D canvases redrawn per frame, and no allocation in hot loops.
- The first frame at `layer.start` is a hard cut in, so make it striking. The last frames land on an accent.

## The E object

- **Time and audio**
  - `E.t`, `E.frame`, `E.fps`, `E.dur`, `E.bpm`, `E.spb`.
  - `E.env(name, t)` for `mix|vocal|kick|snare|hats|bass` (≈0..1.5), plus `E.envAvg(name, t, win)`.
  - `E.last(list, t)` / `E.next(list, t)` return `{i, t, dt}` for the lists `beats|downbeats|kicks|snares|vocal_onsets`. There is no `hats` list (hats are an envelope only).
  - `E.pulse(list, t, decay=0.12, lead=0)` is an exponential decay since the last event (the workhorse).
  - `E.beat(t)` returns `{i, t0, t1, phase, bar, barT0, inBar, isDown, len}`.
- **Lyrics**
  - `E.words` holds `{w, s, e, li, wi, section, line}`.
  - `E.lineAt(t, lead)`, `E.wordAt(t, lead)`, `E.wordsIn(t0, t1)`, `E.section(name)`.
- **Math**
  - `E.clamp`, `E.lerp`, `E.remap`, `E.fract`.
  - `E.ease.{linear,inQuad,outQuad,inOutQuad,inCubic,outCubic,inOutCubic,inQuart,outQuart,inOutQuart,inExpo,outExpo,inOutExpo,outBack,inBack,outElastic,smooth}`.
  - `E.tween(t, t0, dur, fn)`, `E.spring(dt, k, z)` (0→1 damped step response).
- **Palette**
  - `E.PAL`: replace the values in `core.js` per project (from STYLE.md). Keep the role keys `black ink white accent`; the HUD and templates use them.
  - `E.col(hex, mul)` gives a linear THREE.Color; `mul > 1` makes it glow.
- **2D**
  - `E.makeG2D(w, h)` returns `{ctx, tex, clear(), commit()}`.
  - `E.blitG2D(E, g, intensity, blending)` draws the surface fullscreen into the current target.
- **Type**
  - `E.drawText(ctx, text, x, y, {font, size, weight, stretch:'125%'|'extra-condensed'…, tracking(em), color, alpha, align, s|sx|sy, rot, skewX, stroke, strokeOnly, glow, italic})`.
  - `E.measure(ctx, text, o)`.
  - `E.drawStagger(ctx, text, x, y, t, s, {stagger, dy, spring, e})`.
  - `E.drawKaraoke(ctx, E, line, t, {x, y, size, align, font, litColor, dimColor})`.
  - `E.popScale(t, s, {k, z, from})` and `E.wordAlpha(t, s, e, {out})`; `E.LEAD = 0.05`.
  - `E.textTexture(text, o)` returns a cached `{tex, w, h, aspect}` for planes.
  - `E.text3D(str, {font:'ArchivoBlack'|'Anton'|'BlackHanSans', size, depth, bevel…})` returns a cached, centered TextGeometry. Use a material array `[front, side]`.
  - Canvas `fontStretch` only accepts keywords. `stretchKW` maps percentages.
  - Never stroke a variable font: overlapping contours show their inner lines. Use static fonts (Archivo Black, Anton) for outline type.

## Footage: clean plates, mattes and tracking

This is the default compositing mode. Footage is drawn exactly as generated, and code graphics live in layers around it.

- `const v = await E.loadVideo('clip')` loads `assets/video/<clip>/f_#####.jpg` + `meta.json {fps,n,w,h,lumLo,lumHi,warp?,mask?,track?}`. If `meta.mask` is set, the matte sequence `m_#####.png` loads too (`v.mtex`, white = subject). If `meta.track` is set, `track.json` loads too.
- In `prepare()`: `await v.frame(localT)`. Use `localT = t - SLOT` for slot clips. This updates `v.tex`, `v.mtex` and `v.i`. Beat-warp in `meta.warp` is applied automatically. The index clamps to the last frame, so **keep localT inside the clip**, because a held last frame reads as a freeze.
- `E.drawPlate(E, v, { fit:'cover'|'contain', zoom:1, x:0, y:0, rot:0, crop:[x,y,w,h] (image UV, y down), mirror:false, opacity:1, matte:false, invert:false, feather:0.12 })` draws into the current render target.
  - `matte:true` draws only the subject (alpha from the matte). `invert:true` draws only the background.
  - `x` and `y` are px offsets at 1080p scale (multiplied by `E.SCALE` internally).
- **Layer recipe** ("type behind the subject"): `drawPlate(v)`, then MID graphics (a `blitG2D` or a 3D render), then `drawPlate(v, {matte:true})`, then FRONT graphics.
- **Backdrop replacement** for plates shot on a flat color cyc: draw a color field, then `drawPlate(v, {matte:true})`. The backdrop becomes your color and the subject is untouched (the floor shadow is lost). Run `fixmatte.py` on those clips first.
- `rect: [x, y, w, h]` (1080 units) places the plate in any screen rectangle instead of `fit`/`zoom`; pair it with a `crop` that matches the rect's aspect (`K.coverIn(v, rect)` computes both). `plateToScreen` ignores `crop`, so for points inside a cropped window use `K.uvToRect(opts, uv)`.
- `E.plateRect(E, v, opts)` gives `{x, y, w, h, cx, cy, rot}` in screen px. `E.plateToScreen(E, v, [u, v], opts)` gives `[x, y]` in screen px (E.W × E.H, y down) for a video-UV point. Pass the same opts you used for `drawPlate`.
- **Tracking:** `v.trackAt(localT)` returns `{ pose: [[x,y,vis]×33] | null, box: [x0,y0,x1,y1], c: [cx,cy], a: area, top: [x,y] }`, all in video UV (0..1, y down).
  - MediaPipe indices: 0 nose, 2/5 eyes, 9/10 mouth corners, 11/12 shoulders, 13/14 elbows, 15/16 wrists, 19/20 index fingers, 23/24 hips, 27/28 ankles.
  - Pose is single-person and may lock onto the wrong person in a group shot. `box`, `c` and `top` come from the matte and cover everyone.
  - Pose needs a human-like body. For creatures, objects or products, use `box`, `c` and `top`.
  - Smooth landmarks over ±2 frames (see `smoothPt` in the scene template). Raw jitter looks cheap.
- `E.plateMaterialFor(v, {matte})` gives a material for your own mesh: footage on a 3D card, inside a tile grid, or through a type mask.

## Keyed footage planes in 3D (roto)

For clips shot on a pitch-black void that should float inside a 3D world without a matte:

- `const m = E.makeRotoMaterial(E, {footGain, keyLo, keyHi})`, then `E.rotoLevels(m, v)`. Each frame: `m.uniforms.tVideo.value = v.tex`.
- Other uniforms: `uCrop` (Vector4 x,y,w,h in video UV), `uMirror`, `uOpacity`, `uReveal`/`uRevealDir`, `uDissolve`.
- Put it on `new THREE.Mesh(new THREE.PlaneGeometry(16/9*h, h), m)`, or call `E.drawRotoFullscreen(E, m, {scale, x, y})`.
- Output is `rgb = c·m, alpha = key·m`, so dim rim halos add light. Near-black costumes go see-through over bright graphics. Fix this with a dark backing cut to the silhouette, or a tighter key (`keyLo 0.006, keyHi 0.03`).
- Stylized redraws (dots, edges, ASCII, scanline, cel) need `{stylized:true}`. Use them only when the director asks; effects on footage are rejected by default.

## Post

- `E.post` is reset every frame to the neutral defaults, merged with the project's `POST` from timeline.js:
  `{bloom:0.55, bloomRadius:0.35, bloomThreshold:1.05, exposure:1, ca:0, grain:0, vignette:0, flash:0, flashCol:[r,g,b], invert:0, punch:0, shake:[x,y], rot:0, scan:0, glitch:0, letterbox:0, sat:1, tint:[r,g,b], fade:1, grade:'neutral', invertCol:'#FFA010'}`
- **`grade:'neutral'`** (default): values ≤ 1 pass through unchanged (no tonemap, no clamp), so footage and any palette render true. Only HDR > 1 is compressed, hue-preserving with a white-hot core (neon reads like a tube). `invert` is a true RGB invert.
- **`grade:'warm'`**: for amber-on-black pieces that are mostly graphics. It clamps g ≤ r and b ≤ g (kills cool CA fringes), applies a 50% hue-preserving ACES blend and pulls saturated yellows toward amber. `invert` becomes a poster in `invertCol`. It shifts footage colors, so don't use it when footage must stay clean.
- `grain`, `ca`, `vignette`, `scan`, `glitch`, `sat` and `tint` touch every pixel, including footage. Keep them at 0 over footage unless the director wants that texture.
- `punch` (zoom), `shake` and `rot` move the whole frame. `shake` is in UV units (0.004 is a hard hit), not pixels: pixel values blow the frame up and show as corrupt plates. They work as camera accents over footage. `rot` samples clamp-to-edge, so add about 0.1 punch while tilted.
- `flash` is added in linear space before sRGB encoding, so 0.1 already reads strong. It is zeroed below 0.02.

## HUD

A persistent frame glues 2D, 3D and footage sections into one piece, and its subtitle track keeps every lyric readable.

- Per frame: `E.hud = {alpha:1, sub:true, corners:true, label:'', theme:'dark'|'light', ink, accent}`. Use `theme:'light'` on white or color frames (dark ink). Set `sub=false` only while the scene shows the full sung line itself.
- Content comes from `HUD` in timeline.js: `title`, optional `mark` (an SVG path, official brand paths only), `sections`, `counters` (`fmt: int|short|sci|clock|text`, `interp: lin|log`), `progress`, and `dark`/`light` theme colors. The counters are where the video's spine usually shows: a clock, a countdown, or a number that explodes over the song.
- Retheme it per project or drop it (`alpha:0`). Some concepts want no HUD at all.

## Timeline, variants and project config

- `TIMELINE` entries: `{id, file?, start, end, z, blend?, variant?}`. One file per section, with hard cuts at boundaries on downbeats.
- **Variants:** give alternate versions of a section (an ending, a hook) `variant:'a'|'b'|'c'`. Only `a` renders unless you pass `--variant b`, which lets you deliver several cuts from one project. A variant may run past the song; `render.mjs` pads silence (`apad`).
- `POST` in timeline.js sets project-wide post defaults. `HUD` configures the frame.

## Fonts and 3D assets

- Canvas fonts loaded by `index.html`/`main.js`: `Geist` and `Geist Mono` (UI and system type; the HUD uses Geist Mono), `Archivo` (variable: wght 100-900, stretch 62-125% via `stretch:'125%'`), `Archivo Black`, `Anton`, `JetBrains Mono`, `Doto`, `Black Han Sans`, `Unbounded`, `Instrument Serif` (+ italic). To add a project font, drop the TTF in `assets/fonts/`, add an `@font-face` in `index.html` and a `document.fonts.load` line in `main.js`.
- 3D type fonts: `E.text3D(str, {font:'ArchivoBlack'|'Anton'|'BlackHanSans'})`. Add more with `core.loadFont3D(name, url)` in `main.js`.
- `import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'` and `SVGLoader` are available. Assets are served from the project root (`/assets/3d/*.glb`, `/assets/brand/*.svg`).

## Commands

- `node tools/still.mjs --only <id>,hud --range a:b:step --scale 0.5 --dir out/<id>/it1 --sheet sheet --cols 4` (or `--t 1.2,3.4`)
- `node tools/render.mjs --only <id>,hud --from a --to b --fps 30 --scale 0.5 --out out/<id>/preview.mp4 --force`
- Full: `node tools/render.mjs --fps 60 --scale 1 --workers 3 --crf 17 --out out/final/master.mp4 [--variant b] [--to <end>]`

## Engine safeguards and gotchas (from the reference build)

- `main.js` clamps `arc`/`ellipse`/`arcTo` radii to >= 0: spring overshoot (`popScale` anticipation) can drive a radius negative for a frame, and Canvas throws, which kills a full render late.
- `E.drawText` sets its own `globalAlpha` from `o.alpha`; a fade set on the canvas does not reach text, so pass alpha per call.
- `E.wordAlpha(t, s, e)` takes an absolute end time; use `1e9` for "never fade", not a small number.
- `E.loadVideo` caches one texture per clip name: one clip shows one frame per render. To show the same clip at several moments at once, load the frame JPGs with `K.loadImage` and draw them in 2D, or prep a copy under another name.
- `E.pulse` takes a list name from audio.json; for hand-picked times write a local `exp(-(t - t0)/decay)`.
- A still at exactly a section's start time may show the previous section (frame rounding); check at start + 1 frame.
- Mirroring a plate mirrors everything in it (text, a "?" on a screen); cover such details with code graphics.
