#!/usr/bin/env python3
"""Measure a music track's beat grid for a beat-synced motion piece.

Usage:
  python3 beat_grid.py music.mp3 [--bpm 120] [--out beats.json] [--beats-per-bar 4]

Needs ffmpeg on PATH and numpy. Prints the tempo, the first downbeat and a bar table,
and writes beats.json:
  { "bpm": 120.0, "offset": 0.012, "beat": 0.5, "bar": 2.0, "duration": 16.0,
    "beats": [...], "downbeats": [...], "accents": [...] }
"offset" is the grid origin: where bar 1 beat 1 falls (a quiet intro is counted back to it). "accents" are the strongest onsets
(drops, hits, fills), the moments worth a big visual event.
Pass --bpm when you already know the tempo (a generator's setting); only the phase is measured then.
"""
import argparse
import json
import subprocess
import sys

import numpy as np

SR = 22050
HOP = 256
WIN = 1024


def load(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32)


def spectral_flux(x):
    n = 1 + (len(x) - WIN) // HOP
    frames = np.lib.stride_tricks.as_strided(
        x, shape=(n, WIN), strides=(x.strides[0] * HOP, x.strides[0])
    )
    spec = np.abs(np.fft.rfft(frames * np.hanning(WIN), axis=1))
    logspec = np.log1p(spec * 20)
    flux = np.maximum(0, np.diff(logspec, axis=0))
    freqs = np.fft.rfftfreq(WIN, 1 / SR)
    full = flux.sum(1)
    low = flux[:, freqs < 150].sum(1)
    norm = lambda v: (v - v.mean()) / (v.std() + 1e-9)
    return norm(full), norm(low)


def tempo(flux, lo=70, hi=180):
    fps = SR / HOP
    f = flux - flux.mean()
    ac = np.correlate(f, f, mode="full")[len(f) - 1:]
    lags = np.arange(len(ac))
    valid = (lags >= fps * 60 / hi) & (lags <= fps * 60 / lo)
    lag = lags[valid][np.argmax(ac[valid])]
    bpm = 60 * fps / lag
    while bpm < 90:
        bpm *= 2
    while bpm > 160:
        bpm /= 2
    return bpm


def phase(flux, period_frames):
    best, best_score = 0.0, -1e9
    for p in np.arange(0, period_frames, 0.25):
        idx = np.round(np.arange(p, len(flux), period_frames)).astype(int)
        idx = idx[idx < len(flux)]
        score = flux[idx].mean()
        if score > best_score:
            best, best_score = p, score
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--bpm", type=float)
    ap.add_argument("--beats-per-bar", type=int, default=4)
    ap.add_argument("--out", default="beats.json")
    a = ap.parse_args()

    x = load(a.audio)
    duration = len(x) / SR
    full, low = spectral_flux(x)
    fps = SR / HOP
    bpm = a.bpm or round(tempo(full) * 2) / 2
    period = fps * 60 / bpm
    p = phase(full, period)
    beat_frames = np.arange(p, len(full), period)

    # Downbeat: the beat phase (of beats-per-bar) with the most low-end energy.
    bpb = a.beats_per_bar
    low_at = [low[np.round(beat_frames[k::bpb]).astype(int).clip(0, len(low) - 1)].mean() for k in range(bpb)]
    k0 = int(np.argmax(low_at))

    to_sec = lambda f: round(((f + 1) * HOP + WIN / 2) / SR, 3)
    beats = [to_sec(f) for f in beat_frames]
    downbeats = beats[k0::bpb]
    # Grid origin: the first downbeat, extended back over a quiet intro.
    offset = round(downbeats[0] % (60 / bpm * bpb), 3) if downbeats else 0.0
    if 60 / bpm * bpb - offset < 0.06:
        offset = 0.0

    thr = np.percentile(full, 99)
    peaks = [i for i in range(1, len(full) - 1) if full[i] > thr and full[i] >= full[i - 1] and full[i] >= full[i + 1]]
    accents = []
    for i in sorted(peaks, key=lambda i: -full[i]):
        t = to_sec(i)
        if all(abs(t - u) > 0.4 for u in accents):
            accents.append(t)
    accents = sorted(accents[:12])

    out = {
        "bpm": bpm, "offset": offset, "beat": round(60 / bpm, 4), "bar": round(60 / bpm * bpb, 4),
        "beatsPerBar": bpb, "duration": round(duration, 3),
        "beats": beats, "downbeats": downbeats, "accents": accents,
    }
    with open(a.out, "w") as fh:
        json.dump(out, fh, indent=1)

    print(f"tempo {bpm} BPM  beat {60 / bpm:.3f}s  bar {60 / bpm * bpb:.3f}s  grid origin {offset:.3f}s  length {duration:.2f}s")
    for n, t in enumerate(downbeats):
        print(f"  downbeat {n + 1:>2}  {t:7.3f}s")
    print("accents:", ", ".join(f"{t:.2f}" for t in accents))
    print(f"wrote {a.out}")


if __name__ == "__main__":
    sys.exit(main())
