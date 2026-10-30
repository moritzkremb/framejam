#!/usr/bin/env python3
"""Create a short labelled side-by-side comparison and a technical JSON report.

The left input is the candidate and the right input is the previous or user-supplied local reference. This script
does not download media or claim visual-style parity.
"""
import argparse
import json
import re
import subprocess
from pathlib import Path


def run(args, check=True):
    return subprocess.run(args, check=check, capture_output=True, text=True)


def probe(path):
    result = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)]).stdout)
    video = next((stream for stream in result["streams"] if stream.get("codec_type") == "video"), None)
    audio = next((stream for stream in result["streams"] if stream.get("codec_type") == "audio"), None)
    if video is None:
        raise SystemExit(f"{path} has no video stream.")
    return {
        "duration": float(result["format"]["duration"]),
        "width": int(video["width"]),
        "height": int(video["height"]),
        "fps": video.get("avg_frame_rate", video.get("r_frame_rate")),
        "videoCodec": video.get("codec_name"),
        "audioCodec": audio.get("codec_name") if audio else None,
    }


def loudness(path, start, end):
    result = run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-ss",
            str(start),
            "-t",
            str(end - start),
            "-i",
            str(path),
            "-vn",
            "-af",
            "ebur128=framelog=quiet",
            "-f",
            "null",
            "-",
        ],
        check=False,
    )
    values = re.findall(r"\bI:\s*(-?[0-9.]+)\s+LUFS", result.stderr)
    return float(values[-1]) if values else None


def black_ranges(path, start, end):
    result = run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-ss",
            str(start),
            "-t",
            str(end - start),
            "-i",
            str(path),
            "-an",
            "-vf",
            "blackdetect=d=0.3:pix_th=0.05",
            "-f",
            "null",
            "-",
        ],
        check=False,
    )
    return [
        {"start": float(match.group(1)), "end": float(match.group(2))}
        for match in re.finditer(r"black_start:([0-9.]+)\s+black_end:([0-9.]+)", result.stderr)
    ]


def window(value, maximum):
    if value is None:
        return 0.0, min(8.0, maximum)
    try:
        start, end = (float(part) for part in value.split(":", 1))
    except (TypeError, ValueError):
        raise SystemExit("--window must be START:END in seconds.")
    if not 0 <= start < end <= maximum + 0.001:
        raise SystemExit(f"--window must fit inside both renders (maximum {maximum:.3f} s).")
    return start, min(end, maximum)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("candidate")
    parser.add_argument("reference")
    parser.add_argument("--window")
    parser.add_argument("--out", default="compare.mp4")
    parser.add_argument("--report", default="compare.json")
    parser.add_argument("--height", type=int, default=540)
    args = parser.parse_args()
    candidate, reference = Path(args.candidate).resolve(), Path(args.reference).resolve()
    candidate_info, reference_info = probe(candidate), probe(reference)
    start, end = window(args.window, min(candidate_info["duration"], reference_info["duration"]))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    graph = (
        f"[0:v]trim=start={start}:end={end},setpts=PTS-STARTPTS,"
        f"scale=-2:{args.height},drawtext=text='CANDIDATE':fontcolor=white:fontsize=28:"
        "box=1:boxcolor=black@0.65:boxborderw=8:x=24:y=24[left];"
        f"[1:v]trim=start={start}:end={end},setpts=PTS-STARTPTS,"
        f"scale=-2:{args.height},drawtext=text='REFERENCE':fontcolor=white:fontsize=28:"
        "box=1:boxcolor=black@0.65:boxborderw=8:x=24:y=24[right];"
        "[left][right]hstack=inputs=2[v];"
        f"[0:a]atrim=start={start}:end={end},asetpts=PTS-STARTPTS[a]"
    )
    result = run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-i",
            str(candidate),
            "-i",
            str(reference),
            "-filter_complex",
            graph,
            "-map",
            "[v]",
            "-map",
            "[a]",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-movflags",
            "+faststart",
            str(out),
        ],
        check=False,
    )
    if result.returncode:
        raise SystemExit(result.stderr.strip() or "ffmpeg comparison failed.")
    report = {
        "purpose": "technical and side-by-side review; no style-parity score",
        "window": {"start": start, "end": end},
        "candidate": {
            **candidate_info,
            "loudnessLufs": loudness(candidate, start, end),
            "blackRanges": black_ranges(candidate, start, end),
        },
        "reference": {
            **reference_info,
            "loudnessLufs": loudness(reference, start, end),
            "blackRanges": black_ranges(reference, start, end),
        },
        "comparison": str(out),
    }
    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"out": str(out), "report": str(report_path), "window": [start, end]}))


if __name__ == "__main__":
    main()
