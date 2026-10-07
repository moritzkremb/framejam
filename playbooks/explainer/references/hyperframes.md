# Building it with Hyperframes (the default for a new project)

Hyperframes renders an HTML page with a paused GSAP timeline to mp4, frame by frame, in headless Chrome. Free, runs via `npx`. If the Hyperframes agent skills are installed, use them for anything this file doesn't cover; otherwise `npx hyperframes docs <topic>` (topics: data-attributes, gsap, compositions, rendering, troubleshooting).

## Set up
```bash
npx hyperframes init videos/<slug> --non-interactive --example=blank
cd videos/<slug>
mkdir -p scripts && cp <playbook>/scripts/* scripts/
cp <playbook>/template/index.template.html <playbook>/template/build_html.py <playbook>/template/panels.py scripts/
cp <playbook>/template/script.json .            # the example; replace with yours
python3 -m venv .venv && source .venv/bin/activate && pip install numpy kokoro-onnx soundfile
python scripts/fetch_fonts.py "Gochi Hand" "Patrick Hand"   # or the style's fonts
```
Keep the project out of folders with spaces in the path if you can (Kokoro's speech engine trips on them; the scripts work around it).

## The build loop
```bash
python scripts/tts.py && python scripts/word_times.py && python scripts/build_timing.py
python scripts/sfx.py && python scripts/mix.py
python scripts/build_html.py                     # index.template.html + timing -> index.html
npx hyperframes lint && npx hyperframes check    # 0 errors; read layout/contrast warnings
npx hyperframes render --quality high --output renders/v1.mp4
```
Re-run from `build_timing.py` after any voice change, from `mix.py` after sound changes, and only `build_html.py` after visual edits. A 30 s example renders in ~30 s on an Apple-silicon Mac; 2–3 min videos in 2–5 min.

## How the template is put together
- Edit `scripts/index.template.html`, never `index.html` (it's generated).
- `#root` carries `data-composition-id="main"`, `data-duration="{{TOTAL}}"`, 1920×1080.
- One `<section class="scene clip" data-start="{{start:<id>}}" data-duration="{{dur:<id>}}" data-track-index="1">` per scene. Each has its own ground (`.paperbg`) as its first child, so no scene ever shows through to an empty body.
- `{{WIPES}}` becomes one short wipe clip per scene change; captions are built from `T.captions` into `#caps`; the soundtrack is an `<audio>` clip from 0 to the end.
- In the script: `T` = timing.json, `C` = cues, `S[id]` = a scene's `start`, `dur`, `vo`. Place everything with `C.<cue>` (minus ~0.1–0.3 s so it lands with the word) or `S[id].start + x` for scene furniture (chapter labels).
- Helpers: `rise`, `pop`, `draw` (paths need `pathLength="1"`), `title`, `shake`, plus line boil and wipes. Add your own next to them (count-up, walk cycle, blink).
- The timeline is registered as `window.__timelines["main"]` after `document.fonts.ready`.

## Rules that keep renders correct
- Entrances use `fromTo` (explicit start state); state changes use `tl.set` at a time. No CSS transitions or `@keyframes`, no `Math.random`/`Date.now`, no `repeat: -1`.
- Fonts are local files (`assets/fonts/`, `@font-face`), images local (`assets/`). The GSAP script tag is the only network load.
- SVG drawn shapes: give paths `pathLength="1"` so `draw` works on any path.
- `lint` warns that scenes "should be sub-compositions" for single-file projects; that's advice for big projects, not an error. Split scenes into `compositions/*.html` with `data-composition-src` only when one file gets unwieldy (> ~1500 lines) or several agents build scenes in parallel.
- `check` layout warnings name the element: fix overflow by resizing the child, or mark intentional overflow with `data-layout-allow-overflow`.

## Building many scenes in parallel
For 8+ scenes, give scene sections to subagents after the clock exists: each gets PLAN.md's rows for its scenes, the cue names, the palette and helpers, and edits only its own `<section>` and its own `// ===== S<n>` block (or its own sub-composition file). You merge, run `check`, and look at the contact sheet.

## Checks before review
- `bash scripts/sheet.sh renders/v1.mp4 2`, then Read the sheet: every scene readable, nothing overlapping captions, no empty frames.
- Read full-size frames at a few key cues (`ffmpeg -ss <t> -i renders/v1.mp4 -frames:v 1 f.jpg`).
- Transcribe the render and compare with the script: no missing or doubled lines.
