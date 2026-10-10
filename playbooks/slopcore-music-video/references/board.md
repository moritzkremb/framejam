# The board

Condensed from https://claudia.gallery/wiki/storyboard/. The board decides the film: every shot's time on the song,
the lyric it types, the place, what happens, how the camera answers the music, what moves, and the graphic that
explains its line. Plates, clips, edit and motion design all read from it.

## Design before shots

- **The treatment:** one paragraph on what the film is.
- **The through-line device:** one object every shot carries and that escalates. ESCAPE VELOCITY: a split-flap board
  clattering onto "18 MONTHS TO ESCAPE THE PERMANENT UNDERCLASS", plus a LOOK counter for the show's looks (it flips
  to "THERE IS NO UNDERCLASS" as the catwalk lifts off). CLODYSSEY: a safety card, a rope-load readout in kN, a ×8,192
  counter. BLISS: the XP desktop itself.
- **The chapter map:** the song's sections grouped into chapters, each with its set, light and accent.
- **Plants and payoffs:** a payoff's gesture or object appears before it is sung.
- **A sequel never reuses the last film's device.**

## A shot

| Field | What |
|---|---|
| time | starts and ends on beats, or on a declared hit |
| lyric | the lines whose words fall in it, and how each is typed |
| set | concretely: "a night market under sodium lamps", not "a market" |
| framing | ECU, CU, MCU, MS, MWS, WS, FS, EWS or OTS |
| action | what happens and the reaction, with an end state |
| camera | one move, tied to a sound |
| what moves | still, 2.5D, motion clip or sung clip |
| plate | its prompt (framing first, the identity text, the place, "no text, no letters, no logos") |
| graphic | the explaining graphic and the chrome, each with its timing key |
| transition | a cut, or a motivated device |
| notes | the user's notes on this shot, verbatim |

## One explaining graphic per lyric line

1. It shows what the line means: the chart a number implies, the interface the joke is about, the diagram of the
   mechanism, the label that classifies, the counter that ticks the stakes.
