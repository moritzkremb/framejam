#!/usr/bin/env python3
"""Make the starter scene: placeholder media that matches template/edit.example.json, so the template renders before
the user's footage is in. Run it in the project folder (where build.py and edit.example.json are):

  python3 scripts/make_starter.py

It writes:
  assets/speech.mp4             a drawn stand-in presenter talking in a dim room (1080x1920, 30 fps)
  assets/speech-norm.wav        the starter script read by the computer voice (macOS `say`; silence elsewhere)
  transcripts/edited.words.json word times (local whisper via `npx hyperframes transcribe`, else estimated)
  assets/vis/thumb-*.png        placeholder video thumbnails for the hook
  edit.json                     a copy of edit.example.json, unless edit.json exists

Then: make_sounds.py, make_captions.py, build.py and `npx hyperframes render` (SKILL.md, "Starter scene").
Everything here is a placeholder; replace it with the user's recording and real pictures for the actual reel.
"""
import argparse, json, math, shutil, subprocess, sys, tempfile, wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS, SR = 1080, 1920, 30, 48000
DURATION = 24.6
# (start in seconds, line). Starts match the beats in edit.example.json.
SCRIPT = [
    (0.0, "Why does every script your agent writes sound the same?"),
    (3.5, "It only keeps the steps."),
    (5.3, "A hook. Three tips. A call to action."),
    (8.2, "Then it copies them into everything."),
    (10.3, "So teach it how to think instead."),
    (12.8, "Welcome to Tool Tuesday."),
    (14.4, "This week it's called Story Rules."),
    (16.6, "Open a loop. Be specific. Pay it off."),
    (19.6, "My last ten videos used it."),
    (21.7, "Comment rules, and I'll send it over."),
]
WALL, SOFA, TEE = (124, 114, 100), (34, 34, 40), (56, 64, 82)


def font(size, root, bold=False):
    try:
        f = ImageFont.truetype(str(root / "fonts/inter.woff2"), size)
        if bold:
            try:
                f.set_variation_by_axes([800])
            except (OSError, AttributeError):
                pass
        return f
    except OSError:
        return ImageFont.load_default(size=size)


def read_wav_mono(path):
    with wave.open(str(path)) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float64) / 32768
        if w.getnchannels() == 2:
            x = x.reshape(-1, 2).mean(axis=1)
    return x


def make_voice(root, voice):
    """Read each line with `say`, squeeze it into its slot if needed, and lay the lines on one track."""
    track = np.zeros(int(DURATION * SR))
    have_say = shutil.which("say") is not None
    lines = []
    with tempfile.TemporaryDirectory() as tmp:
        for k, (start, text) in enumerate(SCRIPT):
            slot = (SCRIPT[k + 1][0] if k + 1 < len(SCRIPT) else DURATION) - start - 0.15
            x = np.zeros(int(min(slot, 0.32 * len(text.split())) * SR))
            if have_say:
                rate = 195
                for _ in range(4):
                    aiff, wav_ = Path(tmp) / f"{k}.aiff", Path(tmp) / f"{k}.wav"
                    cmd = ["say", "-r", str(rate), "-o", str(aiff)] + (["-v", voice] if voice else []) + [text]
                    subprocess.run(cmd, check=True)
                    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(aiff), "-ar", str(SR), "-ac", "1", str(wav_)], check=True)
                    x = read_wav_mono(wav_)
                    nz = np.nonzero(np.abs(x) > 0.004)[0]
                    x = x[max(0, nz[0] - 200): nz[-1] + 800] if len(nz) else x
                    if len(x) / SR <= slot:
                        break
                    rate = int(rate * len(x) / SR / slot * 1.04) + 1
            i = int(start * SR)
            x = x[: len(track) - i]
            track[i:i + len(x)] += x
            lines.append((start, len(x) / SR, text))
    peak = np.max(np.abs(track)) or 1
    track = track / peak * 0.7
    out = root / "assets/speech-norm.wav"
    out.parent.mkdir(parents=True, exist_ok=True)
    raw = root / "assets/speech-raw.wav"
    with wave.open(str(raw), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((track * 32767).astype("<i2").tobytes())
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-af", "loudnorm=I=-15:TP=-1.5:LRA=11", "-ar", str(SR), "-ac", "2", str(out)], check=True)
    raw.unlink()
    return track, lines, have_say


def estimate_words(lines):
    words = []
    for start, length, text in lines:
        toks = text.split()
        weights = [len(t.strip(".,?!")) + 2 for t in toks]
        total = sum(weights)
        t = start
        for tok, wgt in zip(toks, weights):
            d = length * wgt / total
            words.append({"word": tok, "start": round(t, 3), "end": round(t + d * 0.92, 3)})
            t += d
    return {"words": words}


def transcribe(root, lines, use_asr):
    """Word times from `npx hyperframes transcribe` (local whisper.cpp), else estimated from the lines."""
    out = root / "transcripts/edited.words.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    if use_asr and shutil.which("npx"):
        with tempfile.TemporaryDirectory() as tmp:
            wav16 = Path(tmp) / "speech-16k.wav"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(root / "assets/speech-norm.wav"), "-ac", "1", "-ar", "16000", str(wav16)], check=True)
            r = subprocess.run(["npx", "-y", "hyperframes", "transcribe", str(wav16), "--dir", tmp, "--model", "small.en", "--json"],
                               capture_output=True, text=True)
            js = Path(tmp) / "transcript.json"
            if r.returncode == 0 and js.exists():
                d = json.loads(js.read_text())
                d = d.get("words", d) if isinstance(d, dict) else d
                words = [{"word": str(w.get("text", w.get("word", ""))).strip(), "start": w["start"], "end": w["end"]} for w in d]
                words = [w for w in words if w["word"]]
                if words:
                    out.write_text(json.dumps({"words": words}, indent=1) + "\n")
                    return "transcribed"
    out.write_text(json.dumps(estimate_words(lines), indent=1) + "\n")
    return "estimated"


