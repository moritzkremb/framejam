# Style Bible

Status: **observed public-video DNA; real-footage parity not yet tested**

These findings came from Local Eyes review of four public Nick Saraev videos. They describe repeated visible and
audible choices, not a private implementation. Exact values that were not visible remain configurable. Keep each
evidence ID with any downstream adaptation.

## Evidence index

| ID | Public reference |
| --- | --- |
| `youtube-s3kdxrioesk` | https://www.youtube.com/watch?v=S3kdxriOESk |
| `youtube-2imdodzap7c` | https://www.youtube.com/watch?v=2iMdoDZap7c |
| `youtube-wju9-kdm41o` | https://www.youtube.com/watch?v=wJu9-KDM41o |
| `youtube-he-nyjjzwm0` | https://www.youtube.com/watch?v=He-NyJjzWM0 |

## Public pipeline

Saraev's own on-screen slide at about 0:31 in `youtube-s3kdxrioesk` shows:

1. extract audio to WAV;
2. Silero VAD and silence removal (default around 0.5 s);
3. Whisper detects spoken “cut cut” and deletes the mistake segment;
4. high-pass → EQ → compression → loudness around -16 LUFS;
5. optional LUT grade;
6. insert a 3D swivel teaser intro;
7. hardware encode; his shown route uses `h264_videotoolbox`.

The open scripts follow that order. EQ bands, compressor settings, LUT and 3D geometry were not exposed and must not
be presented as his private values.

## Opening and pace

- No title card. Open mid-thought; the first spoken word typically lands around 1.2–2.0 s.
- Speech runs about 200–260 words per minute and covers roughly 99–100% of runtime.
- The swivel teaser occupies about 0:00–0:08: roughly 3 s of the head, then about eight micro-clips lasting
  0.3–1.1 s each as tilted screen cards over a blurred background. The voice continues underneath.
- The first 15 s runs about 52 cuts/min; after the teaser, about 7 cuts/min.
- Evidence: all four IDs; teaser structure and pipeline slide are clearest in `youtube-s3kdxrioesk`.

## Frame and camera

- Typical delivery: 1080p30, centered medium close-up.
- Cool-grey wall, plant at bottom right, black hoodie or tee, soft window key.
- These are reference traits, not prerequisites. Match the user's room and wardrobe honestly rather than fabricating
  a background.
- Evidence: `youtube-2imdodzap7c`, `youtube-he-nyjjzwm0`, `youtube-wju9-kdm41o`,
  `youtube-s3kdxrioesk`.

## Three edit modes

1. **Raw jump-cuts:** about 13 cuts/min; median shot around 3.3 s.
2. **Graphics explainer:** about 6.6 cuts/min, with designed panels carrying the explanation.
3. **News reaction:** full-frame tweet/article with a small webcam PiP.

Select one mode per section in `edit.json`. Do not average all three into every scene.

## Graphics

- Main panel: off-white `#fbfdfa`, rounded.
- Editorial serif headlines.
- Letter-spaced, all-caps grey labels; black pill labels.
- Thin olive-green line icons.
- Charts, UI mockups and citation strips.
- In graphics mode, webcam becomes a small rounded PiP at the right edge.
- In screen-share mode, webcam is about 26% frame width at bottom left over a bokeh background.
- Do not fake UI, quotes, charts, citations or results.
- Evidence: `youtube-2imdodzap7c`, `youtube-he-nyjjzwm0`, `youtube-wju9-kdm41o`.

## Captions

- No word-by-word spoken captions.
- On-screen text is a graphic label, headline, citation or UI element.
- `captions.enabled` therefore defaults to `false`; only enable captions when the user explicitly requests them.
- Evidence: all four IDs.

## Color

- Neutral, very low saturation: observed range about 0.05–0.12.
- Mild contrast.
- Template mapping: ffmpeg `eq` saturation `0.10`, contrast `1.05`, brightness `0`, gamma `1`.
- Optional LUT is a hook only. Do not infer or name a private LUT.
- Evidence: all four IDs.

## Audio

- Voice only; no music.
- High-pass → footage-specific EQ → compression → about -16 LUFS.
- True peak target about -0.4 dB.
- `audio.eq` starts empty because the slide shows the stage, not the frequencies or gains.
- Evidence: `youtube-s3kdxrioesk` for the chain; all four IDs for voice-only delivery.

## Export

- `h264_videotoolbox` is the observed hardware route on Saraev's Mac.
- `encoder: auto` selects it on a supported Mac and falls back to `libx264` elsewhere.
- Hardware availability never changes the edit decisions or look.
- Evidence: `youtube-s3kdxrioesk`.

## Remaining parity work

- Test VAD, “cut cut” removal and the 1.2 s lead against real raw talking-head footage.
- Build and review a full eight-card teaser with real visual inserts.
- Compare the three edit modes on phone and desktop.
- Measure real speech coverage, words per minute, cut cadence, LUFS and true peak.
- Real footage is still required before claiming parity.
