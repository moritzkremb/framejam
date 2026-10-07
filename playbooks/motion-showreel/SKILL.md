---
name: motion-showreel
description: >
  Motion Design Showreel: a 12–25 s show-off piece for a product, a brand or the user's own motion skills, where one
  hero object (a dot, a button, the logo mark) morphs through a fast run of motion-design "tricks" (UI
  micro-interactions, onion-skin trails, colour floods, kinetic type, a 3D type ring, grid ripples) cut to a music
  beat grid, ending on a logo lockup. Includes a beat-synced Hyperframes starter, a beat-grid analyzer and a
  royalty-free scratch beat. Every version is reviewed in FrameJam. Use for "make a motion design showreel", a launch
  teaser, a logo reveal with flair, "make something like this @uxmiles video", or a brand sizzle. Not for narrated
  explainers or talking-head edits.
---

# Motion Design Showreel

A short, dense, beat-cut piece that proves taste and craft: one hero object never leaves the screen and does a new
trick every bar, the music drives every cut, and it lands on the logo. Inspired by @uxmiles's "Motion designer."
reel (`references/reference-breakdown.md`); the worked example in `template/` is a 17 s FrameJam reel (the mark as
the hero, six tricks, a lockup). `<playbook>` below means this folder (the local path `get_playbook` returned).

