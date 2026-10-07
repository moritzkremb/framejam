"""Word-level lyric timing -> engine/data/lyrics.json
usage:
  python scripts/lyrics_align.py transcribe --prompt "vocabulary hints, names, jargon"   # writes analysis/lyrics_raw.json + prints lines
  python scripts/lyrics_align.py align lyrics.txt [--chant outro:GO]                      # maps corrected lyrics onto the timings
lyrics.txt format: '# section: name' lines, then one sung line per row (you correct the transcript by hand; supplied lyrics always win).
Method (what held up on sung vocals): faster-whisper large-v3 word timestamps on the Demucs vocal stem, sequence-matched onto the
corrected lyrics, starts snapped to vocal onsets within 80 ms, then a fix for short first words pulled early by a held note.
wav2vec/MMS forced alignment ran ~200 ms late on singing, so it is not used. Always eyeball the result with plot_lyrics.py."""
import os, json, re, difflib, glob, argparse, numpy as np


def load_json(path):
    with open(path) as f:
        return json.load(f)


def save_json(obj, path, **kw):
    with open(path, 'w') as f:
        json.dump(obj, f, **kw)


def stem():
    c = glob.glob('stems/htdemucs/*/vocals.wav'); assert c, 'run audio_analysis.py first'; return c[0]

def transcribe(prompt):
    from faster_whisper import WhisperModel
    m = WhisperModel('large-v3', device='cpu', compute_type='int8')
    segs, _ = m.transcribe(stem(), language='en', word_timestamps=True, beam_size=5, condition_on_previous_text=False, initial_prompt=prompt or None, temperature=0)
    out = []
    for s in segs:
        out.append({'start': s.start, 'end': s.end, 'text': s.text.strip(), 'words': [{'w': w.word.strip(), 's': round(w.start, 3), 'e': round(w.end, 3)} for w in s.words]})
        print(f'[{s.start:7.2f}-{s.end:7.2f}] {s.text.strip()}', flush=True)
    os.makedirs('analysis', exist_ok=True); save_json(out, 'analysis/lyrics_raw.json', indent=1)

def align(path, chant=None, no_fix=()):
    A = load_json('engine/data/audio.json'); vo = np.array(A['vocal_onsets'])
    W = [w for s in load_json('analysis/lyrics_raw.json') for w in s['words']]
    norm = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())
    lines, sec = [], None
    with open(path) as fh:
        raw = fh.readlines()
    for L in raw:
        L = L.strip()
        if not L: continue
        if L.startswith('# section:'): sec = L.split(':', 1)[1].strip(); continue
        lines.append({'section': sec, 'text': L, 'words': L.split()})
    chant_sec, chant_word = (chant.split(':') + ['GO'])[:2] if chant else (None, None)
    C = [(li, wi, norm(w)) for li, l in enumerate(lines) if l['section'] != chant_sec for wi, w in enumerate(l['words'])]
    sm = difflib.SequenceMatcher(a=[c[2] for c in C], b=[norm(w['w']) for w in W], autojunk=False)
    T = [None] * len(C)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal':
            for k in range(i2 - i1): T[i1 + k] = (W[j1 + k]['s'], W[j1 + k]['e'])
        elif tag == 'replace':
            # spread over at most as many transcript words as lyric words: when the supplied lyrics cover only part of
            # the song, the tail of the transcript is not theirs (it once stretched a last word to the song's end)
            n = i2 - i1; s, e = W[j1]['s'], W[min(j2, j1 + n) - 1]['e']
            for k in range(n): T[i1 + k] = (s + (e - s) * k / n, s + (e - s) * (k + 1) / n)
    for i in range(len(C)):
        if T[i] is None:
            p = next((T[j] for j in range(i - 1, -1, -1) if T[j]), (0, 0)); T[i] = (p[1], p[1] + 0.25)
    for i, (li, wi, _) in enumerate(C):
        s, e = T[i]
        if len(vo):
            j = np.argmin(abs(vo - s))
            if abs(vo[j] - s) < 0.08: s = float(vo[j])
        lines[li].setdefault('_w', []).append({'w': lines[li]['words'][wi], 's': round(s, 3), 'e': round(max(e, s + 0.06), 3)})
    out = []
    for l in lines:
        if l['section'] == chant_sec: continue
        ws = l.pop('_w')
        for i in range(len(ws) - 1):  # short first word pulled early by the previous held note
            if ws[i + 1]['s'] - ws[i]['s'] > 0.9 and len(ws[i]['w'].strip(',.?!')) <= 4 and ws[i]['w'].strip(',.?!') not in no_fix:
                c = vo[(vo > ws[i + 1]['s'] - 0.55) & (vo < ws[i + 1]['s'] - 0.1)]
                ws[i]['s'] = round(float(c[0]) if len(c) else ws[i + 1]['s'] - 0.28, 3)
        for i, w in enumerate(ws):
            if i + 1 < len(ws): w['e'] = round(min(max(w['e'], w['s'] + 0.12), ws[i + 1]['s']), 3)
            w['e'] = round(min(w['e'], w['s'] + 2.0), 3)  # no sung word holds past 2 s
        l['words'] = ws; l['s'] = ws[0]['s']; l['e'] = ws[-1]['e']; out.append(l)
    if chant_sec:  # repeated chant: one word per vocal-envelope peak inside the chant section's window
        from scipy.signal import find_peaks
        env = np.array(A['env']['vocal']); fps = A['env_fps']; t = np.arange(len(env)) / fps
        t0 = out[-1]['e'] if out else 0; m = (t > t0) & (env > 0)
        pk, _ = find_peaks(env[m], height=0.3, distance=int(0.17 * fps), prominence=0.15)
        gos = [round(float(t[m][p]) - 0.06, 3) for p in pk]
        if gos: out.append({'section': chant_sec, 'text': (chant_word + ' ') * len(gos), 'words': [{'w': chant_word, 's': g, 'e': round(g + 0.18, 3)} for g in gos], 's': gos[0], 'e': gos[-1] + 0.3})
    os.makedirs('engine/data', exist_ok=True); save_json({'lines': out}, 'engine/data/lyrics.json', indent=1)
    for l in out: print(f"{l['s']:7.2f}-{l['e']:7.2f} {l['section'] or '':8s} {l['text'][:70]}")

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('cmd'); ap.add_argument('lyrics', nargs='?'); ap.add_argument('--prompt', default='')
    ap.add_argument('--chant'); ap.add_argument('--no-fix', default='', help='comma list of short words that are legitimately long (acronyms)')
    a = ap.parse_args()
    if a.cmd == 'transcribe': transcribe(a.prompt)
    else: align(a.lyrics, a.chant, tuple(x for x in a.no_fix.split(',') if x))
