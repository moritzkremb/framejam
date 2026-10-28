#!/usr/bin/env python3
"""Turn VAD speech islands and source-time words into an auditable edit plan.

A configured trigger phrase removes the entire VAD speech island containing it. No trigger is guessed or enabled by
default. Accepted transcript shapes: a word list, {"words": [...]}, or {"segments": [{"words": [...]}]}.
"""
import argparse
import json
import re
import subprocess
from pathlib import Path


def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True)


def write(path, data):
    Path(path).write_text(json.dumps(data, indent=2) + "\n")


def load_words(path):
    data = json.loads(Path(path).read_text())
    if isinstance(data, dict) and "words" in data:
        data = data["words"]
    elif isinstance(data, dict) and "segments" in data:
        data = [word for segment in data["segments"] for word in segment.get("words", [])]
    if not isinstance(data, list):
        raise SystemExit("Transcript has no word list.")
    words = []
    for item in data:
        if item.get("type", "word") != "word" or "start" not in item or "end" not in item:
            continue
        text = str(item.get("text", item.get("word", ""))).strip()
        if text:
            words.append({"text": text, "start": float(item["start"]), "end": float(item["end"])})
    if not words:
        raise SystemExit("Transcript has no word timestamps.")
    return words


def token(text):
    return re.sub(r"[^\w']+", "", text, flags=re.UNICODE).casefold()


def trigger_matches(words, phrases):
    matches = []
    for phrase in phrases:
        wanted = [token(part) for part in phrase.split() if token(part)]
        if not wanted:
            raise SystemExit("A --trigger phrase has no words.")
        for index in range(len(words) - len(wanted) + 1):
            got = [token(word["text"]) for word in words[index : index + len(wanted)]]
            if got == wanted:
                matches.append(
                    {
                        "phrase": phrase,
                        "wordStart": index,
                        "wordEnd": index + len(wanted) - 1,
                        "sourceStart": words[index]["start"],
                        "sourceEnd": words[index + len(wanted) - 1]["end"],
                    }
                )
    return sorted(matches, key=lambda x: (x["sourceStart"], x["sourceEnd"], x["phrase"]))


def parse_rate(value):
    if "/" in value:
        top, bottom = value.split("/", 1)
        return float(top) / float(bottom)
    return float(value)


def source_info(path):
    data = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)]).stdout)
    video = next((stream for stream in data["streams"] if stream.get("codec_type") == "video"), None)
    audio = next((stream for stream in data["streams"] if stream.get("codec_type") == "audio"), None)
    if video is None or audio is None:
        raise SystemExit("Source needs both video and audio streams.")
    rate = parse_rate(video.get("avg_frame_rate") or video.get("r_frame_rate") or "30")
    standard = min((24, 25, 30, 50, 60), key=lambda candidate: abs(candidate - rate))
    fps = standard if abs(standard - rate) < 0.6 else 30
    return {
        "duration": float(data["format"]["duration"]),
        "width": int(video["width"]),
        "height": int(video["height"]),
        "fps": fps,
        "probe": data,
    }


def find_island(islands, start, end):
    midpoint = (start + end) / 2
    for index, island in enumerate(islands):
        if island["start"] <= midpoint <= island["end"]:
            return index
    return None


def pad_and_merge(islands, total, pre_roll, post_roll):
    padded = []
    for island in islands:
        start = max(0.0, island["start"] - pre_roll)
        end = min(total, island["end"] + post_roll)
        if padded and start <= padded[-1]["end"]:
            padded[-1]["end"] = max(padded[-1]["end"], end)
        else:
            padded.append({"start": start, "end": end})
    return padded


def map_clips(clips, fps):
    out = []
    cursor_frames = 0
    for role, start, end in clips:
        frames = max(1, round((end - start) * fps))
        item = {
            "role": role,
            "sourceStart": round(start, 6),
            "sourceEnd": round(end, 6),
            "editedStart": round(cursor_frames / fps, 6),
            "editedEnd": round((cursor_frames + frames) / fps, 6),
            "frames": frames,
        }
        out.append(item)
        cursor_frames += frames
    return out


def retime(words, clips):
    out = []
    for clip_index, clip in enumerate(clips):
        for source_index, word in enumerate(words):
            overlap_start = max(word["start"], clip["sourceStart"])
            overlap_end = min(word["end"], clip["sourceEnd"])
            if overlap_end <= overlap_start:
                continue
            out.append(
                {
                    "text": word["text"],
                    "start": round(clip["editedStart"] + overlap_start - clip["sourceStart"], 6),
                    "end": round(clip["editedStart"] + overlap_end - clip["sourceStart"], 6),
                    "sourceStart": word["start"],
                    "sourceEnd": word["end"],
                    "sourceWordIndex": source_index,
                    "clipIndex": clip_index,
                    "role": clip["role"],
                }
            )
    return {"timebase": "edited_seconds", "words": out, "text": " ".join(word["text"] for word in out)}


