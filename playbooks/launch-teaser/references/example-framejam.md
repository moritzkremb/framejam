# Example: the FrameJam teaser

18 s, 1920×1080, 120 BPM, made with this playbook in Hyperframes from real FrameJam material: the app's style
preview videos and a screen recording of the review page. Music and sound effects from `scripts/launch_bed.py`.
The composition is `template/hyperframes/index.html`, the cue sheet `template/hyperframes/cues.json`.

Look: FrameJam's design system. Canvas #0c0c0d, text #f4f4f5, lime #d4ff3a for "you" (pins, the key word, "Jam"),
agent blue #7cc4ff only in a glow, Geist and Geist Mono.

| Time | Section | On screen | Sound |
| --- | --- | --- | --- |
| 0–2 | intro | Black. Mono label "v1.mp4" top left. "Your agent made a video." rises one word per eighth note. | ticks per word |
| 2–4 | intro | Waterfall cut to "Now say what's wrong." ("wrong." in lime); a lime pin drops above it at 3.0; zoom-through at 3.7. | slam at 2.0, pop at 3.0, whoosh into 4.0 |
| 4–8 | drop 1 | Eight real style previews, 0.5 s each, full bleed. Caption pill center swaps on each bar: "Point." "Comment." "Finish review." "Next version." Pins with timestamp chips pop at 4.5 and 6.5 in the corners. | automatic drop at 4.0, pops, ticks |
| 8–10 | groove | "Notes land on the exact frame." The real review page rises in a window, then pushes in on the comment box as "Make the mascot blue" is typed. | whoosh + swoosh at 8.0, click at 9.2 |
| 10–12 | breakdown | The window recedes to 8% and blurs; "every timestamp" / "every pin" / "every version" tick in; short flash at 11.8. | riser, snare roll, ticks |
| 12–16 | drop 2 | "Frame Jam" letters rise on the drop with a lime glow; "Review your agent's videos." at 13.0. | automatic drop at 12.0, tick at 13.0 |
| 16–18 | outro | Lime pill "npx -y framejam install", "Free. Local. framejam.ai"; fade at 17.5. | final impact, click |

What we fixed between v1 and v4: moved chips to the corners (they collided with captions), whitened and spaced the
breakdown lines over a dimmer window, and added the push into the comment box (the full review page was unreadable).
The push only worked once the video sat inside a wrapper `div`.
