# STYLE.md: "Which Frame?" (the law)

**Concept.** A creator gives her AI agent the worst video notes on earth ("make it pop", "logo bigger", "something's off at like three seconds"), the agent can only answer "Which frame?", until FrameJam lets her point at the frame. Parody of the "I'm not sending my deck anymore" pitch-call music video, for FrameJam (framejam.ai, free, local, open-source video review for coding agents).

**Spine.** The HUD's VERSION counter: V1 → V12_FINAL_FINAL_FINAL.MP4 during the chaos, then a clean V1 → V2 → V3 · APPROVED once FrameJam arrives. NOTES counter: 8 VAGUE → 3 PINNED → 3 SENT. CALL clock runs the whole song. The edit carries the joke: chaos escalates until the pin.

## Cast (generated stills, cut out with mattes)
- **The Creator** (= "you", lime): auburn messy hair, round tortoiseshell glasses, lime hoodie, black tee/jeans, white sneakers.
- **The Agent** (= FrameJam's agent, blue): cobalt robot, dark screen face with blue pixel eyes, antenna.
- Stills are illustrations; they live through the line boil (`K.boil`), the beat hop/sway of `K.puppet`, camera punches and the graphics around them. Never hold a still without motion around and on it.

## Looks (cut hard between them on downbeats)
| look | ground | ink | accent | rule |
|---|---|---|---|---|
| **CALL** | `#0C0C0D` FrameJam bg | `#F4F4F5` | lime `#D4FF3A`, agent `#7CC4FF` | video-call UI: rounded tiles, name tags, call bar. Geist. |
| **POP** | flat cobalt `#2F54FF` (creator) / flat lime `#D4FF3A` (agent) | `#0C0C0D` or white | the other field colour | flat, no glow; hard 0-blur drop shadows OK; stickers |
| **PAPER** | cream `#EFE7DA` or `#F7F7F5` | `#0C0C0D` | ONE accent (lime or cobalt) | editorial, Swiss grid, hairlines, Instrument Serif italic for soft lines |
| **NIGHT** | pure black | white | agent blue rim, lime | pressure/chaos; glow allowed (HDR > 1) |
| **APP** | `#0C0C0D` + real FrameJam footage in windows | `#F4F4F5` | lime pins/ranges, blue = agent | product truth: real UI, pins, comment cards, Finish review |
| **PIXEL** | black | Doto LED type | lime + blue | bridge quiz show only |

Characters keep their generated backgrounds out: we always draw our own field and place the matte cut-out on it (`K.puppet`). Full plates (`full:true`) only inside call tiles or windows.

## Palette roles (`E.PAL`)
`ink #0C0C0D` (bg) · `white #F4F4F5` · `accent #D4FF3A` lime = YOU, pins, playhead, ranges, primary button · `agent #7CC4FF` = the agent, status, sent pins · `cobalt #2F54FF` field · `cream #EFE7DA` paper · `surface #151517 / surface2 #1D1D20 / surface3 #26262a` UI · `text3 #86868F` timestamps · `onAccent #121400` text on lime.

## Type (5 roles)
- **HERO**: `Archivo` 900, stretch 125% (wide) or 62% (condensed), UPPERCASE, tracking −0.03em, 25-90% frame height, accent full stop ("POP.").
- **3D HERO**: `E.text3D` Archivo Black / Anton (flat looks: unlit colour front + black side).
- **UI**: `Geist` 500-800 (FrameJam's brand font) for every piece of product UI: cards, buttons, pills, tags.
- **SYSTEM**: `Geist Mono` 500 for timestamps, filenames, counters, terminal (`npx -y framejam install`).
- **SOFT**: `Instrument Serif` italic, lowercase, for "I'll know it when I see it" and the outro line only.
- LED: `Doto` 900 in the bridge scoreboard.

## Lyrics
Every sung word is visible at its onset: as a designed hero or in the HUD subtitle (on by default, bottom-left). Hero words = 1-3 per line. Agent lines ("Which frame?", "Which second?", "Which thing?", "Which blue?", "Agent's listening…") are always set in agent blue or on lime with the agent on screen. Creator lines in lime/white with the creator on screen. Never the same type treatment on two consecutive lines.

## Motion grammar
- Vocal onset → type (impact on `w.s`, anticipation ≤ 4 frames). Kick → `E.post.punch` 0.02-0.035 or a shape hit. Snare → colour or shape event. Bass/hats → small shimmer only.
- Cut density: intro 1 cut per 2 bars · verse 1 cut per line (call/response ping-pong) · pre-chorus climbs 1 bar → 1 beat → half beat · chorus 1 bar with beat events inside · verse 2 one idea per line · bridge per Q/A · final chorus per beat, then hold the stamp.
- Springs with overshoot for pops; UI cards from 0.94, never from 0. Exits 3× faster than entries or a hard cut.
- Photosensitivity: ≤ 3 full-frame luminance flips per second (cobalt↔lime flips are fine, white↔black ≤ 2/s).

## Brand rules
- FrameJam logo only from `assets/brand/` (official lockup PNG/SVG, official colours), only on the end card and at most one small mark elsewhere.
- Use FrameJam's real UI vocabulary and copy: pins, "Finish review · 3", "Agent listening", "Got 3 notes. Making v2…", "Version 1 · 3 comments not sent", "Sent". Facts allowed on screen: free, local, open source, MIT, no account, no uploads, stays in `~/.framejam`, works with Cursor / Claude Code / Codex or any MCP agent, any mp4 (Hyperframes not required), `npx -y framejam install`, framejam.ai.
- **Bans:** other companies' logos (no Apple logo: s20's laptop lid must be covered by a FrameJam sticker; Cursor/Claude/Codex appear as plain text only), real people, filters/grades on the stills' pixels, generic HUD clutter, cyan/magenta cyberpunk, particle soup.
