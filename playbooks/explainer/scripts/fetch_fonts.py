#!/usr/bin/env python3
"""Download Google Fonts (free) as local woff2 files so renders are identical on every machine.

    python scripts/fetch_fonts.py "Gochi Hand" "Patrick Hand:400" "JetBrains Mono:700"

Writes assets/fonts/<Family>-<weight>.woff2 and prints the @font-face rules to paste into the composition.
Uses the Fontsource CDN (latin subset).
"""
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "fonts"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rules = []
    for arg in sys.argv[1:]:
        family, _, weights = arg.partition(":")
        fid = family.strip().lower().replace(" ", "-")
        for weight in (weights or "400").split(","):
            name = f"{family.replace(' ', '')}-{weight}.woff2"
            url = f"https://cdn.jsdelivr.net/fontsource/fonts/{fid}@latest/latin-{weight}-normal.woff2"
            urllib.request.urlretrieve(url, OUT / name)
            rules.append(f'@font-face {{ font-family: "{family}"; src: url("assets/fonts/{name}") format("woff2"); '
                         f"font-weight: {weight}; }}")
            print("got", name, file=sys.stderr)
    print("\n".join(rules))


if __name__ == "__main__":
    main()
