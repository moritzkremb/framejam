#!/usr/bin/env python3
"""Build auditable silence-first and retry-second EDLs; optionally render speech.

Outputs (in --out): silence.edl.json, retry.edl.json, final.edl.json (source-time clips with edited times),
silence.transcript.json and final.transcript.json (words retimed to the edit). With --render also speech.mp4
(silent picture), speech.wav (mono narration) and cut.mp4 (picture and sound together).

--transcript accepts word timings as: a JSON list of {text|word,start,end}; {"words": [...]} (OpenAI verbose_json,
ElevenLabs Scribe, `npx hyperframes transcribe`); or {"segments": [{"words": [...]}]} (openai-whisper, faster-whisper
with word timestamps). Non-word entries such as ElevenLabs "spacing" are skipped.
"""
import argparse,json,math,re,subprocess,wave
from pathlib import Path
import numpy as np

def run(args): return subprocess.run(args,check=True,capture_output=True,text=True)
def write(p,x): p.write_text(json.dumps(x,indent=2)+'\n')
def load_words(path):
    d=json.loads(Path(path).read_text())
    if isinstance(d,dict) and 'words' in d: d=d['words']
    elif isinstance(d,dict) and 'segments' in d: d=[w for s in d['segments'] for w in s.get('words',[])]
    if not isinstance(d,list): raise SystemExit('Transcript has no word timings. See --help for accepted formats.')
    words=[w for w in d if w.get('type','word')=='word' and 'start' in w and 'end' in w]
    if not words: raise SystemExit('Transcript has no word timings. Transcribe with word timestamps.')
    return [dict(w,word=str(w.get('word',w.get('text',''))).strip()) for w in words]
def mapped(ranges,fps):
    result=[];cursor=0
    for a,b in ranges:
        n=round((b-a)*fps)
        if n<=0:continue
        result.append(dict(source_start=a,source_end=b,edited_start=cursor/fps,edited_end=(cursor+n)/fps,frames=n));cursor+=n
    return result

def retime(words,edl):
    out=[]
    for i,w in enumerate(words):
        a=float(w['start']);b=float(w['end']);matches=[]
        for c in edl:
            lo=max(a,c['source_start']);hi=min(max(b,a+.001),c['source_end'])
            if hi>lo:matches.append((hi-lo,lo,hi,c))
        if not matches:continue
        _,lo,hi,c=max(matches,key=lambda m:m[0])
        out.append(dict(text=w.get('word',w.get('text','')),start=lo-c['source_start']+c['edited_start'],end=hi-c['source_start']+c['edited_start'],source_word_index=i,source_start=a,source_end=b))
    return {'timestamp_basis':'edited','words':out,'text':' '.join(w['text'] for w in out)}

