---
name: cartoon-music-video
description: >
  Cartoon Music Video: turn a song (supplied, or written and generated with any music generator) into a 1080p60
  kinetic-typography music video. Illustrated characters from any image generator become living cut-outs, real
  footage or optional generated clips are woven in, and a bundled three.js/Canvas2D engine lands every lyric word,
  cut and camera hit on the vocal and the beat, built section by section by parallel scene agents. Every version is
  reviewed in FrameJam. Use for a parody or promo music video, a lyric video, a brand anthem, "make a video like this
  viral music video", or revising one of these. Not for narrated explainers or product launch films.
---

# Cartoon Music Video

A song goes in; a motion designer's showreel cut to the track comes out. Kinetic type, 2D and 3D graphics, illustrated character cut-outs and real footage land on the beats and sung syllables, and the untouched master is the only soundtrack.

The method is fixed; the generators are not. Song, images and optional video clips can come from any tool the user has (`references/providers.md` defines what each step must deliver and lists options such as Suno, ElevenLabs Music, Udio, Midjourney, Higgsfield, GPT Image, Nano Banana, Seedance, Kling, Veo). Ready-made helpers for two of them live in `scripts/providers/`; they are options, not defaults.

Reference build: **"Which Frame?"**: 2:13, 1080p60, a comedy song for FrameJam parodying the "I'm not sending my deck anymore" pitch-call music video, made with zero generated video (24 illustrated stills + real app recordings + the engine). Its lyrics, song plan, STYLE, TREATMENT, timeline and one full scene are in `references/examples/which-frame/`. Match that quality bar.

How the work splits:
- **Song:** any source that delivers a vocal master (`providers.md` §1). If the user brings a finished song, skip generation.
- **Look and cast:** any image generator with reference images makes a model sheet and one style frame per shot; `prep_stills.py` turns each still into a living cut-out (matte, line boil, beat hop).
- **Footage:** real screen recordings and product video for product truth; optional generated clips (any image-to-video model) for lip-sync, dances or action, only inside an explicit budget.
- **The engine** (`engine/`, copied into the project by `scaffold.sh`): exact typography, frame-exact timing to onsets and beats, mattes, 3D type, HUD, post, endless free re-renders. `references/engine_api.md`, `references/kit_api.md`.
- **Scene agents** give each section a dedicated designer; a shared brief, style bible, kit and verification loop keep them coherent.
- **Review:** FrameJam, after the style frames (storyboard) and after every render.

Read `references/lessons.md` before starting and `references/motion_library.md` as the design menu. `references/pipeline.md` has every command. `<playbook>` below means this folder (the local path `get_playbook` returned).

Derived from the MIT-licensed `scenario-kinetic-music-video` by Scenario (engine, scripts, references; see `THIRD_PARTY_LICENSE`), rebuilt to be independent of any generation platform.

## What goes in, what comes out
- **In:** a brief (what the video is for, a reference video if any), a song or the wish to write one, optionally brand files, real footage and the user's own photos (with consent) for a likeness.
- **Out:** a 16:9 1080p60 mp4 (~2:10 by default, ≤ 2:20 for X), every lyric word on screen on time, reviewed and approved in FrameJam.

## Before you start (decide once, then run)

Resolve from the request and the environment; ask only what can't be resolved, in one round:
- **Concept and target:** what the video is for, the reference video if any, the audience, length (≤ 2:20 for X; ~2:10 default).
- **Song:** supplied master (its lyrics win), or write lyrics and generate it with the user's tool of choice. Music generation is usually paid.
- **Generators:** check what this runtime can already use (a native image tool, connected MCP/app connectors, configured API keys, logged-in web apps) and the user's stated preferences. Offer options from `providers.md` only when nothing is available or the choice matters; prefer what costs nothing extra.
- **Style:** call `get_selected_preset`. If the user picked a FrameJam style, use it as the starting point for STYLE.md (palette, type, motion feel), then build this video's own looks from it. No style: design the looks from the concept.
- **Cast:** fictional characters (default), a mascot, a product, the user's own likeness (own photos, consent), or none.
- **Footage:** real recordings available? Generated clips only with an explicit budget. Default: the zero-spend route.
- **Brand:** official logo files and colour tokens, the copy and facts allowed on screen.
- **Format:** 16:9 1080p60.
- **Machine:** Node ≥ 20, Python 3.11 via `uv`, ffmpeg, Google Chrome. macOS adds the free Apple Vision matte (`matte.swift`); elsewhere use the fallbacks in `providers.md` §4.

