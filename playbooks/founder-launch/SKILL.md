---
name: founder-launch
description: >
  Founder Launch: turn a founder's to-camera recording plus screen recordings of the product into the launch video
  founders post on X: a sharp cold open, why it exists, the product working on screen, proof or the offer, and the
  name and link, with captions, kinetic word callouts, a lower third and brand cards. Real footage and real UI only.
  Works in whatever video tool or editor the project uses; Hyperframes when starting fresh. Free routes for
  transcription (local whisper) and music (an included script). Every version is reviewed in FrameJam. Use for "we're
  launching X" videos with the founder on camera, funding plus launch announcements, or a founder-narrated product
  demo. Not for music-only UI promos (product-launch) or short teasers (launch-teaser).
---

# Founder Launch

A founder talking to camera goes in, with screen recordings of the product; a tight launch video comes out. The kind
that does well on X when a founder ships: a cold open that makes you stay, a personal reason, the product working on
screen, a reason to believe, and one clear link. 45–90 s.

Patterns come from launch videos that did well in 2026 (Energy, Lindy, Tapkit, shift, Airpost, Cursor Automations):
the founder carries the story, the screen carries the proof, and type turns the key words into graphics.
`references/structure.md` breaks them down.

The method is fixed; the tool is not. Edit in the project's tool or editor if there is one (Hyperframes, Remotion, a
timeline editor via an EDL). Starting fresh: Hyperframes (`npx hyperframes init`) with the founder video as a full-
frame clip and overlays on top.

`<playbook>` below means this folder (the local path `get_playbook` returned).

## What goes in, what comes out
- **In:** one or more to-camera takes of the founder (phone or camera, any length), screen recordings of the product,
  the logo and link. Optional: a script or outline, b-roll, customer quotes, metrics, a music track.
- **Out:** a 45–90 s mp4 (16:9 for X and landing pages by default, 9:16 on request) with clean cuts, captions,
  callouts, product inserts, brand open and end card, music under the voice, reviewed and approved in FrameJam.

## Before you start (decide once, then run)

Resolve from the request and the files; ask only what's left, in one round:
- **Footage check:** is there a to-camera recording? If not, stop and hand the founder `references/recording.md`
  (outline, framing, audio, the screen takes to record). Never fake a founder with an avatar unless asked.
- **The one-line promise** and the **CTA** (URL, waitlist, "free for the first N", install command).
- **Length and format:** X 60–90 s 16:9 (default); 9:16 ≤ 60 s for Reels/TikTok.
- **Style:** Use the style picked for this video, if any (from `wait_for_pick`, or `get_preset` when the user names one). A FrameJam style sets the title cards, captions and callout graphics;
  the founder footage stays as shot. No style: use the product's brand colors and fonts.
- **Transcription:** local whisper (free, default) or a service the user already has.
- **Music:** `scripts/launch_bed.py` (free; use `mood: "night"` and low gain under speech), the user's track, or a
  licensed library track.
- **Facts:** numbers, customer names and funding only from the founder.

**Existing project made with another tool:** stay in it. The method, the transcript-based cut and the scripts work
anywhere; for a timeline editor, export the keep list as an EDL or cut list.

Unattended: pick defaults (16:9, ~60 s, brand look, local whisper, generated bed), write them in `BRIEF.md`.

## Workflow

### 1. Transcribe and log
- Transcribe every take with word timestamps (`references/edit.md` § Transcription; free: whisper.cpp or
  `openai-whisper` locally). Save `transcript.json` and a readable `transcript.md` with timecodes.
- Log the screen recordings in `ASSETS.md`: one line per take with what happens and when (click at 3.2 s, result at
  4.1 s). These are the inserts.

### 2. Find the story in the footage
Read `references/structure.md`. Then write `EDIT.md`: the beats in order, each with the exact transcript lines (with
timecodes) that cover it and the insert planned over it.
- **Cold open (0–5 s):** the strongest line in the footage, even if it was said last. A claim, a stat, a bold "we
  just killed X", or the product doing something surprising. No "Hi, I'm…".
