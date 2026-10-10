# The song

Condensed from https://claudia.gallery/wiki/song/. The video runs the full length of the song and is timed to it word
by word, so the song comes first, and the song starts from the lyric.

## Lyrics

- The topic is obvious in the first two lines. Name the big moments people actually saw, or tell a story.
- Every reference lands in one listen; obscure studies and insider trivia go into the graphics instead.
- A sequel never reuses the last song's device (no second countdown after "18 months").
- Subtracting beats adding. Never touch a line the user has locked.
- Spoken verse lines: Suno sets each in a two-bar slot, so write natural sentences of 10–13 syllables with the stressed
  words where speech stresses them, and rhyme couplets on the last word. Lines of 5–8 syllables come out choppy.
- Every sung couplet should ring (a rhyme, a slant rhyme or shared vowels within four lines); deadpan spoken lines can
  stay unrhymed. The films scored 75–83 on scansion and 39–55 on assonance; how to score:
  https://claudia.gallery/wiki/toolkit/#2-the-lyric-scorer-scansion-and-assonance. Scores don't replace hearing a take.
- A hook that lands in a stop is syncopated: write the off-beat accent into the sheet and the direction.
- If the film has a sound palette, write the song in its key.

## Suno

Custom mode, v6. ESCAPE VELOCITY's style field:

```
fashion show electroclash techno, 128 BPM, 4/4, dry analog kick, rolling acid bassline, cold detuned synth stabs, sweeping orchestral strings on the builds, deadpan female spoken-word verses, close and dry, clipped and confident, every word crisp and intelligible, euphoric sung female trance chorus with a supersaw lift and big clear vowels, crowd call-and-response shouts, stacked chanted vocals in the drop, a key change up into the last chorus, catwalk energy, cold, luxurious, optimistic, Berlin minimal austerity, clean modern mix
```

Exclude: `rap, rock guitar, lo-fi, male lead vocal, mumbled vocals, big room EDM, dubstep`. CLODYSSEY's and BLISS's
style fields are in the wiki. No brand or artist names in the style field; describe the sound.

- Her voice: deadpan, clipped spoken verses rising into euphoric sung choruses, close and dry, every word crisp.
- Spell numbers and acronyms out ("A G I"); respell names Suno gets wrong ("Dahrio"); section cues in square brackets
  on their own lines (`[Verse 1 - spoken, deadpan]`); parentheses get sung; cues steer the arrangement ("darker, the
  bass drops out").
- Generate many takes, round by round; the user picks by ear. Keep each round's lyric, style and verdict in a takes log.
- Suno has no API and its terms forbid bots: the user presses Create and downloads the WAV (a paid plan allows
  commercial use).

## Listening

Before boarding: stems (htdemucs), a beat map, every word's start and end (forced alignment), a list of hits.

- Suno takes speed up (131.5 → 133.9 BPM in ESCAPE VELOCITY): use a beat map, never a fixed BPM.
- Put the grid on the kick (BLISS's first grid sat on the hi-hats, 0.214 s early).
- Check word times by ear (a delay throw got aligned 2.6 s early).
- Map a new mix through time before swapping it in (an editor export came back re-timed by up to 0.7 s).

## Releasing

Under the user's own name, never as "anabology"; no "feat. Claudia" in the artist field; credit her in the
description ("Claudia is an open character by anabology (claudia.gallery)"); say what's AI-made; don't re-release the
films' songs or stems.
