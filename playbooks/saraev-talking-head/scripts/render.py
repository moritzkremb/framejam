#!/usr/bin/env python3
"""Render an edit plan with ffmpeg: cuts, grade, audio, teaser, captions, graphics and export.

  python3 render.py working/edit-01/edit.json --out renders/draft-01.mp4
  python3 render.py working/edit-01/edit.json --sample 0:8 --out working/sample.mp4
  python3 render.py working/edit-01/edit.json --captions captions.srt --force-captions --out renders/accessible.mp4
  python3 render.py working/edit-01/edit.json --encoder auto --out renders/draft-hw.mp4
"""
import argparse
import json
import platform
import shutil
import subprocess
import tempfile
import time
from pathlib import Path


HARDWARE_ENCODERS = {"h264_nvenc", "h264_qsv", "h264_vaapi", "h264_videotoolbox"}


def filter_path(path):
    return str(Path(path).resolve()).replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")


def num(value):
    return f"{float(value):.6f}".rstrip("0").rstrip(".")


def available_encoders():
    result = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True)
    return {name for name in ["libx264", *sorted(HARDWARE_ENCODERS)] if name in result.stdout}


def choose_encoder(requested):
    available = available_encoders()
    if requested != "auto":
        if requested not in available:
            raise SystemExit(f"ffmpeg does not list encoder {requested}. Available choices: {', '.join(sorted(available))}")
        return requested
    if platform.system() == "Darwin" and "h264_videotoolbox" in available:
        return "h264_videotoolbox"
    if Path("/dev/nvidia0").exists() and "h264_nvenc" in available:
        return "h264_nvenc"
    if Path("/dev/dri/renderD128").exists() and "h264_vaapi" in available:
        return "h264_vaapi"
    return "libx264"


def encoder_args(encoder, plan, vaapi_device):
    crf = str(plan.get("export", {}).get("crf", 18))
    if encoder == "libx264":
        return [], ["-c:v", encoder, "-preset", "medium", "-crf", crf]
    if encoder == "h264_nvenc":
        return [], ["-c:v", encoder, "-preset", "p4", "-cq", crf, "-b:v", "0"]
    if encoder == "h264_qsv":
        return [], ["-c:v", encoder, "-global_quality", crf]
    if encoder == "h264_videotoolbox":
        return [], ["-c:v", encoder, "-q:v", "65", "-realtime", "true"]
    if encoder == "h264_vaapi":
        return ["-vaapi_device", vaapi_device], ["-c:v", encoder, "-global_quality", crf]
    raise SystemExit(f"Unsupported encoder {encoder}.")


def parse_sample(value, duration):
    if not value:
        return 0.0, float(duration)
    try:
        start, end = (float(part) for part in value.split(":", 1))
    except (TypeError, ValueError):
        raise SystemExit("--sample must be EDITED_START:EDITED_END in seconds.")
    if not (0 <= start < end <= float(duration) + 0.001):
        raise SystemExit(f"--sample must fit inside the {duration:.3f} s edit.")
    return start, min(end, float(duration))


def select_clips(plan, sample_start, sample_end):
    selected = []
    for clip in plan["clips"]:
        start = max(sample_start, float(clip["editedStart"]))
        end = min(sample_end, float(clip["editedEnd"]))
        if end <= start:
            continue
        offset = start - float(clip["editedStart"])
        selected.append(
            {
                "role": clip.get("role", "main"),
                "sourceStart": float(clip["sourceStart"]) + offset,
                "sourceEnd": float(clip["sourceStart"]) + offset + (end - start),
                "originalStart": start,
                "originalEnd": end,
            }
        )
    if not selected:
        raise SystemExit("The sample window contains no clips.")
    return selected


