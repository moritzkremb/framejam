# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "scipy", "soundfile"]
# ///
"""Synthesize a cinematic trailer bed: atmosphere → build → silence → climax → hero → outro.

Free and local: no music service, no samples, no licence questions. Authored from a cue
sheet so the silence gap and the drop land on your cut.

    uv run trailer_bed.py cues.json --out assets/bed.wav
    python3 trailer_bed.py cues.json --out bed.wav      # needs numpy, scipy, soundfile

Cue sheet (times in seconds). Sections take t+dur or bars (1-indexed, 4 beats):

{
  "bpm": 120,
  "duration": 52,
  "mood": "night",
  "sections": [
    {"t": 0, "dur": 5, "type": "atmosphere"},
    {"t": 5, "dur": 16.5, "type": "build"},
    {"t": 21.5, "dur": 1.5, "type": "silence"},
    {"t": 23, "dur": 11, "type": "climax"},
    {"t": 34, "dur": 15, "type": "hero"},
    {"t": 49, "dur": 3, "type": "outro"}
  ],
  "hits": [
    {"t": 23.0, "sfx": "boom"},
    {"t": 49.0, "sfx": "boom"}
  ]
}

Section types: atmosphere (drone, heartbeat), build (opens + riser), silence (digital
black), climax (drop), hero (driving, room for VO), outro (boom and ring-out).
A climax or hero after silence or build starts with a drop unless "drop": false.
mood: "night" (minor, default) or "bright".
"""

import argparse
import json
import sys

import numpy as np
import soundfile as sf
from scipy.signal import butter, fftconvolve, sosfilt

