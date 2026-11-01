#!/usr/bin/env python3
"""Group edited-time words into short captions and write SRT plus a JSON audit file."""
import argparse
import json
import math
import re
from pathlib import Path


def load_words(path):
    data = json.loads(Path(path).read_text())
    if isinstance(data, dict):
        data = data.get("words", [])
    words = []
    for item in data:
        if "start" not in item or "end" not in item:
            continue
        text = str(item.get("text", item.get("word", ""))).strip()
        if text:
            words.append({"text": text, "start": float(item["start"]), "end": float(item["end"])})
    if not words:
        raise SystemExit("No edited-time words found.")
    return words


def timestamp(seconds):
    milliseconds = round(seconds * 1000)
    return (
        f"{milliseconds // 3600000:02d}:"
        f"{milliseconds // 60000 % 60:02d}:"
        f"{milliseconds // 1000 % 60:02d},"
        f"{milliseconds % 1000:03d}"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--words", required=True)
    parser.add_argument("--out", default="captions.srt")
    parser.add_argument("--max-words", type=int, default=4)
    parser.add_argument("--max-chars", type=int, default=30)
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--fix", action="append", default=[], help="case-insensitive old=new replacement")
    args = parser.parse_args()
    if args.max_words < 1 or args.max_chars < 1:
        raise SystemExit("Caption limits must be positive.")
    words = load_words(args.words)
    fixes = {}
    for value in args.fix:
        if "=" not in value:
            raise SystemExit("--fix must look like old=new.")
        old, new = value.split("=", 1)
        fixes[old.casefold()] = new
    for word in words:
        bare = re.sub(r"[^\w']+", "", word["text"]).casefold()
        if bare in fixes:
            trail = re.search(r"[^\w']*$", word["text"]).group(0)
            word["text"] = fixes[bare] + trail

    runs, current = [], []
    for word in words:
        if current and (word["start"] - current[-1]["end"] > 0.45 or re.search(r"[.!?]$", current[-1]["text"])):
            runs.append(current)
            current = []
        current.append(word)
    if current:
        runs.append(current)

    groups = []
    for run in runs:
        count = max(1, math.ceil(len(run) / args.max_words))
        while count <= len(run):
            sizes = [len(run) // count + (1 if index < len(run) % count else 0) for index in range(count)]
            chunks, cursor = [], 0
            for size in sizes:
                chunks.append(run[cursor : cursor + size])
                cursor += size
            if count == len(run) or all(len(" ".join(word["text"] for word in chunk)) <= args.max_chars for chunk in chunks):
                groups.extend(chunks)
                break
            count += 1

    captions = []
    for group in groups:
        start = math.floor(group[0]["start"] * args.fps) / args.fps
        end = math.ceil(max(group[-1]["end"], start + 0.2) * args.fps) / args.fps
        captions.append(
            {
                "start": round(start, 6),
                "end": round(end, 6),
                "text": " ".join(word["text"] for word in group).rstrip(".,;:"),
            }
        )
    for index in range(len(captions) - 1):
        captions[index]["end"] = min(captions[index]["end"], captions[index + 1]["start"])
    captions = [caption for caption in captions if caption["end"] - caption["start"] >= 1 / args.fps]

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        "".join(
            f"{index}\n{timestamp(caption['start'])} --> {timestamp(caption['end'])}\n{caption['text']}\n\n"
            for index, caption in enumerate(captions, 1)
        )
    )
    out.with_suffix(".json").write_text(json.dumps(captions, indent=2) + "\n")
    print(json.dumps({"captions": len(captions), "out": str(out)}))


if __name__ == "__main__":
    main()