def room():
    """The dim, warm room behind the presenter: a wall with a framed print, a sofa, a ceiling light."""
    y = np.linspace(0, 1, H)[:, None]
    x = np.linspace(0, 1, W)[None, :]
    wall = np.array(WALL, dtype=np.float64) * (0.62 + 0.38 * np.exp(-(((x - 0.62) / 0.5) ** 2 + ((y - 0.32) / 0.45) ** 2)))[..., None]
    img = Image.fromarray(np.clip(wall, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 120], fill=(118, 112, 104))
    d.ellipse([90, 60, 250, 120], fill=(214, 210, 200))
    d.rectangle([660, 250, 940, 640], fill=(196, 170, 132))
    d.rectangle([684, 274, 916, 616], fill=(226, 218, 204))
    for k, r_ in enumerate((96, 72, 48)):
        d.arc([800 - r_, 470 - r_, 800 + r_, 470 + r_], 180, 360, fill=(40, 38, 36), width=10 - 2 * k)
    d.ellipse([772, 330, 828, 386], fill=(40, 38, 36))
    d.rounded_rectangle([-60, 1180, W + 60, 1560], 60, fill=SOFA)
    d.rectangle([0, 1520, W, H], fill=(34, 34, 40))
    d.rounded_rectangle([0, 1060, 70, H], 20, fill=(150, 172, 196))
    img = img.filter(ImageFilter.GaussianBlur(7))
    v = np.asarray(img).astype(np.float64)
    vig = 1 - 0.4 * (((x - 0.5) / 0.8) ** 2 + ((y - 0.45) / 0.85) ** 2)
    return Image.fromarray(np.clip(v * vig[..., None], 0, 255).astype(np.uint8))


