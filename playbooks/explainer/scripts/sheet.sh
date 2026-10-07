#!/usr/bin/env bash
# Contact sheet of a render, one frame every N seconds (default 4), to look at before showing anyone.
#   bash scripts/sheet.sh renders/v1.mp4 [seconds_per_frame] -> renders/v1-sheet.jpg
set -euo pipefail
in="$1"; every="${2:-4}"
out="${in%.*}-sheet.jpg"
ffmpeg -v error -y -i "$in" -vf "fps=1/${every},scale=384:-1,tile=5x8:padding=4:color=black" -frames:v 1 "$out"
echo "$out"
