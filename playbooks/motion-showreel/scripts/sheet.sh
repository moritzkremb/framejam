#!/usr/bin/env bash
# Contact sheet of a video for checking a render: one frame every N seconds, 6 per row.
# Usage: bash sheet.sh video.mp4 [seconds_between_frames=1] [out=<video>-sheet.jpg]
set -euo pipefail
in="$1"; step="${2:-1}"; out="${3:-${in%.*}-sheet.jpg}"
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
n=$(python3 -c "import math; print(max(1, math.ceil($dur / $step)))")
rows=$(( (n + 5) / 6 ))
ffmpeg -v error -y -i "$in" -vf "fps=1/$step,scale=320:-1,tile=6x$rows:padding=4:color=black" -frames:v 1 "$out"
echo "wrote $out ($n frames, every ${step}s)"
