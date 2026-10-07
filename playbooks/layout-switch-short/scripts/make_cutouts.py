#!/usr/bin/env python3
"""Cut the speaker out of the edited talking-head video for every "visual" beat in edit.json.

For each beat with "layout": "visual" it trims the speaker video to the beat (frame-accurate re-encode), removes the
background locally with `npx hyperframes remove-background` (free, runs on this computer, about 5-10 frames per
second on a laptop) and writes assets/cutouts/<beat-id>.webm (VP9 with transparency). It then sets each beat's
"cutout" field in edit.json. Existing cutouts are kept unless --force.
"""
import argparse, json, subprocess
from pathlib import Path


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--edit", default="edit.json")
    ap.add_argument("--outdir", default="assets/cutouts")
    ap.add_argument("--pad", type=float, default=0.1, help="extra seconds kept after each beat")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()

    edit_path = Path(a.edit)
    e = json.loads(edit_path.read_text())
    root = edit_path.parent
    speaker = root / e["speaker"]
    outdir = root / a.outdir
    outdir.mkdir(parents=True, exist_ok=True)
    beats = sorted(e["beats"], key=lambda b: b["start"])
    for i, b in enumerate(beats):
        b.setdefault("id", f"b{i + 1:02d}")
        end = b.get("end", beats[i + 1]["start"] if i + 1 < len(beats) else e["duration"])
        if b["layout"] != "visual":
            continue
        target = outdir / f"{b['id']}.webm"
        if target.exists() and not a.force:
            print(f"keep {target}")
        else:
            seg = outdir / f"{b['id']}-src.mp4"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(b["start"]), "-i", str(speaker), "-t", str(end - b["start"] + a.pad),
                            "-an", "-c:v", "libx264", "-crf", "14", "-pix_fmt", "yuv420p", str(seg)], check=True)
            subprocess.run(["npx", "-y", "hyperframes", "remove-background", str(seg), "-o", str(target), "--quality", "best"], check=True)
            seg.unlink()
            print(f"wrote {target}")
        b["cutout"] = str(target.relative_to(root))
    e["beats"] = beats
    edit_path.write_text(json.dumps(e, indent=2) + "\n")


if __name__ == "__main__":
    main()
