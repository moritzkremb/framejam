#!/usr/bin/env python3
"""The soundtrack: voice on its scene clock + sound effects on cues + music ducked under the voice.

    python scripts/mix.py                     # -> assets/soundtrack.wav (48 kHz stereo, -16 LUFS)

Reads assets/timing.json (run build_timing.py first) and, from script.json:
  "sfx":   [{"at": "c_blue", "sound": "pop", "offset": -0.05, "gain": -14}, ...]
           at = a cue name or seconds; sound = a file in assets/sfx/ (without .wav) or a path
  "scene_sfx": "whoosh"            optional sound at every scene change (0.3 s before it)
  "music": {"file": "assets/music.mp3", "db": -20, "start": 0}   optional; loops if short, fades out at the end
The music dips ~8 dB whenever the voice speaks. Needs ffmpeg.
"""
import json
import subprocess
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    T = json.loads((ROOT / "assets" / "timing.json").read_text())
    script = json.loads((ROOT / "script.json").read_text())
    total = T["total"]
    cues = T["cues"]

    inputs, filters, vo_labels, fx_labels = [], [], [], []

    def add_input(path, loop=False):
        inputs.extend((["-stream_loop", "-1"] if loop else []) + ["-i", str(path)])
        return sum(1 for x in inputs if x == "-i") - 1

    for s in T["scenes"]:
        i = add_input(ROOT / "assets" / "vo" / f"{s['id']}.wav")
        filters.append(f"[{i}:a]aresample=48000,pan=stereo|c0=c0|c1=c0,adelay={int(s['vo'] * 1000)}:all=1[vo{i}]")
        vo_labels.append(f"[vo{i}]")

    events = list(script.get("sfx", []))
    if script.get("scene_sfx"):
        events += [{"at": s["start"] - 0.3, "sound": script["scene_sfx"], "gain": -18} for s in T["scenes"][1:]]
    by_sound = defaultdict(list)
    for e in events:
        at = cues[e["at"]] if isinstance(e["at"], str) else float(e["at"])
        by_sound[e["sound"]].append((max(0.0, at + e.get("offset", 0)), e.get("gain", -14)))
    for sound, hits in by_sound.items():
        p = Path(sound) if sound.endswith((".wav", ".mp3")) else ROOT / "assets" / "sfx" / f"{sound}.wav"
        if not p.is_absolute():
            p = ROOT / p
        i = add_input(p)
        outs = [f"[fx{i}_{k}]" for k in range(len(hits))]
        filters.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,asplit={len(hits)}{''.join(outs)}"
                       if len(hits) > 1 else f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo[fx{i}_0]")
        for k, (at, gain) in enumerate(hits):
            filters.append(f"[fx{i}_{k}]volume={gain}dB,adelay={int(at * 1000)}:all=1[fxd{i}_{k}]")
            fx_labels.append(f"[fxd{i}_{k}]")

    filters.append(f"{''.join(vo_labels)}amix=inputs={len(vo_labels)}:normalize=0,apad[vo]")
    bed = []
    music = script.get("music")
    if music and music.get("file"):
        i = add_input(ROOT / music["file"], loop=True)
        filters.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=start={music.get('start', 0)},"
                       f"asetpts=PTS-STARTPTS,volume={music.get('db', -20)}dB,afade=t=in:d=1.5,"
                       f"afade=t=out:st={max(total - 3, 0):.2f}:d=3[mus]")
        filters.append("[vo]asplit[vo1][vokey]")
        filters.append("[mus][vokey]sidechaincompress=threshold=0.02:ratio=5:attack=30:release=500[duck]")
        bed = ["[duck]"]
        vo_out = "[vo1]"
    else:
        vo_out = "[vo]"
    mix_in = [vo_out] + bed + fx_labels
    filters.append(f"{''.join(mix_in)}amix=inputs={len(mix_in)}:normalize=0,"
                   f"atrim=end={total:.3f},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[out]")

    out = ROOT / "assets" / "soundtrack.wav"
    cmd = ["ffmpeg", "-y", "-loglevel", "error"] + inputs + ["-filter_complex", ";".join(filters), "-map", "[out]",
                                                             "-ac", "2", "-ar", "48000", str(out)]
    subprocess.run(cmd, check=True)
    print(f"wrote assets/soundtrack.wav ({total:.1f} s, {len(events)} sound effects"
          f"{', music' if bed else ''})")


if __name__ == "__main__":
    main()
