#!/usr/bin/env python3
"""Make the sound effects and a light, plucky music bed with NumPy. Free, offline, no license questions.

  python3 scripts/make_sounds.py --sfx assets/sfx                    # pop, whoosh, click, scribble, tick, swipe, thud, typing
  python3 scripts/make_sounds.py --music assets/music.wav --duration 48 --bpm 96 --seed 3

The bed is a soft four-on-the-floor-free groove (kick on 1 and 3, a quiet clap on 2 and 4, an 8th-note shaker), a
plucked marimba-like arpeggio over a warm pad, and a round sub bass. It's bright but low-passed and sparse, so it
sits 18-24 dB under the voice at volume 0.08-0.12 in edit.json and never fights the speech. --seed changes the chords
and the arpeggio pattern, --bpm the tempo (90-104 suits this style). It ends with a 1.5 s fade.
"""
import argparse, wave
from pathlib import Path

import numpy as np

SR = 48000


def write(path, x, stereo=True):
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 1 and stereo:
        x = np.stack([x, x], axis=1)
    peak = np.max(np.abs(x)) or 1.0
    x = x / peak * 0.89
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2 if x.ndim == 2 else 1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())


def t_axis(sec):
    return np.arange(int(SR * sec)) / SR


def env(n, attack, decay):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-np.maximum(t - attack, 0) / decay)


def lowpass(x, cutoff):
    spec = np.fft.rfft(x, axis=0)
    f = np.fft.rfftfreq(x.shape[0], 1 / SR)
    gain = 1 / (1 + (f / cutoff) ** 4)
    return np.fft.irfft(spec * (gain[:, None] if x.ndim == 2 else gain), n=x.shape[0], axis=0)


def highpass(x, cutoff):
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    gain = 1 / (1 + (cutoff / np.maximum(f, 1)) ** 4)
    return np.fft.irfft(spec * gain, n=len(x))


def bandpass(x, lo, hi):
    return highpass(lowpass(x, hi), lo)


def sfx(outdir, rng):
    out = Path(outdir)
    # pop: a round bubble blip, pitch bending up (cards and nodes landing)
    t = t_axis(0.14)
    f = 380 + 700 * (1 - np.exp(-t * 40))
    write(out / "pop.wav", np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), 0.002, 0.035))
    # whoosh: a short airy sweep (panels and stacked cards)
    t = t_axis(0.42)
    n = rng.standard_normal(len(t))
    y = np.zeros_like(n)
    centres = np.linspace(900, 4200, 8)
    for k, c in enumerate(centres):
        sl = slice(k * len(t) // 8, (k + 1) * len(t) // 8)
        y[sl] = bandpass(n, c * 0.6, c * 1.5)[sl]
    shape = np.sin(np.pi * np.clip(t / t[-1], 0, 1)) ** 2
    pan = np.linspace(-0.5, 0.5, len(t))
    write(out / "whoosh.wav", np.stack([y * shape * (1 - pan) / 2, y * shape * (1 + pan) / 2], axis=1))
    # click: a crisp UI tap (a card coming into focus)
    t = t_axis(0.05)
    write(out / "click.wav", highpass(rng.standard_normal(len(t)), 3000) * env(len(t), 0.0004, 0.006)
          + 0.5 * np.sin(2 * np.pi * 2100 * t) * env(len(t), 0.0004, 0.008))
    # scribble: a felt-tip pen drawing a line (diagram lines, underline, strike-through)
    t = t_axis(0.38)
    grain = bandpass(rng.standard_normal(len(t)), 1800, 6500)
    wobble = 0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 11 * t + rng.uniform(0, 3)))
    write(out / "scribble.wav", grain * wobble * np.clip(np.sin(np.pi * t / t[-1]), 0, 1) ** 0.7)
    # tick: a light counter tick (numbers counting up)
    t = t_axis(0.04)
    write(out / "tick.wav", np.sin(2 * np.pi * 3200 * t) * env(len(t), 0.0003, 0.004)
          + 0.25 * highpass(rng.standard_normal(len(t)), 5000) * env(len(t), 0.0002, 0.003))
    # swipe: a marker sweep (highlighter, board sliding in)
    t = t_axis(0.24)
    y = bandpass(rng.standard_normal(len(t)), 1200, 5000) * np.clip(np.sin(np.pi * t / t[-1]), 0, 1) ** 1.5
    write(out / "swipe.wav", y)
    # thud: a soft low hit with a short click on top (titles and the CTA keyword)
    t = t_axis(0.5)
    body = np.sin(2 * np.pi * np.cumsum(120 * np.exp(-t * 14) + 55) / SR) * np.exp(-t * 9)
    top = lowpass(rng.standard_normal(len(t)), 4000) * env(len(t), 0.0008, 0.015)
    write(out / "thud.wav", body + 0.35 * top)
    # typing: 4 s of light laptop keys (cut to length by the build)
    t = t_axis(4.0)
    y = np.zeros(len(t))
    pos = 0.0
    key = t_axis(0.025)
    while pos < 3.95:
        i = int(pos * SR)
        k = highpass(rng.standard_normal(len(key)), 2500) * env(len(key), 0.0004, 0.005) * rng.uniform(0.5, 1)
        k += 0.35 * np.sin(2 * np.pi * rng.uniform(500, 800) * key) * env(len(key), 0.0004, 0.006)
        y[i:i + len(key)] += k[: len(y) - i]
        pos += rng.uniform(0.05, 0.11)
    write(out / "typing.wav", y)
    print(f"wrote 8 sound effects to {out}")


