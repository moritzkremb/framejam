---
name: youtube-intro
description: >
  YouTube Intro: turn a script or a raw camera/screen take of a long-form video's opening into a finished 20–60 s
  16:9 intro, using the formula from Moritz Kremb's channel ("Moritz | AI Builder"): a hook with the proof on screen,
  one line of context, a three-part promise, "let's dive in", hard cut to the body. Either an edited talking head
  (punch-ins, keyword captions, a full-screen insert, pop-up cards, icon row, quiet music bed) or a framed screen
  layout (screen inset on a gradient with a camera card). Works in any video tool; every version is reviewed in
  FrameJam. Use for "make the intro for my YouTube video", "edit my intro like Moritz's", a hook for a tutorial,
  launch or news video. Not for shorts or full video edits.
---

# YouTube Intro

The first 20–35 seconds of a long-form YouTube video, built to keep people watching: say what happened with the proof
on screen, why it matters, what the video will show (three things), then cut straight into the body. Measured from
Moritz Kremb's own intros; `references/formula.md` has the numbers and examples, `references/graphics.md` the exact
specs. `<playbook>` below means this folder (the local path `get_playbook` returned).

## What goes in, what comes out
- **In:** the topic and the video's title; the intro as a script, a camera take, a screen take, or both; optional
  proof to show (screen recordings, the launch post, results, before/after clips, screenshots), brand colours, music.
- **Out:** `intro-vN.mp4`, 1920×1080, 20–35 s (≤ 60 s), voice at about -14 LUFS, ending on a clean frame so it can be
  cut onto the start of the long video. Plus the trimmed script and the list of what was used.

## Before you start (decide once, then run)

