---
name: whiteboard-reel
description: Turn a raw talking-head recording that explains or shares something (a tool, a skill, a method, a lesson) into a 9:16 Instagram-style reel where every idea is drawn on a clean white board that drops over the top of the frame while the speaker slides down under it - a numbered steps card with a handwritten note, a tree that branches into outputs, a mind map, a fan of cards revealed one by one, a heavy title with a hand-drawn underline, profile cards, an analytics panel that counts up with a marker sweep, thumbnails with a prompt bar - plus a series badge over the speaker, lowercase mono captions, a light plucky music bed with quiet sound effects, and a comment-keyword CTA in the caption spot. Includes the cut (pauses and earlier takes removed), a Hyperframes template with a runnable starter scene, and scripts for captions, pacing and sound. Works with the project's own video tool too.
---

# Whiteboard Reel

> **How to use this playbook.** It's a recipe, not a set of rules: every format, length, pace and formula below is a
> default, and whatever the user asks for wins. Don't open with questions: use the defaults, build, and mention the
> defaults you chose in one line when you share the first render (ask only if something essential is missing, like the
> footage itself). The first render is the proposal, so there's no plan to approve first. Storyboards only when the
> user asks to see the shots first. Planning files the method mentions (`BRIEF.md`, `PLAN.md` and the like) are your
> own working notes: write them when they help you, never as a step for the user.

**In:** a raw recording of someone talking to camera about something they want to explain or share, plus any
screenshots or clips of the real things they mention (thumbnails, profiles, analytics, the tool itself), the name of
the thing, an optional series name, and the word people should comment for the CTA.
**Out:** a 1080×1920 reel, 30–60 s, that switches between two layouts:

| Piece | When |
| --- | --- |
| **board**: a white board over the top ~47% of the frame, the speaker slid down under it, a diagram drawing itself on the board | every explanation: a method, a structure, a list, "how to think about it", the name of the thing |
| **speaker**: the talking head full frame, wide or punched in | opinions, asides, the turn in the story, the CTA |
| **cutaway**: a full-frame picture or clip | B-roll, an earlier video, 1–2 s |
| **graphics on the board**: steps card (+ note, strike), tree, mind map, fan of cards, title, thumbnails + prompt bar | as each idea is said, item by item |
| **floating cards over the speaker**: series badge, profile cards, analytics panel | the series intro, "I studied…", the results |
| **keyword**: "comment" and the keyword in big quotes in the caption spot | the CTA, last 4–6 s |

The look: an off-white board with a faint vignette and white rounded cards with soft shadows; near-black bold sans
(Inter) for everything on the board, small grey mono labels, one electric blue for pills, diagram lines and focus, red
only for strikes and the badge icon, a lime marker on the number that matters, a handwritten script (Caveat) for notes
and the series tag; white lowercase mono captions with a soft shadow, no box, on the speaker's chest; a light plucky
music bed under the voice and a quiet pop or pen scribble on every graphic. The pattern comes from a reel by
@aiwithremy; `references/reference-breakdown.md` has its timeline and the rules taken from it.

## Defaults (the user's request overrides any of them)

Work these out from the request and the files. Where nothing is said, use the default and keep going; ask only if something essential is missing.

- **Format.** 9:16 at 1080×1920, 30 fps. Keep the source frame rate if it's 24, 25 or 60.
- **Length.** Keep the whole story the speaker tells; no cutting content to hit a length. Say so if it runs far
  over the platform's limit.
- **Visuals.** List what the user supplied. `thumbs`, `profiles`, `stats`, a `tree` of pictures and every `cutaway`
  need real pictures of the thing being said. Missing ones: a web screenshot of a public page (record the URL), or a
  diagram instead (`steps`, `tree` of blank documents, `mindmap`, `fan`, `title`). Never invent a profile, a result,
  a number or someone else's post.
- **Series badge.** Only if the user names a series (or it's in their earlier reels); otherwise leave it out.
- **CTA.** If the user gave a keyword, end with `keyword`; otherwise end on the speaker's last line with captions only.
- **Tool.** If the project already renders with another tool, follow this method there using the geometry in
  `references/graphics.md`; never convert the project. Say what the bundled template would have added (the
  data-driven build, sounds and checks). For a fresh project, use Hyperframes with the template in `template/`.
- **Look.** The template's default look is ready to use. For a FrameJam style (from `wait_for_pick`, or `get_preset`
  when the user names one), map its colours and display font onto `theme` in edit.json (fields in
  `references/graphics.md`, "Look") and bundle the font files with their license. Layouts, timing and positions stay.
- **Transcription.** Free and local by default (`references/transcription.md`); paid only with the user's OK.
- **Music and sound.** Make the music bed and the sound effects with `scripts/make_sounds.py` (free, made on the
  computer) unless the user brings a licensed track. Music ~20 dB under the voice.
- **Rights.** Only the user's own footage and media they may use. Don't reuse the reference reel's footage, lines,
  series name or exact colours.
