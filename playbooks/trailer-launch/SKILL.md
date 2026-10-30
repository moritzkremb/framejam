---
name: trailer-launch
description: >
  Trailer Launch: turn a product or mission (name, promise, voiceover, archival or epic B-roll, real hero footage)
  into a 45–60 s cinematic trailer: mythology hook, rising stakes, a mandatory silence, a beat-drop reveal, product
  hero shots and a logo CTA. Kinetic type, trailer music stages, CRT/grain in act 1 and a clean 16:9 after the drop.
  Works in whatever video tool the project uses; Hyperframes when starting fresh. A free local script makes the
  multi-stage bed. Every version is reviewed in FrameJam. Use for a launch that should feel like a documentary or
  sci-fi teaser, a mission film, or an infrastructure / hardware / category reveal. Not for a 15 s curiosity sting
  (launch-teaser), a SaaS UI window launch (product-launch), or a founder talking to camera (founder-launch).
---

# Trailer Launch

> **How to use this playbook.** It's a recipe, not a set of rules: every format, length, pace and formula below is a
> default, and whatever the user asks for wins. Don't open with questions: use the defaults, build, and mention the
> defaults you chose in one line when you share the first render (ask only if something essential is missing, like the
> footage itself). The first render is the proposal, so there's no plan to approve first. Storyboards only when the
> user asks to see the shots first. Planning files the method mentions (`BRIEF.md`, `PLAN.md` and the like) are your
> own working notes: write them when they help you, never as a step for the user.

A product or a mission goes in; a cinematic trailer comes out. The shape of a documentary or sci-fi teaser, not a
feature walk-through: a grand hook, the industry's tension, music that climbs and then **goes silent**, a drop that
flips the story, real hero shots of the thing itself, and a logo with one line to act on.

This is a different playbook from **Launch Teaser** (10–20 s, few words, name on the drop, little explaining) and
**Product Launch** (SaaS UI in floating windows, feature proof, end card). If they asked for a teaser or a UI launch,
use those. If they asked for a trailer, stay here.