Resolve from the request and the files; ask only what can't be resolved, in one round:
- **Footage:** a camera take of the intro (Layout A, edited talking head), a take recorded over the screen
  (Layout B, framed screen), or only a script (write and tighten it first, then ask the user to record: one take
  to camera, one screen recording of the proof; offer Layout B if they'd rather record once over the screen).
- **Proof:** what can be on screen in the first 5 seconds. The hook only works if something real is shown: the post,
  the product, the result. Ask for it if there's none.
- **Tool:** use the project's own tool (Hyperframes, Remotion, an NLE, plain ffmpeg). Starting fresh with Layout A:
  Hyperframes (`npx hyperframes init`; if the Hyperframes skills are installed, use them, otherwise
  `npx hyperframes docs`). Layout B can be done entirely with `scripts/framed.py` (ffmpeg).
- **Style:** Use the style picked for this video, if any (from `wait_for_pick`, or `get_preset` when the user names one). A FrameJam style sets the captions, cards and graphics (fonts, palette,
  accent, motion feel). The footage stays untouched. No style: use the default look (white heavy uppercase
  captions with a yellow #efd245 accent, inserts on #0c160f).
- **Music (Layout A):** the user's licensed track, a generated one, or none. Never use unlicensed music.
- **Transcription:** local and free by default (`scripts/transcribe.py`, whisper.cpp). A service (ElevenLabs Scribe,
  OpenAI Whisper API) only if the user already uses one.

**Paid steps:** none are needed. Music generation or a transcription service may cost money; stop and ask before
using one unless the user set a budget.

Unattended: pick the layout from the footage, write the plan into `INTRO_PLAN.md`, and continue.

## Workflow

### 1. Script the four beats
Write or tighten the intro into `INTRO_PLAN.md` (from the user's script or the take's transcript), one line per beat,
with what's on screen for each:
1. **Hook (0–5 s):** the news or result in one sentence with a number or a verdict, the proof on screen.
   "Yesterday X was released that's 20 to 200 times faster..." / "The video you're seeing right now was edited
   entirely with AI."
2. **Context (5–12 s):** why it matters or what was hard before. "Up until now... Well, that changed with..."
3. **Promise (12–28 s):** "In this video I'll show you..." + exactly three things (what it is → how to use it →
   examples/use cases), each with its visual.
4. **Handoff:** "So let's dive in." No title card, logo sting or subscribe ask.

Cut anything else (greetings, "in today's video", throat-clearing, a long credential). Read it aloud at speaking
pace: 20–35 s. If the user only gave a script, stop here and ask them to record (or to approve the plan).

### 2. Transcribe and tighten the take
```bash
python3 <playbook>/scripts/transcribe.py intro_raw.mp4 --out words.json
python3 <playbook>/scripts/tighten.py intro_raw.mp4 --words words.json --drop "<retakes>" --render work/tight.mp4
```
Read `words.json`, find retakes and flubs (repeated starts, "let me say that again", trailing "um"), pass their
ranges as `--drop`, keep the last good take of each sentence. `tighten.py` shortens every pause to ~0.12 s and writes
`words_cut.json` on the new timeline; every graphic is timed from it. Check the cut length against the plan; if it's
over 35 s with no reason, cut a sentence, not speed.

Layout B: the screen take usually carries the voice; tighten it the same way, or tighten the camera take and use
`--screen-start` to line up the screen.

### 3. Plan the graphics (storyboard round when it's Layout A)
In `INTRO_PLAN.md`, add a timed list from `words_cut.json`: each sentence → shot scale (wide/punch, alternating),
caption text (1–4 words, kicker), and at most one graphic: the full-screen insert on the context line, a pop-up card
per "like this", an icon row for a list, the proof clip during the hook. Specs in `references/graphics.md`.

For Layout A, render one still per graphic (the insert, each card, a caption frame) into `storyboard/` as
`01_hook.png`, `02_insert.png`..., then review them in FrameJam: `open_review` with `panelsDir` = the storyboard
folder, open the URL, `wait_for_feedback`. Fix what the user flags before animating. Layout B skips this.

### 4. Build
**Layout A (edited talking head):**
- Base: `work/tight.mp4` full frame. Punch-ins as hard cuts between 1.00 and ~1.18 on sentence boundaries, anchored
  above the face.
- Bottom gradient, keyword captions, the insert (3–4 s, hard in/out, the voice continues), pop-up cards, icon row,
  each landing 2–4 frames before its word.
- Sound: voice normalised to -14 LUFS, music bed ~20 dB under it ending on "let's dive in", low whooshes and pops on
  graphics.

**Layout B (framed screen):**
```bash
python3 <playbook>/scripts/framed.py --cam work/tight_cam.mp4 --screen screen.mp4 --screen-start 12.4 --out work/framed.mp4
```
Then add the hand-drawn arrows/underlines on the key lines when they're spoken (in the project's tool), and an
optional slow push during the promise. No captions, no music. Use the user's wallpaper with `--backdrop` if they
have a signature one.

In both: the proof must be visible by second 2; the last second before the body cut is clean.

### 5. Render and check
- Render `out/intro-v1.mp4` (1920×1080, H.264, 30 or the source fps, AAC).
- Contact sheet every 1 s (`bash <playbook>/scripts/sheet.sh out/intro-v1.mp4 1`) and Read it; check frames at each
  graphic's word; the first 5 s twice; the last frame.
- Measure loudness (`ffmpeg -i out/intro-v1.mp4 -af loudnorm=print_format=summary -f null -`): about -14 LUFS
  integrated, true peak ≤ -1 dB.
- Re-read the words against the plan: nothing important cut, no caption covering a face or the proof.

### 6. Review in FrameJam, deliver
- `open_review` with `videoPath` = the render (absolute path), open the URL in the built-in browser, then loop
  `wait_for_feedback` until the user presses Finish review.
- Map each comment (time, range or pinned spot) to its sentence and graphic, fix, re-render to a new file
  (`intro-v2.mp4`), check again, `add_version` with a short note of what changed, `wait_for_feedback` again. Repeat
  until approved.
- Deliver the approved file where the user keeps the long video's assets, and say where the body should start
  (the cut is right after "let's dive in").

## Quality bar
- **Hook in five seconds:** the claim is said and the proof is visible by second 5; no greeting before it.
- **Three-part promise:** exactly three things, each with its own visual.
- **No dead air:** pauses ≤ ~0.15 s, no retakes, no "um" at sentence starts. Length 20–35 s unless the user asked
  for more.
- **Graphics on the word:** each lands 2–4 frames before its word; one graphic at a time; nothing static over
  ~2.5 s in Layout A.
- **Readable:** captions ≤ 4 words, two lines max, never over the face; the insert reads without sound.
- **Clean handoff:** "let's dive in", music out, hard cut; the last frame is usable as a cut point.
- **Rights:** official logos only for tools actually used; screen content the user may show; music licensed or
  generated; no third-party faces without consent.

## Files in this playbook
- `scripts/transcribe.py`: word-level transcript with local whisper.cpp → `words.json` (free; downloads the base
  model once).
- `scripts/tighten.py`: pause shortening and retake removal from the audio → `cuts.json`, `words_cut.json`, and
  the cut video.
- `scripts/framed.py`: Layout B composer (screen inset on a gradient or wallpaper, rounded camera card), ffmpeg only.
- `scripts/sheet.sh`: contact sheet for checking renders.
- `references/formula.md`: the four beats and both layouts, measured from four of Moritz's intros.
- `references/graphics.md`: caption, insert, card, icon row, punch-in and sound specs, with a Hyperframes snippet.
