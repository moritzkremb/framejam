# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "scipy", "soundfile"]
# ///
"""Synthesize a bright electronic launch-video music bed, authored to your cut.

Free and local: no music service, no samples, no licence questions. The track is
built from a cue sheet (JSON) so drops, breakdowns and sound effects land exactly
on your frame boundaries.

    uv run launch_bed.py cues.json --out assets/music/bed.wav
    python3 launch_bed.py cues.json --out bed.wav      # needs numpy, scipy, soundfile

Cue sheet (all times in seconds, bars are 1-indexed, 4 beats per bar):

{
  "bpm": 120,
  "duration": 30,
  "sections": [
    {"bars": [1, 2], "type": "intro"},      # filtered pads, heartbeat kick, drone
    {"bars": [3, 10], "type": "groove"},    # drums, bass, pads, stabs, arp, hook
    {"bars": [11, 12], "type": "breakdown"},# no drums, pads open up, riser + snare roll
    {"bars": [13, 14], "type": "groove"},
    {"bars": [15, 15], "type": "outro"}     # final hit and ring-out, no drums
  ],
  "hits": [
    {"t": 4.0, "sfx": "impact"},
    {"t": 8.0, "sfx": "whoosh"},            # reverse whoosh that ENDS at t (into a cut)
    {"t": 8.5, "sfx": "swoosh"},            # forward whoosh that STARTS at t (a window flying in)
    {"t": 9.0, "sfx": "pop"},
    {"t": 9.5, "sfx": "click"},
    {"t": 10.0, "sfx": "tick"},
    {"t": 10.5, "sfx": "chime"},
    {"t": 11.0, "sfx": "typing", "dur": 1.6, "chars": 40},
    {"t": 12.0, "sfx": "riser", "dur": 2.0}
  ],
  "mood": "bright"                          # "bright" (major, default) or "night" (minor)
}

Every section start is a downbeat; a groove section that follows an intro or breakdown
starts with a big kick + impact automatically (the drop). Put the drop on the frame
where the product or the brand first appears.
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
    ap.add_argument("--seed", type=int, default=11)
    ap.add_argument("--no-sfx", action="store_true", help="music only (render sfx separately)")
    ap.add_argument("--sfx-only", action="store_true", help="sound effects only")
    args = ap.parse_args()

    cues = json.load(open(args.cues))
    bpm = float(cues.get("bpm", 120))
    total = float(cues["duration"])
    beat = 60.0 / bpm
    bar_len = beat * 4
    n_total = int(total * SR)
    rng = np.random.default_rng(args.seed)

    L = np.zeros(n_total)
    R = np.zeros(n_total)
    side = np.ones(n_total)

    def t_of(bar, b=0.0):
        return (bar - 1) * bar_len + b * beat

    def idx(t):
        return int(round(t * SR))

    def add(sig, t, gain=1.0, pan=0.0):
        i = idx(t)
        if i >= n_total or i < 0:
            return
        sig = sig[: n_total - i]
        L[i : i + len(sig)] += sig * gain * np.sqrt(0.5 * (1 - pan))
        R[i : i + len(sig)] += sig * gain * np.sqrt(0.5 * (1 + pan))

    def lp(x, fc, order=2):
        return sosfilt(butter(order, min(fc, SR / 2 - 100) / (SR / 2), "low", output="sos"), x)

    def hp(x, fc, order=2):
        return sosfilt(butter(order, fc / (SR / 2), "high", output="sos"), x)

    def bp(x, lo, hi, order=2):
        return sosfilt(butter(order, [lo / (SR / 2), min(hi, SR / 2 - 200) / (SR / 2)], "band", output="sos"), x)

    def env(n, decay):
        return np.exp(-np.arange(n) / (decay * SR))

    def saw(freq, dur, phase=0.0):
        t = np.arange(int(dur * SR)) / SR
        return 2 * ((t * freq + phase) % 1.0) - 1

    def midi(m):
        return 440.0 * 2 ** ((m - 69) / 12)

    # ---- drums and fx ----
    def kick(big=False):
        n = int((0.5 if big else 0.34) * SR)
        t = np.arange(n) / SR
        f = 48 + 110 * np.exp(-t * 30)
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.15 if big else 0.1)
        click = hp(rng.standard_normal(n), 3500) * env(n, 0.002) * 0.3
        return np.tanh((s + click) * 1.4)

    def clap():
        n = int(0.3 * SR)
        noise = bp(rng.standard_normal(n), 1000, 6000)
        e = np.zeros(n)
        for k, off in enumerate([0, 0.009, 0.018]):
            i = idx(off)
            e[i:] += env(n - i, 0.01 if k < 2 else 0.09)
        return noise * e * 0.8

    def hat(open_=False):
        n = int((0.18 if open_ else 0.04) * SR)
        return hp(rng.standard_normal(n), 8000, 4) * env(n, 0.06 if open_ else 0.01)

    def shaker():
        n = int(0.08 * SR)
        a = np.minimum(1, np.arange(n) / (0.015 * SR))
        return bp(rng.standard_normal(n), 5000, 12000) * a * env(n, 0.02)

    def snare():
        n = int(0.22 * SR)
        t = np.arange(n) / SR
        return np.sin(2 * np.pi * 200 * t) * env(n, 0.035) * 0.5 + bp(rng.standard_normal(n), 1800, 9000) * env(n, 0.06) * 0.7

    def impact(dur=2.2):
        n = int(dur * SR)
        t = np.arange(n) / SR
        f = 34 + 70 * np.exp(-t * 7)
        boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.5)
        shimmer = lp(hp(rng.standard_normal(n), 3000), 11000) * env(n, 0.45) * 0.22
        return np.tanh(boom * 1.3) + shimmer

    def sweep_noise(dur, f0, f1, shape):
        n = int(dur * SR)
        t = np.linspace(0, 1, n)
        nz = rng.standard_normal(n)
        out = np.zeros(n)
        seg = 1024
        for s in range(0, n, seg):
            fc = f0 * (f1 / f0) ** t[s]
            chunk = nz[max(0, s - 256) : s + seg]
            filt = bp(chunk, max(100, fc * 0.5), fc * 1.6)
            out[s : s + seg] = filt[-len(out[s : s + seg]) :]
        return out * shape(t)

    def riser(dur):
        n = int(dur * SR)
        t = np.linspace(0, 1, n)
        tone = np.sin(2 * np.pi * np.cumsum(220 * (4 ** t)) / SR) * 0.15
        return (sweep_noise(dur, 300, 7000, lambda x: np.ones_like(x)) + tone) * (t ** 2.2)

    def whoosh(dur=0.5, rev=True):
        shape = (lambda x: x ** 2) if rev else (lambda x: np.sin(np.pi * x) ** 1.5)
        return sweep_noise(dur, 600, 7200, shape) * 0.7

    def pop(f=900):
        n = int(0.09 * SR)
        t = np.arange(n) / SR
        fr = f * (1 + 1.5 * np.exp(-t * 60))
        return np.sin(2 * np.pi * np.cumsum(fr) / SR) * env(n, 0.018) * 0.6

    def tick():
        n = int(0.03 * SR)
        return hp(rng.standard_normal(n), 4000) * env(n, 0.004) * 0.6

    def key_click():
        n = int(0.025 * SR)
        t = np.arange(n) / SR
        return (hp(rng.standard_normal(n), 2500) * 0.5 + np.sin(2 * np.pi * 2400 * t) * 0.3) * env(n, 0.003)

    def ui_click():
        n = int(0.06 * SR)
        t = np.arange(n) / SR
        return np.sin(2 * np.pi * 1600 * t) * env(n, 0.008) + hp(rng.standard_normal(n), 3000) * env(n, 0.002) * 0.6

    def bell(m, dur=0.5):
        n = int(dur * SR)
        t = np.arange(n) / SR
        f = midi(m)
        mod = np.sin(2 * np.pi * f * 2 * t) * 1.6 * env(n, 0.12)
        s = np.sin(2 * np.pi * f * t + mod) * env(n, 0.28)
        s += 0.25 * np.sin(2 * np.pi * f * 4.01 * t) * env(n, 0.05)
        return s * np.minimum(1, np.arange(n) / (0.002 * SR))

    def chime():
        out = np.zeros(int(0.9 * SR))
        for m, off in ((84, 0.0), (88, 0.07), (91, 0.14)):
            s = bell(m, 0.7)
            i = idx(off)
            out[i : i + len(s)] += s[: len(out) - i]
        return out * 0.5

    # ---- tonal ----
    if cues.get("mood", "bright") == "night":
        chords = [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]]  # Am7 Fmaj7 G7 Em7
        roots = [45, 41, 43, 40]
    else:
        chords = [[53, 57, 60, 64], [55, 59, 62, 64], [52, 55, 59, 62], [57, 60, 64, 71]]  # Fmaj7 G6 Em7 Am9
        roots = [41, 43, 40, 45]

    def supersaw(notes, dur, cutoff):
        n = int(dur * SR)
        out = np.zeros(n)
        for m in notes:
            for d in (-0.1, -0.05, 0, 0.05, 0.1):
                out += saw(midi(m + d), dur, phase=rng.random())[:n]
        out /= len(notes) * 5
        a = np.minimum(1, np.arange(n) / (0.04 * SR))
        rel = np.minimum(1, (n - np.arange(n)) / (0.08 * SR))
        return lp(out, cutoff, 2) * a * rel

    def bass_note(m, dur):
        n = int(dur * SR)
        tt = np.arange(n) / SR
        s = np.sin(2 * np.pi * midi(m) * tt) + 0.35 * saw(midi(m), dur)[:n]
        e = np.minimum(1, np.arange(n) / (0.004 * SR)) * np.minimum(1, (n - np.arange(n)) / (0.03 * SR))
        return lp(s, 600, 2) * e

    def pluck(m, dur=0.25, bright=4500):
        n = int(dur * SR)
        s = saw(midi(m), dur)[:n] * 0.5 + np.sin(2 * np.pi * midi(m) * np.arange(n) / SR) * 0.5
        return lp(s, bright, 2) * env(n, 0.08)

    def drone(bar):
        n = int(bar_len * SR)
        tt = np.arange(n) / SR
        return np.sin(2 * np.pi * midi(roots[(bar - 1) % 4] - 12) * tt) * 0.45 * np.minimum(1, tt / 0.05)

    # ---- arrangement ----
    sections = cues.get("sections") or [{"bars": [1, int(np.ceil(total / bar_len))], "type": "groove"}]
    bar_type = {}
    for s in sections:
        for b in range(s["bars"][0], s["bars"][1] + 1):
            bar_type[b] = s["type"]
    last_bar = max(bar_type)
    motif = [(0, 76, 0.5), (0.5, 79, 0.5), (1.0, 81, 1.0), (2.0, 79, 0.5), (2.5, 76, 0.5), (3.0, 74, 1.0)]
    arp_pat = [0, 2, 1, 3, 2, 1, 3, 2, 0, 2, 1, 3, 2, 3, 1, 2]

    if not args.sfx_only:
        groove_count = 0
        for bar in range(1, last_bar + 1):
            typ = bar_type.get(bar, "groove")
            prev = bar_type.get(bar - 1)
            c = chords[(bar - 1) % 4]
            root = roots[(bar - 1) % 4]
            if typ == "groove":
                groove_count += 1
                drop = prev in (None, "intro", "breakdown") and bar > 1
                for b in range(4):
                    add(kick(big=(b == 0 and drop)), t_of(bar, b), 0.9)
                    i = idx(t_of(bar, b))
                    n = int(0.28 * SR)
                    curve = 1 - 0.6 * env(n, 0.08)
                    side[i : i + n] = np.minimum(side[i : i + n], curve[: max(0, min(n, n_total - i))])
                if drop:
                    add(impact(2.4), t_of(bar), 0.9)
                for b in (1, 3):
                    add(clap(), t_of(bar, b), 0.45, pan=0.05)
                for s in range(8):
                    add(hat(open_=(s % 2 == 1)), t_of(bar, s / 2), 0.14 if s % 2 else 0.07, pan=0.2)
                for s in range(16):
                    add(shaker(), t_of(bar, s / 4), 0.06 + (0.04 if s % 4 == 2 else 0), pan=-0.3)
                for e in range(8):
                    add(bass_note(root + (12 if e == 7 else 0), beat / 2 * 0.85), t_of(bar, e / 2), 0.5 if e % 2 else 0.22)
                for b in [0.5, 1.5, 2.0, 3.0, 3.5]:
                    for m in c:
                        add(bell(m + 12, 0.45), t_of(bar, b), 0.045, pan=0.1)
                if groove_count >= 3 and groove_count % 2 == 1:
                    for b, m, d in motif:
                        add(bell(m, d * beat * 2.5), t_of(bar, b), 0.12)
                cut, g = 2800, 0.17
            elif typ == "intro":
                for b in (0, 2):
                    add(lp(kick(), 700), t_of(bar, b), 0.55)
                add(drone(bar), t_of(bar), 0.45)
                cut, g = 600 + 500 * (bar - 1), 0.16
            elif typ == "breakdown":
                add(drone(bar), t_of(bar), 0.45)
                start = min(b for b, v in bar_type.items() if v == "breakdown" and all(bar_type.get(k) == "breakdown" for k in range(b, bar + 1)))
                k = bar - start
                cut, g = 900 + 1300 * k, 0.24
                if bar_type.get(bar + 1) != "breakdown":
                    for i in range(16):
                        add(snare(), t_of(bar, 2) + i * beat / 8, 0.12 + 0.28 * i / 16)
                    add(riser(bar_len * (k + 1)), t_of(start), 0.5)
                    add(whoosh(1.0, rev=True), t_of(bar + 1) - 1.0, 0.6)
            else:  # outro
                if prev != "outro":
                    add(impact(3.5), t_of(bar), 0.9)
                    rest = total - t_of(bar)
                    n = int(rest * SR)
                    pad = supersaw([72, 76, 79, 83], rest, 2400) * env(n, 1.1)
                    add(pad, t_of(bar), 0.3, pan=-0.2)
                    add(np.roll(pad, 400), t_of(bar), 0.3, pan=0.2)
                    for j, m in enumerate((72, 76, 79, 84)):
                        add(bell(m, 1.8), t_of(bar) + j * 0.12, 0.08, pan=-0.3 + 0.2 * j)
                continue
            p = supersaw([m + 12 for m in c], bar_len, cut)
            add(p, t_of(bar), g, pan=-0.35)
            add(np.roll(p, 290), t_of(bar), g, pan=0.35)
            for s, kk in enumerate(arp_pat):
                bright = 5000 if typ == "groove" else 1200 + 3000 * s / 16
                add(pluck(c[kk] + 24, bright=bright), t_of(bar, s / 4), 0.085 if typ == "groove" else 0.07, pan=-0.45 if s % 2 else 0.45)

    if not args.no_sfx:
        for h in cues.get("hits", []):
            t, kind = float(h["t"]), h["sfx"]
            gain = float(h.get("gain", 1.0))
            pan = float(rng.uniform(-0.3, 0.3))
            if kind == "impact":
                add(impact(float(h.get("dur", 2.0))), t, 0.8 * gain)
            elif kind == "whoosh":
                d = float(h.get("dur", 0.45))
                add(whoosh(d, rev=True), t - d, 0.55 * gain)
            elif kind == "swoosh":
                add(whoosh(float(h.get("dur", 0.9)), rev=False), t, 0.35 * gain)
            elif kind == "pop":
                add(pop(float(h.get("freq", 1000))), t, 0.35 * gain, pan)
            elif kind == "tick":
                add(tick(), t, 0.35 * gain, pan)
            elif kind == "click":
                add(ui_click(), t, 0.45 * gain)
            elif kind == "chime":
                add(chime(), t, 0.4 * gain)
            elif kind == "slam":
                add(lp(kick(), 2500), t, 0.55 * gain)
                add(impact(0.6) * 0.5, t, 0.35 * gain)
            elif kind == "typing":
                chars = int(h.get("chars", 30))
                d = float(h.get("dur", 1.5))
                for k in range(chars):
                    add(key_click(), t + d * k / chars, 0.22 * gain, float(rng.uniform(-0.2, 0.2)))
            elif kind == "riser":
                add(riser(float(h.get("dur", 2.0))), t, 0.5 * gain)
            else:
                print(f"unknown sfx {kind!r} at {t}", file=sys.stderr)

    # ---- mix ----
    Lm = L * (0.6 + 0.4 * side)
    Rm = R * (0.6 + 0.4 * side)
    ir_n = int(1.6 * SR)
    ir = lp(rng.standard_normal(ir_n) * env(ir_n, 0.4), 7000)
    ir /= np.sqrt(np.sum(ir ** 2))
    Lm = Lm + fftconvolve(hp(Lm, 350), ir)[:n_total] * 0.16
    Rm = Rm + fftconvolve(hp(Rm, 350), np.roll(ir, 197))[:n_total] * 0.16
    fade = np.ones(n_total)
    fn = int(min(0.8, total / 4) * SR)
    fade[-fn:] = np.linspace(1, 0, fn) ** 1.5
    mix = np.stack([Lm * fade, Rm * fade], axis=1)
    mix = np.tanh(mix * 1.25) / np.tanh(1.25)
    peak = np.max(np.abs(mix))
    if peak > 0:
        mix *= 0.63 / peak
    sf.write(args.out, mix.astype(np.float32), SR, subtype="PCM_16")
    print(f"wrote {args.out}: {total:.2f}s at {bpm:g} BPM, {last_bar} bars")


if __name__ == "__main__":
    main()