- A request to make the video already allows local renders; don't ask again.

Requirements: Python 3 with NumPy and Pillow, ffmpeg, Node 22 (for `npx hyperframes`).

## Setup

```bash
npx -y hyperframes init my-reel --example blank --resolution portrait --non-interactive
cp -R <playbook>/template/. my-reel/          # build.py, edit.example.json, assets/fonts
cp -R <playbook>/scripts my-reel/scripts
mkdir -p my-reel/{source,transcripts,working,assets/vis,renders}
```

Put the raw recording and the user's media in `source/` (never modify them). If the Hyperframes skills are installed
use them for anything not covered here; otherwise `npx hyperframes docs`.

## Starter scene

`template/edit.example.json` is a 24.6 s reel that uses board and speaker beats and eight graphic types: thumbs with a typing prompt bar, steps with a note, a tree, a mind map, the series badge, a fan
with a title, an analytics panel and the keyword CTA. `scripts/make_starter.py` makes placeholder media for it (a
drawn stand-in presenter, a computer voice, word times, placeholder thumbnails), so the template renders before the
real footage is in:

```bash
cd my-reel
python3 scripts/make_starter.py
python3 scripts/make_sounds.py --sfx assets/sfx --music assets/music.wav --duration 24.6
python3 scripts/make_captions.py --words transcripts/edited.words.json --breaks edit.json --out captions.json
python3 build.py && npx hyperframes render -o renders/starter.mp4
```

Use it to check the setup, to show the user the look before their footage arrives, or as a pattern to copy beats
from. Then delete the placeholder files and `edit.json` and build the real reel below.

## Workflow

### 1. Look at everything

`ffprobe` every file. Contact sheets of the talking head and every supplied file
(`ffmpeg -i in.mp4 -vf "fps=1/5,scale=320:-1,tile=6x6" -frames:v 1 sheet.jpg`), then 1 s sheets and full-resolution
frames of promising parts. Note where the face sits in the frame (it decides the board's `shift`), what each file can
show, and where the angle changes.

### 2. Cut the speech

Same as a clean talking-head edit (details in `references/clean-cuts.md`):

1. Transcribe the raw recording (`references/transcription.md`).
2. `python3 scripts/prepare_edit.py --input source/raw.mp4 --transcript transcripts/source.words.json --out working/edit-01`
   (silence pass, fast settings).
3. Find earlier takes: read `working/edit-01/silence.transcript.json`, then the partial-retake audit (3–6 s excerpts
   around every sentence start and removed pause). Keep the last take; write `working/removals-01.json`.
4. `python3 scripts/prepare_edit.py ... --removals working/removals-01.json --out working/edit-02 --render`.
5. Check the joins (transcribe the cut and 3–6 s around each join; frames on both sides).
6. Copy `speech.mp4` to `assets/speech.mp4`; normalise the narration:
   `ffmpeg -i working/edit-02/speech.wav -af loudnorm=I=-15:TP=-1.5:LRA=11 -ar 48000 assets/speech-norm.wav`.
7. Transcribe `speech.wav` for edited-time words: `transcripts/edited.words.json`.

### 3. Plan the reel

Read the edited transcript and write `edit.json` (start from `template/edit.example.json`; every field is in
`references/graphics.md`):

- **Find the explanations.** Mark every stretch where the speaker explains how something works, lists things, names
  the thing or shows proof. Those are `board` beats (or floating cards); everything else is `speaker`.
- **One diagram per idea, built as it's said.** A method or recipe → `steps` (one item per spoken step; `strikeAt`
  when they then say to stop doing it); "it turns into / it copies into" → `tree`; "how to think about it" or a set
  of qualities → `mindmap`; "three principles / rules / tips" → `fan` with a `focus` on each as it's named; the name of
  the thing → `title` (often under a `fan`); a pile of examples someone feeds in → `thumbs` with a prompt bar. Every
  item, node and focus lands on the word it shows.
- **Proof floats over the speaker:** `profiles` for the people they learned from, `stats` for their results (real
  screenshots and real numbers only), a `tree` whose children are real thumbnails for "every video I made".
- **Series:** a `badge` over a full-frame speaker beat when the series is named, once, early.
- **Pace:** something changes every 1–2 s; speaker-only stretches up to ~3 s, broken by punch-ins (alternate 1.0 and
  1.12–1.2) or an angle change. Set `shift` on board beats so the eyes sit 60–150 px under the board's edge.
- **CTA** with the CTA sentence: `keyword` to the end.
- `emphasis`: 2–5 words that turn lime in the captions (the key idea, the name of the thing, the keyword).

Check it: `python3 scripts/check_pacing.py edit.json` lists every hold over 3 s; fix them before building.

