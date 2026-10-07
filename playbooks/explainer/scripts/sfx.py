#!/usr/bin/env python3
"""A small free sound-effect kit, synthesized (no downloads, no licences): assets/sfx/<name>.wav

    python scripts/sfx.py          # needs numpy

pop (something appears), whoosh (scene change, fast move), click (UI, typing), tick (counter step),
ding (a result lands), thud (a heavy stamp or fail), sparkle (a payoff), riser (build into a reveal).
Swap in library sounds any time: mix.py plays any file in assets/sfx/ by name.
"""
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "sfx"
SR = 48000
rng = np.random.default_rng(7)


def env(n, a=0.003, d=0.2):
    t = np.arange(n) / SR
    e = np.exp(-t / d)
    na = max(1, int(a * SR))
    e[:na] *= np.linspace(0, 1, na)
    return e


def sweep(f, n):
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def bandnoise(n, lo, hi):
    spec = np.fft.rfft(rng.standard_normal(n))
    freqs = np.fft.rfftfreq(n, 1 / SR)
    spec[(freqs < lo) | (freqs > hi)] = 0
    s = np.fft.irfft(spec, n)
    return s / (np.abs(s).max() + 1e-9)


def pop():
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    return sweep(500 + 500 * np.exp(-t / 0.02), n) * env(n, 0.002, 0.045)


def whoosh():
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    return bandnoise(n, 400, 2600) * np.sin(np.pi * t / 0.6) ** 2 * 0.8


def click():
    n = int(0.04 * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * 2400 * t) * np.exp(-t / 0.005)


def tick():
    n = int(0.03 * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * 3600 * t) * np.exp(-t / 0.004) * 0.6


def ding():
    n = int(1.2 * SR)
    t = np.arange(n) / SR
    s = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t / d)
            for f, a, d in [(1568, 1, 0.5), (2349, 0.5, 0.35), (3136, 0.3, 0.25), (4186, 0.15, 0.15)])
    return s * np.minimum(1, t / 0.002) / 1.6


def thud():
    n = int(0.4 * SR)
    t = np.arange(n) / SR
    s = sweep(60 + 100 * np.exp(-t / 0.03), n) * np.exp(-t / 0.09)
    return s + 0.3 * bandnoise(n, 40, 1800) * np.exp(-t / 0.03)


def sparkle():
    out = np.zeros(int(0.9 * SR))
    for k, m in enumerate([84, 88, 91, 96]):
        f = 440 * 2 ** ((m - 69) / 12)
        n = int(0.5 * SR)
        t = np.arange(n) / SR
        s = np.sin(2 * np.pi * f * t) * env(n, 0.002, 0.18) * 0.4
        i = int(k * 0.07 * SR)
        out[i:i + n] += s[: len(out) - i]
    return out


def riser():
    n = int(1.2 * SR)
    t = np.arange(n) / SR
    return bandnoise(n, 300, 6000) * (t / 1.2) ** 2 * 0.6 + sweep(200 + 600 * (t / 1.2) ** 2, n) * (t / 1.2) ** 3 * 0.3


def write(name, s):
    s = s / (np.abs(s).max() + 1e-9) * 0.9
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((s * 32767).astype(np.int16).tobytes())


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for fn in (pop, whoosh, click, tick, ding, thud, sparkle, riser):
        write(fn.__name__, fn())
    print("wrote", ", ".join(sorted(p.stem for p in OUT.glob("*.wav"))), "to assets/sfx/")
