#!/usr/bin/env python3
"""Compose the "framed screen" intro layout: the screen recording inset on a soft gradient
backdrop with a rounded shadow, and the camera as a tall rounded card overlapping its left edge.

Usage:
  python3 framed.py --cam cam.mp4 --screen screen.mp4 --out framed.mp4
                    [--screen-start 0] [--cam-shift 0] [--backdrop wallpaper.jpg]
                    [--colors "#0e5b5c,#081a2c,#2a9d8f"] [--audio cam|screen] [--fps 30]

  --screen-start  seconds into the screen recording where the intro starts
  --cam-shift     move the camera crop left/right (-1..1) to keep the face centred
  --backdrop      an image to use instead of the generated gradient (it gets blurred)
  --colors        three hex colours for the generated, slowly drifting gradient

Output is 1920x1080, H.264 CRF 17, length of the camera take (the screen holds its last frame
if it is shorter). The camera's audio is used unless --audio screen. Needs only ffmpeg.
"""
import argparse
import os
import subprocess
import tempfile

W, H = 1920, 1080
SCREEN = dict(x=210, y=73, w=1660, h=934, r=26)
CAM = dict(x=52, y=262, w=316, h=556, r=38)


def rounded_mask(path, w, h, r):
    expr = (f"if(gt(abs(X-{w}/2),{w}/2-{r})*gt(abs(Y-{h}/2),{h}/2-{r}),"
            f"if(lte(hypot(abs(X-{w}/2)-({w}/2-{r}),abs(Y-{h}/2)-({h}/2-{r})),{r}),255,0),255)")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=black:s={w}x{h}", "-frames:v", "1",
                    "-vf", f"format=gray,geq=lum='{expr}'", path], check=True)


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         check=True, capture_output=True, text=True).stdout
    return float(out.strip())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cam", required=True)
    ap.add_argument("--screen", required=True)
    ap.add_argument("--out", default="framed.mp4")
    ap.add_argument("--screen-start", type=float, default=0)
    ap.add_argument("--cam-shift", type=float, default=0)
    ap.add_argument("--backdrop")
    ap.add_argument("--colors", default="#0e5b5c,#081a2c,#2a9d8f")
    ap.add_argument("--audio", choices=["cam", "screen"], default="cam")
    ap.add_argument("--fps", type=int, default=30)
    a = ap.parse_args()

    dur = duration(a.cam)
    c0, c1, c2 = a.colors.split(",")
    with tempfile.TemporaryDirectory() as tmp:
        sm, cm = os.path.join(tmp, "screen_mask.png"), os.path.join(tmp, "cam_mask.png")
        rounded_mask(sm, SCREEN["w"], SCREEN["h"], SCREEN["r"])
        rounded_mask(cm, CAM["w"], CAM["h"], CAM["r"])

        inputs = ["-i", a.cam, "-ss", str(a.screen_start), "-i", a.screen, "-loop", "1", "-i", sm, "-loop", "1", "-i", cm]
        if a.backdrop:
            inputs += ["-loop", "1", "-i", a.backdrop]
            bg = f"[4:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},gblur=sigma=40,eq=brightness=-0.08[bg]"
        else:
            inputs += ["-f", "lavfi", "-i", f"gradients=s={W}x{H}:c0={c0}:c1={c1}:c2={c2}:n=3:speed=0.004:r={a.fps}"]
            bg = f"[4:v]gblur=sigma=60,eq=brightness=-0.05[bg]"

        s, c = SCREEN, CAM
        shift = max(-1.0, min(1.0, a.cam_shift))
        graph = ";".join([
            bg,
            f"[1:v]fps={a.fps},scale={s['w']}:{s['h']}:force_original_aspect_ratio=increase,crop={s['w']}:{s['h']},"
            f"tpad=stop_mode=clone:stop_duration={dur:.2f},format=rgba[sv]",
            "[2:v]format=gray,split[sm1][sm2]",
            "[sv][sm1]alphamerge[scr]",
            f"[sm2]pad={s['w'] + 160}:{s['h'] + 160}:80:80:black,boxblur=40:2,"
            f"colorchannelmixer=aa=0.55,format=gray[shm]",
            f"color=black:s={s['w'] + 160}x{s['h'] + 160}:r={a.fps},format=rgba[shc]",
            "[shc][shm]alphamerge[shadow]",
            f"[0:v]fps={a.fps},crop=ih*{c['w']}/{c['h']}:ih:(iw-ih*{c['w']}/{c['h']})*{(shift + 1) / 2:.3f}:0,"
            f"scale={c['w']}:{c['h']},format=rgba[cv]",
            "[3:v]format=gray[cmk]",
            "[cv][cmk]alphamerge[cam]",
            f"[bg][shadow]overlay={s['x'] - 80}:{s['y'] - 80 + 24}:shortest=1[b1]",
            f"[b1][scr]overlay={s['x']}:{s['y']}:shortest=1[b2]",
            f"[b2][cam]overlay={c['x']}:{c['y']}:shortest=1,format=yuv420p[v]",
        ])
        amap = "0:a?" if a.audio == "cam" else "1:a?"
        subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", graph, "-map", "[v]", "-map", amap,
                        "-t", f"{dur:.3f}", "-c:v", "libx264", "-crf", "17", "-preset", "fast", "-c:a", "aac",
                        "-b:a", "192k", a.out], check=True)
    print(f"wrote {a.out} ({dur:.1f}s)")


if __name__ == "__main__":
    main()
