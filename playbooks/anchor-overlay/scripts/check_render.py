#!/usr/bin/env python3
"""Check a rendered anchor-overlay mp4 against the plan that made it.

  python3 scripts/check_render.py renders/draft.mp4 --edit edit.json [--captions captions.json] [--sample 12:27] [--json]

The render is compared with a clean copy of the A-roll built from the same plan (same punch-ins, no overlays, no text):

  file        9:16, length matches the plan, audio present, no black stretch, integrated loudness in range
  anchor      the A-roll is still on screen at both sides of every frame (side strips match the clean copy)
  overlays    every overlay is on screen from its `at` to its `end` and gone outside it, with hard cuts (no fade)
  cadence     the median and longest gap between picture changes, recomputed from the overlays the render confirms
  music       the music sits calmDb under the voice before the turn and driveDb under it after (each stem measured)

Thresholds come from edit.json -> "checks". Prints every failure and warning; exits 1 when something fails.
Needs Python 3, numpy and ffmpeg. Use --sample A:B when the render was made with `render.py --sample A:B`.
"""
import argparse, json, re, subprocess, sys, tempfile
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import anchorlib as L  # noqa: E402

SW, SH = 216, 384
S = SW / L.W


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)], capture_output=True, text=True)
    if out.returncode:
        raise SystemExit(f"Can't read {path}: {out.stderr.strip() or 'ffprobe failed'}")
    return json.loads(out.stdout)


def gray_frames(cmd_in, vf_graph, fps, frames):
    """Decode to 216x384 gray frames at `fps` as a numpy array [n, SH, SW]."""
    cmd = ["ffmpeg", "-v", "error", *cmd_in, "-filter_complex", vf_graph, "-map", "[g]", "-an", "-frames:v", str(frames),
           "-f", "rawvideo", "-pix_fmt", "gray", "-"]
    raw = subprocess.run(cmd, capture_output=True).stdout
    n = len(raw) // (SW * SH)
    return np.frombuffer(raw[: n * SW * SH], dtype=np.uint8).reshape(n, SH, SW)


