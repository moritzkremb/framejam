# Public evidence and claim boundaries

## What the references support

The task supplied these public Nick Saraev videos:

1. [“f*ck it. Here's how I automated my youtube channel in 24 mins (I show everything)”](https://www.youtube.com/watch?v=S3kdxriOESk)
2. [“The Death Of The Open Internet”](https://www.youtube.com/watch?v=2iMdoDZap7c)
3. [“Anthropic Just Announced the End of Capitalism.”](https://www.youtube.com/watch?v=wJu9-KDM41o)
4. [“How to Use AI Like A Top 0.1% CEO”](https://www.youtube.com/watch?v=He-NyJjzWM0)

In the first video, Saraev's own on-screen slide at about 0:31 describes an automated talking-head pipeline that:

- extracts audio to WAV;
- runs Silero VAD;
- removes silence gaps with a 0.5-second threshold;
- has Whisper find the spoken marker “cut cut” and remove the mistaken section;
- processes audio high-pass → EQ → compression → about -16 LUFS;
- applies an optional LUT grade;
- inserts a 3D swivel teaser;
- hardware-encodes with `h264_videotoolbox` on his shown Mac route.

Local Eyes review of all four public references also found the visible and audible DNA mirrored in
`template/STYLE_BIBLE.md`: an approximately eight-second continuous-voice swivel teaser, no title card, no
word-by-word captions, three edit modes, editorial graphic panels, a low-saturation neutral grade, voice-only audio
and the measured pacing ranges. The evidence IDs are:

- `youtube-s3kdxrioesk`
- `youtube-2imdodzap7c`
- `youtube-wju9-kdm41o`
- `youtube-he-nyjjzwm0`

These are public observations, not sufficient specifications for exact reproduction.

## What is not public here

- VAD model version, probability threshold, padding or boundary repair.
- The rule that decides exactly how much speech precedes a marker and should be removed.
- EQ bands, compressor values, microphone chain or room treatment.
- LUT identity, exposure, white balance, curves, skin-tone treatment or per-camera corrections.
- Geometry, easing, duration or implementation of the “swivel” effect.
- Exact fonts, radii, icon set, UI source files or graphics implementation.
- Hardware decode settings, codec quality settings or ffmpeg build.

The included scripts therefore expose these as settings, use observed values only where the evidence supports them,
and keep software fallbacks. Do not call the open ffmpeg card tilt, EQ or grade his private implementation.

## Using the other three videos

Do not download or redistribute the references. Keep the evidence IDs when adapting a finding, distinguish a
repeated pattern from a one-off choice, and do not claim parity until the pipeline is tested on real raw footage.
