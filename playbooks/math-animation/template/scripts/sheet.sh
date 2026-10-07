#!/usr/bin/env bash
# Contact sheet of a render, one frame every N seconds, to look at before calling a version done.
#   bash scripts/sheet.sh out/video.mp4 [seconds_per_frame=2] -> out/video-sheet.jpg
set -euo pipefail
in="$1"; every="${2:-2}"
out="${in%.*}-sheet.jpg"
ffmpeg -v error -y -i "$in" -vf "fps=1/${every},scale=384:-1,tile=5x6:padding=4:color=black" -frames:v 1 "$out"
echo "$out"