The pattern is written up from a public example by [@_ganimate_](https://x.com/_ganimate_/status/2115810508125446482)
("Launches can also look like Netflix Trailers!"). Credit that post; don't copy its footage, VO, type, music or
product. The structure is in `references/ganimate.md` and `references/beats.md`.

The method is fixed; the tool is not. In an existing project, use its tool. Starting fresh: Hyperframes
(`npx hyperframes init`) and the layer plan below. There is no starter composition — a trailer is built from the
user's VO, B-roll and hero shots, not a reskinned scene.

`<playbook>` below means this folder (the local path `get_playbook` returned).

## What goes in, what comes out
- **In:** the name, the one-line promise, the CTA, a voiceover script or recording, archival or epic B-roll, real
  product hero footage or renders, the logo. Optional: brand files, a music track, short quote clips the user owns
  the rights to.
- **Out:** a 45–60 s mp4 (16:9 default; 9:16 on request as a centre-weighted cut-down), voiceover, kinetic type,
  trailer music with a silence gap, reviewed and approved in FrameJam.

## Defaults (the user's request overrides any of them)
- **Arc:** Hook → Problem → Climax build + **silence** → Beat-drop reveal → Product hero → Logo CTA. The silence
  stays in the default shape (about 1–1.5 s of black, no music). Skip it only if the user says so.
- **Length and format:** 50–53 s, 16:9, 24 or 30 fps. 9:16 only on request: same cut, reframed, type still centred.
- **Voice:** authoritative, visionary, present tense. Write it first; it sets the cuts. One narrator. Optional
  2–3 short quote clips only if the user supplied them and has the rights — never invent a celebrity voice or
  download someone else's interview.
- **Type:** bold clean sans, mostly white, 1–3 words at a time, synced to the VO. Key lines stay on screen even
  with the sound off.
- **Picture:** act 1 can be degraded (CRT scanlines, VHS glitch, grain, boxy archival frames inside 16:9). After
  the drop the frame goes clean and full-bleed. Product hero is real footage or a real render in a real place —
  no mocked UI, no fake 3D of an app that doesn't exist.
- **Style:** Use the style picked for this video, if any (from `wait_for_pick`, or `get_preset` when the user names
  one). A FrameJam style sets the whole look (palette, type, grain, motion). The arc, the silence and the act-1 vs
  clean split stay. No style: black / near-black ground, white type, one accent if the brand has one.
- **Music:** `scripts/trailer_bed.py` (free) by default — atmosphere → build → silence → climax → hero → outro.
  The user's track or a licensed trailer cue if they have one. Generated music services are paid; ask first.
- **Facts:** names, claims and scale lines only from the user or the product's own site.

**Existing project made with another tool:** stay in that tool. The beat plan, cue sheet, music script and checks
apply unchanged.

When nothing is said: 16:9, ~52 s, the silence in, generated bed, the brand's look. Name the defaults you used when
you share the first render.

## Workflow

### 1. Voiceover and beat plan
Read `references/beats.md`. Write `SCRIPT.md` as short cues (6–18 words per beat, 1–3 words on screen). Then lay
them on the default clock and write `STORYBOARD.md` with a time-coded line per shot:

| Time | Section | Job |
| --- | --- | --- |
| 0:00–0:05 | Hook | Mythology or lineage; one big idea; archival or CRT framing |
| 0:05–0:17 | Problem | Industry tension; scale B-roll; music rising |
| 0:17–0:21.5 | Climax build | The core insight; music peaks |
| 0:21.5–0:23 | **Silence** | Black. No type, no music, no VO |
| 0:23–0:34 | Reveal | Drop. The story flips; driving cuts; kinetic type |
| 0:34–0:49 | Product | Clean 16:9; real hero shots; scale or promise copy |
| 0:49–0:53 | Outro | Slow; logo + one CTA line; boom |

Shift the times to the VO, but keep the silence as a hard gap (1–1.5 s) before the reveal. Then build; the first
render is the proposal. If the user wants to see the shots first, make 6 stills (hook, problem, pre-silence, first
frame after the drop, hero, CTA) and review them in FrameJam (`open_review` with `panelsDir`).

### 2. Footage
- **Act 1:** archival, found, news-texture, infrastructure, nature, cities. Stock is fine if the license is. Grade
  it as old: scanlines, grain, slight weave, 4:3 or 16:9 boxed inside the frame.
- **Quotes (optional):** only clips the user handed you, with rights. A name super is enough; don't fake a network
  lower-third. No quotes: the VO carries act 1 alone.
- **Reveal and hero:** the real product or a real render, preferably in a place (aerial, tracked 3D, stabilized
  beauty). Cut each shot to a short H.264 clip with frequent keyframes:
  `ffmpeg -ss 2.2 -t 3 -i in.mp4 -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30" -an -c:v libx264 -crf 18 -g 15 clips/name.mp4`
- If there is no real hero yet, stay on epic B-roll and type through the product act — don't invent an interface.
- Write `ASSETS.md`: one line per file, what it shows, rights, and the useful in/out.

### 3. Music
Write `cues.json` from the storyboard (section times, the silence, hits on cuts and word slams). Then:

`uv run <playbook>/scripts/trailer_bed.py cues.json --out assets/bed.wav`

(or `python3` with numpy, scipy, soundfile). Sections: atmosphere → build → silence → climax → hero → outro.
Whooshes on transitions, a boom on the drop and the logo. Check the loudness shape (`references/music.md`); you
can't hear it, so ask the user to listen. Duck the bed 6–9 dB under the VO in the video tool.

### 4. Build
No template ships. In Hyperframes (`npx hyperframes init`, 1920×1080) or the project's tool:

- One layer (or composition) per section; one paused timeline; every tween with an explicit from-state.
- **Type:** per-word or per-card rise with a short blur, hard cut or 2–4 frame fade, one card at a time. Centre,
  96–160 px at 1080p. Don't leave a sentence up for the whole beat.
- **Act 1 picture:** full-bleed or boxed video + a grain/scanline overlay (CSS, a looped texture, or a grade).
  Glitch or whip only on a cut, not as a constant effect.
- **Silence:** a black layer, audio empty. Hold it. The next frame is the drop.
- **Reveal / hero:** clean 16:9, no CRT. Hard cuts and match cuts on the grid; a whip or glitch only to jump eras.
- **Product:** hero footage full-bleed, not a floating SaaS window. Type sits over the calm part of the shot.
- **Outro:** logo settles, one CTA line, last boom, hold ≥ 1.5 s.
- `references/pitfalls.md` lists what usually breaks.

### 5. Check, render, review
- Lint/check in the tool, then a snapshot at every section midpoint, both sides of the silence, and the first frame
  after the drop.
- Render to a new file per version; `bash <playbook>/scripts/sheet.sh renders/v1.mp4` and Read the sheet. Check:
  first frame isn't empty, type never collides with a busy sky, the silence is actually silent and black, the drop
  lands on a picture (not more black), the product is real, the end card holds.
- Mix: VO on top, bed underneath, SFX on cuts. Peak under 0 dBFS; silence at −∞.
- **Review in FrameJam:** `open_review` with `videoPath` (absolute), open the URL, `wait_for_feedback`. Fix each
  note by timestamp, render `v2`, `add_version` with a one-line note, wait again. Repeat until approved.

## Quality bar
- **The silence is in the default cut.** Black, 1–1.5 s, no music, no VO, no type. The drop after it is a picture
  and a hit, not a fade back in.
- **Real product after the reveal.** Hero footage or a real render. No mocked UI. Act 1 may use stock and archive.
- **No invented authority.** Don't write, generate or scrape celebrity audio or likenesses. Quotes only from files
  the user supplied with rights.
- **Reads with sound on, still reads off.** VO + music do the feeling; the same lines sit as type.
- **Two pictures, one movie:** degraded and boxed before the drop, clean and wide after it.
- **Premium motion:** hard cuts on the grid, short settles, no bounce, no screensaver drift. At most 3 full-frame
  flashes per second.
- **Watch it yourself** (contact sheet + the silence and the drop) before every FrameJam round.

## Files in this playbook
- `references/beats.md`: the arc, VO and type rules, picture grammar, 9:16.
- `references/music.md`: cue sheet, section types, loudness checks, using a real track.
- `references/pitfalls.md`: what usually breaks a trailer cut.
- `references/ganimate.md`: the public example's structure, for craft only.
- `scripts/trailer_bed.py`: free local trailer bed (atmosphere → build → silence → climax → hero → outro).
- `scripts/cues.example.json`: the default 52 s cue sheet.
- `scripts/sheet.sh`: contact sheet of any render.
