# Public evidence and claim boundaries

## What the references support

The task supplied these public Nick Saraev videos:

1. [“f*ck it. Here's how I automated my youtube channel in 24 mins (I show everything)”](https://www.youtube.com/watch?v=S3kdxriOESk)
2. [“The Death Of The Open Internet”](https://www.youtube.com/watch?v=2iMdoDZap7c)
3. [“Anthropic Just Announced the End of Capitalism.”](https://www.youtube.com/watch?v=wJu9-KDM41o)
4. [“How to Use AI Like A Top 0.1% CEO”](https://www.youtube.com/watch?v=He-NyJjzWM0)

In the first video, Saraev publicly describes an automated talking-head pipeline that:

- extracts audio;
- runs a neural voice activity detector, transcribed in the public video as “Solera VAD”;
- removes silence gaps with a 0.5-second threshold;
- reacts to an undisclosed two-word spoken marker by removing a mistaken section;
- performs audio enhancement and color grading;
- adds an opening “swivel teaser”;
- uses hardware acceleration for processing.

Those are pipeline stages, not sufficient specifications for exact reproduction.

## What is not public here

- The spoken marker phrase. Never provide a default that could fire on ordinary speech.
- Whether “Solera” is the exact product name or a transcription/pronunciation of Silero.
- VAD model version, probability threshold, padding or boundary repair.
- The rule that decides exactly how much speech precedes a marker and should be removed.
- Audio filters, order, parameters, loudness target, microphone chain or room treatment.
- LUT, exposure, white balance, curves, skin-tone treatment or per-camera corrections.
- Geometry, easing, duration or implementation of the “swivel” effect.
- Caption font, sizes, safe zones, line breaking, graphic system or insertion cadence.
- GPU, operating system, encoder, decoder or ffmpeg build.

The included scripts therefore expose these as settings and use neutral defaults. Describe Silero and ffmpeg as open
alternatives, not as Saraev's private implementation.

## Using the other three videos

Treat the last three links as public visual references for a later evidence pass. Do not download or redistribute
them. Record any observation in `STYLE_BIBLE.md` with a video URL and timestamp, and distinguish a repeated pattern
from a one-off choice. Until that pass is complete, the template makes no claim about their exact look or pacing.