2. It is drawn from the thing in frame: tally marks scratched into the mast, a clock's own LED segments re-lit as the
   number, a meter read off her actual bow ("as if when you were taking the picture, you lined it up perfectly to have
   the graphics fit, but you put the graphics in in post").
3. It enters on the word that names it.
4. It animates in beats: counters roll on sixteenths, rows type one per sixteenth, detections land on thirty-seconds,
   crops cut on eighths.
5. It escalates across the film, with its sources in micro-type ("HIS WORDS", dates, "ILLUSTRATIVE CURVE").
6. It is real: numbers, diagrams, labels and interfaces that could exist; curves computed. No clip-art.
7. It reads in one glance on a phone.

| The line is | The graphic |
|---|---|
| a number | a counter, chart, tally or gauge |
| a claim or a category | a classifier tag, a label or a stamp |
| a process or a place | a plot, leader lines, a departures board or a spec sheet |
| speech or tech | a chat, a terminal or a voice trace |
| a correction | a strike-through or a redaction |

At least six kinds in a film, never the same kind three lines in a row. Examples from the films: "Ladies. Gentlemen.
Agents." → a guest list LADIES 0% · GENTLEMEN 0% · AGENTS 100%, then a front row of laptops each detected as AGENT;
"This is not an AI billboard." → a classifier tag flipping BILLBOARD · 0.99 to AI BILLBOARD · 0.97 on "billboard";
"Feel the AGI" → a seismograph, M 9.0, OFF SCALE; "Escape velocity" → Newton's cannonball: falls at 7.0, orbits at
7.9, escapes at 11.2 km/s.

## The hook

1. The frame at 1.0 s shows her face, her accent and one readable line of the premise (ESCAPE VELOCITY: her face in a
   dark back seat, a red lamp crossing the streak, a split-flap row locking on the 1.20 s beat; her eyes open on the
   1.12 s hit).
2. No black frames, no slow title card first.
3. The premise on screen by 3 s; one new piece of information per bar; the first joke by about 10 s.
4. A cold open's words are on screen from 0:00.
5. The freeze-frame test: if the key line can't be read on a phone, enlarge it first.

## Cut rhythm

ESCAPE VELOCITY: 141 shots in 306 s, mean 2.17 s, median 1.83 s (about one bar at 131.5 BPM).

| Section | Mean shot | Why |
|---|---|---|
| intro, no vocal | 1.33 s | the hook: one new thing per bar |
| spoken verse | 1.62 s | jokes, dense |
| sung chorus | 2.69 s | lip sync needs room |
| second verse | 2.63 s | darker, slower |
| bridge | 2.25 s | the countdown |
| drop | 1.58 s | plus eighth-note strobes inside shots |
| outro | 4.40 s | the ring-out |

- Every cut within 0.03 s of a beat or a declared hit; if a word would straddle a cut, move the cut by ≤ 0.028 s; a
  held note gets typed in both shots.
- Section changes on downbeats or impacts. Match the cut rate to the song's energy, section by section; let a calm
  song be calm.
- Hold sung close-ups 2–4 s so the lip sync settles.

## The lead's share

- On screen ≥ 70% of the runtime when recognisable (ESCAPE VELOCITY 83%); hands, props and tags are inserts.
- No stretch without her longer than two bars; to raise the share, put the prop in her hand rather than relabel.
- She sings on camera for most sung words, in chains of 4–8 s windows (62% of sung words in ESCAPE VELOCITY).

## What moves, and what it costs

| Tier | What | Use when | Cost |
|---|---|---|---|
| still | a plate moved in code (crops on eighths, stills swapped on the beat) or pure motion design | the stillness is the design | free |
| 2.5D | a plate with its depth map, animated with a treatment | most shots that aren't heroes | free |
| motion | a clip from the plate; nobody's mouth forms words | a real turn, a fall, fabric, water | paid per second |
| sung | a clip with a clean vocal of only her words as the audio reference | she sings or speaks on camera | paid per second, plus covers |

- Sung windows 4–8 s, starting in a word gap, listing their exact words; motion clips 4–12 s.
- One image per shot; two clips never start from the same frame (a sibling candidate or the previous clip's last frame).
- A 2.5D treatment never repeats on two shots in a row and is never a still with a slow zoom.
- Budget ~60% more sung seconds for covers.

## The audit (run after every edit; show the board only when all pass)

| Gate | Fails when |
|---|---|
| tile | a gap or overlap anywhere in the song |
| cuts | a cut > 0.03 s from a beat and not a declared hit |
| words typed | a sung word starts in a shot whose type doesn't list its line |
| graphics | a lyric line with no explaining graphic |
| lead share | her seconds below the target (default 70%) |
| motion budget | planned clip seconds over the budget |
| clip windows | a sung window outside 4–8 s or not starting in a word gap; a motion clip outside 4–12 s |
| plates unique | one plate on two shots that aren't one moment; two clips from one start frame |
| banned | a taboo word anywhere |
| treatments | a 2.5D shot without a treatment, or the same one twice in a row |
| to do | a placeholder left, or a shot without a framing |

Warnings: a sung plate with a mic, hand or hair in front of her mouth; her share above 85%; the same transition twice
in a row; an unused plate or clip.

## Showing the board in FrameJam

One panel per shot in `out/board/` (the picked plate, or a rough frame), named in shot order; `open_review` with
`panelsDir` and `panels` whose title is the shot id and time and whose caption is the lyric, the framing and action in
one line, what moves, and the graphic in one line. Mark plates whose face may be off-model. Send it with the clip
count and cost: "<N> shots, the lead on screen <X>%, <M> clips (<S> s, about $<E>). Flag anything by shot id." Notes
arrive by panel; apply them all, re-run the audit, and ask again only if the user wants to see it.
