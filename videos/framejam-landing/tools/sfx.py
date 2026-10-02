"""Synthesise the UI sound-effects bed (one 44s stereo WAV) from cue times.

Cue times are global seconds, derived from the footage event logs and each scene's
data-media-start / playback-rate (see the comments per scene).
"""
import random
import wave
from pathlib import Path

import numpy as np

SR = 48000
DUR = 44.0
OUT = Path(__file__).resolve().parent.parent / "assets" / "audio" / "sfx.wav"
rng = np.random.default_rng(7)
random.seed(7)


def env(n, attack, decay):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-t / decay)


def onepole_lp(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def bandnoise(n, lo, hi):
    x = rng.standard_normal(n)
    return onepole_lp(x, hi) - onepole_lp(x, lo)


def click():
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * 2400 * t) * env(n, 0.0005, 0.006)
    knock = np.sin(2 * np.pi * 900 * t) * env(n, 0.0005, 0.012)
    noise = bandnoise(n, 1500, 7000) * env(n, 0.0002, 0.004)
    return 0.35 * body + 0.4 * knock + 0.5 * noise


def tick():
    n = int(0.025 * SR)
    t = np.arange(n) / SR
    f = random.uniform(2600, 3600)
    return (0.5 * bandnoise(n, 1800, 8000) + 0.25 * np.sin(2 * np.pi * f * t)) * env(n, 0.0002, 0.003)


def pop(f0=720, f1=360, dur=0.09):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / 0.018)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * env(n, 0.001, 0.03)


def whoosh(dur=0.42, rise=0.7):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = bandnoise(n, 300, 5000)
    shape = np.sin(np.pi * np.clip(t / dur, 0, 1) ** rise) ** 2
    return x * shape * 0.9


def chime():
    n = int(1.4 * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f, d, a, off in ((1318.5, 0.5, 0.5, 0.0), (1975.5, 0.7, 0.45, 0.07)):
        k = int(off * SR)
        tt = t[: n - k]
        out[k:] += a * (np.sin(2 * np.pi * f * tt) + 0.2 * np.sin(2 * np.pi * 2 * f * tt)) * env(n - k, 0.002, d)
    return out * 0.6


def boom():
    n = int(1.2 * SR)
    t = np.arange(n) / SR
    f = 46 + 50 * np.exp(-t / 0.06)
    low = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.35)
    air = bandnoise(n, 2000, 9000) * env(n, 0.002, 0.25) * 0.15
    return low + air


def shimmer(dur=0.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f in (2637, 3136, 3951):
        out += np.sin(2 * np.pi * f * t + random.random() * 6)
    return out / 3 * np.sin(np.pi * t / dur) ** 2 * 0.35


L = np.zeros(int(DUR * SR))
R = np.zeros_like(L)


def put(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    j = min(len(L), i + len(sig))
    if i >= len(L):
        return
    s = sig[: j - i] * gain
    L[i:j] += s * np.sqrt((1 - pan) / 2) * 1.414
    R[i:j] += s * np.sqrt((1 + pan) / 2) * 1.414


def typing(start, end, chars, gain=0.22, pan=-0.15):
    for k in range(chars):
        put(tick(), start + (end - start) * k / max(chars - 1, 1) + random.uniform(-0.01, 0.01), gain * random.uniform(0.7, 1.0), pan)


# 01 hook: footage cut to type (1.7), the mumbled ask types itself, the strike.
put(whoosh(0.3, 0.4), 1.5, 0.35)
put(pop(380, 160, 0.14), 1.72, 0.5)
put(pop(420, 200, 0.12), 2.22, 0.35)
typing(2.75, 2.75 + 0.022 * 44, 22, 0.16)
put(whoosh(0.28, 1.6), 3.82, 0.4, 0.2)

# 02 claim: wordmark lands, zoom-through exit.
put(boom(), 4.55, 0.55)
put(shimmer(0.7), 4.8, 0.5)
put(whoosh(0.55, 0.5), 7.45, 0.6)

# 03 point (start 8, media 5.98): pin click 7.823, typing 8.621-10.007, Enter 10.36.
put(click(), 8 + 7.823 - 5.98, 0.9, -0.2)
put(pop(900, 500, 0.08), 8 + 7.9 - 5.98, 0.35, -0.2)
typing(8 + 8.621 - 5.98, 8 + 10.007 - 5.98, 22)
put(pop(), 8 + 10.36 - 5.98, 0.5)
put(whoosh(0.4, 0.8), 12.15, 0.25, 0.3)

# 04 range (start 15, media 12.4, rate 1.5): drag 12.979-14.318, typing 15.018-18.003, Enter 18.305.
r = lambda m: 15 + (m - 12.4) / 1.5
put(click(), r(12.979), 0.8)
put(tick(), r(14.318), 0.5)
typing(r(15.018), r(18.003), 30, 0.18)
put(pop(), r(18.305), 0.5)

# 05 exact: underline draws (local 0.9).
put(whoosh(0.32, 1.2), 19.4, 0.3)
put(shimmer(0.55), 20.4, 0.55, 0.3)

# 06 send (start 24, media 26.3, rate 1.6): Finish 26.818, Version 2 ready 32.889.
s = lambda m: 24 + (m - 26.3) / 1.6
put(click(), s(26.818), 0.9, 0.2)
put(whoosh(0.5, 0.6), s(26.9), 0.4)
put(chime(), s(32.889), 0.55)

# 07 v2 (start 29): marker swipe (media 39.5 → local 0.3), split-screen in at 2.1.
put(whoosh(0.5, 1.0), 29.25, 0.3, -0.2)
put(whoosh(0.4, 0.5), 30.95, 0.45)
put(pop(500, 260, 0.1), 31.12, 0.35, -0.3)
put(pop(560, 280, 0.1), 31.22, 0.35, 0.3)

# 08 styles (start 34): grid in, cut to detail (2.6), cut back (3.9), Use click 15.22 (media 13.9, rate 1.25).
put(whoosh(0.4, 0.5), 33.85, 0.4)
put(whoosh(0.25, 0.5), 36.45, 0.3)
put(whoosh(0.25, 0.5), 37.75, 0.3)
put(click(), 34 + 3.9 + (15.22 - 13.9) / 1.25, 0.9, 0.3)
put(pop(820, 420, 0.09), 34 + 3.9 + (15.3 - 13.9) / 1.25, 0.45, 0.3)

# 09 cta (start 40): lockup lands, pill pops.
put(whoosh(0.45, 0.4), 39.7, 0.45)
put(boom(), 40.08, 0.6)
put(shimmer(0.9), 40.3, 0.5)
put(pop(640, 320, 0.11), 40.98, 0.5)

mix = np.stack([L, R], axis=1)
peak = np.max(np.abs(mix))
mix = mix / peak * 0.7
fade = int(0.4 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
OUT.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(OUT), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print(OUT, f"peak-normalised from {peak:.2f}")