def region(rect):
    x, y, w, h = rect
    x0, y0 = max(0, int(x * S)), max(0, int(y * S))
    x1, y1 = min(SW, int((x + w) * S)), min(SH, int((y + h) * S))
    return slice(y0, max(y1, y0 + 1)), slice(x0, max(x1, x0 + 1))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("render")
    ap.add_argument("--edit", default="edit.json")
    ap.add_argument("--captions")
    ap.add_argument("--sample", help="the A:B seconds the render covers (as given to render.py --sample)")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    plan = L.load_plan(a.edit)
    if a.sample:
        s, e = (float(x) for x in a.sample.split(":"))
        plan, _ = L.window(plan, None, s, min(e, float(plan["duration"])))
    c = plan["checks"]
    dur, fps = float(plan["duration"]), plan["fps"]
    fails, warns, notes, facts = [], [], [], {}

    info = probe(a.render)
    vs = next((x for x in info["streams"] if x["codec_type"] == "video"), None)
    au = next((x for x in info["streams"] if x["codec_type"] == "audio"), None)
    if not vs:
        raise SystemExit(f"{a.render} has no video stream")
    w, h = int(vs["width"]), int(vs["height"])
    if abs(w / h - 9 / 16) > 0.01:
        fails.append(f"file: {w}x{h} is not 9:16")
    fdur = float(info["format"]["duration"])
    facts.update(size=f"{w}x{h}", duration=round(fdur, 2), planDuration=round(dur, 2))
    if abs(fdur - dur) > 0.25:
        fails.append(f"file: {fdur:.2f} s long, the plan says {dur:.2f} s")
    if not au:
        fails.append("file: no audio stream")
    elif abs(float(au.get("duration", fdur)) - float(vs.get("duration", fdur))) > 0.2:
        fails.append("file: audio and video lengths differ by more than 0.2 s")

    err = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", a.render, "-vf", "blackdetect=d=0.3:pix_th=0.05", "-an", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    for m in re.finditer(r"black_start:([\d.]+) black_end:([\d.]+)", err):
        fails.append(f"file: black frames from {m.group(1)} s to {m.group(2)} s")

    lu = L.lufs(a.render)
    facts["loudnessLUFS"] = lu
    lo, hi = c["loudness"]
    if lu is None:
        warns.append("loudness: could not measure")
    elif not (lo - 1.0 <= lu <= hi + 1.0):
        fails.append(f"loudness: {lu:.1f} LUFS, wanted {lo:g} to {hi:g}; set aroll.gainDb to about {float(plan['aroll'].get('gainDb', 0)) + (lo + hi) / 2 - lu:.1f} and render again")
    elif not (lo <= lu <= hi):
        warns.append(f"loudness: {lu:.1f} LUFS is just outside {lo:g} to {hi:g}")

    n_frames = int(dur * fps)
    with tempfile.TemporaryDirectory(prefix="anchor-check-") as tmp:
        ref_graph = ";".join(L.aroll_graph(plan, label="rv") + [f"[rv]scale={SW}:{SH},format=gray[g]"])
        ref = gray_frames(L.aroll_input_args(plan), ref_graph, fps, n_frames)
        ren = gray_frames(["-i", a.render], f"[0:v]fps={fps},scale={SW}:{SH}:flags=bilinear,format=gray[g]", fps, n_frames)
        n = min(len(ref), len(ren))
        if n < n_frames - 2:
            fails.append(f"file: decoded {n} frames, expected about {n_frames}")
        ref, ren = ref[:n].astype(np.int16), ren[:n].astype(np.int16)
        diff = np.abs(ren - ref)

        # ----- the anchor stays on screen at both sides -----
        strip = max(2, int(c["armsStripPx"] * S))
        side = np.concatenate([diff[:, :, :strip], diff[:, :, SW - strip:]], axis=2).mean(axis=(1, 2))
        bad = np.where(side > c["armsMaxDiff"])[0]
        facts["sideStripMaxDiff"] = round(float(side.max()), 2) if n else None
        if len(bad):
            t0, t1 = bad[0] / fps, bad[-1] / fps
            fails.append(f"A-roll hidden at the side in {len(bad)} frames ({t0:.2f}-{t1:.2f} s): something is drawn over the speaker's arms")

        # ----- overlays appear and leave on their frames, with hard cuts -----
        confirmed = []
        near = 3
        for o in plan["overlays"]:
            oid = o.get("id", "?")
            try:
                rects = L.overlay_rects(plan, o)
            except SystemExit as e:
                warns.append(f"overlay {oid}: {e}")
                continue
            reg = [region(r) for r in rects]

            def d_at(i, others=None):
                i = min(max(i, 0), n - 1)
                return float(np.mean([np.median(diff[i][rr]) for rr in reg]))

            others = [(float(p["at"]), float(p["end"]), L.overlay_rects(plan, p)) for p in plan["overlays"] if p is not o]

            def covered(i):
                t = i / fps
                return any(s <= t <= e and any(L.rects_hit(r, q) for r in rects for q in rr) for s, e, rr in others)

            i_in, i_out = int(round(float(o["at"]) * fps)), int(round(float(o["end"]) * fps))
            problems = []
            mid = (i_in + i_out) // 2
            if d_at(mid) < c["spikeMin"]:
                problems.append("is not visible in the render")
            else:
                if i_in >= near and not covered(i_in - near) and d_at(i_in - near) >= c["armsMaxDiff"] / 2:
                    problems.append(f"is on screen before its start ({o['at']} s)")
                if d_at(i_in + near) < c["spikeMin"]:
                    problems.append(f"is not fully on screen {near} frames after its start (a fade or a late cut)")
                if i_out + near < n and not covered(i_out + near) and d_at(i_out + near) >= c["armsMaxDiff"] / 2:
                    problems.append(f"stays on screen after its end ({o['end']} s)")
                if d_at(i_out - near) < c["spikeMin"] and i_out - near > i_in:
                    problems.append(f"is already gone {near} frames before its end")
            if problems:
                fails.append(f"overlay {oid}: " + "; ".join(problems))
            else:
                confirmed.append(o)

        facts["overlaysConfirmed"] = f"{len(confirmed)}/{len(plan['overlays'])}"
        if plan["overlays"] and not confirmed:
            fails.append("overlays: none of the planned overlays is visible in the render")

        # ----- cadence recomputed from what the render confirms -----
        planned = L.picture_events(plan)
        p2 = dict(plan, overlays=confirmed)
        measured = L.picture_events(p2)
        gp = L.gaps([t for t, _, _ in planned], dur)
        gm = L.gaps([t for t, _, _ in measured], dur)
        med_p, med_m = L.median(gp), L.median(gm)
        facts.update(medianPictureGapPlanned=round(med_p, 2), medianPictureGapMeasured=round(med_m, 2),
                     longestPictureGapMeasured=round(max(gm), 2) if gm else None)
        if abs(med_p - med_m) > 0.2:
            fails.append(f"cadence: planned median gap {med_p:.2f} s but the render confirms {med_m:.2f} s")
        if not (c["pictureMedianMin"] <= med_m <= c["pictureMedianMax"]):
            fails.append(f"cadence: median gap between picture changes is {med_m:.2f} s (wanted {c['pictureMedianMin']} to {c['pictureMedianMax']})")
        if gm and max(gm) > c["maxPictureGap"]:
            fails.append(f"cadence: {max(gm):.1f} s with no picture change (max {c['maxPictureGap']})")

        # ----- music level against the voice, each stem on its own -----
        if L.music_active(plan) and au:
            if float(plan["music"]["turnAt"]) < 1.0 or float(plan["music"]["turnAt"]) > dur - 1.0:
                notes.append("music: the turn is outside the reel, level not verified")
            else:
                cmd = ["ffmpeg", "-v", "error", "-y", *L.aroll_input_args(plan), *L.music_input_args(plan), "-filter_complex",
                       ";".join(L.audio_graph(plan, 1)), "-map", "[voice]", f"{tmp}/voice.wav", "-map", "[music]", f"{tmp}/music.wav"]
                subprocess.run(cmd, check=True)
                (c0, c1), (d0, d1) = L.music_windows(plan)
                tol = c["musicToleranceDb"]
                for name, (t0, t1), want in (("calm", (c0, c1), c["calmDb"]), ("drive", (d0, d1), c["driveDb"])):
                    if t1 - t0 < 1.0:
                        continue
                    v, mu = L.lufs(f"{tmp}/voice.wav", t0, t1), L.lufs(f"{tmp}/music.wav", t0, t1)
                    if v is None or mu is None:
                        warns.append(f"music: could not measure the {name} part")
                        continue
                    rel = mu - v
                    facts[f"music{name.capitalize()}VsVoiceDb"] = round(rel, 1)
                    if not (want[0] - tol <= rel <= want[1] + tol):
                        fails.append(f"music: {name} part is {rel:+.1f} dB against the voice, wanted {want[0]} to {want[1]} (+/-{tol})")
        elif not L.music_active(plan):
            notes.append("music: off in this plan")

    result = {"ok": not fails, "failures": fails, "warnings": warns, "notes": notes, "facts": facts}
    if a.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"{'PASS' if not fails else 'FAIL'}: {a.render}")
        for k, v in facts.items():
            print(f"  {k}: {v}")
        for f in fails:
            print(f"FAIL  {f}")
        for x in warns:
            print(f"warn  {x}")
        for x in notes:
            print(f"note  {x}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
