#!/usr/bin/env python3
"""List what still sounds like a retake in a cut: repeated words and phrases, restarts, cut-off words and fillers.

Run it on a transcript of the cut, before every review round, so the user doesn't spend a round on stumbles a machine
can find. Best input: a fresh transcript of speech.wav made with a model that keeps retakes (large-v3-turbo, see
references/transcription.md). final.transcript.json works too, but it only knows what the source transcript heard.

  python3 scripts/find_retakes.py --transcript transcripts/edited.words.json --edl working/edit-02/final.edl.json
  python3 scripts/find_retakes.py ... --speed 1.15 --out working/retakes.md   # times as they show in a sped-up render

Repeats, fillers, cut-off words and contraction restarts ("it's, it is") are usually real; "possible restart" (the
same three words again shortly after) is often just phrasing. Every line is a candidate, not a decision: listen to it (or transcribe 3-6 s around its source time on its own), then
add a removal and cut again. Transcript times can drift 0.5-1.5 s; place the cut on the waveform.
"""
import argparse,json,re
from pathlib import Path
from prepare_edit import load_words

FILLERS={'um','uh','erm','uhm','hmm','mm'}
CONTRA={"it's":('it','is'),"that's":('that','is'),"there's":('there','is'),"i'm":('i','am'),"we're":('we','are'),
        "you're":('you','are'),"they're":('they','are'),"i'll":('i','will')}
DETS={'the','a','an','this','that','these','those','my','your','our','their'}
REPEAT_OK={'bye','very','so','no','yeah','really','ha'}
norm=lambda w:re.sub(r"[^a-z0-9']",'',w.lower())

def hits(ws):
    t=[norm(w['word']) for w in ws];out=[]
    for i,w in enumerate(t):
        if w in FILLERS:out.append((i,i+1,'filler'))
        if ws[i]['word'].endswith('-'):out.append((i,i+1,'cut-off word'))
    for i in range(len(t)-2):  # "It's, it is 16 pages"
        if CONTRA.get(t[i])==tuple(t[i+1:i+3]):out.append((i,i+3,'restart'))
    for i in range(len(t)-1):  # "the, this new feature"
        if t[i] in {'the','a','an'} and t[i+1] in DETS and t[i+1]!=t[i]:out.append((i,i+2,'restart'))
    for k in range(6,0,-1):  # "for, for", "and then on x and then on x"
        for i in range(len(t)-2*k+1):
            if t[i:i+k]==t[i+k:i+2*k] and all(t[i:i+k]) and not (k==1 and t[i] in REPEAT_OK):out.append((i,i+2*k,f'repeat x{k}'))
    i=0
    while i<len(t)-3:  # the same three words again within 12 words: often a restart, sometimes just phrasing
        g=t[i:i+3];j=next((j for j in range(i+3,min(len(t)-2,i+15)) if t[j:j+3]==g),None) if all(g) else None
        if j is None:i+=1
        else:out.append((i,j+3,'possible restart'));i=j
    return out

def to_source(t,clips):
    for c in clips:
        if c['edited_start']<=t<c['edited_end']:return c['source_start']+t-c['edited_start']
    return None

def main():
    ap=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--transcript',required=True,help='word timings of the cut (any format prepare_edit.py reads)')
    ap.add_argument('--edl',help='final.edl.json, to add source times')
    ap.add_argument('--speed',type=float,default=1.0,help='playback speed of the render the user reviews')
    ap.add_argument('--out',help='also write the list as a Markdown table')
    a=ap.parse_args()
    ws=load_words(a.transcript);clips=json.loads(Path(a.edl).read_text())['clips'] if a.edl else []
    found=sorted(hits(ws),key=lambda h:(ws[h[0]]['start'],-h[1]));merged=[]
    for h in found:  # one line per spot: keep the longest hit within 1.5 s
        if merged and float(ws[h[0]]['start'])-float(ws[merged[-1][0]]['start'])<1.5 and 'filler' not in (h[2],merged[-1][2]):
            if h[1]-h[0]>merged[-1][1]-merged[-1][0]:merged[-1]=h
            continue
        merged.append(h)
    clock=lambda s:f'{int(s//60)}:{s%60:04.1f}'
    rows=[]
    for i,j,kind in merged:
        t=float(ws[i]['start']);src=to_source(t,clips) if clips else None
        rows.append([clock(t/a.speed),f'{t:.2f}','' if src is None else f'{src:.2f}',kind,' '.join(w['word'] for w in ws[i:j]),
                     ' '.join(w['word'] for w in ws[max(0,i-8):min(len(ws),j+8)])])
    head=['review','edited','source','kind','heard','context']
    md='\n'.join(['| '+' | '.join(head)+' |','|'+'---|'*len(head)]+['| '+' | '.join(r)+' |' for r in rows])+'\n'
    if a.out:Path(a.out).write_text(md)
    print(md if rows else 'No candidates found.')
    kinds={}
    for r in rows:kinds[r[3].split(' x')[0]]=kinds.get(r[3].split(' x')[0],0)+1
    print(json.dumps({'candidates':len(rows),'by_kind':kinds}))

if __name__=='__main__':main()
