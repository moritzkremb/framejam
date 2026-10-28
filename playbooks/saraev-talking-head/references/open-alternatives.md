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

Whisper is the observed route for finding `cut cut`. Another local or hosted transcription tool is acceptable when
it returns word start and end times, but record the substitution. Keep the raw transcript, correct proper names and
the marker, and preserve source times. A transcript does not prove that a cut sounds clean.

## Audio

The observed order is high-pass → EQ → compression → loudness around -16 LUFS, with true peak around -0.4 dB.
The renderer follows that order. `audio.eq` is empty because the public slide does not expose frequencies or gains;
set bands from the actual recording. Low-pass and denoise remain optional JSON fields, not defaults. Disable a stage
that makes the voice metallic or pumps the room tone. The default has no music.

## Grade

The observed mapping uses ffmpeg's `eq` filter at saturation `0.10` and contrast `1.05`, inside the measured
low-saturation/mild-contrast range. For log footage or camera matching, grade from the original in a color-managed
editor and apply the EDL there. The LUT hook is optional; never fit a private LUT from a compressed web video and
call it exact.

## Teaser, captions and graphics

The teaser keeps one continuous voice/head excerpt for about eight seconds. After about three seconds, optional
0.3–1.1 s inserts appear over its blurred continuation. The ffmpeg fallback uses bordered, tilted 2D cards; a
project's existing motion tool can replace them with true 3D cards while preserving timing and audio.

Spoken captions are off. SRT/libass remains an explicit accessibility override. Graphics are timed data entries;
build real `#fbfdfa` panels, labels, pills, icons, charts, UI and citation strips in the project's normal tool.

## Export

The renderer supports software H.264 and common ffmpeg hardware encoders:

- `h264_videotoolbox` on supported Macs;
- `h264_nvenc` with a working NVIDIA device and driver;
- `h264_qsv` with Intel Quick Sync;
- `h264_vaapi` with a Linux VAAPI render device.

An encoder listed by ffmpeg can still fail when the matching device or entitlement is missing. `--encoder auto`
chooses hardware only when a platform/device hint is visible; otherwise it uses `libx264`. Keep a high-quality
software or mezzanine export when hardware output is not visually acceptable.
