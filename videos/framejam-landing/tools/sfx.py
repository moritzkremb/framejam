"""Synthesise the UI sound-effects bed (one stereo WAV) from cue times.

Cue times are global seconds, derived from the footage event logs and each scene's
data-media-start / playback-rate (see the comments per scene).
"""
import random
import wave
from pathlib import Path

import numpy as np

SR = 48000
DUR = 33.35
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


# 01 looks: a soft knock on every montage cut, the pill lands, whip out.
for at in (0.0, 0.45, 0.87, 1.29, 1.69, 2.09, 2.47, 2.85):
    put(pop(260, 110, 0.12), at + 0.01, 0.45)
    put(tick(), at + 0.01, 0.35)
put(pop(700, 340, 0.1), 0.14, 0.5)
put(whoosh(0.45, 0.4), 3.3, 0.55)

# 02 grid (start 3.8): dive in, down to Doodle Mascot (1.76), Use (3.32), out to the toast.
put(whoosh(0.35, 1.4), 3.78, 0.35)
put(whoosh(0.3, 0.5), 3.8 + 1.4, 0.25)
put(click(), 3.8 + 3.32, 0.9, -0.3)
put(pop(820, 420, 0.09), 3.8 + 3.4, 0.45)
put(whoosh(0.3, 0.6), 3.8 + 3.6, 0.3)

# 03 build (start 8.1): the agent app opens, the prompt types and sends, three steps tick, Frame Jam slides in, zoom.
put(whoosh(0.35, 0.6), 8.05, 0.3)
put(pop(), 8.2, 0.35)
typing(8.55, 9.92, 42, 0.18)
put(click(), 8.0 + 2.0, 0.7)
put(pop(700, 340, 0.1), 8.1 + 1.97, 0.4)
for k in range(3):
    put(pop(900, 520, 0.07), 8.1 + 2.17 + 0.25 * k, 0.35)
put(whoosh(0.45, 0.7), 8.1 + 2.85, 0.5, 0.4)
put(whoosh(0.5, 0.5), 8.1 + 4.5, 0.35)

# 04 point (start 13.3, media 6.6, rate 1.3): pin 7.821, typing 8.617-9.813, add 10.168.
p4 = lambda m: 13.3 + (m - 6.6) / 1.3
put(click(), p4(7.821), 0.9, -0.2)
put(pop(900, 500, 0.08), p4(7.88), 0.35, -0.2)
put(pop(), 14.7, 0.3)
typing(p4(8.617), p4(9.813), 17, 0.2)
put(pop(), p4(10.168), 0.5)

# 05 range (start 16.9): clip A continues from media 11.28 at 2x for 1.56s, then clip B from media 14.4 at 2x.
r = lambda m: 16.9 + ((m - 11.28) / 2 if m <= 14.4 else 1.56 + (m - 14.4) / 2)
put(pop(), 17.25, 0.3)
put(click(), r(12.83), 0.8)
put(tick(), r(14.169), 0.5)
typing(r(14.87), r(17.121), 30, 0.15)
put(pop(), r(17.423), 0.5)

# 07 send (start 20.35): Finish (0.72), the agent window (0.85) gets the comments and applies them, then "Version 2 is ready" (3.47).
put(click(), 20.35 + 0.72, 0.9, 0.2)
put(whoosh(0.35, 0.6), 20.35 + 0.8, 0.35)
put(pop(700, 340, 0.1), 20.35 + 1.12, 0.45)
for k in range(3):
    put(pop(900, 520, 0.07), 20.35 + 1.32 + 0.1 * k, 0.25)
for k in range(3):
    put(pop(900, 520, 0.07), 20.35 + 1.97 + 0.28 * k, 0.35)
put(chime(), 20.35 + 3.47, 0.6)

# 08 v2 (start 25.15): lime orb in the player, split-screen in at 1.7.
put(pop(500, 200, 0.14), 25.25, 0.45)
put(whoosh(0.45, 0.5), 25.15 + 1.6, 0.4)
put(pop(500, 260, 0.1), 25.15 + 1.72, 0.35, -0.3)
put(pop(560, 280, 0.1), 25.15 + 1.84, 0.35, 0.3)

# 09 end card (start 28.85): wordmark lands, the pill pops.
put(whoosh(0.4, 0.5), 28.6, 0.4)
put(boom(), 28.9, 0.6)
put(shimmer(0.8), 29.15, 0.5)
put(pop(640, 320, 0.11), 28.85 + 1.6, 0.5)

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
