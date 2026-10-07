#!/usr/bin/env python3
"""Copy rendered storyboard stills into storyboard/ as 01-<Scene>.png, 02-<Scene>.png, ... and print the
`panels` list for FrameJam's open_review (title = scene id, caption = that scene's narration).

    manim -qm -s -a storyboard.py && python scripts/panels.py
"""
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "build" / "media" / "images" / "storyboard"
DST = ROOT / "storyboard"


def main():
    script = json.loads((ROOT / "script.json").read_text())
    text = {s["id"]: " ".join(l["text"] for l in s["lines"]) for s in script["scenes"]}
    DST.mkdir(exist_ok=True)
    panels = []
    for png in sorted(SRC.glob("Panel*.png")):
        m = re.match(r"Panel(\d+)_([A-Za-z0-9]+)", png.stem)
        if not m:
            continue
        num, scene = m.groups()
        name = f"{int(num):02d}-{scene}.png"
        shutil.copy(png, DST / name)
        panels.append({"path": name, "title": scene, "caption": text.get(scene, "")})
    print(json.dumps({"panelsDir": str(DST), "panels": panels}, indent=1))


if __name__ == "__main__":
    main()
