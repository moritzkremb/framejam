# Building it in Hyperframes (when starting fresh)

Use this only when the project has no video tool yet. In a Remotion, Motion Canvas or editor project, apply the same
method there.

If the Hyperframes skills are installed, use them for composition details. Otherwise `npx hyperframes docs` has the
reference. Everything here is free and local.

## Setup

```bash
npx hyperframes init videos/<product>-launch --non-interactive --example=blank
cp -R <playbook>/template/hyperframes/* videos/<product>-launch/
cd videos/<product>-launch
```

Put assets under `assets/` (`ui/`, `logos/`, `fonts/`, `music/`). Vendor GSAP locally (`assets/vendor/gsap.min.js`)
for offline renders, or keep the CDN link in the template.

## Composition basics

- The root element has `data-composition-id="main"`, `data-duration`, `data-width`, `data-height`.
- Anything that appears for a time window is a `class="clip"` element with `data-start`, `data-duration` and a
  `data-track-index` (overlapping clips need different tracks).
- One paused GSAP timeline per composition, registered as `window.__timelines["main"] = tl`. The renderer seeks it
  frame by frame, so every tween needs an explicit from-state (`fromTo`, or a `tl.set` at the scene start).
- For longer videos, one sub-composition per frame (`data-composition-src="compositions/03-hero.html"`), each with its
  own timeline and local times. The starter is one file with a layer per frame, which is fine up to ~30 s.

## Video and audio

- `<video id="v-hero" class="clip" src="assets/ui/hero.mp4" data-start="8" data-duration="3" data-track-index="5"
  muted playsinline>`. **Every timed video needs an id**, or it renders frozen. `data-media-start` offsets into
  the file.
- Move a wrapper `div` for camera moves inside a window (scale + x/y with `transform-origin: 0 0`). Transforming the
  `<video>` itself didn't apply reliably in our renders.
- Pre-cut long recordings to short H.264 clips with frequent keyframes (`-g 15`) so seeks are exact:
  `ffmpeg -ss 6.5 -t 4 -i take.mp4 -vf "scale=1920:-2,fps=30" -an -c:v libx264 -crf 18 -g 15 clip.mp4`.
- Music and sound effects: one `<audio class="clip" src="assets/music/bed.wav" data-start="0" data-duration="…"
  data-track-index="20">`. With `launch_bed.py` the effects are already in the bed.

## Commands

```bash
npx hyperframes lint                                   # fix every error; warnings about sub-compositions are fine for one-file pieces
npx hyperframes snapshot --at 1.4,3.4,6.7,9.0,13.6     # frame midpoints and both sides of each cut
npx hyperframes preview                                # live preview in the browser
npx hyperframes render --quality high --output renders/v1.mp4
```

## Pitfalls we hit

- Centering with `transform: translate(-50%, -50%)` fights GSAP transforms. Use `gsap.set(el, { xPercent: -50,
  yPercent: -50 })` instead.
- Text that sits on a fading window: dim the window to ≤ 10% opacity and blur it, or the text reads gray on gray.
- Floating chips next to a caption: place them in the corners, not near center, or they collide on some clips.
- A UI recording shown whole in a window is too small to read at 1080p. Push into the part that matters (the comment
  box, the answer) with the wrapper.
- `freezedetect` flags small UI changes (typing) as frozen; check those spots by eye before "fixing" them.
