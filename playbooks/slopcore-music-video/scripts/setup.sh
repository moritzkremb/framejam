#!/usr/bin/env bash
# Set up a slopcore music video project in the CURRENT directory.
# usage: bash <playbook>/scripts/setup.sh [/path/to/song.mp3]
#   Copies the helpers into tools/, creates the folders, and builds a Python 3.11 .venv for audio analysis and lyric
#   alignment (Demucs, beat_this, faster-whisper, librosa). Takes a few minutes; run it in the background.
#   SKIP_VENV=1 skips the Python environment (folders and tools only).
# Needs: ffmpeg/ffprobe, git, and uv (preferred) or python3.11.
set -euo pipefail
PB="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p audio/takes analysis tools moodboard assets/refs assets/stills assets/clips assets/inserts out/base out/watch
cp "$PB/scripts/"*.py tools/
if [ $# -ge 1 ]; then
  [ "$1" -ef "audio/master.${1##*.}" ] || cp "$1" "audio/master.${1##*.}"
  echo "master: audio/master.${1##*.}"
fi
[ "${SKIP_VENV:-0}" = "1" ] && { echo "tools copied; skipped .venv"; exit 0; }

DEPS=(numpy scipy librosa soundfile matplotlib pillow demucs torch torchaudio faster-whisper "git+https://github.com/CPJKU/beat_this.git")
if command -v uv >/dev/null; then
  export UV_NATIVE_TLS=1
  uv venv .venv -q --python 3.11
  uv pip install -q --python .venv/bin/python "${DEPS[@]}"
else
  python3.11 -m venv .venv
  .venv/bin/pip install -q "${DEPS[@]}"
fi
echo "ready. next: .venv/bin/python tools/audio_analysis.py audio/master.mp3"
