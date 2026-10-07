#!/usr/bin/env python3
"""Storyboard panels from a Hyperframes build: the last fully-built frame of every scene.

    python scripts/panels.py            # -> storyboard/01-<id>.png ... and the open_review arguments

Runs `npx hyperframes snapshot` at each scene's end (minus 0.6 s) with Gemini description off, copies the
frames to storyboard/ and prints panelsDir + panels (title = chapter or id, caption = the narration).
Works before the real voice exists: build_timing.py with estimated or draft audio is enough.
"""
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    T = json.loads((ROOT / "assets" / "timing.json").read_text())
    script = json.loads((ROOT / "script.json").read_text())
    text = {s["id"]: s["text"] for s in script["scenes"]}
    times = [round(s["start"] + s["dur"] - 0.6, 2) for s in T["scenes"]]
    out = ROOT / "build" / "panels"
    shutil.rmtree(out, ignore_errors=True)
    subprocess.run(["npx", "hyperframes", "snapshot", "--at", ",".join(map(str, times)), "--no-end",
                    "--describe", "false", "-o", str(out)], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    shots = sorted(out.glob("frame-*.png"))
    dst = ROOT / "storyboard"
    shutil.rmtree(dst, ignore_errors=True)
    dst.mkdir()
    panels = []
    for i, (s, png) in enumerate(zip(T["scenes"], shots), start=1):
        name = f"{s['id']}.png" if s["id"][:2].isdigit() else f"{i:02d}-{s['id']}.png"
        shutil.copy(png, dst / name)
        panels.append({"path": name, "title": s.get("chapter") or s["id"], "caption": text.get(s["id"], "")})
    print(json.dumps({"panelsDir": str(dst), "panels": panels}, indent=1))


if __name__ == "__main__":
    main()