## What goes in, what comes out
- **In:** what the reel is for (a product, a brand, the user's own skills), the logo or mark (SVG preferred), brand
  colours and fonts if any, 3–6 facts or features worth a trick, optional real UI or screenshots, optional music.
- **Out:** a 1920×1080 60 fps mp4, 12–25 s (default ~16 s + a short logo hold), every trick landing on the beat,
  reviewed and approved in FrameJam. Square or vertical cuts on request.

## Before you start (decide once, then run)

Resolve from the request and the files; ask only what can't be resolved, in one round:
- **Subject and the hero object:** the thing that survives every shot. Best: something from the brand (the logo
  mark, a product's key button, a cursor, a dot from the wordmark). It must be a simple shape that can morph.
- **The list:** 5–8 things the reel should show off (features, values, capabilities, skills). Each becomes a trick
  and a one-word HUD label.
- **Music:** the user's licensed track, generated music (usually paid: ask), or the free scratch beat
  (`references/beat-grid.md`). The scratch beat is fine for drafts.
- **Look:** call `get_selected_preset`. A FrameJam style is a starting point: take its palette (cut to 3 colours: a
  ground, an ink, one accent), its fonts (one display, one mono) and its motion feel, then design this reel's own
  look from it. No style: use the brand, or the template's look.
- **Tool:** starting fresh, use the bundled Hyperframes template (`project: new`). **Existing project made with
  another tool** (Remotion, Motion Canvas, After Effects scripts...): don't convert it. Follow the same method with
  that tool; `references/tricks.md` gives each trick tool-independently, and `beat_grid.py`, `scratch_beat.py`,
  `sync_check.py` work anywhere. Say what the template would have added (beat-addressed timeline, HUD index and beat
  dots, the six worked tricks, free deterministic re-renders).
- **Machine:** Node ≥ 20, Python 3 with numpy, ffmpeg. `npx hyperframes` is free and local.

**Paid steps:** none needed. Music generation may cost money; stop and ask before using it without a stated budget.

Unattended: pick the hero from the logo, 6 tricks from the subject, the scratch beat at 120 BPM, write the plan
into `PLAN.md`, and continue.

## Workflow

### 1. Study and concept
- If the user names a reference video, study it: contact sheets every 0.25–0.5 s (`bash <playbook>/scripts/sheet.sh ref.mp4 0.5`)
  and Read all of them, `python3 <playbook>/scripts/beat_grid.py ref.mp4` for the tempo, and list each shot as *time, trick, what the hero does*
  (the format of `reference-breakdown.md`). Take the grammar, never the content or the exact sequence.
- Write `PLAN.md`: the hero object, the palette (3 colours with roles), the two fonts, the joke or idea that opens
  and closes it (uxmiles: "Reduce Motion" off → "0 keyframes"; FrameJam: a comment saying "make it pop" → the logo),
  and the shot list: one row per trick with beats, label, what the hero does, what's on screen, the transition into
  the next shot. Order by energy: a small UI opener, building tricks, the biggest moment on the first musical hit
  (a flood), a 3D or generative showpiece, the lockup on the last hit. `references/tricks.md` is the menu.

### 2. Scaffold and music
```bash
bash <playbook>/scripts/scaffold.sh <project-dir> --bpm 120 --bars 8 --hits 12,24
```
This runs `npx hyperframes init`, copies `template/` (index.html, Geist fonts) and the tools into `tools/`, and
writes a scratch beat with hits on beats 12 and 24 to `assets/music.wav`, so it renders at once
(`npx hyperframes render --output renders/v0.mp4`, ~20 s). With a real track: put it in `assets/`, point the
`<audio>` at it, run `python3 tools/beat_grid.py assets/<track> --out analysis/beats.json`, set `BPM`/`OFFSET` and
the root `data-duration`, and move the flood and lockup beats onto its accents (`references/beat-grid.md`).

### 3. Storyboard round
Before animating new tricks, make one still per shot at its key pose: build each shot's peak state quickly in the
composition, `npx hyperframes snapshot --at <peak times> --describe false -o storyboard` and rename the frames
`01_<label>.png`... Review them in FrameJam: `open_review` with `panelsDir` = `storyboard/`, open the URL,
`wait_for_feedback`. Fix what the user flags; `add_version` for another round if much changed.

### 4. Build
`index.html` is one composition, one paused GSAP timeline, everything placed with `at(beat)`:
- Config block at the top: `BPM`, `OFFSET`, brand colours, copy (`COMMENT`, `WORDS`, `RING`, `WORDMARK`), the 30
  grid colours, and `SHOTS` (HUD index). Change these first.
- `#hero` (+ `#ghost1`, `#ghost2`) is the hero object. Each shot block tweens it from the previous shot's end state
  to its own; replace or add shots by copying a block and keeping that hand-off.
- Shot layers (`#s1`…`#s7`) appear and disappear with `tl.set(..., {autoAlpha})` on the beat; there are no timed
  clips, so retiming is only editing beats.
- Brand: draw the mark from divs or inline its SVG; use official logo files and colours only.
Build in the shot order and snapshot each shot's beats as you go (`npx hyperframes snapshot --at ...`). Run
`npx hyperframes lint` after each structural change. If the Hyperframes skills are installed, use them for
anything beyond the template; otherwise `npx hyperframes docs`.

Pitfalls the template already handles (keep them): `fromTo` later in the timeline needs `immediateRender: false`;
never put `opacity` or `filter` on a `preserve-3d` element (fade its parent); computed things (the ring) are drawn in
an `onUpdate` so seeking redraws them; no `Math.random()` or clocks.

### 5. Render and verify
- `npx hyperframes check` (lint, layout, contrast: back-of-ring letters behind the hero may raise contrast warnings;
  the 3D letters carry `data-layout-allow-overlap`).
- `npx hyperframes render --quality looks --output renders/v1.mp4` (60 fps from the root `data-fps`).
- `bash tools/sheet.sh renders/v1.mp4 0.5` and Read every sheet; check every shot boundary and the first 2 s twice.
- `python3 tools/sync_check.py renders/v1.mp4 --at <flood time>,<lockup time>`: cuts and floods within 0 to +1 frame.
- Fix weak shots by replacing the trick, not by adding effects.

### 6. Review in FrameJam, deliver
- `open_review` with `videoPath` = the render (absolute path), open the URL in the built-in browser, loop
  `wait_for_feedback` until the user presses Finish review.
- Map each comment (time, range or pin) to its shot and beat, fix, re-render to a new file (`renders/v2.mp4`),
  verify again, `add_version` with a short note of what changed, `wait_for_feedback` again. Repeat until approved.
- Deliver `<slug>-v<N>.mp4`. For X or LinkedIn also offer a 1:1 version (set the root to 1080×1080 and recentre).
  Say which music was used and whether it needs replacing before publishing.

## Quality bar
- **One hero, no cuts that lose it:** the hero is on screen in every shot and carries each transition.
- **On the beat:** every arrival peaks on a beat or eighth; the flood and the lockup sit on the music's hits; the
  sync check passes.
- **A trick per bar:** nothing holds longer than ~2 s except the lockup; every trick shows a different skill.
- **Restraint:** 3 colours, 2 fonts, flat shapes, no stock effects, no glow soup.
- **Readable at speed:** every word on screen is ≤ 3 words or a big single word, held ≥ 0.75 s.
- **Rights:** official logos and real product UI only; licensed, generated or scratch music; no third-party logos.
- **Photosensitivity:** at most 3 full-frame luminance flips per second.

## Files in this playbook
- `template/index.html`: the beat-addressed Hyperframes starter (the FrameJam reel: send → onion skin → timeline →
  flood → 3D type → grid → lockup, HUD index, beat dots, timecode). `template/assets/fonts/`: Geist and Geist Mono
  (OFL).
- `scripts/scaffold.sh`: new project from the template, tools copied, scratch beat written.
- `scripts/beat_grid.py`: tempo, grid origin, downbeats and accents of any track → `beats.json` (numpy, ffmpeg).
- `scripts/scratch_beat.py`: royalty-free synthesized beat on an exact grid with risers into chosen hits.
- `scripts/sync_check.py`: picture-vs-audio hit offsets in a render. `scripts/sheet.sh`: contact sheets.
- `references/reference-breakdown.md`: the @uxmiles reel, shot by shot. `references/tricks.md`: the trick library
  with GSAP/CSS and Remotion notes, transitions, motion grammar, determinism. `references/beat-grid.md`: music
  sources, measuring, placing in beats, sync checks.
