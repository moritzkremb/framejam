# Pipeline: commands step by step

Run everything from the project root (a new folder per video, e.g. `videos/<slug>` in the user's workspace). `<skill>` = this playbook's folder (the path `get_playbook` returns).

## Contents
1. [Scaffold](#1-scaffold)
2. [Song](#2-song)
3. [Audio and lyrics](#3-audio-and-lyrics)
4. [Cast, style frames and stills](#4-cast-style-frames-and-stills)
5. [Other footage: screen recordings, product video, optional paid clips](#5-other-footage)
6. [Engine, kit and agents](#6-engine-kit-and-agents)
7. [Render and verification](#7-render-and-verification)
8. [Delivery and review](#8-delivery-and-review)

## 1. Scaffold

```bash
mkdir -p <project> && cd <project>
bash <skill>/scripts/scaffold.sh /path/to/song.mp3   # no song yet: pass a placeholder (ffmpeg -f lavfi -i anullsrc -t 1 /tmp/p.mp3)
```

Creates `audio/`, the `engine/` (with `lib.js`), `tools/`, fonts (Geist ships with the skill), npm deps (three, playwright), a Python 3.11 `.venv` (demucs, faster-whisper, librosa, mediapipe…), and builds `tools/matte` (Apple Vision) with an SDK fallback. Takes a few minutes; run it in the background while you write the song. On a machine with a previous project you can symlink `.venv` and `node_modules` from it.

## 2. Song

Skip if the director supplies a master (its lyrics then win over any transcript). Otherwise any song generator works; see `providers.md` §1 for the contract and options (ElevenLabs Music API helper, Suno, Udio, others).

1. Write the lyrics like a comedy/pop topliner: one frame device for the whole song, call-and-response verses (short lines, the reply as a shouted hook), one simple chorus hook repeated 3 times with a different last line the final time, a fast Q&A or list bridge, and a deadpan spoken punchline at the end. Spell acronyms with spaces ("M C P", "N P X"), respell names phonetically. Keep them in `analysis/lyrics_draft.md`.
2. Translate them into the chosen generator's format: section tags, a direction for each answering line (e.g. `{gang shout}` in an ElevenLabs plan, `[gang vocals]` in Suno), styles naming genre, BPM, the two voices, instruments. ~2:10 fits X's 2:20 cap. ElevenLabs example: `examples/which-frame/song_plan.json` with `python3 tools/providers/elevenlabs_song.py a 11 & python3 tools/providers/elevenlabs_song.py b 42 & wait` (both in one shell call).
3. Get at least two takes into `audio/takes/`.
4. Pick a take: transcribe each quickly with any local or hosted transcriber (e.g. `whisper-cli` with a small English model, or `tools/lyrics_align.py transcribe` on a test project) and choose the one whose transcript contains every line in order; check `ffprobe` duration. You cannot hear it: say so, and let the director judge the sound.
5. `cp audio/takes/<pick>.mp3 audio/master.mp3`.

## 3. Audio and lyrics

```bash
.venv/bin/python tools/audio_analysis.py audio/master.mp3            # stems + engine/data/audio.json; prints BPM and downbeats
.venv/bin/python tools/lyrics_align.py transcribe --prompt "<jargon, names, hooks>"   # Whisper large-v3 on the vocal stem (~10-15 min on CPU; background it)
# write analysis/lyrics.txt: '# section: <id>' headers, one sung line per row, as actually sung
.venv/bin/python tools/lyrics_align.py align analysis/lyrics.txt --no-fix MIT,MP4,MCP,12   # comma list of long short-words
.venv/bin/python tools/lyrics_fix.py                                  # snap early first words; apply analysis/lyrics_fixes.json
.venv/bin/python tools/lyrics_fix.py --rms 0 9.5                      # measure spoken lines Whisper missed, then hand-fix them
.venv/bin/python tools/plot_lyrics.py 0:12 12:24 ...                  # Read the PNGs; word starts sit on harmonic/consonant onsets
```

- Measure the tempo (labels lie). Write the measured grid into TREATMENT.md.
- Section ids in `lyrics.txt` become the scene ids. Cut points: downbeats, or just before a vocal pickup.
- Re-run `align` then `lyrics_fix.py` after every lyrics.txt change (fix is not idempotent with align).

## 4. Cast, style frames and stills

Image generation: whatever is available (`providers.md` §2: the runtime's native image tool, OpenAI, Google, Higgsfield, Midjourney, Flux…). It must take reference images for identity. Real people only from their own photos with consent; never generate other real people.

1. **Model sheet first** (16:9): every character, front + 3/4 full body + 3 expressions, flat light-grey backdrop, explicit style ("clean modern anime-influenced 2D illustration, crisp dark ink outlines, flat cel shading, NOT Pixar 3D, NOT chibi"), colours as hex. Save to `assets/refs/`, then crop one reference per character with ffmpeg (`crop=iw*0.51:ih:0:0`).
2. **One style frame per planned shot** (16:9, ~22-26 for a 2-minute song), each with only its character's crop as reference:
   - the look's rendering and backdrop: a flat colour cyc that CONTRASTS with the character's colours, cream/white high-key, or a black void with a hard rim light in the accent colour;
   - one clear pose/prop that carries the line's joke (pointing, shrug, megaphone, stopwatch, paint roller…);
   - composition with negative space for type ("framed on the right third, left two thirds empty"; "full body filling the whole frame height");
   - "Only <character> in frame. No text, no letters, no numbers, no logos, no UI."
   Generate 4 in parallel per batch, look at each, regenerate misses (wrong character added, subject too small, logo on a prop).
3. Save them as `assets/gen/sNN_<desc>.jpg` and prep:
   ```bash
   .venv/bin/python tools/prep_stills.py            # all; or name list. 1080p upscale, 3 boil frames, matte, track.json
   ```
4. **Matte check**: composite every `m_00001.png` over magenta into one sheet and Read it (snippet below). Note matte quality and the subject bbox per still in TREATMENT.md's footage map.
   ```bash
   .venv/bin/python -c "
   import cv2,numpy as np,glob,os
   ims=[]
   for d in sorted(glob.glob('assets/video/s*')):
     f=cv2.imread(d+'/f_00001.jpg'); m=cv2.imread(d+'/m_00001.png',0)/255.
     bg=np.zeros_like(f); bg[:]=(180,0,255); c=(f*m[...,None]+bg*(1-m[...,None])).astype(np.uint8)
     c=cv2.resize(c,(480,270)); cv2.putText(c,os.path.basename(d),(8,20),0,0.6,(255,255,255),2); ims.append(c)
   while len(ims)%4: ims.append(np.zeros_like(ims[0]))
   cv2.imwrite('out/matte_sheet.jpg',np.vstack([np.hstack(ims[i:i+4]) for i in range(0,len(ims),4)]))"
   ```

## 5. Other footage

- **Screen recordings / product video / user clips** (the strongest product-truth beats): `.venv/bin/python tools/prep_video.py <in.mp4> ui_<name> --fps 30 --width 1920` (no matte). Write their key moments in clip seconds into the footage map; scenes speed-ramp so actions land on words. Put them in windows with `K.coverIn`.
- **Generated clips (optional, only with an explicit budget):** any image-to-video model (`providers.md` §3: Seedance, Kling, Veo, Runway, Hailuo, Higgsfield…; ready-made helper for Seedance on kie: `tools/providers/kie_seedance.py`, with a ledger and a credit floor). Animate an approved style frame; turn native audio off; for lip-sync send a WAV slice of the vocal stem, for dances a synthesized beat track (`tools/synth_beat.py`), then `tools/beatwarp.py`. Never send the song. Save to `assets/clips/<name>.mp4`, prep with `bash tools/prep_clip.sh <name>` (frames, matte, pose tracking), measure with `tools/lipsync_check.py` / `tools/dance_sync_check.py`. See `lessons.md` for lip-sync and dance gotchas.
- Code instead of generation for UI, charts, networks, counters, particles, any text.

## 6. Engine, kit and agents

1. Set `PAL` in `engine/core.js` (brand tokens if any), `HUD` + `TIMELINE` + `POST` in `engine/timeline.js` (sections on downbeats; the spine as `fmt:'text'` counters with step keys, see `examples/which-frame/timeline.js`).
2. Copy official brand files to `assets/brand/` (logo PNG/SVG, fonts) and take colours from the brand's tokens.
3. Placeholder scene per timeline id (a field + the id) so the engine boots while agents work.
4. **Smoke:** `engine/scenes/_smoke.js` (from the template: set STILL and WORD), timeline entry with `variant:"smoke"`, render one still and a 5 s clip:
   ```bash
   node tools/still.mjs --only _smoke,hud --t <t1>,<t2> --scale 0.5 --dir out/smoke --sheet sheet --cols 2
   node tools/render.mjs --only _smoke,hud --from <a> --to <b> --fps 30 --scale 0.5 --out out/smoke/smoke.mp4 --force
   ```
5. **Kit test:** one frame using every kit helper you expect agents to use (a window of app footage, call tiles, card, timeline, button, pill, sticker, pin, cursor, confetti). Loading stills/clip frames belongs in `prepare()`, never `render()`.
6. Write `STYLE.md`, `TREATMENT.md` (sections, lyrics, must-haves per line, footage map) and `AGENTS_BRIEF.md` (from `agent_brief_template.md`). Examples: `examples/which-frame/`.
7. Launch the scene agents in parallel in ONE message (background), one per section group, each owning only its scene files; log their ids in `analysis/agents.md`. Prompt shape per agent: project path, read-first list, its files, time ranges, lyrics, must-haves, the stills/clips to use, "do not edit other files, do not generate images", and the report format.
8. Review each report: Read its best stills; fix kit/engine issues yourself (they affect everyone) and tell running agents.

## 7. Render and verification

```bash
node tools/render.mjs --fps 60 --scale 1 --workers 3 --crf 17 --to <video end> --out out/final/v1.mp4 --force > out/final/render.log 2>&1   # FOREGROUND
.venv/bin/python tools/av_sync_check.py out/final/v1.mp4 0          # expect audio 0.0 ms; visual 0..+1 frame
ffmpeg -i out/final/v1.mp4 -vf "freezedetect=n=0.003:d=0.25" -map 0:v -f null - 2>&1 | grep freeze_
ffmpeg -v error -i out/final/v1.mp4 -vf "fps=2,scale=384:-1" -q:v 4 out/watch/f_%04d.jpg
# sheets of 40 frames (20 s), 8 columns; in zsh split the file list with ${(f)"$(...)"}
for i in $(seq 0 6); do .venv/bin/python tools/sheet.py out/watch/sheet_$i.jpg 8 ${(f)"$(ls out/watch/f_*.jpg | sed -n "$((i*40+1)),$((i*40+40))p")"} --force; done
```

- Render in the foreground with a long block time (~7-8 min for 2:13 at 1080p60 on an M-series Mac). Never background it with `nohup … &` from an agent shell call; the process dies with the call. If it crashes, read the stack in `render.log`, fix, re-render.
- `--to` defaults to the song length; pass the video end when the end card runs past the song (silence is padded).
- Read every contact sheet; check every section boundary at −1/0/+1 frames; every freeze hit must be an intentional graphics hold with something still moving.

## 8. Delivery and review

- Deliver the master where the user keeps finished videos (the workspace's delivery folder if it has one, else `out/final/`), named `<slug>-v<N>.mp4`. Under 512 MB already at crf 17 for ~2 min; for X re-encode 2-pass 21 Mb/s if larger, and cut a teaser if over 2:20.
  ```bash
  ffmpeg -i out/final/vN.mp4 -c:v libx264 -preset slow -b:v 21M -maxrate 25M -bufsize 42M -pass 1 -an -f mp4 /dev/null
  ffmpeg -i out/final/vN.mp4 -c:v libx264 -preset slow -b:v 21M -maxrate 25M -bufsize 42M -pass 2 -pix_fmt yuv420p -profile:v high -c:a aac -b:a 192k -ar 44100 -movflags +faststart out/final/vN_x.mp4
  ```
- Stills: `node tools/still.mjs --t <times> --scale 1 --dir out/stills` (lossless from the engine).
- Review in FrameJam: `open_review` with `videoPath` for v1, open the URL, loop `wait_for_feedback`, then `add_version` with a note per new render. Map each note to its section and resume the owning agent (ids in `analysis/agents.md`) with it; re-render; verify again.