**Paid steps:** song generation, image generation and video clips usually cost money. Stop before the first paid step unless the user stated a budget; say what it will cost and which free route exists (a supplied song, the runtime's own image tool, hand-drawn art, no generated clips).

Unattended: choose creative defaults, write them into TREATMENT.md, and stop before any paid step without a stated budget.

**Existing project made with another tool** (Remotion, Hyperframes, Motion Canvas…): don't convert it. Follow the same method (song analysis, lyric alignment, style frames as cut-outs, every word on its onset, the verification and FrameJam loops) with that tool, reuse the tool-independent scripts (`audio_analysis.py`, `lyrics_align.py`, `lyrics_fix.py`, `prep_stills.py`, `av_sync_check.py`, `sheet.py`), and tell the user what the bundled engine would have added (frame-exact onset timing, line boil and beat hop on stills, matte-aware 3D type, the HUD spine, free deterministic re-renders).

## Workflow

### 1. Research and concept
- Study the reference: frames every 4 s as a contact sheet, a transcript, and its device (the reference for Which Frame? was a pitch call: slide counter, call clock, investor clichés vs founder buzzwords).
- **Give the video a spine:** a device that progresses and escalates through the song, usually as HUD counters (Which Frame?: VERSION V1 → V12_FINAL_FINAL_FINAL.MP4 → V3 · APPROVED; NOTES 8 VAGUE → 3 PINNED → 3 SENT; CALL clock).
- Write the lyrics (`pipeline.md` §2): call-and-response verses where each line is a joke, a chorus hook ×3 with a new last line at the end, a fast Q&A bridge for facts, a deadpan spoken punchline that echoes the reference. Facts only from verified sources.

### 2. Scaffold, song, analysis
- In a new project folder: `bash <playbook>/scripts/scaffold.sh <song or placeholder>` (background it; it copies the engine and tools and installs Python/Node deps).
- Song: 2+ takes from the chosen generator → pick by transcript completeness → `audio/master.mp3`. You can't hear it; the user judges the sound.
- `audio_analysis.py` (measure the tempo), `lyrics_align.py transcribe` (background, ~15 min), hand-correct `analysis/lyrics.txt` with `# section:` headers, `align`, `lyrics_fix.py`, `plot_lyrics.py` and Read the plots. Fix spoken lines from the vocal RMS.

### 3. Style bible and treatment
- **STYLE.md** (the law): concept + spine, cast, 3-6 looks (ground, ink, accent, rendering rule; e.g. CALL / POP colour fields / PAPER editorial / NIGHT / APP product UI / PIXEL), palette roles, 5 type roles with named fonts, lyric rules, motion grammar and cut density per section, brand rules and bans.
- **TREATMENT.md:** song facts and measured grid, the hook for the first 3 s (must work muted), the arc, one row per section (time range on downbeats, lyrics, look, must-haves per line), the footage map (every still and clip with content, backdrop, matte bbox, key moments in clip seconds).
- Give each chorus a different look in the treatment, or the agents converge.

### 4. Cast and stills, then the storyboard round
- Model sheet → per-character reference crops → one style frame per shot (~22-26 for 2 min), in parallel batches, each on a backdrop that contrasts with the character, with negative space for type and no text or logos (`pipeline.md` §4, `providers.md` §2).
- **Review the stills in FrameJam before animating:** `open_review` with `panelsDir` = `assets/gen` (named `sNN_<desc>.jpg`, so they sort in shot order), open the URL, `wait_for_feedback`. Regenerate the panels the user flags; `add_version` for another round if many changed.
- `prep_stills.py`, then the matte sheet over magenta. Regenerate stills with a bad matte, a wrong extra character, a too-small subject or a third-party logo (or plan a tracked sticker over the logo).
- Real recordings with `prep_video.py`; generated clips (if budgeted) with `prep_clip.sh` (`providers.md` §3).

### 5. Kit, smoke test, agents
- Set `PAL`, `HUD` (spine counters), `TIMELINE`, `POST`; copy brand files to `assets/brand/`; placeholder scene per section.
- Smoke scene (`_smoke.js` from the template) and one kit-test frame that uses every kit helper; render stills and a 5 s clip; fix anything broken before agents start. Extend `lib.js` for project-specific UI the agents will need (lead-only file).
- Fill `AGENTS_BRIEF.md` from `references/agent_brief_template.md`. Launch the scene agents in parallel in the background, in one message, with the runtime's subagent tool: 5-6 for a 2-minute song (Which Frame?: intro+outro, verse1, pre+chorus1, verse2, chorus2+bridge, chorus3). Each prompt: project path, read-first list, its files only, time ranges, lyrics, must-haves, stills/clips, "don't edit other files, don't generate images", final report format. Log ids in `analysis/agents.md`. Without subagents, build the sections yourself in the same order with the same loop.
- Review every report: Read its best stills; fix kit/engine issues centrally and tell the running agents.

### 6. Render, watch, verify
- Full render in the FOREGROUND: `node tools/render.mjs --fps 60 --scale 1 --workers 3 --crf 17 --to <video end> --out out/final/v1.mp4 --force` (~7-8 min for 2:13 on an M-series Mac). Never background it from an agent shell call.
- `av_sync_check.py` (expect 0.0 ms audio, 0 to +1 frame visual), `freezedetect`, 0.5 s contact sheets of the whole video (Read all of them), every section boundary at −1/0/+1 frames, the first 3 seconds twice.
- Fix by replacing weak shots (a new still in another look, or code), never by adding effects on the stills.

### 7. Review in FrameJam, deliver
- v1: `open_review` with `videoPath` = the render (absolute path), open the URL in the built-in browser, then loop `wait_for_feedback` until the user presses Finish review.
- Each note has a timestamp (or a range, or a pin with a frame image). Map it to its section, resume the owning scene agent with it, re-render to a new file (`out/final/v2.mp4`), verify again (step 6), then `add_version` with a short note of what changed and `wait_for_feedback` again. Repeat until the user approves.
- Deliver `<slug>-v<N>.mp4` where the user keeps finished videos (else `out/final/`); X: ≤ 512 MB, ≤ 2:20 (2-pass encode and teaser in `pipeline.md` §8).
- Report: what was verified, which lyric words were guessed, what was spent and with which tools, and the honest limits (you can't hear the song; stills vs generated motion).

## Quality bar
- **Every word shows on time:** each sung word is visible at its onset (designed hero or HUD subtitle); hero words peak on the onset frame.
- **Every joke reads in half a second:** one focal point per frame, 1-3 hero words per line, never the same type treatment on two consecutive lines.
- **Integration, not decoration:** every character moment has a graphic tracked to it, coming out of its prop or gesture, or behind it via the matte. The stills' pixels are untouched (no filters, grades or outlines on them).
- **No static frames:** stills always boil and hop, something always moves; only intentional end-card holds.
- **Section variance:** mix looks, 2D and 3D, poster slams and quiet lines; cut density climbs with the song's energy; showcase moments (logo, payoff, end card) get time.
- **Rights:** the song is the user's, licensed, or generated under a plan that allows the use. Real UI and copy for product beats, official logo files in official colours, no third-party logos, no real people without consent.
- **Photosensitivity:** at most 3 full-frame luminance flips per second.
- **Watch it yourself** (all contact sheets) before sending a version to FrameJam.

## Files in this playbook
- `engine/`: `index.html`, `main.js`, `core.js`, `plate.js`, `roto.js`, `typekit.js`, `lib.js` (the kit), `scenes/hud.js`. `scaffold.sh` copies it to the project's `engine/`.
- `assets/`: `timeline.template.js`, `scene.template.js`, `smoke.template.js`; `fonts/` (Geist, Geist Mono, OFL).
- `scripts/`: setup (`scaffold.sh`), analysis (`audio_analysis.py`, `lyrics_align.py`, `lyrics_fix.py`, `plot_lyrics.py`), stills and footage prep (`prep_stills.py`, `prep_video.py`, `prep_clip.sh`, `matte.swift`, `fixmatte.py`, `matte_keyed.py`, `matte_fallback.py`, `track.py`), clip helpers (`synth_beat.py`, `beatwarp.py`), sync checks (`av_sync_check.py`, `lipsync_check.py`, `dance_sync_check.py`), render and review (`render.mjs`, `still.mjs`, `serve.mjs`, `sheet.py`). In the project they live in `tools/`.
- `scripts/providers/` (optional, paid services): `elevenlabs_song.py` (ElevenLabs Music plan → takes), `kie_seedance.py` (Seedance on kie.ai, ledger and credit floor). Add helpers for other services the same way.
- `references/`: `providers.md` (contracts and options per step), `pipeline.md` (every command), `engine_api.md`, `kit_api.md`, `motion_library.md`, `lessons.md`, `agent_brief_template.md`, `examples/which-frame/`.
- `THIRD_PARTY_LICENSE`: MIT, Scenario.
