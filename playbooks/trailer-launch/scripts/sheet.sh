#!/usr/bin/env bash
# Contact sheet of a render: one frame every 1/FPS seconds, 6 per row.
#   bash sheet.sh renders/v1.mp4 [fps=2] [out=renders/v1-sheet.jpg]
set -euo pipefail
in="$1"
fps="${2:-2}"
out="${3:-${in%.*}-sheet.jpg}"
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
rows=$(python3 -c "import math;print(max(1, math.ceil(float('$dur') * $fps / 6)))")
ffmpeg -v error -y -i "$in" -vf "fps=$fps,scale=320:-2,tile=6x${rows}:padding=3" -frames:v 1 "$out"
echo "$out (${dur}s, ${fps} fps, 6x${rows})"
