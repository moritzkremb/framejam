"""Cut plan for a slopcore music video: analysis/audio.json + analysis/lyrics.json -> analysis/shots.json + analysis/shots.md

usage: python tools/shot_plan.py [--fps 24] [--bars 1] [--max-bars 2] [--min 0.6] [--lead 0.08] [--flurry chorus,hook]

The rhythm it encodes (measured on the reference: median shot 1.8 s at 136 BPM, about one bar):
- A cut lands just before each sung line, on the beat at or before the line's first word (vocal pickup), so the new
  image arrives with the new words.
- Long lines and instrumental stretches split on downbeats so no shot runs past --max-bars bars.
- In --flurry sections (substring match on the section id) shots split every 2 beats for the hook.
- Shots shorter than --min seconds merge into the next. All times snap to whole frames at --fps.
Each shot carries its lyric words with times; fill in look, clip, hero and overlay by hand (or by agent) afterwards.
Re-running keeps those hand-filled fields for shots whose id and start are unchanged."""
import argparse, json, os, bisect

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('--fps', type=float, default=24)
ap.add_argument('--max-bars', type=float, default=2, help='longest shot in bars')
ap.add_argument('--bars', type=float, default=1, help='shot length in bars where nobody sings')
ap.add_argument('--min', type=float, default=0.6, help='shortest shot in seconds')
ap.add_argument('--lead', type=float, default=0.08, help='cut this much before a line when no beat is close')
ap.add_argument('--flurry', default='', help='comma list of section-id substrings cut every 2 beats')
ap.add_argument('--audio', default='analysis/audio.json'); ap.add_argument('--lyrics', default='analysis/lyrics.json')
ap.add_argument('--out', default='analysis/shots.json')
a = ap.parse_args()

A = json.load(open(a.audio)); L = json.load(open(a.lyrics))['lines'] if os.path.exists(a.lyrics) else []
beats, downs, dur = A['beats'], A['downbeats'] or A['beats'][::4], A['duration']
beat = sorted(beats)[len(beats) // 2 + 1] - sorted(beats)[len(beats) // 2] if len(beats) > 2 else 0.5
bar = 4 * (60 / A['bpm']) if A.get('bpm') else 4 * beat
snap = lambda t: round(round(t * a.fps) / a.fps, 4)
flurry = [s for s in a.flurry.split(',') if s]

def grid_before(t, grid, within):
    i = bisect.bisect_right(grid, t + 1e-6) - 1
    return grid[i] if i >= 0 and t - grid[i] <= within else None

cuts = {0.0: None}
for l in L:  # one cut per sung line, on the beat at or just before the pickup
    g = grid_before(l['s'], beats, 0.35)
    cuts[snap(g if g is not None else max(0, l['s'] - a.lead))] = l['section']
sec_at = lambda t: next((l['section'] for l in reversed(L) if l['s'] <= t + 0.4), L[0]['section'] if L else 'song')
ts = sorted(cuts) + [dur]
out = []
for t0, t1 in zip(ts, ts[1:]):  # split long stretches on downbeats (or every 2 beats in flurry sections)
    sec = sec_at(t0); fl = any(f in (sec or '') for f in flurry)
    sung = any(l['s'] < t1 and l['e'] > t0 for l in L)
    step = 2 * beat if fl else (a.max_bars if sung else a.bars) * bar
    grid = beats[::2] if fl else downs
    seg, cur = [t0], t0
    for g in grid:
        if cur + step - 0.15 <= g < t1 - a.min: seg.append(g); cur = g
    out += [(snap(x), sec) for x in seg]
out.append((snap(dur), None))
shots = []
for (s, sec), (e, _) in zip(out, out[1:]):
    if shots and e - s < a.min * 0.5: continue
    if shots and s - shots[-1]['start'] < a.min: shots[-1]['end'] = e; continue
    shots.append({'start': s, 'end': e, 'section': sec})
for sh in shots: sh['end'] = shots[shots.index(sh) + 1]['start'] if sh is not shots[-1] else snap(dur)

old = {}
if os.path.exists(a.out):
    for o in json.load(open(a.out)).get('shots', []): old[(o['id'], o['start'])] = o
res = []
for i, sh in enumerate(shots):
    sid = f's{i + 1:03d}'; s, e = sh['start'], sh['end']
    words = [w for l in L for w in l['words'] if s - 0.02 <= w['s'] < e - 0.02]
    lines = [l['text'] for l in L if any(s - 0.02 <= w['s'] < e - 0.02 for w in l['words'])]
    row = {'id': sid, 'start': s, 'end': e, 'dur': round(e - s, 3), 'frames': round((e - s) * a.fps), 'section': sh['section'],
           'lyric': ' / '.join(lines), 'words': words, 'look': None, 'prompt': None, 'still': None, 'clip': None, 'in': 0,
           'hero': None, 'overlay': None}
    keep = old.get((sid, s))
    if keep:
        for k in ('look', 'prompt', 'still', 'clip', 'in', 'speed', 'hero', 'overlay', 'note'):
            if k in keep: row[k] = keep[k]
    res.append(row)
os.makedirs(os.path.dirname(a.out) or '.', exist_ok=True)
json.dump({'fps': a.fps, 'bpm': A.get('bpm'), 'duration': dur, 'shots': res}, open(a.out, 'w'), indent=1)
md = ['| id | start | dur | section | lyric | look | hero | overlay |', '|---|---|---|---|---|---|---|---|']
md += [f"| {r['id']} | {r['start']:.2f} | {r['dur']:.2f} | {r['section'] or ''} | {r['lyric'][:60]} | {r['look'] or ''} | {r['hero'] or ''} | {r['overlay'] or ''} |" for r in res]
open(os.path.splitext(a.out)[0] + '.md', 'w').write('\n'.join(md) + '\n')
d = [r['dur'] for r in res]
print(f"{len(res)} shots, median {sorted(d)[len(d) // 2]:.2f} s, shortest {min(d):.2f} s, longest {max(d):.2f} s, bar {bar:.2f} s -> {a.out}")
