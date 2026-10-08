# How the reference reel is built

Reference: a 68 s, 1080×1920, 60 fps Instagram reel by Ole Lehmann (@itsolelehmann), posted 21 Sep 2026:
"you can now use AI to build your own hardware product for $250" (https://www.instagram.com/p/Ddjx8SLocgR/).
A how-to in five steps, talking to camera, with the layout changing about every 3 seconds. Use this breakdown to
learn the pattern; never copy its footage, title text or exact colors. The playbook's own look (background, cards,
captions) is in `references/layouts.md` and deliberately differs from the reel's.

## Timeline (seconds, layout, what is said)

| Time | Layout | Top / background | Speech |
| --- | --- | --- | --- |
| 0.0–3.9 | split + title | gradient, 3-line headline + "(in 5 steps for $250)"; product cut-outs pop in around the speaker at ~1.9 s | the promise |
| 3.9–6.4 | speaker, punched in | – | "This used to take an engineer and tens of thousands of dollars" |
| 6.4–9.0 | split | gradient, app logo with lines drawing out to a list | "but now it's a 5 step playbook that anyone can follow" |
| 9.0–11.1 | split + roadmap | all five steps blur in, step 1 boxed | "One. Describe the idea to ChatGPT" |
| 11.1–13.3 | visual + cut-out | the app's website | "Connect it to Blender or FreeCAD" |
| 13.3–15.7 | visual + cut-out | 3D viewport, two shots | "so ChatGPT can use these 3D apps to create the model" |
| 15.7–18.3 | speaker, punched in | – | "The $20 ChatGPT sub is enough to start" |
| 18.3–20.7 | split + roadmap | step 2 boxed | "Two. Upload the file to this site, jlc3dp.com" |
| 20.7–24.8 | split | website screenshot, slow scroll | "a Chinese factory site, they print it and mail you the thing for $20" |
| 24.8–26.9 | speaker | – | "That's your outside, the case of your product" |
| 26.9–29.5 | split + roadmap | step 3 boxed | "Three. Now the inside" |
| 29.5–32.3 | split | photo of a circuit board | "If it needs wifi or a brain, add an ESP32" |
| 32.3–37.1 | split | product photo on white | "a $5 chip the size of a stamp, inside half the gadgets you own" |
| 37.1–39.6 | visual + cut-out | stock footage of code | "ChatGPT writes the code that runs on it" |
| 39.6–42.2 | split + roadmap | step 4 boxed | "Four. The chip needs a circuit board" |
| 42.2–47.0 | visual + cut-out | the app's website | "Flux, a $20 AI app, draws that from a simple text description" |
| 47.0–51.9 | split | website screenshot | "you get the board made on jlcpcb.com, the same factory's site for electronics" |
| 51.9–57.1 | speaker (two framings) | – | "You upload the file, they build the board and solder the chip on, about $100 for a small batch" |
| 57.1–60.0 | visual + cut-out | footage of hands putting a board into a case | "That board goes inside your case, and you have a working prototype" |
| 60.0–63.4 | split + roadmap | all five steps (recap) | "Five. Use it for a week, fix what annoys you" |
| 63.4–68.2 | speaker | – | the call to action ("comment prototype and I'll send it over") |

21 layout segments in 68 s: average 3.2 s, shortest ~0.8 s (a shot change inside one layout), longest ~5 s. Scene
detection finds 23 hard cuts (one every ~2.8 s), and most segments also move inside (a second shot, a reframe, a
scroll, footage). About 45% of the time is split screen, 30% the speaker alone, 25% a full visual with the speaker
cut out.

This playbook keeps the reference's layouts and switching rules but cuts faster by default: a change every
1.5–2.5 s and nothing static for more than ~2.5 s (`references/layouts.md`, "Pacing").

## What it does

- **Layouts:** four (split, speaker, visual with cut-out, plus the split variants title and roadmap). Every change
  is a hard cut on the first word of the phrase that motivates it. No slides, wipes or zooms between layouts.
- **Motion inside a layout:** the gradient drifts slowly; roadmap lines blur in one after another; stickers pop in
  with a small overshoot; screenshots scroll slowly; footage moves on its own. Nothing else animates.
- **Roadmap card:** the five steps stacked and centred on the gradient. The current step sits in a thin, light,
  rounded outline box; the other steps are blurred and dimmed. It returns at every "One... Two... Three..." and as a
  recap at the end, so the viewer always knows where they are.
- **Speaker:** in split screens a head-and-shoulders crop in the lower half; alone, often punched in (~1.3×) so the
  face fills the frame, alternating with a wider framing; in full visuals cut out from the room (no box, no border),
  about 60% of the frame wide, standing at the bottom centre with the head around y≈1250.
- **Captions:** one to three words, lowercase as spoken, no punctuation; white semibold sans (~44 px) on a small,
  rounded, dark translucent pill. On the seam (y≈960) in split screens; at chest height (y≈1150–1215) when the
  speaker is alone; just above the cut-out's head in full visuals. No word highlight, no animation.
- **Title:** heavy, uppercase, cream-yellow with a dark drop shadow, three lines, plus a small parenthetical with
  the numbers. On screen from the first frame.
- **Pace:** dead air is gone completely; the voice runs continuously. A quiet bed seems to sit under the voice (the
  gaps between words never fall below about -36 dB); unconfirmed.

## Rules it follows (and this playbook uses)

1. A new step is announced → roadmap card, current step highlighted, 2–3 s.
2. A concrete, nameable thing (a website, a product, a part, an app) → split screen with exactly that thing on top,
   held while it's described.
3. A process, or a tool doing something → full-bleed visual (screen recording or footage in motion) with the
   speaker cut out at the bottom.
4. A claim, a number, an opinion, a joke, the payoff, the call to action → the speaker alone, punched in when it
   needs weight.
5. Nothing holds longer than ~5 s in the reference (this playbook: ~2.5 s unless something moves); two speaker-alone
   beats in a row alternate between punched-in and wide; the same visual is never shown twice in a row.
6. Open on split + title (the promise) from frame 0. End on the roadmap recap, then the speaker alone for the CTA.
