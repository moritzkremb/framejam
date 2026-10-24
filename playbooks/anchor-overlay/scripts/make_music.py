#!/usr/bin/env python3
"""Make a two-part music bed with NumPy: calm until --turn, driving after it. Free, offline, no license questions.

  python3 scripts/make_music.py --duration 61.4 --turn 33.6 --out assets/music.wav
  python3 scripts/make_music.py --duration 15 --turn 8 --bpm 92 --seed 3 --out assets/music.wav

Calm part: a soft pad on four chords, a quiet plucked arpeggio and a slow bass. A short noise riser leads into the
turn, which lands on a downbeat (a hard cut, no crossfade). Driving part: kick on every beat, snare on 2 and 4, eighth
hats, a pumping bass, a brighter pad and a faster arpeggio. A last chord rings out and the bed fades over the final
1.2 s. render.py lowers it 20-24 dB under the voice before the turn and 14-18 dB under after it (edit.json -> music).
--seed changes the chord order and the arpeggio, --bpm the tempo (80-100 suits a talking-head reel).
To keep a track of your own instead, set music.src to it and give turnAt the time of its lift.
"""
import argparse, wave
from pathlib import Path

import numpy as np

SR = 48000
# Chord roots (MIDI) and their thirds and fifths: Am, F, C, G, Dm, Em
CHORDS = {"Am": (45, 48, 52), "F": (41, 45, 48), "C": (48, 52, 55), "G": (43, 47, 50), "Dm": (50, 53, 57), "Em": (52, 55, 59)}
PROGRESSIONS = [["Am", "F", "C", "G"], ["Am", "G", "F", "G"], ["Dm", "Am", "F", "C"], ["Am", "Em", "F", "G"]]


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env(n, attack, decay):
    t = np.arange(n) / SR
    return np.clip(t / max(attack, 1e-4), 0, 1) * np.exp(-t / max(decay, 1e-4))


def add(buf, start, x, gain=1.0):
    i = int(start * SR)
    if i >= len(buf) or i + len(x) <= 0:
        return
    j = min(len(buf), i + len(x))
    k = max(0, -i)
    buf[max(i, 0):j] += x[k:k + (j - max(i, 0))] * gain


def tone(freq, sec, attack=0.01, decay=0.4, partials=(1.0, 0.35, 0.12), detune=0.0):
    n = int(sec * SR)
    t = np.arange(n) / SR
    y = sum(a * np.sin(2 * np.pi * freq * (k + 1) * (1 + detune) * t) for k, a in enumerate(partials))
    return y * env(n, attack, decay)


def highpass_noise(rng, n):
    x = rng.standard_normal(n)
    return np.diff(x, prepend=0.0)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--duration", type=float, required=True)
    ap.add_argument("--turn", type=float, required=True, help="seconds into the reel where the music turns driving")
    ap.add_argument("--bpm", type=float, default=88)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", default="assets/music.wav")
    a = ap.parse_args()
    if not 0.5 < a.turn < a.duration - 0.5:
        raise SystemExit("--turn must sit inside the reel")
    rng = np.random.default_rng(a.seed)
    prog = PROGRESSIONS[a.seed % len(PROGRESSIONS)]
    beat = 60.0 / a.bpm
    bar = 4 * beat
    n = int(a.duration * SR)
    mix = np.zeros((n, 2))
    pad, rhythm = np.zeros(n), np.zeros(n)

    # Bars are laid out so one of them starts exactly on the turn.
    first_bar = a.turn - np.ceil(a.turn / bar) * bar
    bars = np.arange(first_bar, a.duration, bar)
    for bi, bs in enumerate(bars):
        chord = CHORDS[prog[bi % len(prog)]]
        drive = bs >= a.turn - 1e-6
        sec = bar + 0.25
        for k, mnote in enumerate(chord):
            for oct_shift in ((12,) if not drive else (12, 24)):
                add(pad, bs, tone(hz(mnote + oct_shift), sec, attack=0.35 if not drive else 0.08, decay=2.5, partials=(1.0, 0.3, 0.1), detune=0.002 * k), 0.12 if not drive else 0.1)
        # bass
        if not drive:
            add(rhythm, bs, tone(hz(chord[0]), bar, attack=0.05, decay=2.0, partials=(1.0, 0.2)), 0.5)
        else:
            for e in range(8):
                add(rhythm, bs + e * beat / 2, tone(hz(chord[0] + (12 if e % 4 == 3 else 0)), beat / 2 * 1.4, attack=0.004, decay=0.16, partials=(1.0, 0.4, 0.1)), 0.55)
        # arpeggio
        notes = list(chord) + [chord[1] + 12]
        steps = 8 if not drive else 16
        for s_ in range(steps):
            pat = notes[(s_ * (3 if a.seed % 2 else 1)) % len(notes)] + 24
            add(rhythm, bs + s_ * bar / steps, tone(hz(pat), 0.5, attack=0.004, decay=0.14, partials=(1.0, 0.25)), 0.13 if not drive else 0.17)
        if drive:
            for b_ in range(4):
                tt = bs + b_ * beat
                kn = int(0.3 * SR)
                t = np.arange(kn) / SR
                kick = np.sin(2 * np.pi * (45 * t + 75 * (1 - np.exp(-t * 30)) / 30 * 1.0)) * np.exp(-t / 0.11)
                add(rhythm, tt, kick, 0.95)
                if b_ in (1, 3):
                    sn = int(0.2 * SR)
                    t2 = np.arange(sn) / SR
                    snare = (highpass_noise(rng, sn) * 0.5 + np.sin(2 * np.pi * 190 * t2) * 0.4) * np.exp(-t2 / 0.07)
                    add(rhythm, tt, snare, 0.45)
            for h_ in range(8):
                hn = int(0.06 * SR)
                add(rhythm, bs + h_ * beat / 2, highpass_noise(rng, hn) * np.exp(-np.arange(hn) / SR / 0.018), 0.12 if h_ % 2 else 0.07)

    # riser into the turn
    rl = min(1.5, a.turn - 0.2)
    rn = int(rl * SR)
    ramp = (np.arange(rn) / rn) ** 2.5
    add(rhythm, a.turn - rl, highpass_noise(rng, rn) * ramp, 0.18)

    # button: the last chord rings out
    last = CHORDS[prog[0]]
    for k, mnote in enumerate(last):
        add(pad, a.duration - 1.6, tone(hz(mnote + 12), 1.6, attack=0.02, decay=0.9), 0.1)
    add(rhythm, a.duration - 1.6, tone(hz(last[0]), 1.6, attack=0.01, decay=0.7), 0.45)

    calm_gain = np.where(np.arange(n) / SR < a.turn, 0.8, 1.0)
    x = (pad + rhythm) * calm_gain
    fade = int(min(1.2, a.duration / 4) * SR)
    x[-fade:] *= np.linspace(1, 0, fade)
    x = x / (np.max(np.abs(x)) or 1.0) * 0.89
    # a touch of width: the right channel lags by 7 ms
    d = int(0.007 * SR)
    mix[:, 0] = x
    mix[d:, 1] = x[:-d]
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((mix * 32767).astype("<i2").tobytes())
    print(f"{out}: {a.duration:.1f} s, {a.bpm:g} bpm, calm until {a.turn:.2f} s, then driving")


if __name__ == "__main__":
    main()
