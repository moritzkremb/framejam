# Open alternatives

Use these when the exact component is unavailable. They are implementation choices for this playbook, not claims
about Nick Saraev's private stack.

## Voice activity detection

### Silero VAD

The optional `silero-vad` Python package exposes `load_silero_vad`, `read_audio` and
`get_speech_timestamps`. `detect_speech.py` extracts 16 kHz mono WAV with ffmpeg and asks Silero for speech
timestamps in seconds, with `min_silence_duration_ms` set from `--min-silence` (500 ms by default).

Silero separates speech from non-speech, but it still needs review around breaths, quiet words, room noise and music.

### ffmpeg fallback

`silencedetect` is installed with ffmpeg and has no model download. It detects amplitude, not voice, so keyboard
noise, room tone or music can look like speech. Tune `--noise-db`, read the emitted silence log and listen at every
boundary.

Both backends emit the same small JSON interface:

```json
{
  "timebase": "seconds",
  "backend": "silero",
  "speech": [
    {"start": 0.12, "end": 4.83},
    {"start": 5.41, "end": 9.02}
  ]
}
```

## Transcription

Any local or hosted transcription tool is acceptable when it returns word start and end times. Keep the raw
transcript, correct proper names and marker phrases, and preserve source times. A transcript does not prove that a
cut sounds clean.

## Audio

The renderer's default chain is intentionally conventional and conservative: high-pass, low-pass, ffmpeg denoise,
compression and loudness normalization. Disable a stage that makes the voice metallic or pumps the room tone.
Dedicated restoration tools are optional; record their name and settings in `VERIFY.md`.

## Grade

The neutral JSON grade uses ffmpeg's `eq` filter. For log footage or camera matching, grade from the original in a
color-managed editor and apply the EDL there. Never fit a private LUT from a compressed web video and call it exact.

## Teaser, captions and graphics

The included teaser is a repeated source excerpt with a small label and subtle lateral crop motion. It is a
replaceable approximation. Captions use SRT plus libass; graphics are timed text entries. A project can swap either
for its existing motion system while keeping the source timeline and checks.

## Export

The renderer supports software H.264 and common ffmpeg hardware encoders:

- `h264_videotoolbox` on supported Macs;
- `h264_nvenc` with a working NVIDIA device and driver;
- `h264_qsv` with Intel Quick Sync;
- `h264_vaapi` with a Linux VAAPI render device.

An encoder listed by ffmpeg can still fail when the matching device or entitlement is missing. `--encoder auto`
chooses hardware only when a platform/device hint is visible; otherwise it uses `libx264`. Keep a high-quality
software or mezzanine export when hardware output is not visually acceptable.
