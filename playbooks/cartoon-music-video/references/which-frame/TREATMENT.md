# TREATMENT.md: "Which Frame?"

Song: `audio/master.mp3` (ElevenLabs music_v2_5, take b). **125 BPM measured** (beat 0.48 s, bar 1.935 s), 66 bars, 128.04 s. Downbeats and onsets: `engine/data/audio.json`. Word times: `engine/data/lyrics.json` (hand-corrected, use these, never hard-code other times). Female lead = the Creator; gang shouts / vocoder = the Agent. The video runs to 133.0 s (end card over silence).

**Hook (first 3 s, must work muted):** the agent's question-mark face slams "WHICH FRAME?" on the first two downbeats, then a hard cut into the video call.

**Arc:** awkward call → note chaos (call/response ping-pong) → pressure pile-up of `final_FINAL` files → "Somebody point at the frame!" → FrameJam: pin, comment, Finish review, v2 → how it works (real app) → chorus 2 party → quiz-show FAQ → biggest chorus, V3 APPROVED → deadpan "I'm not describing timestamps anymore" → `npx -y framejam install` → end card.

## Sections (owner · time · look · lyrics · must-haves)

**intro** · 0.00-7.78 · CALL
- 0.00-2.85 cold open: `s06_agent_ecu` cut-out on lime, "WHICH FRAME?" HERO slams on downbeats 0.04 and 1.96; match cut: the ? on its screen scales up into the title's "?" (or out of it).
- 2.85 hard cut: two-tile video call like a real meeting (creator `s01_creator_wave` left with speaking ring, agent `s02_agent_call` right, name tags "You" / "Agent"), call bar at the bottom. "Can you see my screen?" 2.92-3.72 (she waves; small call caption).
- "Version one." 6.70-7.62: she shares her screen: a player window "v1.mp4" slides up, tiles shrink to a strip. Last frames land on 7.78.

