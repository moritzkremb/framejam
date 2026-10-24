#!/usr/bin/env python3
"""Make the starter scene: placeholder media that matches template/edit.example.json, so the template renders before
the user's footage is in. Run it in the project folder (where build.py and edit.example.json are):

  python3 scripts/make_starter.py

It writes:
  assets/speech.mp4             a drawn stand-in presenter talking in a room (1080x1920, 30 fps)
  assets/cutouts/speaker.webm   the same presenter on a transparent background (for hook, word and magazine beats)
  assets/speech-norm.wav        the starter script read by the computer voice (macOS `say`; silence elsewhere)
  transcripts/edited.words.json word times (local whisper via `npx hyperframes transcribe`, else estimated)
  assets/vis/*.png              placeholder app icons, grid tiles and a storyboard window
  edit.json                     a copy of edit.example.json, unless edit.json exists

Then: make_sounds.py, make_captions.py, build.py and `npx hyperframes render` (SKILL.md, "Starter scene").
Everything here is a placeholder; replace it with the user's recording and real pictures for the actual reel.
"""
import argparse, json, math, shutil, subprocess, sys, tempfile, wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS, SR = 1080, 1920, 30, 48000
DURATION = 24.2
# (start in seconds, line). Starts match the beats in edit.example.json.
SCRIPT = [
    (0.0, "I didn't edit a single second of this."),
    (2.55, "My agent did."),
    (3.7, "No timeline. No editing app."),
    (5.75, "I just type one sentence,"),
    (7.3, "and the titles look like a magazine cover."),
    (9.8, "It even made all of these."),
    (11.4, "The difference is huge."),
    (12.9, "It plans every shot before it renders,"),
    (15.2, "so a day of editing takes ten minutes."),
    (17.6, "Want bigger captions? One more sentence."),
    (20.1, "Comment reel and I'll send you the playbook."),
    (22.8, "Follow for more."),
]
GREEN, CREAM, GOLD = (27, 58, 46), (243, 238, 225), (201, 168, 106)


def font(size, root):
    for f in (root / "assets/fonts/inter.woff2", root / "assets/fonts/playfair-display.woff2"):
        try:
            return ImageFont.truetype(str(f), size)
        except OSError:
            pass
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
                rate = 185
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
    """The out-of-focus room behind the presenter."""
    y = np.linspace(0, 1, H)[:, None]
    x = np.linspace(0, 1, W)[None, :]
    wall = np.array([34, 58, 49]) * (1 - 0.25 * y[..., None]) + np.zeros((H, W, 3))
    lamp = np.exp(-(((x - 0.16) / 0.22) ** 2 + ((y - 0.33) / 0.13) ** 2))[..., None]
    wall = wall + lamp * np.array([150, 105, 50])
    img = Image.fromarray(np.clip(wall, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 1330, W, H], fill=(28, 48, 40))
    for x0 in (40, 400, 760):
        d.rectangle([x0, 1400, x0 + 280, 1880], outline=(46, 72, 61), width=8)
    d.rectangle([0, 1318, W, 1340], fill=(52, 80, 68))
    d.rectangle([700, 420, 980, 780], fill=(214, 200, 170))
    d.rectangle([730, 450, 950, 750], fill=(62, 84, 70))
    d.polygon([(730, 700), (800, 600), (860, 660), (950, 560), (950, 750), (730, 750)], fill=(92, 112, 90))
    d.polygon([(110, 560), (250, 560), (280, 680), (80, 680)], fill=(236, 196, 128))
    d.rectangle([174, 680, 186, 900], fill=(60, 50, 40))
    img = img.filter(ImageFilter.GaussianBlur(9))
    v = np.asarray(img).astype(np.float64)
    vig = 1 - 0.45 * (((x - 0.5) / 0.75) ** 2 + ((y - 0.45) / 0.8) ** 2)
    return Image.fromarray(np.clip(v * vig[..., None], 0, 255).astype(np.uint8))


