# How the reference reel is built

Reference: a 54 s, 9:16 Instagram reel by @justyn.ai (https://www.instagram.com/reel/DeUUFJQu8cw/): "I didn't edit a
single second of this video. Claude did." One person talking to camera in a few rooms, with a motion graphic or a
cut roughly every 1–1.5 s. Use this breakdown to learn the pattern; never copy its footage, its lines or its exact
colours. The playbook's own look is in `references/graphics.md` and differs on purpose.

## Timeline (seconds, what's on screen, what's said)

| Time | Beat or pop-up | On screen | Speech |
| --- | --- | --- | --- |
| 0.0–1.0 | hook, serif card | speaker cut out on deep green; "I DIDN'T" above the head, "EDIT" behind it | "I didn't edit" |
| 1.0–2.0 | hook, sans card + timecode | "A SINGLE / SECOND", then "OF THIS / SECOND", a running timecode under it | "a single second of this" |
| 2.0–3.0 | hook, italic card | "Claude did." in serif italic, "did." in gold | "Claude did." |
| 3.0–5.0 | speaker + icons, strike | hard cut to the room; an editing app's icon lands and is slashed, then a second one | "No CapCut, no Edits app." |
| 5.0–5.5 | speaker + small italic word | "nothing." in serif italic, the icons fall away | "Nothing." |
| 5.5–7.5 | speaker + chat | a prompt box types "I want you to take a pass at editing this." and sends | "One sentence and the whole video is edited." |
| 7.5–8.0 | blur transition | whip blur to a wider angle | "Watch." |
| 8.5–10.5 | speaker + chat | the box types "make it more aesthetic" and shrinks away | "I tell Claude, make it more aesthetic." |
| 11.0–12.5 | speaker + cards | three tilted thumbnails float in at the top | "my best videos float in" |
| 13.5–15.0 | magazine | masthead behind the head, issue line, cover line "The whole video. edited.", barcode | "and the titles look like a magazine cover" |
| 15.0–17.0 | blur, then speaker + screen | a dark editing-timeline window slides in | "And I know nothing about video editing." |
| 17.0–18.0 | drop | the window becomes an empty card and a file chip drops in | "I just drop the raw footage" |
| 18.0–19.5 | pip | a tall clip of a bad take with the chip "1:16 of raw footage" | "with the bad takes still in it" |
| 19.5–20.5 | timer | a flip counter "1:16" → "0:55" | "and a few minutes later" |
| 20.5–22.0 | pip | the finished clip small, shrinking | "get exactly what you're seeing now" |
| 22.5–25.0 | new room + chat | "make it moody"; the colours of the shot go darker | "So I can say make it moody and the colors go dark" |
| 25.5–27.0 | word | "HUGE" in tall serif behind the head | "captions come in huge" |
| 27.5–29.0 | grid | 3×3 grid of other creators' reels, the speaker in one cell | "And lots of people…" |
| 29.0–32.0 | speaker, close | punch-in, no graphics | "but my way is a little different, because before rendering" |
| 32.0–36.0 | screen + focus | a storyboard window slides in, then zooms into one shot's notes | "it gives me a complete storyboard, so I can see what Claude is thinking" |
| 36.5–38.0 | thread | comment rows: a request, then the agent's reply | "and if I want to make any changes, I just explain what I want" |
| 38.5–40.0 | word + lead | "NEVER" behind the head, "open an editing app" above | "I never have to open an editing app." |
| 40.5–41.0 | new angle | hard cut | "Tighter cut." |
| 41.0–43.0 | stack | "BIGGER" sans block + "captions." serif italic block; captions switch to bold caps for a moment | "Bigger captions. That's just one more sentence." |
| 43.5–47.0 | wide shot + screen | a video card "How I edit videos with Claude" cycles its chapters | "I recorded a video walking you through exactly how I do this" |
| 47.0–50.0 | comment | headline "Comment "EDIT" and I'll send you the walkthrough"; "EDIT" typed and posted; heart turns red; reply "Sending it over." | "just drop EDIT in the comments below and I'll send it over" |
| 50.0–54.0 | follow | profile pill, Follow flips to Following, "Daily AI tips" | "make sure to follow me for more daily AI tips" |

## Rules taken from it

- **The hook is all type.** Three headline cards in three seconds, each replacing the last, with the speaker cut out
  in front. The first card runs behind the head, the payoff card is italic with one gold word.
- **A graphic or a cut every 1–1.5 s.** There is no stretch longer than ~2 s without something new, except the
  close-up at 29–32 s, which works because it's the turn in the story ("my way is different").
- **Show the thing as it's said.** App icons when apps are named, the prompt box when a prompt is described, the
  storyboard when the storyboard is described, the raw footage when footage is mentioned.
- **Big words are rare.** Two giant serif words in 54 s ("HUGE", "NEVER"), each on the word that carries the feeling.
- **The UI is simulated but plain.** Rounded paper boxes with soft shadows, small mono labels, a check when done.
- **Captions never stop.** 2–4 words at a time, serif on a small green box, words lighting up as they're spoken.
- **Sound carries the motion.** Every pop-up has a pop, click, whoosh or ding; typing has keyboard sounds; a quiet
  lo-fi beat runs underneath.
- **The CTA is a comment keyword**, shown as a real-looking comment being typed and answered, then a follow prompt.
