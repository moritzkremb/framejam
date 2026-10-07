# Generation: moodboard, muse, stills, clips, song

Each step has a contract (the files the next step needs). Any tool that meets it is fine. Prefer what the user already
has; stop before the first paid generation unless the user set a budget, and keep a ledger (`analysis/ledger.md`:
tool, item, count, unit price, total) as you go.

Model features and limits change often. Check the tool's current docs before writing parameters into prompts.

## 1. Moodboard

**Contract:** 12-30 reference images in `moodboard/` plus `moodboard/README.md` (where each came from, and the 5-8
adjectives that describe the board).

- The user's own board wins (a folder, a Pinterest/Are.na/Cosmos board they export, screenshots). Ask for it once.
- Otherwise build one from the premise: 3-4 images per act (location, light, wardrobe, colour), 4-6 for the muse's
  look (hair, silhouette, signature accent), 2-3 for texture (grain, print, halftone). Use images the user owns or
  that are licensed for reference; the board steers the model, it never appears in the video.
- In Midjourney, a moodboard is a personalization profile: create it on the website from these images and use its
  code with `--profile` (or `--p`). In other tools, pass 3-6 board images as style references per generation
  (Midjourney `--sref`, Higgsfield/Nano Banana/GPT Image reference images).
- Write `STYLE.md` from the board: premise, muse, acts with palette and light, accent colour, overlay fonts, bans.

## 2. Muse sheet

**Contract:** `assets/refs/muse_sheet.png` (16:9: front, 3/4, profile, full body, 3 expressions, the signature
accent in close-up) and one or two clean crops (`assets/refs/muse_face.png`, `assets/refs/muse_full.png`).

- Fictional person by default. A real person only from their own photos with their consent (often the user). Never a
  celebrity or a recognisable public figure.
- Lock 4 traits in words and repeat them in every prompt: hair, one garment, one silhouette detail, one accent object
  ("dark choppy bob with a short fringe, white puff-sleeve blouse, black leather harness straps, an orange eight-point
  star hair clip").
- Consistency tools: Midjourney Omni Reference (`--oref <muse crop> --ow 100-400`), Higgsfield Soul ID (train on the
  sheet), Nano Banana / GPT Image with the crop as an input image. Generate 4, keep the most on-model, regenerate drift.

## 3. Stills (one per shot)

**Contract:** `assets/stills/sNNN_<desc>.jpg` named by shot id from `analysis/shots.json`, 16:9, ≥ 1456×816,
no text, no logos, no UI, negative space where that shot's hero word goes.

Prompt template (adapt the wording to the tool):

```
<shot type: extreme close-up / medium / full body / wide> of <muse traits>, <action that carries the lyric's joke>,
in <location of this act>, <light of this act>, 35mm fashion editorial photo, film grain, shallow depth of field,
<negative space: "subject on the right third, empty dark wall on the left">, no text, no logos
--ar 16:9 --profile <moodboard code> --oref <muse crop> --ow 200 --raw
```

- One image per shot; for a 2:30 song that's ~70-90 shots, but reuse is normal: a close-up singing still can serve
  several chorus shots with different crops and overlays. Plan 40-60 unique stills.
- Inserts without the muse (crowd, billboard, server hall, product-like props) come from the same board so the
  palette holds.
- Props that refer to real products must be generic (no logos, no real brand marks); the overlay names them in text.
- Check every still at full size: extra fingers, garbled text on signs, a logo on a garment, a second muse, the
  accent missing. Regenerate or crop.

**Midjourney has no public API**, and its terms don't allow automated access to the website. So with Midjourney the
user runs the prompts: write `analysis/prompts.md` (one numbered prompt per still, ready to paste), the user pastes
them on midjourney.com and saves the picks into `assets/stills/` with the shot ids as names. Tools with an API or an
MCP connector (Higgsfield, GPT Image, Nano Banana / Gemini, Flux on fal or Replicate) can be run by the agent within
the budget.

## 4. Clips (stills that move)

**Contract:** `assets/clips/sNNN_<desc>.mp4`, the still animated, no audio needed, ≥ 3 s, 16:9.

- Image-to-video from the approved still so the look holds: Midjourney Video (the Animate button on an image, run by
  the user), Seedance, Kling, Veo, Hailuo, Runway, Higgsfield's video models.
- One action per clip, one slow camera move, everything else still: "she walks toward camera, hair moving, slow dolly
  back", "she sings with eyes closed, head tilting back, handheld drift", "crowd raises phones, haze drifts".
- Singing close-ups: generic mouth movement reads fine at 1-2 s per shot. For real lip-sync, use a model that takes
  an audio input (e.g. Seedance with a vocal slice): cut the isolated vocal for that shot from
  `stems/htdemucs/master/vocals.wav` with 0.5 s handles, never upload the full song, then check the mouth against the
  word times in the base edit.
- Generate ~4-6 s, use the best 1-2 s (`in` in `shots.json`). Soft, low-res output is fine: the base edit scales it,
  the grain hides it, and the sharp overlay on top is the point.
- Zero-budget route: no clips. `base_edit.py` gives each still a slow push-in, and the overlay carries the motion.
  Say so plainly: it looks like a lyric video with a photo shoot, not a music video.
- Budget: a reply in the source thread put the whole video at about $100, almost all video generation. Price one
  clip, multiply by the planned count, and get the user's OK before the first batch.

## 5. Song

**Contract:** `audio/master.mp3` (or .wav), the lyrics as sung in `analysis/lyrics.txt` with `# section:` headers.

- The user's own song or a licensed track wins; its lyrics win over any transcript.
- Otherwise write it (see `song.md`) and generate 2+ takes with the user's music tool: Suno (custom mode: lyrics,
  style, exclude), ElevenLabs Music, Udio. Use a plan whose terms allow the intended use (posting, commercial).
- Pick the take whose transcript has every line in order. You can't hear it; the user judges the sound.
