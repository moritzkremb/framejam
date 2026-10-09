#!/usr/bin/env bash
# Start a new showreel project from this playbook's Hyperframes template.
# Usage: bash scaffold.sh <project-dir>
# Creates the Hyperframes project, copies the template (with its 120 BPM music track) and the helper scripts
# (into tools/), so the template renders right away.
set -euo pipefail
dir="$1"
here="$(cd "$(dirname "$0")/.." && pwd)"
if [ ! -f "$dir/hyperframes.json" ]; then
  npx --yes hyperframes init "$dir" --non-interactive >/dev/null
fi
cp -R "$here/template/." "$dir/"
mkdir -p "$dir/tools" "$dir/renders"
cp "$here/scripts/beat_grid.py" "$here/scripts/sync_check.py" "$here/scripts/sheet.sh" "$dir/tools/"
echo "ready: $dir (preview: cd \"$dir\" && npx hyperframes preview)"
