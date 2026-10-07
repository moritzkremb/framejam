# Pipeline: commands

Run from the project root. `<playbook>` = this playbook's folder (the local path `get_playbook` returned).
`py` = `.venv/bin/python`.

## Setup

```bash
bash <playbook>/scripts/setup.sh /path/to/song.mp3     # tools/, folders, .venv (a few minutes; background it)
# no song yet: bash <playbook>/scripts/setup.sh  and copy the pick to audio/master.mp3 later
```

## Audio and lyrics

```bash
py tools/audio_analysis.py audio/master.mp3      # Demucs vocal stem + analysis/audio.json; prints BPM and downbeats
py tools/lyrics_align.py transcribe --prompt "AGI, p(doom), Karpathy, <names and slang>"   # ~10-15 min on CPU
# write analysis/lyrics.txt: '# section: <id>' headers, one sung line per row, as actually sung
py tools/lyrics_align.py align analysis/lyrics.txt --no-fix AGI,MCP   # comma list of short words held long
py tools/lyrics_fix.py                            # snap early first words; apply analysis/lyrics_fixes.json
py tools/lyrics_fix.py --rms 0 9.5                # print vocal energy to hand-time spoken lines Whisper missed
py tools/plot_lyrics.py 0:12 12:24 24:36          # Read the PNGs in analysis/plots/: word starts on the onsets
```

Re-run `align` then `lyrics_fix.py` after every change to `lyrics.txt`.

## Shot plan

```bash
py tools/shot_plan.py --fps 24 --flurry chorus    # analysis/shots.json + shots.md (cut on each line's pickup)
```

Then fill each shot in `shots.json`: `look` (act), `prompt` (still prompt), `hero` (word or null), `overlay`
(which annotation/artifact/data viz), later `still`, `clip`, `in`, `speed`. Re-running `shot_plan.py` keeps these
fields for shots whose id and start didn't change. For a flurry the plan doesn't make (a drum fill), split a shot by
hand into 0.1-0.3 s pieces; keep `start`/`end`/`dur`/`frames` consistent.

## Storyboard round

```bash
mkdir -p out/storyboard && for f in assets/stills/s*.jpg; do cp "$f" out/storyboard/; done
```

FrameJam: `open_review` with `panelsDir` = the absolute path of `out/storyboard` (panels sort by name = shot order),
open the URL, `wait_for_feedback`. Comments name the panel. Regenerate, then `add_version` for another round if many
panels changed.

## Base edit

```bash
py tools/base_edit.py                       # out/base.mp4: every clip/still cut to its slot, the master as audio
py tools/base_edit.py --only s012,s031      # rebuild only changed shots, then re-concat
```

## Overlay and render

Build the overlay in the project's video tool over `out/base.mp4` (see `overlay_system.md`); feed it
`analysis/lyrics.json` and `analysis/shots.json` so every word and hero lands on its frame. Hyperframes: if its
skills are installed use them, otherwise `npx hyperframes docs` and `npx hyperframes init`; the base edit is a video
track, the overlay elements are timed HTML. Render to `out/final/v1.mp4` with the master as the only soundtrack.

## Watch and verify

```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 out/final/v1.mp4     # matches the song (± 1 frame)
ffmpeg -v error -i out/final/v1.mp4 -vf "fps=2,scale=384:-1" -q:v 4 out/watch/f_%04d.jpg
for i in $(seq 0 9); do py tools/sheet.py out/watch/sheet_$i.jpg 8 $(ls out/watch/f_*.jpg | sed -n "$((i*40+1)),$((i*40+40))p") --force; done
ffmpeg -v error -ss 0 -t 3 -i out/final/v1.mp4 -vf "fps=8,scale=480:-1,tile=6x4" -frames:v 1 out/watch/hook.jpg
```

Read every sheet. Spot-check 10 hero words at their onset frame (`ffmpeg -ss <t> -frames:v 1`), the first 3 seconds,
and every act change. Then review in FrameJam (SKILL.md step 9).

## Delivery for X

≤ 2:20 and ≤ 512 MB for most accounts. If longer, cut the strongest 2:20 (hook + verse + chorus + last chorus) or post
the first chorus as a teaser.

```bash
ffmpeg -i out/final/vN.mp4 -c:v libx264 -preset slow -b:v 16M -maxrate 20M -bufsize 32M -pix_fmt yuv420p -profile:v high \
  -c:a aac -b:a 192k -ar 44100 -movflags +faststart out/final/vN_x.mp4
```
