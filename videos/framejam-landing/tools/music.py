"""Background music via ElevenLabs Music (music_v2), the same route as the Clawdia video pipelines.

  python3 tools/music.py "<prompt>" [take-name]

Reads ELEVENLABS_API_KEY from ~/Clawdia/.env (never printed). Writes assets/audio/music-<take>.mp3.
"""
import json
import pathlib
import re
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENV = pathlib.Path.home() / "Clawdia" / ".env"
LENGTH_S = 36.4 + 3

prompt = sys.argv[1]
take = sys.argv[2] if len(sys.argv) > 2 else "a"
key = next(re.match(r"\s*ELEVENLABS_API_KEY\s*=\s*(.*)", l)[1].strip().strip("\"'")
           for l in ENV.read_text().splitlines() if re.match(r"\s*ELEVENLABS_API_KEY\s*=", l))
body = json.dumps({"prompt": prompt, "music_length_ms": int(LENGTH_S * 1000), "model_id": "music_v2"}).encode()
req = urllib.request.Request("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192", data=body,
                             headers={"xi-api-key": key, "Content-Type": "application/json", "User-Agent": "framejam/1.0"})
data = urllib.request.urlopen(req, timeout=600).read()
out = ROOT / "assets" / "audio" / f"music-{take}.mp3"
out.write_bytes(data)
(ROOT / "assets" / "audio" / f"music-{take}.prompt.txt").write_text(prompt + "\n")
print(out)
