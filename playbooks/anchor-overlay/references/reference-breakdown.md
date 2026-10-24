# Where the defaults come from

The numbers in this playbook were measured on a 73 s vertical talking-head reel in this format (1 fps contact sheets,
full-resolution frames and an ffmpeg scene-change pass). They are defaults for the format, not a style to copy: no
footage, lines, story or exact look from that reel is used anywhere here.

## What was measured

| Element | Measured |
| --- | --- |
| Base layer | One continuous medium close-up, full frame. It is never replaced by full-screen B-roll. |
| Overlays | Two sizes. A small picture in the band above the head (45–80% of the width, bottom edge above the eyes), so the face stays visible. A large centred picture (70–80% of the width, about 10–90% of the height) that covers the face but leaves the anchor showing at the left and right. Square corners, no frame, no shadow. |
| Overlay share | About 45% of the runtime has an overlay, roughly a third small and two thirds large by time. About 20 overlays a minute, each the literal picture of the word being said. |
| Spoken captions | Mostly one word at a time, in the speaker's own case with their punctuation. Bold sans, about 64 px at 1080 wide, white with a thin black stroke, centred at about y 1230 (chest height, 64% of the frame), not at the exact centre. They stay on top of large pictures. |
| Big words | A second text tier: one or two big all-caps display words over the upper face for numbers and the claims that carry weight. While one is up the spoken caption steps aside. |
| Labels and asides | Numbered labels at top centre (about y 400), each up through its whole list item. Bracketed asides sit at the top or on a large picture's top-left corner. |
| Cadence | 53 picture changes in 72.8 s, caption changes not counted: median gap 1.10 s, 10th to 90th percentile 0.60–2.33 s, longest 3.90 s. Caption changes add one every 0.3–0.6 s. |
| Punch-ins | A slight one (about 1.1×) and a hard one (about 1.35×), both on stressed words, as hard cuts. |
| Sound | The voice plus a music bed that lifts at the turning point. No sound effects. |

## What follows from it

- "The anchor never leaves the screen" means its edges are always visible, not that the face always is. That is what
  `check_render.py` verifies.
- Captions are small and one word at a time because the picture changes constantly; a second, much larger text tier
  is what carries emphasis. That is why the default is one word in the speaker's own case, with big all-caps words
  for the claims.
- Picture changes (about one a second) and caption changes (about one every half second) are two different clocks. The
  rhythm checks count them separately: no gap over 1.5 s with captions, a median of 0.8–1.5 s without them.
- The music is the only pacing device that is not a picture change: calm while the story is heavy, driving after the
  turn. The format needs only the time of the turn (`music.turnAt`).

## A generic timeline

Use it as a shape to compare a plan against, not as a script.

| Part | What the screen does |
| --- | --- |
| Hook, first 5 s | a big claim as a big word, a punch-in, one or two quick pictures |
| Setup, 10 s | a picture per named thing, thumbs while the speaker talks about themselves |
| Heavy middle | pictures in rapid succession, mostly large ones, calm music |
| Turn | the music switches on a hard cut; a hard punch-in on the first word |
| List, if the speech has one | a numbered label per item, a picture per item |
| Close | a quick run of pictures, one big word for the call to action |