SR = 44100


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cues")
    ap.add_argument("--out", default="bed.wav")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--no-sfx", action="store_true")
    ap.add_argument("--sfx-only", action="store_true")
    ap.add_argument("--print-sections", action="store_true", help="print start/end/RMS after writing")
    args = ap.parse_args()

    cues = json.load(open(args.cues))
    bpm = float(cues.get("bpm", 120))
    total = float(cues["duration"])
    beat = 60.0 / bpm
    bar_len = beat * 4
    n_total = int(total * SR)
    rng = np.random.default_rng(args.seed)
    mood = cues.get("mood", "night")

    L = np.zeros(n_total)
    R = np.zeros(n_total)

    def idx(t):
        return int(round(t * SR))

    def add(sig, t, gain=1.0, pan=0.0):
        i = idx(t)
        if i >= n_total or i < 0:
            return
        sig = np.asarray(sig, dtype=float)[: n_total - i]
        L[i : i + len(sig)] += sig * gain * np.sqrt(0.5 * (1 - pan))
        R[i : i + len(sig)] += sig * gain * np.sqrt(0.5 * (1 + pan))

    def lp(x, fc, order=2):
        return sosfilt(butter(order, min(fc, SR / 2 - 100) / (SR / 2), "low", output="sos"), x)

    def hp(x, fc, order=2):
        return sosfilt(butter(order, max(fc, 20) / (SR / 2), "high", output="sos"), x)

    def bp(x, lo, hi, order=2):
        return sosfilt(butter(order, [lo / (SR / 2), min(hi, SR / 2 - 200) / (SR / 2)], "band", output="sos"), x)

    def env(n, decay):
        return np.exp(-np.arange(n) / (decay * SR))

    def saw(freq, dur, phase=0.0):
        t = np.arange(max(1, int(dur * SR))) / SR
        return 2 * ((t * freq + phase) % 1.0) - 1

    def midi(m):
        return 440.0 * 2 ** ((m - 69) / 12)

    def kick(big=False):
        n = int((0.55 if big else 0.36) * SR)
        t = np.arange(n) / SR
        f = (42 if big else 48) + 120 * np.exp(-t * 28)
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.18 if big else 0.1)
        click = hp(rng.standard_normal(n), 3000) * env(n, 0.002) * 0.25
        return np.tanh((s + click) * 1.35)

    def hat(open_=False):
        n = int((0.2 if open_ else 0.045) * SR)
        return hp(rng.standard_normal(n), 7500, 4) * env(n, 0.07 if open_ else 0.012)

    def snare():
        n = int(0.24 * SR)
        t = np.arange(n) / SR
        return np.sin(2 * np.pi * 180 * t) * env(n, 0.04) * 0.45 + bp(rng.standard_normal(n), 1600, 8000) * env(n, 0.07) * 0.7

    def impact(dur=2.4):
        n = int(dur * SR)
        t = np.arange(n) / SR
        f = 28 + 80 * np.exp(-t * 6)
        boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.55)
        shimmer = lp(hp(rng.standard_normal(n), 2500), 10000) * env(n, 0.5) * 0.2
        return np.tanh(boom * 1.4) + shimmer

    def sweep_noise(dur, f0, f1, shape):
        n = int(max(dur, 0.05) * SR)
        t = np.linspace(0, 1, n)
        nz = rng.standard_normal(n)
        out = np.zeros(n)
        seg = 1024
        for s in range(0, n, seg):
            fc = f0 * (f1 / f0) ** t[s]
            chunk = nz[max(0, s - 256) : s + seg]
            filt = bp(chunk, max(80, fc * 0.5), fc * 1.6)
            out[s : s + seg] = filt[-len(out[s : s + seg]) :]
        return out * shape(t)

    def riser(dur):
        n = int(dur * SR)
        t = np.linspace(0, 1, n)
        tone = np.sin(2 * np.pi * np.cumsum(160 * (5 ** t)) / SR) * 0.14
        return (sweep_noise(dur, 200, 6500, lambda x: np.ones_like(x)) + tone) * (t ** 2.4)

    def whoosh(dur=0.5, rev=True):
        shape = (lambda x: x ** 2) if rev else (lambda x: np.sin(np.pi * x) ** 1.5)
        return sweep_noise(dur, 500, 6800, shape) * 0.7

    def tick():
        n = int(0.035 * SR)
        return hp(rng.standard_normal(n), 3500) * env(n, 0.005) * 0.55

    def glitch():
        n = int(0.08 * SR)
        s = hp(rng.standard_normal(n), 1200) * env(n, 0.012)
        s[::7] *= 4
        return np.tanh(s * 1.2) * 0.5

    def boom(dur=2.8):
        a = impact(dur) * 1.05
        b = lp(kick(True), 400) * 0.35
        if len(b) < len(a):
            b = np.pad(b, (0, len(a) - len(b)))
        else:
            a = np.pad(a, (0, len(b) - len(a)))
        return a + b

    def bell(m, dur=0.6):
        n = int(dur * SR)
        t = np.arange(n) / SR
        f = midi(m)
        mod = np.sin(2 * np.pi * f * 2 * t) * 1.4 * env(n, 0.14)
        s = np.sin(2 * np.pi * f * t + mod) * env(n, 0.32)
        s += 0.2 * np.sin(2 * np.pi * f * 3.99 * t) * env(n, 0.06)
        return s * np.minimum(1, np.arange(n) / (0.003 * SR))

    if mood == "bright":
        chords = [[53, 57, 60, 64], [55, 59, 62, 64], [52, 55, 59, 62], [57, 60, 64, 71]]
        roots = [41, 43, 40, 45]
    else:
        chords = [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]]
        roots = [45, 41, 43, 40]

    def supersaw(notes, dur, cutoff):
        n = int(max(dur, 0.05) * SR)
        out = np.zeros(n)
        for m in notes:
            for d in (-0.08, 0, 0.08):
                out += saw(midi(m + d), dur, phase=rng.random())[:n]
        out /= max(1, len(notes) * 3)
        a = np.minimum(1, np.arange(n) / (0.08 * SR))
        rel = np.minimum(1, (n - np.arange(n)) / (0.12 * SR))
        return lp(out, cutoff, 2) * a * rel

    def bass_note(m, dur):
        n = int(max(dur, 0.04) * SR)
        tt = np.arange(n) / SR
        s = np.sin(2 * np.pi * midi(m) * tt) + 0.3 * saw(midi(m), dur)[:n]
        e = np.minimum(1, np.arange(n) / (0.006 * SR)) * np.minimum(1, (n - np.arange(n)) / (0.04 * SR))
        return lp(s, 500, 2) * e

    def drone(dur, m):
        n = int(max(dur, 0.05) * SR)
        tt = np.arange(n) / SR
        s = np.sin(2 * np.pi * midi(m - 12) * tt) * 0.55
        s += 0.18 * np.sin(2 * np.pi * midi(m) * tt)
        return s * np.minimum(1, tt / 0.12)

    def resolve_sections():
        raw = cues.get("sections") or [{"t": 0, "dur": total, "type": "hero"}]
        out = []
        for s in raw:
            typ = s["type"]
            if "t" in s:
                t0 = float(s["t"])
                t1 = t0 + float(s.get("dur", 2))
            else:
                bars = s["bars"]
                t0 = (bars[0] - 1) * bar_len
                t1 = bars[1] * bar_len
            t1 = min(t1, total)
            drop = s.get("drop")
            out.append({"t0": t0, "t1": t1, "type": typ, "drop": drop})
        return out

    sections = resolve_sections()
    silence_windows = [(s["t0"], s["t1"]) for s in sections if s["type"] == "silence"]

    def prev_type(i):
        return sections[i - 1]["type"] if i > 0 else None

    if not args.sfx_only:
        for i, sec in enumerate(sections):
            typ, t0, t1 = sec["type"], sec["t0"], sec["t1"]
            dur = max(0.0, t1 - t0)
            if dur <= 0 or typ == "silence":
                continue
            chord_i = int(t0 / bar_len) % 4
            c = chords[chord_i]
            root = roots[chord_i]
            want_drop = sec["drop"]
            if want_drop is None:
                want_drop = typ in ("climax", "hero") and prev_type(i) in (None, "silence", "build", "atmosphere")
            if typ == "atmosphere":
                add(drone(dur, root), t0, 0.55)
                pad = supersaw([m + 12 for m in c], dur, 500)
                add(pad, t0, 0.14, pan=-0.3)
                add(np.roll(pad, 420), t0, 0.14, pan=0.3)
                t = t0
                while t < t1 - 0.05:
                    add(lp(kick(False), 600), t, 0.4)
                    t += beat * 2
                t = t0 + beat
                while t < t1:
                    add(tick(), t, 0.12, pan=float(rng.uniform(-0.2, 0.2)))
                    t += beat
            elif typ == "build":
                add(drone(dur, root), t0, 0.4)
                steps = max(1, int(np.ceil(dur / beat)))
                for k in range(steps):
                    tt = t0 + k * beat
                    progress = k / steps
                    pad = supersaw([m + 12 for m in c], min(beat * 1.05, t1 - tt), 480 + 2200 * progress)
                    add(pad, tt, 0.12 + 0.1 * progress, pan=-0.25)
                    add(np.roll(pad, 310), tt, 0.12 + 0.1 * progress, pan=0.25)
                    if k % 2 == 0:
                        add(lp(kick(progress > 0.6), 700 + 800 * progress), tt, 0.45 + 0.25 * progress)
                    if progress > 0.35:
                        add(tick(), tt + beat * 0.5, 0.14 + 0.2 * progress)
                    if progress > 0.7 and k % 2 == 1:
                        add(snare(), tt, 0.08 + 0.2 * progress)
                rise_d = min(2.5, dur)
                add(riser(rise_d), t1 - rise_d, 0.55)
                add(whoosh(0.8, rev=True), t1 - 0.8, 0.5)
            elif typ in ("climax", "hero"):
                if want_drop:
                    add(kick(True), t0, 1.0)
                    add(impact(2.6), t0, 0.95)
                t = t0
                step = 0
                denser = typ == "climax"
                while t < t1 - 0.02:
                    b = step % 4
                    add(kick(big=(b == 0 and (want_drop or step == 0))), t, 0.85 if denser else 0.72)
                    if b in (1, 3):
                        add(snare(), t, 0.28 if denser else 0.2)
                    add(hat(open_=(b % 2 == 1)), t, 0.1 if denser else 0.07, pan=0.18)
                    add(bass_note(root + (12 if b == 3 else 0), beat * 0.85), t, 0.42 if b == 0 else 0.22)
                    if denser and b == 0:
                        for m in c:
                            add(bell(m + 12, 0.5), t + 0.02, 0.04, pan=0.1)
                    step += 1
                    t += beat
                cut = 2400 if denser else 1800
                pad = supersaw([m + 12 for m in c], dur, cut)
                add(pad, t0, 0.16 if denser else 0.13, pan=-0.32)
                add(np.roll(pad, 360), t0, 0.16 if denser else 0.13, pan=0.32)
            else:  # outro
                add(boom(3.2), t0, 0.95)
                rest = min(dur, total - t0)
                n = int(rest * SR)
                pad = supersaw([72, 76, 79, 83] if mood == "bright" else [69, 72, 76, 79], rest, 1600) * env(n, 1.0)
                add(pad, t0, 0.28, pan=-0.15)
                add(np.roll(pad, 480), t0, 0.28, pan=0.15)
                for j, m in enumerate((69, 72, 76, 81)):
                    add(bell(m, 1.6), t0 + j * 0.1, 0.07, pan=-0.25 + 0.15 * j)

    if not args.no_sfx:
        for h in cues.get("hits", []):
            t, kind = float(h["t"]), h["sfx"]
            if any(a <= t < b for a, b in silence_windows) and kind != "silence":
                continue
            gain = float(h.get("gain", 1.0))
            pan = float(rng.uniform(-0.25, 0.25))
            if kind == "boom":
                add(boom(float(h.get("dur", 2.8))), t, 0.9 * gain)
            elif kind == "impact":
                add(impact(float(h.get("dur", 2.2))), t, 0.8 * gain)
            elif kind == "whoosh":
                d = float(h.get("dur", 0.45))
                add(whoosh(d, rev=True), t - d, 0.55 * gain)
            elif kind == "swoosh":
                add(whoosh(float(h.get("dur", 0.9)), rev=False), t, 0.35 * gain)
            elif kind == "tick":
                add(tick(), t, 0.35 * gain, pan)
            elif kind == "slam":
                add(lp(kick(), 2200), t, 0.55 * gain)
                add(impact(0.7) * 0.5, t, 0.3 * gain)
            elif kind == "glitch":
                add(glitch(), t, 0.4 * gain, pan)
            elif kind == "riser":
                add(riser(float(h.get("dur", 2.0))), t, 0.5 * gain)
            elif kind == "silence":
                silence_windows.append((t, t + float(h.get("dur", 1.0))))
            else:
                print(f"unknown sfx {kind!r} at {t}", file=sys.stderr)

    for a, b in silence_windows:
        i0, i1 = max(0, idx(a)), min(n_total, idx(b))
        if i1 > i0:
            fade = int(0.02 * SR)
            if fade > 0 and i0 > 0:
                L[max(0, i0 - fade) : i0] *= np.linspace(1, 0, i0 - max(0, i0 - fade))
                R[max(0, i0 - fade) : i0] *= np.linspace(1, 0, i0 - max(0, i0 - fade))
            L[i0:i1] = 0
            R[i0:i1] = 0

    ir_n = int(1.8 * SR)
    ir = lp(rng.standard_normal(ir_n) * env(ir_n, 0.45), 5500)
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
    Lm = L + fftconvolve(hp(L, 300), ir)[:n_total] * 0.18
    Rm = R + fftconvolve(hp(R, 300), np.roll(ir, 223))[:n_total] * 0.18
    for a, b in silence_windows:
        i0, i1 = max(0, idx(a)), min(n_total, idx(b))
        Lm[i0:i1] = 0
        Rm[i0:i1] = 0
    fade = np.ones(n_total)
    fn = int(min(0.7, total / 5) * SR)
    fade[-fn:] = np.linspace(1, 0, fn) ** 1.4
    mix = np.stack([Lm * fade, Rm * fade], axis=1)
    mix = np.tanh(mix * 1.15) / np.tanh(1.15)
    peak = np.max(np.abs(mix))
    if peak > 0:
        mix *= 0.62 / peak
    for a, b in silence_windows:
        i0, i1 = max(0, idx(a)), min(n_total, idx(b))
        mix[i0:i1] = 0
    sf.write(args.out, mix.astype(np.float32), SR, subtype="PCM_16")
    print(f"wrote {args.out}: {total:.2f}s at {bpm:g} BPM, {len(sections)} sections")
    if args.print_sections:
        for s in sections:
            sl = mix[idx(s["t0"]) : idx(s["t1"])]
            rms = float(np.sqrt(np.mean(sl ** 2))) if len(sl) else 0.0
            db = 20 * np.log10(rms + 1e-12)
            print(f"  {s['type']:11} {s['t0']:6.2f}-{s['t1']:6.2f}  RMS {db:7.1f} dB")


if __name__ == "__main__":
    main()
