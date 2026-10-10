# The lead, the plates and the moving shots

Condensed from https://claudia.gallery/wiki/consistency/, /midjourney/ and /seedance/. Every prompt the three films ran
is in the gallery (search it with the Claudia MCP server or `scripts/claudia.py` from its skill).

## The lead: identity is text

The films held one person across 1,595 Midjourney images and ~200 clips with no character reference, trained model or
face swap: one paragraph of identity text, pasted word for word into every prompt.

Claudia, close and medium shots:

```
a 28-year-old Caucasian American woman with a grown-up angular face, defined cheekbones and a strong jawline, pale skin and light freckles, a glossy black blunt jaw-length bob with heavy straight bangs and one clay-orange streak through the bangs, a small flat clay-orange eight-pointed star hair clip, a thin headset microphone at her cheek
```

Full length and wider (the full text makes Midjourney crop in to her face):

```
a Caucasian American woman in her late twenties with pale skin and a glossy black blunt bob with heavy straight bangs and one clay-orange streak, a thin headset microphone
```

ESCAPE VELOCITY's look ("Look 00"): `a white cropped puff-sleeve shirt, a black pleated coated-nylon skirt with a
harness belt and a hanging white garment tag with a barcode, black knee-high boots`. Every other look is on the
gallery's character page.

Rules (they hold for the user's own lead too; write theirs the same way):
1. Never paraphrase the identity text. No face images as references (they over-condition: a close-up-sized head on a
   distant figure).
2. One accent streak on her right side, the star clip on her left, the mic. No other accent colour on her.
3. A grown woman in her late twenties: state the age, never write "young" (Midjourney drifts her to a teenage face).
   Reject any image where she reads under ~25. Keep the ethnicity in the text (without it, it changed shot to shot).
4. The head never changes; the clothes change per world. Describe garments, never designers or celebrities.
5. Every prompt ends "no text, no letters, no logos": all type is drawn in code.
6. Fix the source, not the frame: re-roll, or correct with an image-edit model (the plate as the first reference, the
   prompt listing what must stay), then re-make everything built on it. Never paint by hand.
7. Crowds: the set and her alone in Midjourney, other people added with an edit model.
8. Check every plate before a video is made from it: one streak, the clip, the mic, an adult face, natural anatomy,
   no text. Reject only unmistakable failures; keep bold poses.

Never: a second streak, logos or text on her clothes (the garment tag is the exception), an influencer smile,
anything that reads under-age or sexualised, generic mall Y2K, Midjourney lettering.

## Plates in Midjourney

- Midjourney v8.2, `--raw --hd`. `--ar 16:9` for plates, `2:3` full length, `4:5` inserts, `1:1` tiles. Prompts under
  ~800 characters (past that, Midjourney rewrites them). No style or character references.
- Midjourney has no API and its terms don't allow automating the website: write a numbered prompt sheet; the user runs
  it and saves the picks.
- **The order:** framing → identity text → wardrobe → what she does and where she is in the frame → empty space for
  type ("the upper third empty fog") → the style family → "no text, no letters, no logos".
- **Style families** keep 100+ plates in one world. ESCAPE VELOCITY: `blue-black #0f1216 and steel blue, one small red
  lamp as the only warm note, fine silver-gelatin grain, cinematic 35mm film still`. CLODYSSEY: one light state per
  chapter (`night, moonlight on a black-teal sea, silver spray, cinematic 35mm film still, anamorphic, fine grain`).
  BLISS opens every prompt with `Y2K high fashion editorial, a 2001 couture magazine story:`.
- **Picking:** batches of four; numbered contact sheets; one image per shot (the other three are a free pool for
  neighbours); never two clips from the same frame; look at faces large.
- **The real thing where it counts:** BLISS used the real Bliss photograph and the real XP sounds. Midjourney is for
  what doesn't already exist. Keep brand words out of prompts ("Windows" summons logos and garbled UI).
- Midjourney Animate is for volume over precision; her face and body, when they must be right, go to Seedance.

Example (CLODYSSEY, as it ran):

```
medium close-up of a Caucasian American woman in her mid-twenties with pale skin and light freckles, a glossy black blunt jaw-length bob with heavy straight bangs and one clay-orange streak through the bangs, a small flat clay-orange eight-pointed star hair clip, a thin headset microphone at her cheek, wearing a structured high-neck pearl-white couture gown with long sleeves, its sculpted ruffles rising around her like breaking sea foam, hair damp from the spray, composed and deadpan, sitting on a black wet rock, turning her face to the lens, sea spray behind her, empty dark sea on the left, night, moonlight on a black-teal sea, silver spray, cinematic 35mm film still, anamorphic, fine grain, no text, no letters, no logos
```

## Moving shots in Seedance 2.5

| Kind | Inputs | For |
|---|---|---|
| Plate shot | her plate as first frame, the song (instrumental works best) for rhythm | she walks, turns, reaches, reacts |
| Singing window | her plate, a clean vocal of only her words in the window | lip sync, 4–8 s, one phrase |
| Green-screen performance | a plate of her on chroma green | cut-outs |
| Cover | the last in-sync frame of another take | the rest of a line after a take drifts |
| Extension | a real clip as video reference | joining generated shots to real footage |

**Write motion prompts like a script** (one writer, one context, read before spending): the story beat in one sentence,
blocking at 0.0 s, timestamped beats of action and reaction on the song's hits, she always does something, the camera
tied to hits with a start, direction and end, mouth rules. Finish the whole prompt book, then a three-clip pilot.

**The structure Seedance follows best**, as labelled sections in this order: Audio Policy (top and bottom) · Generation
Goal · Reference Asset Roles (`Use @Image1 as the first frame.` as its own sentence) · Subject (the identity text and
"Only one Claudia appears.") · Timeline in whole seconds · Camera · Core Requirements · Final Acceptance Criteria.
Duration, resolution and aspect go in the API request, never the prompt.

**A singing window** (`@Image1` the plate as PNG at output size, `@Audio1` the vocal stem with everything outside her
words muted, mono, normalised, starting 0.3–0.7 s before the first word, never ending inside a word):

```
【Audio Policy】 The output soundtrack is @Audio1 itself: copy @Audio1 sample for sample from the first frame to the last, with the same timing, pitch and level. Do not re-sing, re-voice or re-generate it. Do not add music, background music, score, instrumental, melody, synth, pad, drone, riser, extra vocals, harmonies, ad-libs, narration or sound effects.
【Generation Goal】 @Image1 sings @Audio1: <who, where, which moment; the performance in one sentence>.
【Reference Asset Roles】 Use @Image1 as the first frame. This first frame defines Claudia's appearance and wardrobe, her pose, the set, the light and the camera direction. @Audio1 is Claudia's own singing voice and the complete soundtrack of this video. Her mouth follows @Audio1 exactly.
【Subject】 Claudia: <short identity text>, <the look as in @Image1>. Only one Claudia appears.
【Performance Timeline】 0-1s: @Audio1 is silent, then her voice begins; <action>. 1-2s: in @Audio1 she sings "<exact words>"; her lips form each of those words exactly when it sounds in @Audio1; <action>. …
【Camera】 <shot size, angle, movement, start, direction, end>.
【Core Requirements】 1. Lip-sync word by word to @Audio1 … 2. Her voice is @Audio1 and nothing else … 3. Head and shoulders move with the rhythm … 4. Identity, streak, clip, mic and wardrobe exactly as in @Image1 … 5. Natural anatomy, five fingers … 6. No on-screen text.
【Final Acceptance Criteria】 The soundtrack is @Audio1 unchanged; lips match word by word; one Claudia, on model; no on-screen text.
【Audio Policy】 (repeat)
```

- Lyrics in plain quotes, as what the audio contains (the brace form makes it re-sing).
- One phrase per window. Short singing prompts copy, long ones re-sing: keep a window's prompt to ~90 words (the words
  quoted, one line of framing and light, at most two timed beats); screenplays are for motion clips.
- Keep her mouth clear on the plate (a mic at her lips held one window to 26% in sync).
- **A motion clip:** the same order; `@Audio1` is the song for rhythm only ("the output audio is @Audio1 unchanged"),
  she doesn't sing or speak, the timeline in bars naming what her body does on the beat.

**Lip sync, measured.** Seedance copies the reference audio into its own soundtrack and the mouth follows that
soundtrack. So compare each take's soundtrack with the real vocal (spectral match over time), keep the take up to the
last eighth note before they diverge (it also gives the lag; Seedance tends to drop ~0.3 s of leading silence), cover
the rest with a new clip from the frame at the cut starting in the word gap, and after three failures make it a
cutaway. The bar is "most lips", like a pop video: ~86% of sung seconds held in ESCAPE VELOCITY. No lip-sync models
(Sync, LatentSync, Wav2Lip): the mouths come out forced. Full spec with constants:
https://claudia.gallery/wiki/toolkit/#15-the-sync-check-the-spectrogram-comparison.

**Inputs and providers:** colour in, look in post (pre-graded grey references came back grey); downscale stills to the
output size and send PNG; distinct first frames; 480p drafts first where the provider allows. On OpenRouter a first
frame drops the audio: singing windows go in reference mode (the plate as `@Image1`, the window as `@Audio1` by HTTPS
URL); Higgsfield keeps audio with a start image. Face filters decline some close-ups: a decline is free and final on
that service, never alter the image to pass it; try the other provider. Silent input filters: reword plainly.

Costs measured: ESCAPE VELOCITY 47 clips + 30 continuations, 421 s at 720p, ~$93; CLODYSSEY 101 clips, 189 takes,
~$107 + 2,436 Higgsfield credits; BLISS 50 clips, 267 s, $182 list.