def figure(t, mouth, blink):
    """An original stand-in presenter: short hair, round glasses, a navy tee."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    dx = 6 * math.sin(2 * math.pi * 0.29 * t) + 3 * math.sin(2 * math.pi * 0.77 * t)
    dy = 4 * math.sin(2 * math.pi * 0.43 * t) - 6 * mouth
    bx = dx * 0.4
    d.ellipse([170 + bx, 1010, 910 + bx, 2250], fill=TEE + (255,))
    d.chord([440 + bx, 960, 640 + bx, 1060], 0, 180, fill=(214, 172, 140, 255))
    d.arc([430 + bx, 950, 650 + bx, 1075], 10, 170, fill=(44, 50, 66, 255), width=12)
    hx, hy = 540 + dx, 760 + dy
    d.rectangle([hx - 52, hy + 110, hx + 52, hy + 225], fill=(204, 160, 128, 255))
    for ex in (-148, 148):
        d.ellipse([hx + ex - 22, hy - 20, hx + ex + 22, hy + 60], fill=(218, 172, 140, 255))
    d.ellipse([hx - 138, hy - 170, hx + 138, hy + 170], fill=(228, 184, 150, 255))
    d.chord([hx - 146, hy - 190, hx + 146, hy + 10], 180, 360, fill=(150, 112, 70, 255))
    d.ellipse([hx - 150, hy - 150, hx - 90, hy - 30], fill=(150, 112, 70, 255))
    d.ellipse([hx + 90, hy - 150, hx + 150, hy - 30], fill=(150, 112, 70, 255))
    d.chord([hx - 120, hy - 160, hx + 150, hy - 40], 180, 360, fill=(170, 130, 86, 255))
    eh = 3 if blink else 16
    for ex in (-56, 56):
        d.ellipse([hx + ex - 12, hy + 6 - eh / 2, hx + ex + 12, hy + 6 + eh / 2], fill=(40, 30, 26, 255))
        d.ellipse([hx + ex - 44, hy - 30, hx + ex + 44, hy + 42], outline=(34, 30, 30, 255), width=7)
        d.line([hx + ex - 28, hy - 46 - 3 * mouth, hx + ex + 28, hy - 50 - 3 * mouth], fill=(120, 88, 56, 255), width=7)
    d.line([hx - 12, hy + 6, hx + 12, hy + 6], fill=(34, 30, 30, 255), width=6)
    d.line([hx - 4, hy + 24, hx - 10, hy + 70, hx + 6, hy + 74], fill=(196, 148, 116, 255), width=5)
    mh = 5 + 28 * mouth
    d.ellipse([hx - 32, hy + 108 - mh / 2, hx + 32, hy + 108 + mh / 2], fill=(110, 50, 46, 255))
    return layer.filter(ImageFilter.GaussianBlur(0.7))


def make_speaker(root, track):
    n = int(DURATION * FPS)
    hop = SR // FPS
    rms = np.array([np.sqrt(np.mean(track[i * hop:(i + 1) * hop] ** 2)) if i * hop < len(track) else 0 for i in range(n)])
    rms = rms / (np.percentile(rms, 95) or 1)
    mouth = np.clip(np.convolve(rms, [0.25, 0.5, 0.25], "same"), 0, 1)
    bg = room().convert("RGBA")
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                          "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p", str(root / "assets/speech.mp4")],
                         stdin=subprocess.PIPE)
    for i in range(n):
        t = i / FPS
        frame = bg.copy()
        frame.alpha_composite(figure(t, float(mouth[i]), (t % 3.6) < 0.12))
        p.stdin.write(frame.convert("RGB").tobytes())
        if i % 150 == 0:
            print(f"  presenter frame {i}/{n}", flush=True)
    p.stdin.close()
    p.wait()


def make_pictures(root):
    """Four placeholder video thumbnails: a colour field, a face shape and two words each."""
    vis = root / "assets/vis"
    vis.mkdir(parents=True, exist_ok=True)
    looks = [("HOOKS", "101", (226, 84, 60), (255, 255, 255)), ("VIRAL", "FORMULA", (30, 30, 36), (255, 214, 64)),
             ("3 TIPS", "THAT WORK", (244, 236, 220), (24, 24, 28)), ("STOP", "SCROLLING", (52, 86, 220), (255, 255, 255))]
    for i, (a, b, bg, ink) in enumerate(looks):
        img = Image.new("RGB", (840, 472), bg)
        d = ImageDraw.Draw(img)
        skin = tuple(min(255, c + 50) for c in bg) if sum(bg) < 500 else (200, 190, 176)
        d.ellipse([520, 90, 720, 310], fill=skin)
        d.ellipse([440, 290, 800, 620], fill=skin)
        d.text((48, 70), a, font=font(110, root, True), fill=ink)
        d.text((52, 196), b, font=font(64, root, True), fill=ink)
        d.rounded_rectangle([700, 400, 812, 448], 10, fill=(0, 0, 0))
        d.text((716, 404), f"{8 + i}:{12 + 7 * i:02d}", font=font(30, root), fill=(255, 255, 255))
        img.save(vis / f"thumb-{i + 1}.png")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default=".", help="the project folder (default: here)")
    ap.add_argument("--voice", default=None, help="a `say` voice, e.g. Samantha")
    ap.add_argument("--no-transcribe", action="store_true", help="estimate word times instead of transcribing")
    a = ap.parse_args()
    root = Path(a.root).resolve()
    example = root / "edit.example.json"
    if not example.exists():
        sys.exit("edit.example.json isn't here: copy the playbook's template/ into the project first")
    print("voice...")
    track, lines, have_say = make_voice(root, a.voice)
    if not have_say:
        print("  `say` isn't available, so the narration is silent and the presenter's mouth won't move")
    print("word times...")
    how = transcribe(root, lines, not a.no_transcribe)
    print(f"  {how}")
    print("pictures...")
    make_pictures(root)
    print("presenter...")
    make_speaker(root, track)
    if not (root / "edit.json").exists():
        shutil.copy(example, root / "edit.json")
    print(json.dumps({"duration": DURATION, "speaker": "assets/speech.mp4", "words": how}))


if __name__ == "__main__":
    main()