def sweater_pattern():
    """A knit band pattern for the sweater, drawn once."""
    pat = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(pat)
    for row, y in enumerate(range(1300, H, 90)):
        col = [(214, 186, 150, 255), (46, 92, 86, 255), (176, 74, 48, 255)][row % 3]
        for x in range(-40, W + 40, 44):
            off = 22 if row % 2 else 0
            d.polygon([(x + off, y), (x + off + 16, y + 18), (x + off, y + 36), (x + off - 16, y + 18)], fill=col)
        d.rectangle([0, y + 52, W, y + 58], fill=(214, 186, 150, 255))
    return pat


def figure(t, mouth, blink, pattern):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    dx = 7 * math.sin(2 * math.pi * 0.31 * t) + 3 * math.sin(2 * math.pi * 0.83 * t)
    dy = 5 * math.sin(2 * math.pi * 0.47 * t) - 8 * mouth
    bx = dx * 0.35
    body = Image.new("L", (W, H), 0)
    bd = ImageDraw.Draw(body)
    bd.ellipse([60 + bx, 1160, 1020 + bx, 2500], fill=255)
    sweater = Image.new("RGBA", (W, H), (150, 62, 40, 255))
    sweater.alpha_composite(pattern, (int(bx), 0))
    layer.paste(sweater, (0, 0), body)
    d.ellipse([400 + bx, 1130, 680 + bx, 1290], fill=(236, 232, 224, 255))
    hx, hy = 540 + dx, 850 + dy
    d.rectangle([hx - 72, hy + 150, hx + 72, hy + 330], fill=(196, 140, 108, 255))
    d.ellipse([hx - 182, hy - 30, hx - 132, hy + 70], fill=(214, 160, 126, 255))
    d.ellipse([hx + 132, hy - 30, hx + 182, hy + 70], fill=(214, 160, 126, 255))
    d.ellipse([hx - 160, hy - 200, hx + 160, hy + 215], fill=(226, 176, 142, 255))
    d.chord([hx - 160, hy - 120, hx + 160, hy + 222], 15, 165, fill=(170, 124, 96, 255))
    d.ellipse([hx - 128, hy - 70, hx + 128, hy + 150], fill=(226, 176, 142, 255))
    d.pieslice([hx - 175, hy - 255, hx + 175, hy + 75], 180, 360, fill=(238, 232, 218, 255))
    d.ellipse([hx - 205, hy - 110, hx + 175, hy - 60], fill=(222, 214, 196, 255))
    d.ellipse([hx - 26, hy - 205, hx + 26, hy - 160], fill=(32, 64, 50, 255))
    eh = 3 if blink else 20
    for ex in (-62, 62):
        d.ellipse([hx + ex - 15, hy + 10 - eh / 2, hx + ex + 15, hy + 10 + eh / 2], fill=(40, 30, 26, 255))
        d.line([hx + ex - 26, hy - 30 - 4 * mouth, hx + ex + 26, hy - 34 - 4 * mouth], fill=(110, 76, 56, 255), width=7)
    d.line([hx - 6, hy + 30, hx - 12, hy + 82, hx + 6, hy + 86], fill=(190, 138, 108, 255), width=5)
    mh = 6 + 34 * mouth
    d.ellipse([hx - 38, hy + 120 - mh / 2, hx + 38, hy + 120 + mh / 2], fill=(98, 44, 40, 255))
    return layer.filter(ImageFilter.GaussianBlur(0.8))


