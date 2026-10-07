"""OPTIONAL PROVIDER: generate a song with lyrics via the ElevenLabs Music API from a chunked composition plan.
Any other song source works (see references/providers.md); this is one ready-made option.

  python3 tools/providers/elevenlabs_song.py <take-name> [seed] [--plan analysis/song_plan.json] [--model music_v2_5]

Plan file: {"title": "...", "chunks": [{"text": "[Verse 1]\\nline\\n{gang shout} reply", "duration_ms": 24000,
            "positive_styles": [...], "negative_styles": [...]}, ...]}
  - text: optional [Section] header, lyric lines (<= 30 lines, <= 200 chars each), inline {directions}.
  - duration_ms per chunk 3000-120000; the sum is the song length (enforced for music_v2 / v2_5).
  - The first chunk's styles set the genre: give it 6-10 (genre, tempo, voices, instruments, "great production quality").
Key: ELEVENLABS_API_KEY from the environment or the project's .env (never printed). Writes audio/takes/<take>.mp3 + .json.
Generate 2 takes with different seeds in parallel, then pick by transcript completeness (see references/pipeline.md).
"""
import argparse
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]


def env_key(name):
    """API key from the environment, else from a .env file in the project root (never printed)."""
    if os.environ.get(name):
        return os.environ[name]
    for env in (ROOT / ".env", pathlib.Path.cwd() / ".env"):
        if env.exists():
            for line in env.read_text().splitlines():
                m = re.match(rf"\s*{name}\s*=\s*(.*)", line)
                if m:
                    return m[1].strip().strip("\"'")
    sys.exit(f"{name} missing: set it in the environment or in the project's .env")


ap = argparse.ArgumentParser()
ap.add_argument("take")
ap.add_argument("seed", nargs="?", type=int)
ap.add_argument("--plan", default=str(ROOT / "analysis" / "song_plan.json"))
ap.add_argument("--model", default="music_v2_5")
a = ap.parse_args()

key = env_key("ELEVENLABS_API_KEY")

plan = json.loads(pathlib.Path(a.plan).read_text())
body = {"composition_plan": {"chunks": plan["chunks"]}, "model_id": a.model}
if a.seed is not None:
    body["seed"] = a.seed
req = urllib.request.Request("https://api.elevenlabs.io/v1/music?output_format=mp3_48000_192", data=json.dumps(body).encode(),
                             headers={"xi-api-key": key, "Content-Type": "application/json", "User-Agent": "webgl-music-video/1.0"})
try:
    resp = urllib.request.urlopen(req, timeout=900)
except urllib.error.HTTPError as e:
    sys.exit(f"HTTP {e.code}: {e.read().decode()[:2000]}")
out = ROOT / "audio" / "takes" / f"{a.take}.mp3"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_bytes(resp.read())
song_id = resp.headers.get("song-id") or resp.headers.get("x-song-id")
out.with_suffix(".json").write_text(json.dumps({"seed": a.seed, "model": a.model, "song_id": song_id}, indent=1))
print(out, song_id)
