# The same method in another tool

When the user's project already uses another video tool, keep it. The method (one insight, picture before formula, step-by-step derivations, narration-paced scenes, the palette roles and pacing rules in `visual-language.md`) carries over; only the drawing layer changes. Tell the user what Manim would have added: true morphing between equations (matching terms glide into place), exact geometry, graphs and plane transforms from code, LaTeX typesetting, and 2D/3D camera moves.

## The parts that carry over unchanged
- `script.json` (scenes and lines) and `scripts/tts.py` from the template: copy both, make the voice the same way, read `audio/durations.json` to size each scene. The tool's scenes then run for `lead + sum(line durations + gaps) + tail`, like `NarratedScene`.
- The palette roles (copy the hex values from `template/palette.py` into the tool's theme).
- The review loop: render to a new file per version, open it in FrameJam, map comments to scenes by start time.

## Remotion (React)
- Equations: KaTeX (`katex` package; render to HTML in a component). For morphs, render each step and cross-fade the parts that change while the unchanged parts stay in place (split the equation into spans you key by term), or use `@remotion/paths` to interpolate SVG paths exported from MathJax (`mathjax-full` → SVG).
- Graphs and geometry: SVG in React, `interpolate()` and `spring({ config: { damping: 200 } })` (no overshoot) for moves; `evolvePath` from `@remotion/paths` for "draw this curve".
- Narration: `<Audio src={staticFile('audio/Scene/line.wav')} />` inside a `<Sequence from={...}>` per line; frame offsets from `durations.json`.

## Motion Canvas (TypeScript)
- The closest in spirit to Manim: generator-based timelines (`yield* all(...)`), `Latex` node (MathJax built in) with `tex` tweening between expressions, `Line`/`Circle`/`Spline` with `end()` for drawing.
- Pace with `yield* waitFor(duration)` per line; or use `waitUntil('event')` and place events on the audio track in the editor.

## Hyperframes (HTML + GSAP)
- Equations: KaTeX or MathJax to SVG in the page; morph by animating per-term elements (`gsap.to` on matched term spans, fade/write the new ones).
- Draw curves and outlines with SVG `stroke-dasharray`/`stroke-dashoffset` tweens; geometry as SVG paths.
- Keep timing deterministic (timeline positions from `durations.json`, no `Math.random`), `ease: "power2.inOut"` for the calm feel.

## ffmpeg / slides only
Not a good fit: the method depends on things moving. Suggest Manim (this playbook's template) for the animated parts and splicing them into the existing edit with ffmpeg.