NOTE = {"C": 0, "Db": 1, "D": 2, "Eb": 3, "E": 4, "F": 5, "Gb": 6, "G": 7, "Ab": 8, "A": 9, "Bb": 10, "B": 11}
MAJ7, MIN7, ADD9, SUS2 = [0, 4, 7, 11], [0, 3, 7, 10], [0, 4, 7, 14], [0, 2, 7, 12]
PROGRESSIONS = [
    [("C", ADD9), ("G", ADD9), ("A", MIN7), ("F", MAJ7)],
    [("D", MAJ7), ("B", MIN7), ("G", MAJ7), ("A", SUS2)],
    [("F", ADD9), ("D", MIN7), ("Bb", MAJ7), ("C", SUS2)],
    [("E", MIN7), ("C", MAJ7), ("G", ADD9), ("D", SUS2)],
]
ARPS = [[0, 1, 2, 3, 2, 1, 2, 3], [0, 2, 1, 3, 0, 2, 3, 1], [0, 1, 3, 2, 1, 3, 2, 3], [0, 2, 3, 1, 2, 3, 1, 2]]


def hz(semi_from_c4):
    return 261.63 * 2 ** (semi_from_c4 / 12)


def music(path, duration, bpm, rng, seed):
    beat = 60 / bpm
    bar = beat * 4
    n = int(SR * (duration + 0.5))
    mix = np.zeros((n, 2))

    def add(sig, at, pan=0.0, gain=1.0):
        i = int(at * SR)
        if i >= n:
            return
        sig = sig[: n - i] * gain
        mix[i:i + len(sig), 0] += sig * (1 - pan) / 2 * 2 ** 0.5
        mix[i:i + len(sig), 1] += sig * (1 + pan) / 2 * 2 ** 0.5

    t = t_axis(0.4)
    kick = np.sin(2 * np.pi * np.cumsum(95 * np.exp(-t * 30) + 50) / SR) * np.exp(-t * 9)
    t = t_axis(0.25)
    clap = np.zeros(len(t))
    for d in (0, 0.008, 0.017):
        i = int(d * SR)
        clap[i:] += (bandpass(rng.standard_normal(len(t)), 1000, 6000) * env(len(t), 0.001, 0.012))[: len(t) - i]
    clap += 0.4 * bandpass(rng.standard_normal(len(t)), 1000, 6000) * np.exp(-t * 14) * (t > 0.017)
    t = t_axis(0.07)
    shaker = bandpass(rng.standard_normal(len(t)), 5000, 11000) * np.clip(np.sin(np.pi * t / t[-1]), 0, 1) ** 2

    def pluck(f, length=0.5):
        pt = t_axis(length)
        tone = np.sin(2 * np.pi * f * pt) + 0.3 * np.sin(2 * np.pi * 4 * f * pt) * np.exp(-pt * 30) + 0.12 * np.sin(2 * np.pi * 10 * f * pt) * np.exp(-pt * 60)
        return tone * env(len(pt), 0.002, 0.16)

    prog = PROGRESSIONS[seed % len(PROGRESSIONS)]
    arp = ARPS[seed % len(ARPS)]
    bars = int(np.ceil(duration / bar)) + 1
    for b in range(bars):
        t0 = b * bar
        for k in (0, 2):
            add(kick, t0 + k * beat, 0, 0.8)
        if b % 2 == 1:
            add(kick, t0 + 3.5 * beat, 0, 0.45)
        for c in (1, 3):
            add(clap, t0 + c * beat + rng.uniform(0, 0.004), 0.1, 0.32)
        for h in range(8):
            add(shaker, t0 + h * beat / 2 + (0.012 if h % 2 else 0), 0.35, (0.16 if h % 2 else 0.24) * rng.uniform(0.75, 1))
        root, ints = prog[b % len(prog)]
        r = NOTE[root]
        # pad: soft detuned sines under everything
        ct = t_axis(bar + 0.4)
        pad = np.zeros(len(ct))
        for iv in ints[:3]:
            f = hz(r + iv - 12)
            pad += np.sin(2 * np.pi * f * ct) + np.sin(2 * np.pi * f * 1.004 * ct)
        pad *= env(len(ct), 0.25, 2.5) * np.clip((bar + 0.4 - ct) / 0.4, 0, 1)
        add(pad, t0, -0.2, 0.05)
        # arpeggio: 8th-note plucks, up an octave on the second half of every other bar
        for s_, idx in enumerate(arp):
            oct_ = 12 if (b % 2 and s_ >= 4) else 0
            f = hz(r + ints[idx % len(ints)] + oct_) * (1 + rng.uniform(-0.001, 0.001))
            add(pluck(f), t0 + s_ * beat / 2, 0.25 if s_ % 2 else -0.1, 0.16 * rng.uniform(0.8, 1))
        # bass: root on 1, a fifth push on the "and" of 3
        for at, semi, dl in ((0, 0, 1.6), (2.5, 7, 1.2)):
            bt = t_axis(dl * beat)
            bass = np.sin(2 * np.pi * hz(r + semi - 24) * bt) * env(len(bt), 0.008, 0.5) * np.clip((dl * beat - bt) / 0.04, 0, 1)
            add(bass, t0 + at * beat, 0, 0.4)

    mix = lowpass(mix, 7500)
    mix = np.tanh(mix * 1.4) / 1.4
    mix = mix[: int(SR * duration)]
    fade = min(1.5, duration / 4)
    nf = int(fade * SR)
    mix[-nf:] *= np.linspace(1, 0, nf)[:, None] ** 2
    write(path, mix)
    print(f"wrote {path}: {duration:.1f}s at {bpm} bpm, chords {' '.join(r for r, _ in prog)}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sfx", help="folder for the sound effects")
    ap.add_argument("--music", help="wav file for the music bed")
    ap.add_argument("--duration", type=float, default=30.0, help="music length in seconds (the video's duration)")
    ap.add_argument("--bpm", type=float, default=96)
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    if not a.sfx and not a.music:
        ap.error("pass --sfx and/or --music")
    rng = np.random.default_rng(a.seed)
    if a.sfx:
        sfx(a.sfx, rng)
    if a.music:
        music(a.music, a.duration, a.bpm, rng, a.seed)


if __name__ == "__main__":
    main()