def main():
    ap=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--input',required=True);ap.add_argument('--transcript',required=True);ap.add_argument('--out',required=True)
    ap.add_argument('--removals',help='JSON array of reviewed source_start/source_end/reason entries')
    ap.add_argument('--threshold-db',type=float,default=-40);ap.add_argument('--min-silence',type=float,default=.28)
    ap.add_argument('--pre-roll',type=float,default=.065);ap.add_argument('--post-roll',type=float,default=.085)
    ap.add_argument('--fps',type=int,default=30);ap.add_argument('--render',action='store_true')
    ap.add_argument('--keep-channels',action='store_true',help='keep stereo sound in speech.wav and cut.mp4 (default: mono narration)')
    a=ap.parse_args();out=Path(a.out);out.mkdir(parents=True,exist_ok=True);src=Path(a.input).resolve()
    if any(out.glob('*.edl.json')):raise SystemExit('Use a new output directory; EDL files already exist.')
    probe=json.loads(run(['ffprobe','-v','quiet','-show_streams','-show_format','-of','json',str(src)]).stdout);write(out/'source-probe.json',probe)
    duration=float(probe['format']['duration']);fps=a.fps
    wav=out/'source.wav';run(['ffmpeg','-v','error','-i',str(src),'-vn','-ac','1','-ar','48000',str(wav)])
    detect=run(['ffmpeg','-hide_banner','-i',str(wav),'-af',f'silencedetect=noise={a.threshold_db}dB:d={a.min_silence}','-f','null','-']).stderr
    (out/'silences.log').write_text(detect)
    starts=[float(x) for x in re.findall(r'silence_start: ([\d.]+)',detect)];ends=[float(x) for x in re.findall(r'silence_end: ([\d.]+)',detect)]
    if len(starts)>len(ends):ends.append(duration)
    sil=[]
    for s,e in zip(starts,ends):
        # Only bridge isolated impulses shorter than 20ms. Review the report.
        if sil and s-sil[-1][1]<.020:sil[-1][1]=e
        else:sil.append([s,e])
    kept=[];cursor=0
    for s,e in sil:
        left=min(duration,s+a.post_roll) if s>0 else 0
        right=max(0,e-a.pre_roll) if e<duration-.02 else duration
        if left>cursor:kept.append([math.floor(cursor*fps)/fps, min(math.ceil(left*fps)/fps,math.floor(duration*fps)/fps)])
        cursor=right
    if cursor<duration-.02:kept.append([math.floor(cursor*fps)/fps,math.floor(duration*fps)/fps])
    stage1=mapped(kept,fps)
    if not stage1:raise SystemExit('No retained speech. Inspect audio/threshold before proceeding.')
    write(out/'silence.edl.json',{'timestamp_basis':'source','clips':stage1,'parameters':vars(a),'silences':sil})
    words=load_words(a.transcript);write(out/'silence.transcript.json',retime(words,stage1))
    removals=json.loads(Path(a.removals).read_text()) if a.removals else []
    second=[];final=[]
    for c in stage1:
        pieces=[[c['source_start'],c['source_end']]]
        for r in removals:
            ra=math.floor(float(r['source_start'])*fps)/fps;rb=math.ceil(float(r['source_end'])*fps)/fps
            if not 0<=ra<rb<=duration+1/fps:raise ValueError('Invalid removal range')
            new=[]
            for lo,hi in pieces:
                if rb<=lo or ra>=hi:new.append([lo,hi]);continue
                if lo<ra:new.append([lo,ra])
                if rb<hi:new.append([rb,hi])
            pieces=new
        for lo,hi in pieces:
            final.append([lo,hi]);second.append([lo-c['source_start']+c['edited_start'],hi-c['source_start']+c['edited_start']])
    edl=mapped(final,fps)
    if not edl:raise SystemExit('All speech was removed; review the retry decisions.')
    for i,c in enumerate(edl):
        assert c['source_end']>c['source_start']>=0 and c['source_end']<=duration
        if i:assert c['source_start']>=edl[i-1]['source_end'] and abs(c['edited_start']-edl[i-1]['edited_end'])<1e-6
    write(out/'retry.edl.json',{'timestamp_basis':'silence-edited','clips':mapped(second,fps),'decisions':removals})
    write(out/'final.edl.json',{'timestamp_basis':'source','fps':fps,'duration':edl[-1]['edited_end'],'clips':edl,'decisions':removals})
    write(out/'final.transcript.json',retime(words,edl))
    print(json.dumps({'silence_duration':stage1[-1]['edited_end'],'final_duration':edl[-1]['edited_end'],'clips':len(edl)}),flush=True)
    if not a.render:return
    aud=wav
    if a.keep_channels:
        ch=min(2,max(int(s.get('channels',1)) for s in probe['streams'] if s.get('codec_type')=='audio'))
        aud=out/'source-full.wav';run(['ffmpeg','-v','error','-i',str(src),'-vn','-ac',str(ch),'-ar','48000',str(aud)])
    with wave.open(str(aud),'rb') as w:rate=w.getframerate();ch=w.getnchannels();audio=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(np.float32).reshape(-1,ch)
    chunks=[];paths=[]
    for i,c in enumerate(edl):
        n=c['frames'];path=out/f'part-{i:03d}.mp4';paths.append(path)
        run(['ffmpeg','-v','error','-ss',str(c['source_start']),'-i',str(src),'-an','-vf',f'fps={fps},format=yuv420p','-frames:v',str(n),'-c:v','libx264','-preset','fast','-crf','18','-g',str(fps),'-keyint_min',str(fps),'-sc_threshold','0','-threads','4',str(path)])
        lo=round(c['source_start']*rate);count=round(n/fps*rate);chunk=audio[lo:lo+count].copy()
        if len(chunk)<count:chunk=np.pad(chunk,((0,count-len(chunk)),(0,0)))
        ramp=min(round(.003*rate),len(chunk)//2);chunk[:ramp]*=np.linspace(0,1,ramp)[:,None];chunk[-ramp:]*=np.linspace(1,0,ramp)[:,None];chunks.append(chunk)
        print(f'Rendered speech segment {i+1}/{len(edl)}',flush=True)
    with wave.open(str(out/'speech.wav'),'wb') as w:w.setnchannels(ch);w.setsampwidth(2);w.setframerate(rate);w.writeframes(np.concatenate(chunks).clip(-32768,32767).astype(np.int16).tobytes())
    # Relative generated names contain no quoting characters.
    (out/'concat.txt').write_text(''.join(f"file '{p.name}'\n" for p in paths))
    run(['ffmpeg','-v','error','-f','concat','-safe','0','-i',str(out/'concat.txt'),'-c','copy','-movflags','+faststart',str(out/'speech.mp4')])
    final_probe=json.loads(run(['ffprobe','-v','quiet','-show_format','-of','json',str(out/'speech.mp4')]).stdout)
    assert abs(float(final_probe['format']['duration'])-edl[-1]['edited_end'])<=1/fps+.001
    run(['ffmpeg','-v','error','-i',str(out/'speech.mp4'),'-i',str(out/'speech.wav'),'-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-b:a','192k','-ac','2','-movflags','+faststart',str(out/'cut.mp4')])
    print(f'Wrote {out/"cut.mp4"}',flush=True)
if __name__=='__main__':main()
