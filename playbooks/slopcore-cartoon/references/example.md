# The example: "So Over (We're So Back)"

2:38, 16:9, a 22-year-old's first job hunt in the AI economy. 22 stills (GPT Image, about $5), a song generated
locally with ACE-Step (free), word times from Whisper, one Hyperframes composition built by a script from the word
times. Use it as a reference for density and devices, not as a template to copy.

## The style block (pasted first in every image prompt)

```
STYLE: bold flat 2000s TV cartoon illustration in the spirit of early-2000s Cartoon Network and Y2K sticker art,
thick confident black ink outlines, flat colour fills with one hard cel-shadow tone, subtle risograph grain and paper
texture, printed on warm off-white paper. Strict limited palette: cream paper #F4EFE3, ink black #151515, electric
lime #C8FF3A, bubblegum hot pink #FF4FA8, cobalt blue #2A45FF, tiny accents of tangerine #FF8A1F. Graphic, funny,
expressive poses, clean shapes, generous negative space. No gradients, no 3D render, no photorealism, no Pixar look.
Absolutely no text, letters, words or logos anywhere in the image.
```

## The cast

```
JUNI: a 22-year-old Gen Z woman, big expressive eyes with heavy half-lidded deadpan 'Gen Z stare' lids, freckles,
chunky electric-lime bob haircut with blunt bangs and two small pink hair clips, oversized cobalt-blue hoodie with a
small pink smiley-face patch on the chest, baggy black cargo pants, chunky white sneakers, wired white earbuds.

CHATTY: a small round glossy hot-pink AI chatbot blob mascot shaped like a speech bubble with a little tail, two
black dot eyes and an enormous sycophantic grin, tiny stubby arms, floating.
```

The first image is a model sheet (Juni three times plus four expressions, Chatty twice); every later still with a
character uses it as the reference image.

## A shot prompt (after the style and cast blocks)

```
SCENE: Medium close-up of JUNI on the right half of the frame, waving one hand lazily at the viewer with a completely
deadpan Gen Z stare, holding an iced matcha latte in the other hand. Background: flat cream paper with a subtle cobalt
halftone dot pattern. Left half of the frame is empty cream space.
```

Each shot names the joke prop for its line: the diploma is a giant PDF icon, the textbooks are under a tiny robot in a
graduation cap, the cover letters fly out of a chatbot.

## The song

Lyrics as a story (intro "Hi, I'm twenty-two / And my first job got automated before I even got it", verse, pre-chorus
"Mom said learn to code / Now the code can code itself", chorus "It's so over, we're so back / Entry level needs ten
years and a jetpack"). Generator prompt:

```
Bubblegum hyperpop meets K-pop girl group anthem. Bright glossy supersaw synths, punchy 808 bass, snappy claps,
sparkly bell hooks. Playful, sassy, ironic young female lead vocal with crisp clear English diction, deadpan spoken
intro, catchy chant chorus with gang vocals, glitchy half-time bridge, huge final chorus, soft music-box outro. Fun,
energetic, TikTok-ready, polished modern pop production.
```

## The build

- **Cuts:** one still per line, snapped to the half-beat at or just before the line's first word. Camera per shot:
  push, pull, pan left or right, tilt up or down; choruses add a small bump on the beat. Some shots sit as a tilted
  card on a coloured ground; type-only shots (a pink, cobalt or lime ground with big words) mark the chorus entries.
- **Lyrics:** a subtitle tag (Inter 800, 40 px, slightly rotated) for every line; on hooks, big "slam" words in Bagel
  Fat One with a thick ink outline and a hand-drawn boil filter ("LEARN TO CODE", "VIBE CODED", "3 MONTHS").
- **Explaining graphics:** a red rubber stamp in Space Mono with a multiply blend ("AUTOMATED", "100% BOTS", "BY Q3"),
  a counter card ("cover letters sent: 0 → 300, written by: 🤖"), a users counter, a progress bar ("escape progress 3%"),
  job posts.
- **HUD:** two corner cards for the whole video: "P(HIRED) 12.0%" on the left (falls through the song) and a recording
  dot with "DAY 001 OF JOB HUNT" on the right (counts up).
- **Palette in code:** the same six colours as the style block, as CSS variables.
- **Fonts:** Bagel Fat One (punch words), Permanent Marker (notes), Space Mono (stamps, HUD), Inter 800 (subtitles).