- **Why / credibility (5–15 s):** the personal reason or the background in one or two lines.
- **The problem (one line)** and **the product reveal**: name card or logo bumper on the reveal line.
- **Demo (the middle 40%):** the product working on screen while the founder narrates. Show, don't describe.
- **Proof or offer:** a metric, a customer quote, the price, the deal.
- **CTA:** the link said and shown, then an end card that holds 2 s.
- Keep the last good take of every line; cut false starts, repeated takes and filler. Target the length.

Show `EDIT.md` as a proposal (beats, lines, inserts, length) and ask: approve or change?

### 3. Rough cut
- Build the cut from the approved lines. `python3 <playbook>/scripts/pauses.py take.mp4 --out keep.json` finds dead
  air; edit `keep.json` by hand with the transcript to drop retakes and reorder, then
  `pauses.py take.mp4 --from-json keep.json --render cut.mp4`. Multiple takes: cut each, then concatenate.
- Cuts land between words, never mid-word. Leave a 0.1–0.2 s breath. Let audio lead the picture by a few frames on
  big cuts (J-cuts) so it doesn't feel choppy.
- Review the rough cut in FrameJam before adding graphics: `open_review` with `videoPath`, `wait_for_feedback`.
  Cheap to change the story now, expensive later.

### 4. Inserts, graphics, captions
`references/edit.md` has the layouts and specs.
- **Screen inserts:** when the founder says "watch" or names a feature, cut to the screen recording (full frame, or
  in a window over a blurred/brand background), pushed in on the part that matters. 40–60% of the runtime should show
  the product.
- **Punch-ins:** on founder-only stretches, alternate 100% and ~115% framing at cuts so jump cuts read as intentional.
- **Kinetic callouts:** 1–3 words from the line itself ("no one is using AI", "10,000+ PEOPLE") set big beside the
  founder on the word they're said. One every 5–8 s, not constantly.
- **Lower third** the first time the founder appears: name and role, in brand type, 3 s.
- **Brand cards:** a logo bumper on the reveal (1–1.5 s), an end card with logo + link (2 s).
- **Captions:** every spoken word, 2–5 words per group, synced to word timings, high contrast, kept clear of
  callouts and faces. Burned in (most viewers watch muted).

### 5. Sound
- Voice: denoise lightly if needed, level to about -16 LUFS (`ffmpeg -af loudnorm=I=-16:TP=-1.5:LRA=11`).
- Music: soft bed 15–20 dB under the voice, swelling only on the cold open, the reveal and the end card. With
  `launch_bed.py`, write sections that match those moments and pass a low `gain` on effects.
- A whoosh into the logo bumper, a soft click when a callout lands. Little else.

### 6. Check, render, review
- Render a new file per version (`renders/v1.mp4`…). `bash <playbook>/scripts/sheet.sh renders/v1.mp4` and Read the
  sheet: faces not covered, captions readable and in sync, callouts on their words, inserts long enough to read.
- Watch every cut point (±0.2 s) on the sheet or with single frames: no mid-word cuts, no flash frames, no audio pops.
- **Review in FrameJam:** `open_review` with the render, open the URL, `wait_for_feedback`. Map notes to beats by
  timestamp, fix, render `v2`, then `add_version` with a one-line note and wait again until approved.
- Deliver the mp4 plus `EDIT.md` (and an EDL if the user edits elsewhere).

## Quality bar
- **The first 3 seconds earn the next 60.** Cold open is the best line, with a callout or the product on screen.
- **The founder sounds like themselves on a good day:** last takes, natural breaths, no robotic jump-cut rhythm.
- **The product is on screen for at least 40% of the video**, real and readable (pushed in, not a tiny full-screen).
- **Every word captioned and in sync;** callouts are words the founder actually said.
- **One promise, one CTA**, said and shown.
- **Rights:** the founder's own footage; other people only with consent; customer names and logos only with permission;
  music licensed or generated locally.
- **Watch it yourself** before every FrameJam round.

## Files in this playbook
- `references/structure.md`: the beat structure, breakdowns of launch videos that did well, line shapes.
- `references/recording.md`: what to send the founder before recording (outline, framing, audio, screen takes).
- `references/edit.md`: transcription, cutting from the transcript, layouts, callouts, captions, sound, EDL export.
- `scripts/pauses.py`: find and cut dead air, render a keep list (Python 3 + ffmpeg).
- `scripts/launch_bed.py`: free local music bed and sound effects from a cue sheet.
- `scripts/sheet.sh`: contact sheet of any render.
