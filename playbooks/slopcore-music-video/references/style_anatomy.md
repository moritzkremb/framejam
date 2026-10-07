# Style anatomy: what makes a slopcore music video

Measured on @anabology's "Slopcore: Escape Velocity" (https://x.com/anabology/status/2103534482930491441, 5:06,
1920×1080, 24 fps, Suno song at ~136 BPM, Midjourney imagery from a moodboard, built by Claude Opus 5.5 overnight from
one long prompt) and on the video it answered, @donaldjewkes' "Upping my p(doom)" (2:21, 30 fps, ~144 BPM, papery
anime pop art). Same method, two very different looks; both read as one genre.

"Slopcore" is the joke and the point: openly AI-made, openly about AI, so dense with real references that it rewards
pausing. It isn't slop because every frame has a reason and every line is annotated.

## 1. The premise: a frame device that turns the song into a show

Pick one device that gives every shot a role and a number. Escape Velocity is a **fashion collection**: "ESCAPE
VELOCITY · SS27", 11 looks, a runway, a front row. Each look is a tech-timeline joke dressed as a garment:

- "Look 01. AGI" · "Look 02. 13 Mac minis" · "Look 03. Dad cap. USAGE LIMIT" · "Look 04. Shoes off in North Beach"
- "Look 08. Hugging-face pin" · "Look 10. Staff badge, empty seat" · "Look 06." with a podcast mic

Other devices that work the same way: a product launch keynote (slide numbers), a countdown to a deadline, a court
case (exhibits), a weather report, a training run (steps, loss), a trading floor, a museum audio guide, a lab notebook.
The device supplies the counter, the vocabulary of the labels and the props in the images.

## 2. The spine: a counter that escalates

A persistent HUD counter carries the story arc while the song repeats: "24 MONTHS TO ESCAPE THE PERMANENT UNDERCLASS"
in the hook, then "18 MONTHS TO ESCAPE" in the corner for most of the song, a split-flap "YOU HAVE 06 MONTHS" in the
bridge, "T-3 … T-1", and finally "THERE IS NO UNDERCLASS" / "END OF SHOW". In p(doom): a "p(doom)" sticker climbs
8 % → 30 % → 81 % → 99.9 % across the song. One number, one direction, paid off at the end.

## 3. The muse: one generated protagonist, held in every shot

- One recurring character in most shots, identity locked by the moodboard and a reference sheet: Escape Velocity's is a
  model with a dark choppy bob, white puff-sleeve blouse, black harness straps, black mini skirt, knee boots, and one
  **signature accent** (an orange eight-point star hair clip) that returns as the final macro shot.
- p(doom)'s muse is a personified Claude: a sunflower-petal orange afro, headset mic, a star, backed by a K-pop
  line-up of "backup dancers" in matching colours.
- Close-ups sing (mouth open on the vocal, headset mic); wides walk, pose, fall, sit; inserts carry no character
  (a billboard, a crowd with raised phones, server racks, a highway in fog, a dog with a robot vacuum).

## 4. The imagery

