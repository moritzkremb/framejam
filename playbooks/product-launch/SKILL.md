---
name: product-launch
description: >
  Product Launch: turn a product (a URL, an app the user can record, screenshots or a brief) into the kind of
  20–60 s launch video SaaS teams post on X: kinetic headlines and the real product UI in floating windows, cut to a
  music grid, ending on the name and a call to action. Real UI only, never mocked. Works with whatever video tool the
  project uses (Hyperframes, Remotion, Motion Canvas, an editor); Hyperframes when starting fresh. A free local
  script makes a music bed authored to the cut. Every version is reviewed in FrameJam. Use for a product launch,
  feature announcement, "introducing X" video, promo for a website or app, or a landing-page hero video. Not for a
  founder talking to camera (founder-launch) or a short mystery teaser (launch-teaser).
---

# Product Launch

A product goes in; a polished launch video comes out. The kind you see on X when a SaaS team ships: a hook that names
the pain, the product name landing on a drop, three features shown in the real interface, proof, and a clean end card.
Music-driven, usually no voiceover, 20–60 s.

Reference build: Moritz's **Notion launch demo** (46 s, 16:9, no voiceover, 120 BPM). Nine frames: scattered-tools
hook on dark, logo and rotating headline on the drop, the real hero video in a floating window, three feature frames
(capture, ask, agents) built from real Notion UI, a use-case roll, a logo wall with stats, and a CTA lockup. Its plan
is in `references/example-notion.md`. Match that bar.

The method is fixed; the tool is not. If the project already has a video tool, use it. If not, start a Hyperframes
project (`npx hyperframes init`), and copy `template/hyperframes/` as the starting composition.

`<playbook>` below means this folder (the local path `get_playbook` returned).

## What goes in, what comes out
- **In:** what's being launched (URL, the app itself, screenshots, recordings, a brief or pasted script), who it's
  for, where it will be posted. Optional: brand files, a voiceover script, a music track.
- **Out:** a 20–60 s mp4 (16:9 by default, 9:16 or 1:1 on request) with real product UI, kinetic type, music and sound
  effects on one beat grid, reviewed and approved in FrameJam.

## Before you start (decide once, then run)

Resolve from the request and the project; ask only what's left, in one round:
- **The one-line promise.** What the viewer should remember. Everything else is evidence for it.
- **Length and format:** X feed 30–45 s 16:9 (default); landing hero 30–45 s 16:9, muted-first; Reels 9:16 ≤ 30 s.
- **Sound:** music-only (default, plays muted on autoplay, so type carries the story) or voiceover + music.
- **Real UI source:** the running app (record it), the website (capture screenshots and its hero video), or files
  the user gives. If there is nothing real to show, say so; don't invent an interface.
- **Style:** Use the style picked for this video, if any (from `wait_for_pick`, or `get_preset` when the user names one). If the user picked a FrameJam style, it sets the whole look (palette, type,
  motion feel, transitions). No style: derive the look from the product's own brand (colors, fonts, UI surfaces).
- **Facts:** stats, customer logos and claims only from the product's own site or the user. No invented numbers.
- **Music:** the included free script (`scripts/launch_bed.py`) by default, a track the user owns, or a licensed
  library track. Generated music services are paid; stop and ask before using one.

**Existing project made with another tool:** stay in that tool. The method (beat grid, storyboard, real UI in windows,
paced reveals, verification, FrameJam loop) and the scripts (`launch_bed.py`, `sheet.sh`) work with any tool.

Unattended: choose defaults (music-only, 16:9, ~40 s, brand look), write them into `BRIEF.md`, and keep going.

## Workflow

### 1. Collect the real product
Gather the material before writing a single line. Details in `references/assets.md`.
- **App:** record short, clean takes of each feature (one action per take, 2880 px wide or more, no notifications,
  realistic demo data). Keep the event timings (when the click lands, when the result appears).
- **Website:** save the hero video, full-page and section screenshots at 2x, the logo (SVG), fonts, the exact
  headlines, stats and customer logos. Hyperframes users can run `npx hyperframes capture <url> -o capture`.
- Write `ASSETS.md`: one line per file with what it shows, size, and for videos the key moments in seconds.
- Brand truth: colors (ink, canvas, one accent), display and body fonts, how the UI looks (radius, shadow, chrome).

### 2. Story and beat grid
Read `references/story.md`. Then write `STORYBOARD.md`:
- Pick one arc (problem → platform, demo loop, before/after, feature cascade). Write the promise in one line.
- 6–10 frames. Each frame has one job: hook, product intro, feature, benefit, proof, CTA. A feature is shown as a
  short sequence on the real surface (input → action → result), not a static screenshot.
- The hook is 3–4 s and works muted: the viewer's pain or desire in their words, never "X is a platform that…".
- **Beat grid first.** Pick a tempo (110–128 BPM; at 120 BPM a beat is 0.5 s, a bar 2 s). Every frame starts on a
  downbeat and lasts whole bars. Mark the drops: usually the product name and the proof section. Every reveal in
  every frame lands on a beat.
