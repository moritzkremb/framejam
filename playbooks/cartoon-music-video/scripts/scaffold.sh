#!/usr/bin/env bash
# Scaffold a kinetic music-video project in the CURRENT directory.
# usage: bash <skill>/scripts/scaffold.sh /path/to/master.mp3
#   No song yet? Pass any placeholder audio file and replace audio/master.mp3 later (then rerun audio_analysis.py).
# Needs: node >= 20, uv (python 3.11), ffmpeg/ffprobe, Google Chrome (Playwright drives it headless with GPU).
# macOS: Xcode command-line tools (swiftc) to build the Apple Vision matte tool.
set -euo pipefail
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
MASTER_SRC="${1:?give the path to the song master (or a placeholder)}"
mkdir -p audio engine/scenes engine/data assets/fonts assets/refs assets/gen assets/clips assets/video assets/audio_slices assets/brand analysis out tools
[ "$MASTER_SRC" -ef "audio/master.${MASTER_SRC##*.}" ] || cp "$MASTER_SRC" "audio/master.${MASTER_SRC##*.}"
cp -R "$SKILL/engine/." engine/
cp "$SKILL/scripts/"*.py "$SKILL/scripts/"*.mjs "$SKILL/scripts/"*.swift "$SKILL/scripts/prep_clip.sh" tools/
mkdir -p tools/providers && cp "$SKILL/scripts/providers/"*.py tools/providers/   # optional ready-made provider helpers
cp "$SKILL/assets/fonts/"*.woff2 assets/fonts/
[ -f engine/timeline.js ] || cp "$SKILL/assets/timeline.template.js" engine/timeline.js
cp -n "$SKILL/assets/scene.template.js" engine/scenes/_template.js || true
cp -n "$SKILL/assets/smoke.template.js" engine/scenes/_smoke.js || true
cp -n "$SKILL/references/engine_api.md" ENGINE_API.md || true
cp -n "$SKILL/references/kit_api.md" KIT_API.md || true
cp -n "$SKILL/references/providers.md" PROVIDERS.md || true
cp -n "$SKILL/references/agent_brief_template.md" AGENTS_BRIEF.md || true

# Subject matte tool (Apple Vision foreground instance mask, ~0.1 s/frame, free). The newest SDK can be ahead of the
# installed swiftc ("this SDK is not supported by the compiler"), so fall back to older SDKs in turn.
if [ "$(uname)" = "Darwin" ] && command -v swiftc >/dev/null && [ ! -x tools/matte ]; then
  swiftc -O tools/matte.swift -o tools/matte 2>/dev/null || for sdk in $(ls -d /Library/Developer/CommandLineTools/SDKs/MacOSX[0-9]*.sdk 2>/dev/null | sort -rV); do
    swiftc -O -sdk "$sdk" tools/matte.swift -o tools/matte 2>/dev/null && { echo "matte built with $sdk"; break; }
  done
  [ -x tools/matte ] || echo "note: tools/matte not built (check: sudo xcodebuild -license accept). Fallbacks: a background-removal tool + tools/matte_keyed.py, or tools/matte_fallback.py."
fi

# Fonts (OFL, from google/fonts). Geist + Geist Mono ship with the skill. Add project fonts the same way (index.html @font-face + main.js document.fonts.load).
B=https://raw.githubusercontent.com/google/fonts/main/ofl
for p in "archivo/Archivo%5Bwdth,wght%5D.ttf:Archivo-VF.ttf" "archivoblack/ArchivoBlack-Regular.ttf:ArchivoBlack.ttf" "anton/Anton-Regular.ttf:Anton.ttf" \
  "jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf:JetBrainsMono-VF.ttf" "doto/Doto%5BROND,wght%5D.ttf:Doto-VF.ttf" "blackhansans/BlackHanSans-Regular.ttf:BlackHanSans.ttf" \
  "unbounded/Unbounded%5Bwght%5D.ttf:Unbounded-VF.ttf" "instrumentserif/InstrumentSerif-Italic.ttf:InstrumentSerif-Italic.ttf" "instrumentserif/InstrumentSerif-Regular.ttf:InstrumentSerif.ttf"; do
  [ -f "assets/fonts/${p##*:}" ] || curl -fsSL "$B/${p%%:*}" -o "assets/fonts/${p##*:}"
done

# JS deps
[ -f package.json ] || npm init -y >/dev/null
npm i -s three@0.170.0 playwright@1.49 opentype.js >/dev/null

# Python env (audio analysis, lyric alignment, stills/footage prep, tracking, sync checks)
export UV_NATIVE_TLS=1
uv venv .venv -q --python 3.11
.venv/bin/python -m ensurepip >/dev/null 2>&1 || true
uv pip install -q --python .venv/bin/python faster-whisper librosa soundfile numpy scipy demucs torch torchaudio opencv-python "mediapipe==0.10.14" matplotlib pillow "git+https://github.com/CPJKU/beat_this.git"
echo "scaffolded. master: audio/master.${MASTER_SRC##*.}"
echo "next: .venv/bin/python tools/audio_analysis.py audio/master.${MASTER_SRC##*.}"
