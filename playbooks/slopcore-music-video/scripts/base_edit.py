"""Assemble the base edit: every shot's generated clip (or still) cut to its exact slot, then the song on top.

usage: python tools/base_edit.py [--shots analysis/shots.json] [--audio audio/master.mp3] [--out out/base.mp4]
                                 [--only s004,s012] [--width 1920 --height 1080]

Per shot in shots.json it reads:
  clip   path to an mp4 (generated or real footage), relative to the project root
  in     second in the clip where the slot starts (default 0; pick the best moment)
  speed  playback speed (default: 1, slowed down to fit when the clip is shorter than the slot, never below 0.5)
  still  path to an image, used when there is no clip (slow 4 % push-in so it never sits frozen)
Shots with neither get a dark grey slate so the timing still holds. Every segment is cover-cropped to the frame,
has exactly round(dur * fps) frames and no audio. Segments are cached in out/base/<id>.mp4; --only rebuilds some.
The result has the untouched master as its only soundtrack. Overlays (lyrics, labels, HUD) go on top in the video tool."""
import argparse, json, os, subprocess, sys

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('--shots', default='analysis/shots.json'); ap.add_argument('--audio', default='audio/master.mp3')
ap.add_argument('--out', default='out/base.mp4'); ap.add_argument('--only', default='')
ap.add_argument('--width', type=int, default=1920); ap.add_argument('--height', type=int, default=1080)
ap.add_argument('--crf', type=int, default=16)
a = ap.parse_args()

P = json.load(open(a.shots)); fps = P['fps']; W, H = a.width, a.height
only = set(x for x in a.only.split(',') if x)
os.makedirs('out/base', exist_ok=True)
cover = f'scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1'
enc = ['-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', str(a.crf), '-pix_fmt', 'yuv420p', '-r', str(fps)]

def probe_dur(p):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True)
    return float(r.stdout.strip() or 0)

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: sys.exit(f"ffmpeg failed: {' '.join(cmd)}\n{r.stderr[-1500:]}")

segs = []
for sh in P['shots']:
    n = max(1, round(sh['dur'] * fps)); seg = f"out/base/{sh['id']}.mp4"; segs.append(seg)
    if os.path.exists(seg) and sh['id'] not in only and not (only == set() and os.path.getmtime(seg) < os.path.getmtime(a.shots)):
        continue
    slot = n / fps
    if sh.get('clip') and os.path.exists(sh['clip']):
        start = float(sh.get('in') or 0); avail = max(0.05, probe_dur(sh['clip']) - start)
        speed = float(sh.get('speed') or (1.0 if avail >= slot else max(0.5, avail / slot)))
        if speed < 1 and avail / speed < slot: print(f"{sh['id']}: clip too short even at 0.5x; last frame holds", file=sys.stderr)
        vf = f"setpts=(PTS-STARTPTS)/{speed},{cover},fps={fps},tpad=stop_mode=clone:stop=-1"
        run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{start:.3f}', '-i', sh['clip'], '-vf', vf, '-frames:v', str(n), *enc, seg])
    elif sh.get('still') and os.path.exists(sh['still']):
        z = f"zoompan=z='1+0.04*on/{n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={fps}"
        run(['ffmpeg', '-v', 'error', '-y', '-loop', '1', '-i', sh['still'], '-vf', f"scale={W*2}:{H*2}:force_original_aspect_ratio=increase,crop={W*2}:{H*2},{z}", '-frames:v', str(n), *enc, seg])
    else:
        run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', f'color=c=0x26262a:s={W}x{H}:r={fps}', '-frames:v', str(n), *enc, seg])
    print(f"{sh['id']} {sh['start']:7.2f} {n:4d}f {'clip' if sh.get('clip') else 'still' if sh.get('still') else 'slate'}")

lst = 'out/base/concat.txt'
open(lst, 'w').write(''.join(f"file '{os.path.abspath(s)}'\n" for s in segs))
cmd = ['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst]
if a.audio and os.path.exists(a.audio): cmd += ['-i', a.audio, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '256k', '-shortest']
run(cmd + ['-c:v', 'copy', '-movflags', '+faststart', a.out])
total = sum(max(1, round(s['dur'] * fps)) for s in P['shots'])
print(f"{a.out}: {len(segs)} shots, {total} frames = {total / fps:.2f} s (song {P['duration']:.2f} s)")