- With voiceover: write `SCRIPT.md` in short cues (6–20 words per frame) and let the voice set frame lengths; music
  still follows the grid underneath.
- Write a `## Video direction` block once at the top: palette roles, type roles, how windows enter, motion rules,
  which frames are dark "impact" frames, what never appears.

Show the plan as a short proposal (frame list with times and one line each) and ask: approve or change? If the look
is uncertain, sketch the frames first and review them in FrameJam as a storyboard: `open_review` with `panelsDir`
(one image per frame, named `01-hook.png`…), then `wait_for_feedback`.

### 3. Shot design
For each frame, write a time-coded shot list against the beat grid (`references/shots.md`):
`Scene 1 (0.0–0.5s): …` with what is on screen, where it sits, and how it moves. Rules:
- At t=0 show only the first thing. Every other piece arrives on its beat (or its spoken word). Never dump the whole
  frame in the first quarter and let it sit.
- Real UI sits in a floating product window (brand radius, hairline border, soft layered shadow) with a 3D settle on
  entry. Never crop UI text mid-word. Rebuild only the one component that has to move (a search box that types).
- One accent color per frame, one highlighted word per headline.
- End every frame on a held read. Stillness beats lazy breathing or a drifting camera.
- Frame-to-frame transitions: hard cuts on the beat by default; zoom-through at section changes; push-slide for a run
  of features.

### 4. Music and sound
Read `references/music.md`. Default route, free: write `cues.json` from the storyboard (sections in bars, drops,
and a sound effect for every slam, pop, click, typing run and window entrance), then
`uv run <playbook>/scripts/launch_bed.py cues.json --out assets/music/bed.wav` (or `python3` with numpy, scipy and
soundfile). Sound effects come from the same cue sheet, so they sit exactly on the cuts. If the user brings a track:
measure its tempo, cut the grid to it, and start the track at its strongest section rather than a slow intro.

### 5. Build
Build frame by frame in the project's tool. Hyperframes notes (and pitfalls we hit) are in
`references/hyperframes.md`; the starter is `template/hyperframes/`.
- One composition per frame, or one file with a layer per frame for short pieces. Keep frame-local times.
- Animate with explicit from-states (seek-safe), long-tail eases (`power3`/`expo.out`), no bounce, no infinite loops,
  no randomness.
- Product videos: give every `<video>` an id; move a wrapper `div` for camera moves, not the video element.
- With parallel subagents available, give each one frame: its storyboard block, `## Video direction`, the asset
  lines it uses, and "edit only your file". Otherwise build in order yourself.

### 6. Check, render, review
- Lint/check in the tool, then render to a new file per version (`renders/v1.mp4`, `v2.mp4`…).
- `bash <playbook>/scripts/sheet.sh renders/v1.mp4` makes a 2 fps contact sheet; Read it. Look at every frame
  midpoint and both sides of every cut. Check: nothing front-loaded, no text cropped or under the caption band, no
  pop at the seams, the drop lands with the name, the end card holds ≥ 1.5 s.
- `ffmpeg -i renders/v1.mp4 -vf freezedetect=n=0.003:d=2 -f null -` flags dead stretches; a freeze is fine only
  where you planned a hold.
- **Review in FrameJam:** `open_review` with `videoPath` = the render (absolute path), open the URL in the built-in
  browser, `wait_for_feedback`. Map each note to its frame by timestamp, fix, render `v2`, verify again, then
  `add_version` with a one-line note and wait again. Repeat until approved.
- Deliver the final mp4 (X: H.264, ≤ 2:20, ≤ 512 MB) with its duration and the frame list.

## Quality bar
- **Real product, truthfully:** every UI shot is a real recording or screenshot. Copy, stats and logos come from the
  product's own sources. Third-party logos only where the product itself shows them (integrations, customers).
- **The promise lands by frame 2.** The hook speaks to the viewer's pain or desire; the name arrives on the drop.
- **Every reveal is on a beat** (or its spoken word), and the music, sound effects and cuts share one grid.
- **Readable at a glance:** 1–7 words per headline, ≥ 64 px at 1080p, one focal point per frame.
- **Premium motion:** smooth settles, windows with depth, velocity-matched seams; no bounce, no screensaver float, no
  generic stock shapes standing in for the product.
- **Works muted:** the story reads from type and UI alone.
- **Watch it yourself** (contact sheet + cut checks) before every FrameJam round.

## Files in this playbook
- `references/story.md`: arcs, frame roles, hook types, proven line shapes for each role, VO rules.
- `references/shots.md`: shot shapes for launch frames, layout and motion rules, seams, a worked shot list.
- `references/assets.md`: recording the app, capturing a site, the asset list, rights.
- `references/music.md`: beat grid, `cues.json` format, using your own track.
- `references/hyperframes.md`: starting fresh in Hyperframes, product windows, video and audio, pitfalls.
- `references/example-notion.md`: the Notion launch demo's plan, frame by frame.
- `scripts/launch_bed.py`: free local music bed and sound effects from a cue sheet.
- `scripts/sheet.sh`: contact sheet of any render.
- `template/hyperframes/`: a starter composition (beat-grid helpers, product window, kinetic line, chip, CTA card).
