#!/usr/bin/env python3
"""Export a final.edl.json from prepare_edit.py as editor cut lists.

Writes <name>.edl (CMX3600, for DaVinci Resolve / Premiere / Avid), <name>.fcpxml (Final Cut Pro, Resolve) and
<name>.csv (plain table). Each kept range becomes one clip on the timeline that points at the untouched source file,
so the user can keep editing the cut in their own editor.
"""
import argparse, csv, json, os
from pathlib import Path
from urllib.parse import quote


def tc(frames, fps):
    s, f = divmod(int(frames), fps)
    m, s = divmod(s, 60)
    h, m = divmod(m, 60)
    return f"{h:02d}:{m:02d}:{s:02d}:{f:02d}"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--edl", required=True, help="final.edl.json written by prepare_edit.py")
    ap.add_argument("--source", required=True, help="the original recording the EDL points at")
    ap.add_argument("--out", required=True, help="output folder")
    ap.add_argument("--name", default="clean-cut")
    ap.add_argument("--record-start", default="01:00:00:00", help="timeline start timecode for the CMX3600 list")
    a = ap.parse_args()

    edl = json.loads(Path(a.edl).read_text())
    fps = int(edl["fps"])
    clips = edl["clips"]
    src = Path(a.source).resolve()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    rec0 = sum(int(x) * m for x, m in zip(a.record_start.split(":"), (3600 * fps, 60 * fps, fps, 1)))

    lines = [f"TITLE: {a.name}", "FCM: NON-DROP FRAME", ""]
    rec = rec0
    for i, c in enumerate(clips, 1):
        s_in = round(c["source_start"] * fps)
        s_out = s_in + c["frames"]
        lines.append(f"{i:03d}  AX       AA/V  C        {tc(s_in, fps)} {tc(s_out, fps)} {tc(rec, fps)} {tc(rec + c['frames'], fps)}")
        lines.append(f"* FROM CLIP NAME: {src.name}")
        lines.append("")
        rec += c["frames"]
    (out / f"{a.name}.edl").write_text("\n".join(lines))

    probe = json.loads(os.popen(f"ffprobe -v quiet -show_streams -show_format -of json {json.dumps(str(src))}").read())
    v = next(s for s in probe["streams"] if s["codec_type"] == "video")
    au = next((s for s in probe["streams"] if s["codec_type"] == "audio"), None)
    w, h = int(v["width"]), int(v["height"])
    src_frames = int(float(probe["format"]["duration"]) * fps)
    total = sum(c["frames"] for c in clips)
    rate = au["sample_rate"] if au else "48000"
    chans = au.get("channels", 2) if au else 2
    url = "file://" + quote(str(src))
    spine, off = [], 0
    for i, c in enumerate(clips, 1):
        s_in = round(c["source_start"] * fps)
        spine.append(
            f'        <asset-clip ref="r2" name="{src.stem} {i:03d}" offset="{off}/{fps}s" start="{s_in}/{fps}s" '
            f'duration="{c["frames"]}/{fps}s" format="r1" tcFormat="NDF"/>'
        )
        off += c["frames"]
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r1" frameDuration="1/{fps}s" width="{w}" height="{h}"/>
    <asset id="r2" name="{src.stem}" start="0s" duration="{src_frames}/{fps}s" hasVideo="1" hasAudio="{1 if au else 0}" format="r1" audioSources="1" audioChannels="{chans}" audioRate="{rate}">
      <media-rep kind="original-media" src="{url}"/>
    </asset>
  </resources>
  <library>
    <event name="{a.name}">
      <project name="{a.name}">
        <sequence format="r1" duration="{total}/{fps}s" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
{chr(10).join(spine)}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
"""
    (out / f"{a.name}.fcpxml").write_text(xml)

    with open(out / f"{a.name}.csv", "w", newline="") as f:
        wr = csv.writer(f)
        wr.writerow(["clip", "source_in", "source_out", "edited_in", "edited_out", "frames"])
        for i, c in enumerate(clips, 1):
            wr.writerow([i, f"{c['source_start']:.3f}", f"{c['source_end']:.3f}", f"{c['edited_start']:.3f}", f"{c['edited_end']:.3f}", c["frames"]])
    print(json.dumps({"clips": len(clips), "fps": fps, "duration": total / fps, "files": [f"{a.name}.edl", f"{a.name}.fcpxml", f"{a.name}.csv"]}))


if __name__ == "__main__":
    main()
