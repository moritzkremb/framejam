#!/usr/bin/env python3
"""Make the sound effects and a lo-fi boom-bap music bed with NumPy. Free, offline, no license questions.

  python3 scripts/make_sounds.py --sfx assets/sfx                    # whoosh, pop, click, ding, typing, hit, tick, swipe
  python3 scripts/make_sounds.py --music assets/music.wav --duration 48 --bpm 88 --seed 3

The bed is drums (kick, snare, swung hats), a warm electric-piano chord loop, a sine bass and vinyl crackle, low-passed
and quiet enough to sit 18-24 dB under the voice at volume 0.12-0.16 in edit.json. --seed changes the chords and the
drum fills, --bpm the tempo (80-95 suits a talking-head reel). It ends with a 1.5 s fade.
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


def lowpass_fast(x, cutoff):
    # FFT brick-wall with a soft knee; fine for whole buffers.
    spec = np.fft.rfft(x, axis=0)
    f = np.fft.rfftfreq(x.shape[0], 1 / SR)
    gain = 1 / (1 + (f / cutoff) ** 4)
    return np.fft.irfft(spec * (gain[:, None] if x.ndim == 2 else gain), n=x.shape[0], axis=0)


def highpass_fast(x, cutoff):
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    gain = 1 / (1 + (cutoff / np.maximum(f, 1)) ** 4)
    return np.fft.irfft(spec * gain, n=len(x))


def bandpass_fast(x, lo, hi):
    return highpass_fast(lowpass_fast(x, hi), lo)


def sfx(outdir, rng):
    out = Path(outdir)
    # whoosh: band-passed noise sweeping up then down
    t = t_axis(0.55)
    n = rng.standard_normal(len(t))
    sweep = np.concatenate([np.linspace(600, 3800, len(t) // 2), np.linspace(3800, 900, len(t) - len(t) // 2)])
    y = np.zeros_like(n)
    for k in range(8):
        sl = slice(k * len(t) // 8, (k + 1) * len(t) // 8)
        c = sweep[sl].mean()
        y[sl] = bandpass_fast(n, c * 0.6, c * 1.4)[sl]
    shape = np.sin(np.pi * np.clip(t / t[-1], 0, 1)) ** 1.6
    pan = np.linspace(-0.6, 0.6, len(t))
    write(out / "whoosh.wav", np.stack([y * shape * (1 - pan) / 2, y * shape * (1 + pan) / 2], axis=1))
    # pop: short pitched blip with a fast downward bend
    t = t_axis(0.16)
    f = 900 * np.exp(-t * 18) + 320
    write(out / "pop.wav", np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), 0.002, 0.045))
    # click: tiny filtered tick
    t = t_axis(0.05)
    write(out / "click.wav", highpass_fast(rng.standard_normal(len(t)), 2500) * env(len(t), 0.0005, 0.008) + 0.4 * np.sin(2 * np.pi * 1800 * t) * env(len(t), 0.0005, 0.01))
    # ding: two bell partials, major sixth apart
    t = t_axis(1.1)
    bell = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t * d) for f, a, d in [(1318.5, 1, 4), (2217, 0.45, 6), (3520, 0.18, 9), (2637, 0.3, 5)])
    write(out / "ding.wav", bell * env(len(t), 0.003, 10))
    # hit: low boom with a noise transient, for big words
    t = t_axis(0.7)
    boom = np.sin(2 * np.pi * np.cumsum(140 * np.exp(-t * 9) + 42) / SR) * np.exp(-t * 6)
    trans = lowpass_fast(rng.standard_normal(len(t)), 3000) * env(len(t), 0.001, 0.03)
    write(out / "hit.wav", boom + 0.5 * trans)
    # tick: dry wooden tick for counters
    t = t_axis(0.06)
    write(out / "tick.wav", np.sin(2 * np.pi * 2400 * t) * env(len(t), 0.0005, 0.006) + 0.3 * highpass_fast(rng.standard_normal(len(t)), 4000) * env(len(t), 0.0003, 0.004))
    # swipe: quick bright noise swish for a strike-through
    t = t_axis(0.22)
    y = bandpass_fast(rng.standard_normal(len(t)), 2500, 9000) * np.sin(np.pi * t / t[-1]) ** 2
    write(out / "swipe.wav", y)
    # typing: 4 s of uneven key clicks (cut to length by the build)
    t = t_axis(4.0)
    y = np.zeros(len(t))
    pos = 0.0
    key = t_axis(0.03)
    while pos < 3.95:
        i = int(pos * SR)
        k = highpass_fast(rng.standard_normal(len(key)), 1800) * env(len(key), 0.0005, 0.006) * rng.uniform(0.5, 1)
        k += 0.5 * np.sin(2 * np.pi * rng.uniform(300, 500) * key) * env(len(key), 0.0005, 0.01)
        y[i:i + len(key)] += k[: len(y) - i]
        pos += rng.uniform(0.055, 0.12)
    write(out / "typing.wav", y)
    print(f"wrote 8 sound effects to {out}")


NOTE = {"C": 0, "Db": 1, "D": 2, "Eb": 3, "E": 4, "F": 5, "Gb": 6, "G": 7, "Ab": 8, "A": 9, "Bb": 10, "B": 11}
PROGRESSIONS = [
    [("F", [0, 3, 7, 10, 14]), ("Bb", [0, 3, 7, 10, 14]), ("Eb", [0, 4, 7, 11, 14]), ("Ab", [0, 4, 7, 11, 14])],
    [("D", [0, 3, 7, 10, 14]), ("G", [0, 4, 7, 10, 14]), ("C", [0, 4, 7, 11, 14]), ("A", [0, 3, 7, 10, 13])],
    [("A", [0, 3, 7, 10, 14]), ("D", [0, 3, 7, 10, 14]), ("G", [0, 4, 7, 11, 14]), ("C", [0, 4, 7, 11, 14])],
    [("E", [0, 3, 7, 10, 14]), ("A", [0, 3, 7, 10, 14]), ("D", [0, 4, 7, 10, 14]), ("G", [0, 4, 7, 11, 14])],
]


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

    t = t_axis(0.5)
    kick = np.sin(2 * np.pi * np.cumsum(110 * np.exp(-t * 25) + 48) / SR) * np.exp(-t * 7)
    t = t_axis(0.35)
    snare = 0.7 * bandpass_fast(rng.standard_normal(len(t)), 900, 7000) * np.exp(-t * 16) + 0.4 * np.sin(2 * np.pi * 190 * t) * np.exp(-t * 22)
    t = t_axis(0.09)
    hat = highpass_fast(rng.standard_normal(len(t)), 7000) * np.exp(-t * 60)

    prog = PROGRESSIONS[seed % len(PROGRESSIONS)]
    swing = beat / 4 * 0.16
    bars = int(np.ceil(duration / bar)) + 1
    for b in range(bars):
        t0 = b * bar
        # drums: boom-bap pattern with a lazy snare and swung 16th hats
        kicks = [0, 1.5, 2.25] if b % 2 == 0 else [0, 1.75, 2.5]
        for k in kicks:
            add(kick, t0 + k * beat + rng.uniform(0, 0.008), 0, 0.95)
        for s_ in (1, 3):
            add(snare, t0 + s_ * beat + 0.012 + rng.uniform(0, 0.006), 0.05, 0.55)
        for h in range(16):
            at = t0 + h * beat / 4 + (swing if h % 2 else 0)
            add(hat, at, 0.3, (0.22 if h % 2 else 0.32) * rng.uniform(0.7, 1))
        if b % 4 == 3 and rng.random() < 0.7:
            add(snare, t0 + 3.75 * beat, 0.05, 0.3)
        # chords: electric piano (sine + soft 2nd harmonic, slow tremolo), one chord per bar, pushed a 16th early
        root, ints = prog[b % len(prog)]
        r = NOTE[root] - 12
        ct = t_axis(bar + 0.6)
        chord = np.zeros(len(ct))
        for j, iv in enumerate(ints):
            f = hz(r + iv) * (1 + rng.uniform(-0.0015, 0.0015))
            chord += (np.sin(2 * np.pi * f * ct) + 0.25 * np.sin(4 * np.pi * f * ct)) * np.exp(-ct * 0.9) * (0.9 - j * 0.08)
        chord *= (1 + 0.12 * np.sin(2 * np.pi * 4.2 * ct)) * env(len(ct), 0.012, 3.0)
        add(chord, max(0, t0 - beat / 4), -0.15, 0.16)
        # bass: root on 1 and the "and" of 2
        for at, dl in ((0, 1.4), (1.5, 0.9), (2.5, 1.2)):
            bt = t_axis(dl * beat)
            bass = np.sin(2 * np.pi * hz(r - 12) * bt) * env(len(bt), 0.01, 0.6) * np.clip((dl * beat - bt) / 0.05, 0, 1)
            add(bass, t0 + at * beat, 0, 0.42)

    crackle = np.zeros(n)
    idx = rng.integers(0, n, size=int(duration * 40))
    crackle[idx] = rng.uniform(-1, 1, size=len(idx))
    crackle = highpass_fast(crackle, 1500) * 0.5 + lowpass_fast(rng.standard_normal(n), 900) * 0.01
    mix += np.stack([crackle, crackle], axis=1) * 0.25
    mix = lowpass_fast(mix, 6500)
    mix = np.tanh(mix * 1.6) / 1.6
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
    ap.add_argument("--bpm", type=float, default=88)
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
