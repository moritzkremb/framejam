# The method: scale, reviews, spending

Condensed from the Claudia wiki (https://claudia.gallery/wiki/start/ and /pipeline/), the making-of anabology and
Claude published for ESCAPE VELOCITY, CLODYSSEY and BLISS. Read the wiki for everything here in full.

## Two roles

- **The director** is the user: taste, money and a few decisions, in very few words (ESCAPE VELOCITY took about 50
  notes, BLISS 21).
- **The production** is you (and any subagents): research, lyrics, board, every prompt, every script, the edit and
  every frame of motion design.
- At a review, show one artefact and ask one question with a default ("Which take? Default: 2."). Between reviews,
  ping the user only when a paid service fails, a step needs a person (a captcha, a sign-in, a Midjourney batch, a
  Suno download), or a decision is theirs (taste, money, a real person's likeness). Send pictures, not descriptions.

## Pick a scale

| | Quick | Studio | Full |
|---|---|---|---|
| Needs | an agent, an image model, the user's song or a generated one | + Midjourney, Suno, Seedance 2.5 credits | + agent capacity for multi-agent runs over a day or two |
| Song | the user's upload, or a short generated song | Suno, round by round | Suno, with a lyric loop scored for scansion and assonance |
| Stills | an image API | Midjourney | Midjourney |
| Motion | 2.5D plates, a few cheap clips | sung clips with measured lip sync, covers | chains of sung clips, scripted motion clips, covers |
| Board | ~14 shots a minute | ~20 a minute | ~27 a minute; several boards judged and merged |
| Motion design | a default renderer driven by data | the default plus one graphic per line | bespoke code per chapter, reviewed on rendered frames |
| Video spend | $3–20 | $50–110 | $90–250 (measured on the films) |
| Time | 2–6 hours | 1–2 days | 19–41 hours wall-clock |

When unsure, start Quick. A lead who sings on camera with real lip sync needs Studio at least.

## Accounts (autumn 2026 prices)

| What | For | Notes |
|---|---|---|
| Suno, paid plan | the song | No API, and the terms forbid bots: the user presses Create and downloads the WAV. A paid plan allows commercial use. |
| Midjourney | plates | v8.2 `--raw --hd`. No API and no automation of the website: the user runs your prompt sheet. A personal style profile is theirs alone; never publish its code. |
| Seedance 2.5 | moving shots | OpenRouter (~$0.23/s at 720p, $0.10 at 480p) or Higgsfield (3/7/12 credits a second at 480/720/1080p). Give the key its own spend limit above the project cap. |
| An image-edit model | fixing a plate at the source, adding people | ~$0.14 an edit |
| A transcription model | checking what a take actually sings | ~$0.002 a song |

Keys live in environment variables or a gitignored file, never in a chat, a prompt, a log or a commit.

## The order of work

1. Brief and taste (verbatim) · 2. Concept · 3. Lyrics · 4. Song (**review: by ear**) · 5. Listening: stems, word
times checked by ear, beat map, hits · 6. The lead: canon text, four test plates (**review: her face**) ·
7. Storyboard, audited · 8. Plates · 9. Clip prompt book and cost (**review: board + book before spend**) · 10. Clips:
pilot, takes, sync measured, covers · 11. Edit and motion design · 12. Checks and render (**review: v1**, excerpt
first) · 13. Master, 9:16 cut, posting copy.

- Lock the song before the board: every shot time is a beat or a word of one specific take.
- Check the word times by ear before the board.
- Test her face before any plate batch (it can run alongside the song).
- Keep the film rendering end to end at every stage: plates stand in for missing clips, a default renderer for missing
  chapters.
- Show a 20–40 s excerpt early. ESCAPE VELOCITY's v1 was rejected as "way too.. gray … loses the Midjourney magic"
  after the whole film was built; an excerpt would have caught it 13 hours sooner.

## Spending

1. Estimate before every batch: planned clip seconds × price × 2 (generated seconds ran 1.9–2.0× the seconds in the cut).
2. Quote real spend only from the provider's bill; local ledgers drift.
3. A quality complaint stops all spending at once, in every job that can spend.
4. Never let a deadline (expiring credits) drive spending on unread prompts.
5. Declines are free and final on that service; never alter an image to get it past a filter (another service is fine).
6. Ask for a target and a cap; leftover budget replaces the most repetitive stills with motion.
7. One hand writes the prompts that cost money: CLODYSSEY's planner-written first round burned ~830 credits on lifeless
   takes nobody had read.

## Human checks between reviews (looks, not approvals)

Faces large on every plate that feeds a video (one accent streak, clip, mic, an adult face, natural anatomy); every
flagged word played by ear; contact sheets of rendered frames for every chapter; a five-second sync proof before
committing to a lip-sync method; a safety and canon scan of every generated take before release.

## Publishing and credit

- Say it's AI-made and name the tools ("Midjourney, Seedance, Suno, Claude"); switch on the platform's AI label.
- Claudia is an open character: credit "Claudia by anabology" if you can. Songs with her go out under the user's own
  name, never as "anabology", without "feat. Claudia" in the artist field; credit her in the description
  ("Claudia is an open character by anabology (claudia.gallery)"). Don't re-release the films' songs.
- Scrub what you publish: no Midjourney job ids (they sit in XMP metadata), no profile codes, no private names.
- Keep generated likenesses of real people out; quote real people as text with the source.