Escape Velocity: 35 mm fashion editorial and music-video stills turned into short clips. Soft, grainy, slightly
smeared motion (low-res video model output upscaled), flash, practical lights, wet floors, haze. Locations: night
underpass, subway platform, server hall, runway with a crowd, foggy motorway under sign gantries, private jet, white
infinity studio, laundry room. Every location is a joke prop for its lyric (a blank billboard for "this is not an AI
billboard", a jet for "escape velocity").

Palette by act (the colour changes are the act breaks):
1. Night: blue-black, red signal lights, cold fluorescent.
2. Tungsten: amber/orange rooms, stage haze, crowd glow.
3. Fog white: overcast motorway, pale grey, washed daylight.
4. Studio white: high-key white cyc, crisp, the clean finale.
One accent survives every act: signal orange (≈ #E8743B), shared by the hair clip, the countdown digits, the
highlighted lyric word, stamps and chart lines.

p(doom) instead: risograph/paper print, halftone and misregistration, pastel pink, orange, navy, mustard and teal,
sunburst rays, everything drawn as if on newsprint.

## 5. The overlay layer (code, never generated)

The generated footage is soft; the overlay is pin-sharp. That contrast IS the look. Elements, all thin and small,
laid out like a technical drawing (specs in `overlay_system.md`):

- **Frame HUD:** a hairline inset border, corner brackets, tiny mono labels in every corner ("LOOK 06 / 11",
  "ESCAPE VELOCITY · SS27", line number + timecode "L19 · 01:27:17", running timecode), a mini audio meter.
- **Ticker:** a full-width bottom strip scrolling timeline news as a stock ticker: "TOKENS BURNED 275,335,000 ▲ ·
  MAC MINIS 13 · UNDERCLASS −38 MO · NVDA ▲ 5.3 % · CONTEXT 1,110,443 TOK".
- **Annotations:** every lyric with a reference gets a citation, like a data label: for "Feel the AGI" a seismograph
  ("SEISMOGRAPH · AGI · FELT INTENSITY", "M 9.0 'A MAGNITUDE 9 EARTHQUAKE' – KARPATHY", "'FEEL THE AGI' – ILYA").
  p(doom) cites papers ("Sparks of Artificial General Intelligence: Early experiments with GPT-4").
- **Artifacts:** physical-feeling paper objects that carry a joke: price tags and receipts with barcodes ("PHONES DOWN.
  TOKENS UP."), garment care labels ("SHELL: 100 % optimism. Wash cold. Do not iron. Do not nerf."), luggage tickets,
  ID badges, stamps ("NOT OURS", "RETIRED"), checklists.
- **Data viz:** line charts ("VIBES · SF · 2019–NOW", a sine between SO BACK and SO OVER), gauges, speedometers,
  split-flap boards, big flip-clock digits ("18"), progress bars, scatter fields. Animated: lines draw on, numbers
  count, flaps flip.
- **Tracking:** brackets and leader lines locked to the muse's face or a prop, with a tiny label ("FACE · SINGING").

## 6. Lyrics on screen

Two registers, always both:
- **Subtitle line:** every sung line, bottom-left, white grotesk (Helvetica/Inter-like) at ~36 px, the current word
  turns signal orange (karaoke), the line clears on the next line. Ad-libs in brackets "(It's so over?)".
- **Hero words:** 1-2 words per line slam big (160-260 px): condensed sans in cream ("AGI,"), grotesk bold
  ("AGENTS." with an orange rule), letter-spaced mono ("ESCAPE VELOCITY"), or a black condensed word in a white box
  ("BACK!", "NERF."). Hero words sit in the negative space the image left for them, opposite the muse.
- Hook (first 3 s): the premise as a full sentence, big, letter-spaced, over a close-up: "24 MONTHS TO ESCAPE THE
  PERMANENT UNDERCLASS". It must read with the sound off.

## 7. Edit rhythm

- Median shot 1.8 s in Escape Velocity (about one bar at 136 BPM; mean 2.2 s, 132 cuts in 5 min). 1.2 s median in
  p(doom). Cuts follow the sung lines (a new image with each line, arriving on the pickup) more than the drum grid:
  only ~45 % sit within 80 ms of a beat. Overlays, not cuts, hit the beats.
- Flurries: 3-6 cuts of 0.1-0.3 s on a drum fill or a hook word, then a held shot.
- Holds: the slow parts (bridge, outro) hold 3-6 s with the overlay doing the moving (a chart drawing, a ticker).
- Camera inside a shot: slow push or drift from the video model; no added digital zooms.

## 8. Song and words

- Lyrics are a collage of the current AI timeline: the phrases people already repeat ("permanent underclass", "feel
  the AGI", "it's so over / we're so back", "slopocalypse", "usage limit", "stop hiring humans", "escape velocity",
  "p(doom)", "FOOM", "you're absolutely right"). Each line is a reference somebody in the audience recognises, which is
  why the annotations work.
- Catchy, simple pop structure: hook, verse, pre, chorus ×3 with the hook phrase as the chorus title; a spoken or
  whispered bridge; a final chorus that changes the counter's meaning.
- Female lead pop vocal, synth-pop / hyperpop / K-pop-adjacent production in both references.

## 9. The ending

Close on the signature accent (the hair-clip star in macro, the sunflower drawn by hand), the counter's final state,
and a one-line credit in the overlay's voice ("drawn by Claude Opus 5.5", "made with Midjourney").

## 10. What the agent did (from the source thread)

donald's prompt (posted in his thread) asked Claude to: study the reference video and other music videos (K-pop for
attention management), audit the timeline memes, design a protagonist and a style that suits the available image
models, make character sheets, supporting characters and sets, generate image-to-video clips per lyric scene with
verification loops for timing, build JavaScript overlay animations with big lyrics where the background is quiet,
vary lyrics between subtitles and giant type, front-load the hook, then watch the whole video repeatedly and fix what
isn't at the bar. @anabology ran the same prompt with Midjourney (through the browser) and a moodboard. A reply
estimates ~$100 per video, almost all of it video generation.