def teaser_range(value, duration):
    if value is None:
        return None
    try:
        start, end = (float(part) for part in value.split(":", 1))
    except (ValueError, TypeError):
        raise SystemExit("--teaser must be SOURCE_START:SOURCE_END in seconds.")
    if not (0 <= start < end <= duration):
        raise SystemExit(f"--teaser must be inside the {duration:.3f} s source.")
    return start, end


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", required=True)
    parser.add_argument("--vad", required=True)
    parser.add_argument("--words", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--trigger", action="append", default=[], help="exact marker phrase; repeat for aliases")
    parser.add_argument("--teaser", help="source-time range START:END to repeat at the opening")
    parser.add_argument("--pre-roll", type=float, default=0.08)
    parser.add_argument("--post-roll", type=float, default=0.12)
    args = parser.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    if (out / "edit.json").exists():
        raise SystemExit("Use a new output directory; edit.json already exists.")
    source = Path(args.input).resolve()
    info = source_info(source)
    vad = json.loads(Path(args.vad).read_text())
    if vad.get("timebase") != "seconds" or not isinstance(vad.get("speech"), list):
        raise SystemExit("VAD JSON needs timebase=seconds and a speech list.")
    islands = []
    for item in vad["speech"]:
        start, end = float(item["start"]), float(item["end"])
        if not 0 <= start < end <= info["duration"] + 0.05:
            raise SystemExit(f"Invalid VAD range {start}:{end}.")
        islands.append({"start": max(0.0, start), "end": min(info["duration"], end)})
    islands.sort(key=lambda x: x["start"])
    for left, right in zip(islands, islands[1:]):
        if right["start"] < left["end"]:
            raise SystemExit("VAD speech ranges overlap; merge them before planning.")

    words = load_words(args.words)
    matches = trigger_matches(words, args.trigger)
    removed_indexes = set()
    decisions = []
    for match in matches:
        index = find_island(islands, match["sourceStart"], match["sourceEnd"])
        decision = {**match, "action": "unmatched"}
        if index is not None:
            removed_indexes.add(index)
            decision.update(
                {
                    "action": "remove_speech_island",
                    "island": index,
                    "removedStart": islands[index]["start"],
                    "removedEnd": islands[index]["end"],
                }
            )
        decisions.append(decision)

    kept = [island for index, island in enumerate(islands) if index not in removed_indexes]
    kept = pad_and_merge(kept, info["duration"], args.pre_roll, args.post_roll)
    if not kept:
        raise SystemExit("No speech remains after marker decisions.")
    teaser = teaser_range(args.teaser, info["duration"])
    raw_clips = []
    if teaser is not None:
        raw_clips.append(("teaser", teaser[0], teaser[1]))
    raw_clips.extend(("main", island["start"], island["end"]) for island in kept)
    clips = map_clips(raw_clips, info["fps"])
    edited = retime(words, clips)
    total = clips[-1]["editedEnd"]
    caption_size = max(24, round(info["height"] * 0.05))
    margin = max(24, round(info["height"] * 0.06))
    plan = {
        "version": 1,
        "source": str(source),
        "sourceDuration": round(info["duration"], 6),
        "duration": total,
        "fps": info["fps"],
        "width": info["width"],
        "height": info["height"],
        "styleBible": "STYLE_BIBLE.md",
        "vad": {
            "file": str(Path(args.vad).resolve()),
            "backend": vad.get("backend", "unknown"),
            "minSilence": vad.get("parameters", {}).get("minSilence", 0.5),
            "preRoll": args.pre_roll,
            "postRoll": args.post_roll,
        },
        "clips": clips,
        "triggers": args.trigger,
        "audio": {
            "highpassHz": 70,
            "lowpassHz": 16000,
            "denoiseDb": -25,
            "compressorThresholdDb": -18,
            "compressorRatio": 3,
            "loudnessLufs": -14,
            "truePeakDb": -1.5,
            "loudnessRange": 11,
        },
        "grade": {"brightness": 0, "contrast": 1, "saturation": 1, "gamma": 1},
        "teaser": {"enabled": teaser is not None, "label": "COMING UP", "swivel": 0.025},
        "captions": {
            "font": "DejaVu Sans",
            "size": caption_size,
            "color": "&H00FFFFFF",
            "outlineColor": "&H00000000",
            "outline": 3,
            "marginV": margin,
        },
        "graphics": [],
        "export": {"encoder": "libx264", "crf": 18},
    }
    write(out / "edit.json", plan)
    write(
        out / "decisions.json",
        {
            "timebase": "source_seconds",
            "triggersConfigured": args.trigger,
            "matches": decisions,
            "removedIslands": [islands[index] for index in sorted(removed_indexes)],
            "unmatched": [decision for decision in decisions if decision["action"] == "unmatched"],
        },
    )
    write(out / "edited.words.json", edited)
    write(out / "source-probe.json", info["probe"])
    print(
        json.dumps(
            {
                "out": str(out),
                "clips": len(clips),
                "duration": total,
                "triggerMatches": len(matches),
                "removedIslands": len(removed_indexes),
                "teaser": teaser is not None,
            }
        )
    )


if __name__ == "__main__":
    main()