def validate_plan(plan):
    required = ["source", "duration", "fps", "width", "height", "clips"]
    missing = [key for key in required if key not in plan]
    if missing:
        raise SystemExit("Plan is missing: " + ", ".join(missing))
    if not plan["clips"]:
        raise SystemExit("Plan has no clips.")
    cursor = 0.0
    for clip in plan["clips"]:
        if abs(float(clip["editedStart"]) - cursor) > 0.002:
            raise SystemExit("Plan clips are not contiguous in edited time.")
        if float(clip["sourceEnd"]) <= float(clip["sourceStart"]):
            raise SystemExit("Plan has an empty source clip.")
        cursor = float(clip["editedEnd"])
    if abs(cursor - float(plan["duration"])) > 0.002:
        raise SystemExit("Plan duration does not match its clips.")


def build_graph(plan, clips, sample_start, sample_end, captions, tmp, encoder):
    width, height, fps = int(plan["width"]), int(plan["height"]), int(plan["fps"])
    count = len(clips)
    teaser = plan.get("teaser", {})
    active_cards = [
        card
        for card in teaser.get("microClips", [])
        if float(card["editedEnd"]) > sample_start and float(card["editedStart"]) < sample_end
    ]
    graph = []
    video_count = count + len(active_cards)
    if video_count == 1:
        video_sources, card_sources = ["0:v"], []
    else:
        all_video_sources = [f"vs{index}" for index in range(video_count)]
        video_sources, card_sources = all_video_sources[:count], all_video_sources[count:]
        graph.append(f"[0:v]split={video_count}" + "".join(f"[{name}]" for name in all_video_sources))
    if count == 1:
        audio_sources = ["0:a"]
    else:
        audio_sources = [f"as{index}" for index in range(count)]
        graph.append(f"[0:a]asplit={count}" + "".join(f"[{name}]" for name in audio_sources))

    grade = plan.get("grade", {})
    grade_filter = (
        f"eq=brightness={num(grade.get('brightness', 0))}:"
        f"contrast={num(grade.get('contrast', 1))}:"
        f"saturation={num(grade.get('saturation', 1))}:"
        f"gamma={num(grade.get('gamma', 1))}"
    )
    if grade.get("lut"):
        grade_filter += f",lut3d=file='{filter_path(grade['lut'])}'"
    concat_inputs = []
    for index, clip in enumerate(clips):
        duration = clip["sourceEnd"] - clip["sourceStart"]
        base = (
            f"[{video_sources[index]}]trim=start={num(clip['sourceStart'])}:end={num(clip['sourceEnd'])},"
            f"setpts=PTS-STARTPTS,fps={fps},"
        )
        if clip["role"] == "teaser":
            visual = f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}"
        else:
            visual = f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}"
        graph.append(base + visual + f",setsar=1,{grade_filter}[v{index}]")
        graph.append(
            f"[{audio_sources[index]}]atrim=start={num(clip['sourceStart'])}:end={num(clip['sourceEnd'])},"
            f"asetpts=PTS-STARTPTS[a{index}]"
        )
        concat_inputs.append(f"[v{index}][a{index}]")
    graph.append("".join(concat_inputs) + f"concat=n={count}:v=1:a=1[vcat][acat]")

    audio = plan.get("audio", {})
    audio_filters = [f"highpass=f={num(audio.get('highpassHz', 70))}"]
    if audio.get("lowpassHz"):
        audio_filters.append(f"lowpass=f={num(audio['lowpassHz'])}")
    if audio.get("denoiseDb") is not None:
        audio_filters.append(f"afftdn=nf={num(audio['denoiseDb'])}")
    for band in audio.get("eq", []):
        audio_filters.append(
            f"equalizer=f={num(band['frequencyHz'])}:width_type=q:w={num(band.get('q', 1))}:g={num(band['gainDb'])}"
        )
    audio_filters.extend(
        [
            f"acompressor=threshold={num(audio.get('compressorThresholdDb', -18))}dB:"
            f"ratio={num(audio.get('compressorRatio', 3))}:attack=20:release=250:makeup=4",
            f"loudnorm=I={num(audio.get('loudnessLufs', -16))}:"
            f"TP={num(audio.get('truePeakDb', -0.4))}:"
            f"LRA={num(audio.get('loudnessRange', 11))}",
            "aresample=48000",
        ]
    )
    graph.append(f"[acat]{','.join(audio_filters)}[aout]")

    visual = "vcat"
    if active_cards:
        intervals = []
        for card in active_cards:
            local_start = max(float(card["editedStart"]), sample_start) - sample_start
            local_end = min(float(card["editedEnd"]), sample_end) - sample_start
            intervals.append(f"between(t,{num(local_start)},{num(local_end)})")
        graph.append(f"[{visual}]split=2[vclear][vblur]")
        graph.append("[vblur]boxblur=luma_radius=20:luma_power=2[vblurred]")
        graph.append(f"[vclear][vblurred]overlay=enable='{'+'.join(intervals)}'[vbg]")
        visual = "vbg"
        card_scale = float(teaser.get("cardScale", 0.72))
        card_width = max(2, round(width * card_scale / 2) * 2)
        card_height = max(2, round(height * card_scale / 2) * 2)
        tilt = float(teaser.get("cardTiltDegrees", -3))
        for index, (card, card_source) in enumerate(zip(active_cards, card_sources)):
            full_start, full_end = float(card["editedStart"]), float(card["editedEnd"])
            local_start = max(full_start, sample_start) - sample_start
            local_end = min(full_end, sample_end) - sample_start
            source_offset = max(sample_start - full_start, 0)
            source_start = float(card["sourceStart"]) + source_offset
            source_end = source_start + (local_end - local_start)
            graph.append(
                f"[{card_source}]trim=start={num(source_start)}:end={num(source_end)},"
                f"setpts=PTS-STARTPTS+{num(local_start)}/TB,fps={fps},"
                f"scale={card_width}:{card_height}:force_original_aspect_ratio=increase,"
                f"crop={card_width}:{card_height},format=rgba,"
                "pad=iw+24:ih+24:12:12:color=0xfbfdfa,"
                f"rotate={num(tilt)}*PI/180:fillcolor=0x00000000:ow=rotw(iw):oh=roth(ih)[card{index}]"
            )
            graph.append(
                f"[{visual}][card{index}]overlay=x=(main_w-overlay_w)/2:y=(main_h-overlay_h)/2:"
                f"enable='between(t,{num(local_start)},{num(local_end)})':eof_action=pass[vcard{index}]"
            )
            visual = f"vcard{index}"

    # Put the sample on the full edit's clock so SRT and graphic times stay valid, then reset at the end.
    graph.append(f"[{visual}]setpts=PTS+{num(sample_start)}/TB[vclock]")
    last = "vclock"
    caption_style = plan.get("captions", {})
    if captions:
        style = ",".join(
            [
                f"FontName={caption_style.get('font', 'DejaVu Sans')}",
                f"FontSize={int(caption_style.get('size', max(24, height * 0.05)))}",
                f"PrimaryColour={caption_style.get('color', '&H00FFFFFF')}",
                f"OutlineColour={caption_style.get('outlineColor', '&H00000000')}",
                f"Outline={int(caption_style.get('outline', 3))}",
                f"MarginV={int(caption_style.get('marginV', max(24, height * 0.06)))}",
                "Alignment=2",
            ]
        )
        graph.append(f"[{last}]subtitles=filename='{filter_path(captions)}':force_style='{style}'[vcap]")
        last = "vcap"

    events = []
    for item in plan.get("graphics", []):
        events.append({**item, "kind": "graphic"})

    for index, event in enumerate(events):
        start, end = float(event["start"]), float(event["end"])
        if end <= sample_start or start >= sample_end:
            continue
        text_path = Path(tmp) / f"text-{index}.txt"
        text_path.write_text(str(event["text"]))
        position = event.get("position", "top")
        if position == "bottom":
            y = f"h-text_h-{max(24, round(height * 0.08))}"
        elif position == "center":
            y = "(h-text_h)/2"
        else:
            y = str(max(24, round(height * 0.08)))
        size = int(event.get("size", max(22, round(height * 0.055))))
        graph.append(
            f"[{last}]drawtext=textfile='{filter_path(text_path)}':"
            f"font='{caption_style.get('font', 'DejaVu Sans')}':fontsize={size}:"
            "fontcolor=white:borderw=2:bordercolor=black@0.8:box=1:boxcolor=black@0.55:boxborderw=10:"
            f"x=(w-text_w)/2:y={y}:enable='between(t,{num(start)},{num(end)})'[vt{index}]"
        )
        last = f"vt{index}"

    graph.append(f"[{last}]setpts=PTS-{num(sample_start)}/TB[vlocal]")
    if encoder == "h264_vaapi":
        graph.append("[vlocal]format=nv12,hwupload[vout]")
    else:
        graph.append("[vlocal]format=yuv420p[vout]")
    return graph


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("edit")
    parser.add_argument("--captions")
    parser.add_argument("--sample", help="edited-time window START:END")
    parser.add_argument("--out", default="renders/draft.mp4")
    parser.add_argument("--encoder", default=None)
    parser.add_argument("--force-captions", action="store_true", help="render supplied SRT even when plan captions are disabled")
    parser.add_argument("--vaapi-device", default="/dev/dri/renderD128")
    parser.add_argument("--keep", action="store_true")
    args = parser.parse_args()

    plan_path = Path(args.edit).resolve()
    plan = json.loads(plan_path.read_text())
    validate_plan(plan)
    sample_start, sample_end = parse_sample(args.sample, float(plan["duration"]))
    clips = select_clips(plan, sample_start, sample_end)
    requested = args.encoder or plan.get("export", {}).get("encoder", "libx264")
    encoder = choose_encoder(requested)
    global_args, video_args = encoder_args(encoder, plan, args.vaapi_device)
    source = Path(plan["source"])
    if not source.is_absolute():
        source = (plan_path.parent / source).resolve()
    if not source.exists():
        raise SystemExit(f"Source not found: {source}")
    if plan.get("grade", {}).get("lut"):
        lut = Path(plan["grade"]["lut"])
        if not lut.is_absolute():
            lut = (plan_path.parent / lut).resolve()
        if not lut.exists():
            raise SystemExit(f"LUT not found: {lut}")
        plan["grade"]["lut"] = str(lut)
    captions = Path(args.captions).resolve() if args.captions else None
    if captions and not captions.exists():
        raise SystemExit(f"Captions not found: {captions}")
    if captions and not (args.force_captions or plan.get("captions", {}).get("enabled", False)):
        captions = None
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="saraev-render-")
    started = time.time()
    try:
        graph = build_graph(plan, clips, sample_start, sample_end, captions, tmp, encoder)
        graph_file = Path(tmp) / "filter.txt"
        graph_file.write_text(";\n".join(graph) + "\n")
        command = [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            *global_args,
            "-i",
            str(source),
            "-filter_complex_script",
            str(graph_file),
            "-map",
            "[vout]",
            "-map",
            "[aout]",
            "-t",
            num(sample_end - sample_start),
            "-r",
            str(plan["fps"]),
            *video_args,
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            str(out),
        ]
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode:
            detail = result.stderr.strip() or "ffmpeg failed without an error message"
            raise SystemExit(f"Render failed with {encoder}: {detail}")
        print(
            json.dumps(
                {
                    "out": str(out),
                    "duration": round(sample_end - sample_start, 6),
                    "sample": [sample_start, sample_end],
                    "encoder": encoder,
                    "seconds": round(time.time() - started, 2),
                }
            )
        )
    finally:
        if args.keep:
            print(f"kept {tmp}")
        else:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
