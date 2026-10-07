#!/usr/bin/env python3
"""Fill scripts/index.template.html with the clock -> index.html (Hyperframes).

    python scripts/build_html.py

Placeholders: {{TOTAL}}, {{TIMING}} (the whole timing.json), {{start:<scene id>}}, {{dur:<scene id>}},
{{WIPES}} (a short wipe clip at every scene change). Rerun after every build_timing.py.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
T = json.loads((ROOT / "assets" / "timing.json").read_text())
S = {s["id"]: s for s in T["scenes"]}
html = (ROOT / "scripts" / "index.template.html").read_text()

wipes = []
for i, s in enumerate(T["scenes"][1:], start=1):
    wipes.append(
        f'<div class="layer clip wipe" id="wipe{i}" data-start="{s["start"] - 0.35:.3f}" data-duration="0.7" '
        f'data-track-index="5"><div class="wipe-bar" id="wb{i}"></div></div>')

html = html.replace("{{WIPES}}", "\n      ".join(wipes))
html = html.replace("{{TOTAL}}", f'{T["total"]:.3f}')
html = html.replace("{{TIMING}}", json.dumps(T))
html = re.sub(r"\{\{start:([\w.-]+)\}\}", lambda m: f'{S[m.group(1)]["start"]:.3f}', html)
html = re.sub(r"\{\{dur:([\w.-]+)\}\}", lambda m: f'{S[m.group(1)]["dur"]:.3f}', html)
left = re.findall(r"\{\{[^}]+\}\}", html)
assert not left, f"unfilled placeholders: {left}"
(ROOT / "index.html").write_text(html)
print("index.html written, total", T["total"])