Prepare each visual: crop screenshots to the one panel being talked about
(`ffmpeg -ss T -i screen.mp4 -frames:v 1 -vf crop=w:h:x:y assets/vis/name.png`), crop avatars square, trim clips to
the moment and mute them, and remove anything private (account IDs, emails, other people's comments). Thumbnails are
16:9, tree pictures 9:16.

If the user wants to see the plan first, show it: one still per beat in `working/storyboard/01-....png`,
`open_review` with `panelsDir`, and adjust before building.

### 4. Captions and sound

```bash
python3 scripts/make_captions.py --words transcripts/edited.words.json --breaks edit.json \
  --out captions.json --fix "cloud code=Claude Code"
python3 scripts/make_sounds.py --sfx assets/sfx --music assets/music.wav --duration <reel length>
```

Captions are 2–3 words, never across a beat start, lowercased by the build (`captionCase: "as-is"` keeps the
transcript's case). `make_sounds.py --seed N` gives a different chord loop and arpeggio; skip `--music` if the user
brings a track and set `music.src` to it.

### 5. Build and check

```bash
python3 build.py                # edit.json + captions.json -> index.html
npx hyperframes check           # must show 0 errors; fix contrast and overlap warnings
npx hyperframes snapshot --at <one time inside every beat and graphic> --no-end
```

Look at every snapshot: the board's edge above the eyes and the face fully visible under it, every diagram inside the
board (nothing cut off at its edge), floating cards off the face, card text readable on a phone, captions on the chest
and clear of the chin, nothing important in the top 170 px, the bottom 380 px or the right 120 px between y 1100 and
1700. White captions over a white shirt pass the eye test only with the shadow: if one is hard to read, move it with
`captionY`.

### 6. Render and review

```bash
npx hyperframes render -o renders/draft-01-raw.mp4
ffmpeg -i renders/draft-01-raw.mp4 -c:v copy -af loudnorm=I=-15:TP=-1.5:LRA=11 -ar 48000 -c:a aac -b:a 192k renders/draft-01.mp4
```

The Hyperframes mixer limits peaks, so the render usually lands near -17 LUFS; the second line brings it to -15
without touching the picture. Check the file: duration equals the cut; audio and video lengths agree; no black frames
(`ffmpeg -i r.mp4 -vf blackdetect=d=0.1 -an -f null -`); loudness -14 to -16 LUFS integrated
(`ffmpeg -i r.mp4 -af ebur128=framelog=quiet -f null -`). Read contact sheets at 2 frames a second
(`ffmpeg -i r.mp4 -vf "fps=2,scale=180:-1,tile=10x6" sheet-%02d.jpg`): diagrams should visibly build up from frame to
frame. Then `open_review` with `videoPath`, `wait_for_feedback`, change `edit.json`, captions or visuals, rebuild,
render `draft-02.mp4` and send it with `add_version` and a note. Comments about the cut itself go back to step 2 (new
removals, new edit folder), after which every time in `edit.json` moves through the new `final.edl.json` and the
captions are regenerated.

## Quality bar

- Every explanation is on the board as a diagram that builds with the words: the list item on its step, the node on
  its idea, the card in focus as its principle is named.
- A change every 1–2 s; no speaker-only stretch over ~3 s without a punch-in; the board and full-frame speaker
  alternate.
- It looks designed: one off-white board, white cards, near-black text, one blue, red only for strikes, lime only on
  the number that matters; sans on the board, mono for captions and labels, the handwritten script only on notes and
  the tag; every graphic lands with a spring and a quiet sound.
- The face is never covered: the board stops above the eyes, floating cards stay off it.
- Captions match the words heard, 2–3 words, never stale across a cut; emphasis words in lime.
- Real pictures and real numbers for everything that exists; diagrams only for ideas.
- Speech: no dead air, no doubled phrase, last take of every line, -14 to -16 LUFS; music clearly under the voice.
- `VERIFY.md` lists the beat plan, removed takes with reasons, checks run and anything not verified (e.g. no listening).

## Files in this playbook

- `template/build.py`: builds a Hyperframes `index.html` from `edit.json` + `captions.json` (three layouts, ten
  graphic types, lowercase mono captions, sound effects placed per graphic, theme, deterministic GSAP timeline).
  `python3 build.py --help`.
- `template/edit.example.json`: the starter scene (24.6 s, 8 beats, 9 graphics) to copy from.
- `template/assets/fonts/`: Inter, Geist Mono and Caveat (SIL Open Font License, texts included).
- `scripts/make_starter.py`: placeholder presenter, voice, word times and thumbnails for the starter scene.
- `scripts/prepare_edit.py`: the cut (silence pass, removals, frame-accurate render, retimed transcripts).
- `scripts/make_captions.py`: edited-time words to 2–3 word captions with word times (`captions.json`, `.srt`).
- `scripts/make_sounds.py`: the sound effects and a light plucky music bed, made with NumPy.
- `scripts/check_pacing.py`: changes per second and every hold over 3 s in a plan.
- `references/graphics.md`: every layout and graphic with its fields and geometry, captions, look, motion, sound.
- `references/reference-breakdown.md`: timestamped breakdown of the reference reel and the rules taken from it.
- `references/clean-cuts.md`, `references/transcription.md`: cutting and transcription details.
