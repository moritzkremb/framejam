# Providers: song, images, video, review

The method is fixed; the generators are not. Each step has a **contract** (the files the engine needs and the properties that make them work). Any tool that meets the contract is fine. Use what the user has connected or prefers; when several are available and the user has no stated preference, offer the options once and default to what costs nothing extra. Never spend on a paid generator without an explicit budget.

How to choose:
1. Use any tool the user names.
2. Otherwise use what this runtime can already call (a native image tool, a connected MCP or app connector, an API key already configured, a logged-in web app in the browser).
3. Otherwise offer the options below and wait for the choice before the first paid step.
4. Store keys in the environment or the project's `.env` (never in the skill, never printed).

## 1. Song

**Contract:** a finished master at `audio/master.mp3` (or `.wav`), ideally ≤ 2:20 for X; lyrics known as sung (`analysis/lyrics.txt`). Everything downstream (analysis, alignment, cut points) reads only this file.

What makes a generated song work for this method:
- One clear lead voice plus a distinct answering voice (gang shouts, a vocoder, a second singer) for call-and-response jokes.
- Short lyric lines, acronyms spelled out ("M C P"), names respelled phonetically.
- A section structure you can cut to: intro, verse, pre-chorus, chorus ×3 (the last line of the last one changed), bridge, outro; a deadpan spoken line works as the punchline.
- Generate 2+ takes and pick by transcript completeness (every line present, in order) and length; the agent can't hear the result, the director judges the sound.

Options (no default; pick by availability and preference):
- **Supplied track** from the director (its lyrics win over any transcript).
- **ElevenLabs Music API** (structured plan with lyrics and per-chunk styles): ready-made helper `tools/providers/elevenlabs_song.py`, plan format in its docstring and `examples/which-frame/song_plan.json`. Used for the reference build.
- **Suno** (custom mode: lyrics field + style field + exclude field), usually in the browser with the user logged in, or any Suno API wrapper they use. Put direction tags in brackets (`[Verse]`, `[gang vocals]`), keep the style field to genre, BPM, voices, instruments.
- **Udio**, **Stable Audio**, **MiniMax Music**, a model on fal/Replicate, a musician friend: anything that returns a vocal master.

## 2. Images (model sheet and style frames)

**Contract:** 16:9 stills at `assets/gen/sNN_<desc>.jpg` (≥ 1280×720; 1920×1080 or larger is better), one per planned shot, plus a model sheet and per-character reference crops in `assets/refs/`. `tools/prep_stills.py` turns each into a cut-out clip.

What makes a still work:
- Identity held across shots: generate a model sheet first, then pass only the relevant character's crop as the reference image for each frame.
- A backdrop the matte separates cleanly: a flat colour cyc that contrasts with the character's colours, cream/white high-key, or a black void with a rim light.
- Negative space for type ("framed on the right third"), "full body filling the frame height" for full-body shots.
- No text, letters, numbers, logos or UI in the image (all type is code). Check every frame for third-party logos anyway.
- Real people only from their own photos with consent.

Options:
- **The runtime's native image tool** (e.g. the IDE's or chat app's image generation; often free and supports reference images).
- **OpenAI Images** (gpt-image models with reference images), **Google** (Gemini image models / Imagen, e.g. via the Gemini CLI or API), **Higgsfield** (Soul / GPT Image / Nano Banana models, character identity via Soul ID), **Midjourney** (with character/style references), **Flux / Ideogram / Recraft** via fal, Replicate or their own apps, **Scenario**, or hand-drawn art and photos the director supplies.

## 3. Video (optional generated footage)

**Contract:** clips at `assets/clips/<name>.mp4`, then `bash tools/prep_clip.sh <name>` (frames, matte, tracking). For clips generated against the song (lip-sync, dance), record the slot (song time at clip frame 1).

What makes a clip work:
- Animate an approved style frame (image-to-video) so the look holds; one dominant action, one camera move, set and light held constant; "no text, no captions, no logos".
- Turn the model's native audio off; never upload the song itself (moderation rejects it, and it can be regenerated into the clip). For lip-sync, send a WAV slice of the isolated vocal stem; for dances, a synthesized beat track (`tools/synth_beat.py`), then `tools/beatwarp.py`.
- Measure: `tools/lipsync_check.py`, `tools/dance_sync_check.py`, and judge by eye.
- Price every distinct request before launching; stay inside the stated budget; keep a ledger.

Options:
- **None (zero-spend route):** stills as living cut-outs plus real footage. The reference build "Which Frame?" used no generated video.
- **Real footage:** screen recordings, product video, the director's clips (`tools/prep_video.py`, no matte; or `prep_clip.sh` for subjects).
- **Seedance** (image/audio/reference-to-video; lip-sync from an audio input): ready-made helper `tools/providers/kie_seedance.py` for kie.ai (it uploads local inputs to a public temporary file host; pass your own URLs for private material); also on Higgsfield, fal, Replicate, BytePlus.
- **Kling**, **Veo**, **Runway**, **Hailuo/MiniMax**, **Wan**, **Luma**, **Pika**, **Higgsfield** (its video models and presets), **Scenario**: any image-to-video model. Lip-sync correction models (e.g. Sync, LatentSync) when a clip's mouth drifts.

## 4. Background removal fallback

Apple Vision (`tools/matte`, macOS, free) is the default matte source and is excellent on illustrations. Without it: any background-removal tool that returns the subject on a solid colour (keyed with `tools/matte_keyed.py`), or `tools/matte_fallback.py` (MediaPipe, people only, soft).

## 5. Review

FrameJam. Storyboard round: `open_review` with `panelsDir` (the style frames), then `wait_for_feedback`. Video rounds: `open_review` with `videoPath` for v1, open the URL, loop `wait_for_feedback`, then `add_version` with a note for each new render. The notes arrive with timestamps (or panel numbers) and a frame image with the pin drawn on it.
