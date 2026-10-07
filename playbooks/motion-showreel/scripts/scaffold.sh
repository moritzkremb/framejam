#!/usr/bin/env bash
# Start a new showreel project from this playbook's Hyperframes template.
# Usage: bash scaffold.sh <project-dir> [scratch_beat.py options, e.g. --bpm 120 --bars 8 --hits 12,24]
# Creates the Hyperframes project, copies the template and the helper scripts (into tools/),
# and writes a scratch beat to assets/music.wav so the template renders right away.
set -euo pipefail
dir="$1"; shift || true
here="$(cd "$(dirname "$0")/.." && pwd)"
if [ ! -f "$dir/hyperframes.json" ]; then
  npx --yes hyperframes init "$dir" --non-interactive >/dev/null
fi
cp -R "$here/template/." "$dir/"
mkdir -p "$dir/tools" "$dir/renders"
cp "$here/scripts/beat_grid.py" "$here/scripts/scratch_beat.py" "$here/scripts/sync_check.py" "$here/scripts/sheet.sh" "$dir/tools/"
python3 "$dir/tools/scratch_beat.py" --bpm 120 --bars 8 --hits 12,24 "$@" --out "$dir/assets/music.wav"
echo "ready: $dir (preview: cd \"$dir\" && npx hyperframes preview)"
