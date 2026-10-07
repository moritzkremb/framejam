# Writing the song

Only when the user doesn't bring a song. The lyrics are the script: every line becomes a shot, a hero word and often
an annotation, so write them with the screen in mind.

## Research the timeline first

List 25-40 phrases the audience already repeats about the topic (for AI: "feel the AGI", "permanent underclass",
"it's so over / we're so back", "you're absolutely right", "usage limit", "p(doom)", "slop"). For each: who said it
first or made it famous, and a source link, in `analysis/references.md`. These become lines, looks, ticker items and
the citations in the annotations. Use the web if the runtime can; quote only what you can source.

The topic doesn't have to be AI. The same method works for any scene with shared slang: crypto, startups, fashion
week, a sport, a fandom, the user's own company (internal jokes, product names, launch dates).

## Structure (~2:20-3:00 for X; the reference ran 5:06)

```
[Intro]      the premise as one spoken or sung sentence (it becomes the hook card)
[Verse 1]    4-8 short lines, one reference each, call-and-response welcome
[Pre-Chorus] 2-4 lines that build the counter ("18 months", "T-minus")
[Chorus]     the title phrase as the hook, repeated; 4 lines max
[Verse 2]    new references, darker or funnier
[Chorus]
[Bridge]     spoken / whispered, slower; the counter runs out
[Chorus]     last chorus, the hook's meaning flips (so over → so back)
[Outro]      one line, the signature image
```

- Lines short enough to read in 1-2 s (3-7 words). Spell acronyms with spaces for the singer ("A G I"), respell names
  phonetically, keep the screen text spelled normally in `lyrics.txt`.
- One rhyme family per section keeps it catchy; slang carries the jokes.
- Pick the device (fashion show, keynote, countdown…) now and name the looks or chapters in the lyrics or the overlay.

## Generator prompt

Style field: genre, BPM, voice, production, e.g. "glossy synth-pop, hyperpop drums, 136 BPM, breathy female lead,
gang vocals on the hook, vocoder ad-libs, big sidechained chorus". Put section tags in the lyrics (`[Chorus]`,
`[Spoken]`, `[Gang vocals]`). Generate at least two takes and keep them in `audio/takes/`.
