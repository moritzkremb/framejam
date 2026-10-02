# Frame Jam landing video: design spec

Brand truth is the Frame Jam design system in `../../design/` (tokens.json, README.md). This file only adapts it for video.

## Colour (dark theme, exact hex from tokens)

| Role | Hex | Use |
| --- | --- | --- |
| canvas | `#0c0c0d` | the video's background in every scene (`bg`) |
| surface | `#151517` | window chrome around footage, cards |
| surface-2 | `#1d1d20` | quiet panels, chips |
| text | `#f4f4f5` | headlines |
| text-2 | `#a1a1aa` | sub-lines |
| text-3 | `#86868f` | timecodes, labels |
| accent (you) | `#d4ff3a` | the person reviewing: pins, playhead, "Jam" in the wordmark, the key word in a headline |
| agent | `#7cc4ff` | anything the agent does: "your agent", the listening ring |
| border | `rgba(255,255,255,0.08)` | hairlines (draw at 2px on video) |

Rules from the brand book: lime means you, blue means the agent, green only for health, red only for errors. One lime hit per headline at most. No gradients on text. Radial glows only (no full-frame linear gradients).

## Type

- **Geist** (variable, bundled locally): headlines 700, 96–150px, tracking -0.035em, sentence case. Sub-lines 500, 36–44px, `text-2`.
- **Geist Mono**: timecodes and labels only (`0:03.0`, `v1`, `v2`), 22–28px, `text-3`.
- The wordmark is "Frame **Jam**" in Geist Bold, "Jam" in accent. No logo mark.

## Copy voice

Plain, sentence case, "you" and "your agent". No exclamation marks, no emoji. Buttons and states quoted exactly as the app writes them.

## Footage treatment

- Every product shot is a real recording of the running app (2880×1800, 1440×900 at 2x). Never rebuilt or mocked.
- Footage sits in a window: `radius 28px`, 2px `border`, `surface` frame, soft shadow `0 40px 120px rgba(0,0,0,.6)`.
- The camera moves inside the window (scale/translate on an inner wrapper). Max zoom 2.4x (stays sharp at 2x capture).
- Motion: entrances 0.4–0.7s, `expo.out` / `power3.out` for arrivals, `power2.inOut` for camera moves, `back.out(1.6)` only for small pops.