def make_speaker(root, track):
    n = int(DURATION * FPS)
    hop = SR // FPS
    rms = np.array([np.sqrt(np.mean(track[i * hop:(i + 1) * hop] ** 2)) if i * hop < len(track) else 0 for i in range(n)])
    rms = rms / (np.percentile(rms, 95) or 1)
    mouth = np.clip(np.convolve(rms, [0.25, 0.5, 0.25], "same"), 0, 1)
    bg = room().convert("RGBA")
    pattern = sweater_pattern()
    (root / "assets/cutouts").mkdir(parents=True, exist_ok=True)
    enc = ["-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p"]
    rgb = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-"]
                           + enc + [str(root / "assets/speech.mp4")], stdin=subprocess.PIPE)
    rgba = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                             "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "34", "-deadline", "realtime", "-cpu-used", "8",
                             "-row-mt", "1", "-auto-alt-ref", "0", str(root / "assets/cutouts/speaker.webm")], stdin=subprocess.PIPE)
    for i in range(n):
        t = i / FPS
        blink = (t % 3.4) < 0.12
        fig = figure(t, float(mouth[i]), blink, pattern)
        frame = bg.copy()
        frame.alpha_composite(fig)
        rgb.stdin.write(frame.convert("RGB").tobytes())
        rgba.stdin.write(fig.tobytes())
        if i % 150 == 0:
            print(f"  presenter frame {i}/{n}", flush=True)
    for p in (rgb, rgba):
        p.stdin.close()
        p.wait()


def make_pictures(root):
    vis = root / "assets/vis"
    vis.mkdir(parents=True, exist_ok=True)
    # Two app icons
    a = Image.new("RGB", (300, 300), (24, 24, 28))
    d = ImageDraw.Draw(a)
    for k, (x, w, c) in enumerate([(40, 120, (233, 120, 160)), (60, 180, (120, 200, 230)), (30, 90, (240, 200, 90)), (90, 150, (150, 230, 150))]):
        d.rounded_rectangle([x, 60 + k * 50, x + w, 92 + k * 50], 8, fill=c)
    a.save(vis / "app-1.png")
    b = Image.new("RGB", (300, 300), (110, 70, 220))
    d = ImageDraw.Draw(b)
    d.polygon([(115, 85), (115, 215), (220, 150)], fill=(255, 255, 255))
    b.save(vis / "app-2.png")
    # Grid tiles: placeholder reel covers
    heads = ["10 MIN EDIT", "BEFORE AFTER", "MY SETUP", "ONE PROMPT", "", "NO TIMELINE", "BIG CAPTIONS", "THE RESULT", "TRY THIS"]
    fills = [(206, 92, 66), (38, 70, 120), (232, 200, 120), (30, 30, 34), (0, 0, 0), (60, 120, 98), (240, 236, 224), (150, 60, 120), (24, 64, 52)]
    for i, (txt, col) in enumerate(zip(heads, fills)):
        if not txt:
            continue
        tile = Image.new("RGB", (540, 960), col)
        d = ImageDraw.Draw(tile)
        ink = (20, 20, 20) if sum(col) > 500 else (250, 248, 240)
        d.ellipse([170, 360, 370, 600], fill=tuple(min(255, c + 40) for c in col))
        d.ellipse([90, 580, 450, 1000], fill=tuple(min(255, c + 40) for c in col))
        f = font(78, root)
        for k, word in enumerate(txt.split()):
            d.text((270, 120 + k * 92), word, font=f, fill=ink, anchor="mt")
        tile.save(vis / f"tile-{i + 1}.png")
    # Storyboard window
    sb = Image.new("RGB", (960, 586), (20, 46, 36))
    d = ImageDraw.Draw(sb)
    small, mid = font(22, root), font(30, root)
    for k in range(4):
        y = 24 + k * 140
        d.rounded_rectangle([24, y, 936, y + 124], 14, fill=(30, 62, 49))
        d.text((44, y + 18), f"0{k + 1}", font=mid, fill=GOLD)
        d.rounded_rectangle([100, y + 14, 250, y + 110], 10, fill=(62, 96, 80))
        d.text((272, y + 18), ["Hook: text behind the speaker", "Chat box types the prompt", "Magazine cover titles", "Grid of results"][k], font=mid, fill=CREAM)
        d.text((272, y + 64), ["0:00-0:03  speaker cut out, serif headline", "0:05-0:08  punch-in, keyboard sound", "0:08-0:10  masthead behind the head", "0:10-0:11  nine tiles land"][k], font=small, fill=(150, 180, 160))
    sb.save(vis / "storyboard.png")


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
    print(json.dumps({"duration": DURATION, "speaker": "assets/speech.mp4", "cutout": "assets/cutouts/speaker.webm", "words": how}))


if __name__ == "__main__":
    main()
