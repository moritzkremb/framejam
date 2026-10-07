#!/usr/bin/env python3
"""Synthesize a royalty-free scratch beat on an exact grid, so a showreel can be built and
timed before (or instead of) real music.

Usage:
  python3 scratch_beat.py --bpm 120 --bars 8 --hits 12,24 --out assets/music.wav

  --hits   beats (0-based, counted from the start) that get a riser into an impact:
           the big visual events (a colour flood, the logo landing).
  --intro  bars at the start with only a filtered pulse (default 1)
  --outro  bars at the end that ring out (default 1)
  --key    root note in Hz (default 55 = A1)

Needs only Python 3 and numpy. The output is a 48 kHz stereo WAV that starts on beat 0 at
t = 0, so the grid is exact: beat n is at n * 60 / bpm seconds. Replace it with licensed or
generated music for the final cut and re-run beat_grid.py on that track.
"""
import argparse
import wave

import numpy as np

SR = 48000
rng = np.random.default_rng(7)


def env(n, attack, decay):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-t / decay)


def kick(n):
    t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.28) * 0.95


def clap(n):
    noise = rng.standard_normal(n)
    bp = noise - np.convolve(noise, np.ones(12) / 12, mode="same")
    e = env(n, 0.001, 0.09)
    for d in (0.008, 0.017):
        k = int(d * SR)
        e[k:] += env(n - k, 0.001, 0.02) * 0.6
    return bp * e * 0.35


def hat(n, open_=False):
    noise = rng.standard_normal(n)
    hp = noise - np.convolve(noise, np.ones(4) / 4, mode="same")
    return hp * env(n, 0.0005, 0.12 if open_ else 0.03) * 0.16


def saw(freq, n):
    t = np.arange(n) / SR
    return 2 * ((t * freq) % 1) - 1


def lowpass(x, k):
    return np.convolve(x, np.ones(k) / k, mode="same")


def bass(freq, n):
    s = saw(freq, n) + 0.5 * saw(freq * 1.005, n)
    return lowpass(s, 40) * env(n, 0.004, 0.18) * 0.32


def pad(freqs, n):
    s = sum(saw(f, n) + saw(f * 1.004, n) for f in freqs) / (2 * len(freqs))
    t = np.arange(n) / SR
    swell = np.clip(t / 0.4, 0, 1) * np.clip((n / SR - t) / 0.3, 0, 1)
    return lowpass(s, 90) * swell * 0.12


def riser(n):
    t = np.linspace(0, 1, n)
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    for i, k in enumerate(np.linspace(60, 2, 16).astype(int)):
        a, b = i * n // 16, (i + 1) * n // 16
        out[a:b] = (noise - np.convolve(noise, np.ones(k) / k, mode="same"))[a:b]
    return out * t ** 2 * 0.22


def impact(n):
    t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * (38 + 60 * np.exp(-t * 9)) * t) * env(n, 0.001, 0.7)
    crash = rng.standard_normal(n) * env(n, 0.001, 0.5) * 0.12
    return (boom * 0.9 + crash)


def add(buf, at, sig, gain=1.0, pan=0.0):
    i = int(round(at * SR))
    if i >= buf.shape[0]:
        return
    sig = sig[: buf.shape[0] - i] * gain
    buf[i:i + len(sig), 0] += sig * (1 - max(pan, 0))
    buf[i:i + len(sig), 1] += sig * (1 + min(pan, 0))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bpm", type=float, default=120)
    ap.add_argument("--bars", type=int, default=8)
    ap.add_argument("--hits", default="")
    ap.add_argument("--intro", type=int, default=1)
    ap.add_argument("--outro", type=int, default=1)
    ap.add_argument("--key", type=float, default=55.0)
    ap.add_argument("--out", default="music.wav")
    a = ap.parse_args()

    beat = 60 / a.bpm
    total_beats = a.bars * 4
    length = total_beats * beat + 1.5
    buf = np.zeros((int(length * SR), 2))
    hits = sorted(int(h) for h in a.hits.split(",") if h.strip())
    prog = [1.0, 1.0, 1.189, 0.891]  # i, i, iii-ish, vii-ish (semitone ratios from the root)
    outro_from = (a.bars - a.outro) * 4

    for b in range(total_beats):
        t = b * beat
        bar = b // 4
        root = a.key * prog[bar % len(prog)]
        intro = bar < a.intro
        outro = b >= outro_from
        if outro:
            if b == outro_from:
                add(buf, t, kick(int(0.6 * SR)))
                add(buf, t, pad([root * 4, root * 4 * 1.26, root * 4 * 1.5], int(4 * beat * SR + 1.2 * SR)), 1.3)
            continue
        if intro:
            add(buf, t, lowpass(kick(int(0.3 * SR)), 30), 0.5)
            add(buf, t + beat / 2, hat(int(0.1 * SR)), 0.6)
            continue
        add(buf, t, kick(int(0.45 * SR)))
        if b % 2 == 1:
            add(buf, t, clap(int(0.3 * SR)), 1.0)
        for s in range(2):
            add(buf, t + s * beat / 2, hat(int(0.15 * SR), open_=(s == 1 and b % 4 == 3)), 1.0, pan=0.3 if s else -0.3)
        for s in range(2):
            add(buf, t + s * beat / 2, bass(root * (2 if s else 1), int(beat / 2 * SR)))
        if b % 4 == 0:
            add(buf, t, pad([root * 4, root * 4 * 1.189, root * 4 * 1.5], int(4 * beat * SR)))

    for h in hits:
        t = h * beat
        r = int(min(2 * beat, t) * SR)
        if r > 0:
            add(buf, t - r / SR, riser(r))
        add(buf, t, impact(int(1.6 * SR)), 0.8)

    buf = np.tanh(buf * 1.2)
    buf /= np.abs(buf).max() + 1e-9
    buf *= 0.89
    fade = int(0.05 * SR)
    buf[-fade:] *= np.linspace(1, 0, fade)[:, None]
    pcm = (buf * 32767).astype("<i2")
    with wave.open(a.out, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"wrote {a.out}: {a.bpm} BPM, {a.bars} bars, beat {beat:.3f}s, {length:.2f}s, hits at beats {hits}")


if __name__ == "__main__":
    main()