**verse1** · 7.78-31.00 · POP (cobalt for creator, lime for agent) + PAPER (cream) · call and response, one shot per line, hard cuts on each line's first onset.
| line | onset | still | must-have |
|---|---|---|---|
| Make it pop. | 8.65 | s03_creator_pop | giant "POP." behind her (see `_smoke.js`), comic burst |
| Which frame? | 10.63 | s04_agent_confused | "?" over every frame of the film strip he holds; "WHICH FRAME?" |
| Make the logo bigger. | 12.53 | s05_creator_logo | the blank card in her fingers (UV ≈ 0.40,0.40) becomes a "LOGO" box that grows absurdly on each beat |
| Which frame? | 14.02 | s06_agent_ecu | ? echo wall multiplying behind him (different treatment than 10.63) |
| Something's off at like three seconds. | 15.85 | s07_creator_squint | her finger-frame becomes a viewfinder; a scrub timecode jitters 0:02.7 / 0:03.? / 0:03.4 |
| Which second? | 18.06 | s08_agent_stopwatch | split-flap seconds counter flipping randomly |
| No, the other thing. | 20.02 | s09_creator_shrug | arrows and labels "THIS?" "THAT?" "THE OTHER THING" pointing everywhere |
| Which thing? | 20.82 | s06 (mirrored, tighter) | quick 0.8 s hit |
| Give it more energy. | 21.66 | s10_creator_jump | ENERGY meter maxes out, shake, lightning shapes |
| Like Apple, but fun. | 23.89 | s11_creator_apple | "Like Apple," thin and minimal, then "but fun." explodes in bouncy chaos. No Apple logo. |
| Can we try it in blue? | 25.44 | s12_creator_blue | the roller paints a blue wipe across the frame |
| Which blue? | 26.67 | s13_agent_swatches | swatch chips with hex codes fan out (#0000FF #1D63C9 #2F54FF #4169E1 #7CC4FF #0047AB) |
| I'll know it when I see it | 28.74 | s14_creator_smug | quiet SOFT serif italic, the one calm line; NOTES counter reads 8 VAGUE |

**pre** · 31.00-41.60 · NIGHT · density climbs 1 bar → 1 beat → half beat.
- "Version 2, version 3 / Final, final, final, final / Version 12, final, final, final" 32.92-38.9: `s15_agent_buried` in reels; every word onset drops a new file card (`v2.mp4`, `v3.mp4`, `v3_final.mp4`, `v3_final_final.mp4`, …, `v12_final_FINAL_FINAL.mp4`) onto the pile; the HUD VERSION counter is the spine. Twitching eye, pile wobble.
- "Somebody point at the frame" 39.94-41.6: hard cut to `s16_creator_megaphone`, the words blast out of the megaphone; on "frame" (41.42) a lime frame rectangle snaps shut around the screen → straight into chorus 1.

**chorus1** · 41.60-58.10 · APP (product truth, dark + lime).
- "Point at the frame" 41.66: `s17_creator_point`; a lime FrameJam pin drops exactly at her fingertip (UV ≈ 0.49,0.29), ripple ring.
- "Tell it what to change" 43.72: a comment card types "Make the logo bigger." with timestamp 0:03.1 (the vague note, now pinned).
- "Click it, drag it, type in" 46.56 / 47.44 / 48.42: three hits on real app footage `ui_review` in a window: click (clip 6.6-7.4 s), drag (11.85-13.3 s), typing (13.87-15.67 s), each with a hero word CLICK / DRAG / TYPE.
- "Finish review" 50.70: `s18_button_press`; the lime button is labelled "Finish review · 3" and presses on 51.46; flash.
- "Here comes version 2" 53.30-56.3: `s19_agent_dance` on lime, "V2" slams on 55.78 (counter flips); optionally the real v2 moment from `ui_review` (clip 30.6 s+: blue mascot, confetti) in a window.

**verse2** · 58.10-75.52 · PAPER (light, Swiss grid) with real app footage in windows. One idea per line.
- "Pick a style, press use" 59.33: `ui_styles` window (hovers, click Use at clip 10.16 s); style names on a grid (Midnight Launch, Cyanotype Mac, Bauhaus Grid, Label Collage).
- "Every color, every font" 61.50: palette chips and a type specimen, snapping in on the words.
- "Pause it, click the thing that's off" 63.52: `s20_creator_couch`; cover the laptop lid logo (UV ≈ 0.38,0.59) with a small lime FrameJam sticker; a pin pops on "off".
- "Drag across the timeline" 65.52: `K.timeline` range drag synced to the word.
- "Every note gets a timestamp / a frame" 67.14 / 69.24: comment cards list with timestamps (0:00.6, 0:03.1, 0:05.2) then frame thumbnails.
- "Agent's listening, got three notes / Making version 2" 72.60-75.42: cut to dark, `s21_agent_listen`; status pill "Agent listening" → "Got 3 notes. Making v2…".

**chorus2** · 75.52-91.02 · POP colour-field flips on kicks (cobalt↔lime), 3D type. Must look different from chorus 1: no app windows, it's the party.
- "Point at the frame" 76.94 / "Tell it what to change" 78.54 / "Click it, drag it, type in" 80.8-84.2 / "Finish review" 85.58 / "Here comes version 2" 88.30-91.0. Use `s22_highfive`, `s19_agent_dance`, `s10_creator_jump`, `s03_creator_pop`, 3D extruded hero words, sticker pops of pins.

**bridge** · 91.02-103.40 · PIXEL quiz show (black, Doto LED). Question cards (creator) vs answers buzzed in by `s24_agent_quiz_pixel`.
- "Is it in the cloud?" 92.30 → "It's on your machine" 93.64 (show `~/.framejam`). "What's it cost?" 94.62 → "Nothing, MIT" 96.25 ($0, MIT LICENSE). "Does it need Hyperframes?" 97.48 → "Any MP4" 99.45. "Cursor, Claude, Codex?" 100.42 → "MCP!" 102.08 (giant). Scoreboard ticks up per answer.

**chorus3** · 103.40-118.12 · everything, biggest. Cut per beat mixing POP / APP / NIGHT looks, confetti. "Version 3 approved" 114.20-117.7: giant "APPROVED" stamp slams on 117.14 ("3" on 116.86 flips the counter), both characters (`s22_highfive`), confetti burst.

**outro** · 118.12-133.00 · CALL then end card.
- Back on the call: `s26_creator_deadpan` (sunglasses) tile big, agent tile small. "I'm not describing timestamps anymore" 120.01-122.9 as a big SOFT italic line (the tweet-style punchline).
- "NPX FrameJam install" 123.24-125.9: a terminal line types `npx -y framejam install` with a block cursor.
- End card from the 125.84 downbeat to 133.0: official lockup (`/assets/brand/lockup-2000.png`) centred on #0C0C0D, "Agent-native video editing", "Free · Local · Open source", "framejam.ai". A lime pin drops onto the card. Slow drift; HUD fades out (`E.hud.alpha`).

## Footage map (stills in `assets/video/<name>/`, 3 boil frames, matte + matte bbox in track.json; all mattes clean)
| still | content | generated bg | subject bbox (u0,v0,u1,v1) |
|---|---|---|---|
| s01_creator_wave | creator at webcam, waving, upper body | cream | 0.17,0.03,0.75,1.0 |
| s02_agent_call | agent at desk facing camera, hands folded | charcoal | 0.32,0.06,0.67,0.93 |
| s03_creator_pop | full body pointing at viewer, smug | cobalt | 0.67,0.04,0.91,0.96 |
| s04_agent_confused | full body, ? face, holds film strip | lime | 0.07,0.05,0.37,0.93 |
| s05_creator_logo | holds tiny blank card, "bigger" hand | cobalt | 0.05,0.04,0.56,1.0 |
| s06_agent_ecu | head ECU, big ? on screen | lime | 0.26,0.02,0.71,1.0 |
| s07_creator_squint | finger frame at eye, squinting | cream | 0.44,0.04,0.98,1.0 |
| s08_agent_stopwatch | full body, holds stopwatch (happy eyes) | cream | 0.14,0.03,0.42,1.0 |
| s09_creator_shrug | full body big shrug | cobalt | 0.32,0.02,0.67,0.96 |
| s10_creator_jump | full body star jump | cobalt | 0.21,0.05,0.77,0.91 |
| s11_creator_apple | party hat, red apple, wink | cream | 0.53,0.02,0.99,1.0 |
| s12_creator_blue | paint roller dripping blue | cream | 0.50,0.03,0.98,1.0 |
| s13_agent_swatches | full body, fan of blue swatches, dizzy eyes | lime | 0.06,0.03,0.34,0.96 |
| s14_creator_smug | arms crossed, eyes closed, smug | cream | 0.14,0.04,0.48,1.0 |
| s15_agent_buried | agent buried in film reels + papers | black + blue rim | 0.15,0.08,0.83,0.95 |
| s16_creator_megaphone | yelling into megaphone, pointing | black + lime rim | 0.03,0.04,0.53,1.0 |
| s17_creator_point | foreshortened finger at camera, wink | near-black + lime rim | 0.24,0.0,0.79,1.0 |
| s18_button_press | hand pressing big lime button on console | near-black | 0.0,0.0,0.72,0.81 (hand+button; use full plate) |
| s19_agent_dance | full body victory dance | lime | 0.31,0.05,0.68,0.93 |
| s20_creator_couch | cross-legged with laptop (cover lid logo!) | cream (couch is matted out) | 0.08,0.07,0.50,0.95 |
| s21_agent_listen | headphones, waveform eyes | near-black + blue rim | 0.56,0.04,0.92,1.0 |
| s22_highfive | both mid-air high five | cobalt | 0.16,0.05,0.85,0.92 |
| s24_agent_quiz_pixel | pixel-art agent at quiz buzzer podium | black | 0.27,0.03,0.66,0.94 |
| s26_creator_deadpan | webcam, sunglasses, arms crossed | cream | 0.29,0.02,0.70,1.0 |

Real app footage (frame sequences, 30 fps, 1920×1200, 16:10, full plates only, no matte): `ui_review` (48.2 s: play 2.0, pause 3.85, click pin 6.72, type "Make the mascot blue." 7.52-8.83, drag 11.85-13.27, type "Add confetti when he jumps." 13.87-15.67, "whole video" 18.3, type 18.9-21.27, Finish review 24.49, v2 arrives 30.57), `ui_styles` (13.8 s: hovers 0.88/3.0, scroll 4.3, hover Label Collage 7.98, click Use 10.16), `ui_style` (13.4 s, one style's page). Use `K.coverIn(v, rect)` to put them in a window; the track never freezes: keep localT inside the clip and pick an offset that plays.
