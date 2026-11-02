# Storyboards

> When the user wants to agree on the shots before animating: a storyboard, shot list or "frames first".

Same loop as a video, but each version is a set of still panels instead of a render.

1. **Make the panels.** One image per shot (png, jpg, webp, gif or svg), all the same aspect as the final video, in one
   folder, named so they sort in order: `storyboard/01.png`, `02.png`, … Good sources, in order of preference:
   - Hyperframes snapshots of a rough composition (`npx hyperframes snapshot --at 0.5,2.5,4.5 -o storyboard`), or
     stills from the project's own tool.
   - Images you generate, one per shot.
   - Quick HTML mockups you screenshot.
2. **Open it:** `open_review({ title, panelsDir: "<abs>/storyboard", panels: [{ path: "01.png", title: "Cold open",
   caption: "Slow push in. VO: 'Every team ships faster now.' 2s" }, …] })`. `panels` is optional; without it every
   image in the folder is used in file-name order. Titles and captions are what the user reads under each panel, so put
   the shot name, the action or camera move, the voiceover line and the duration there. On FrameJam Cloud, upload each
   panel (`request_upload` with `kind: "panel"`) and pass `panels: [{ assetId, title, caption }]`.
3. **Wait** with `wait_for_feedback`, exactly as for videos.
4. **Read the comments by panel.** `at` is `"panel 3 (Cold open)"`, `panel` has the number, title, caption and the
   panel's `imagePath`, and `position` is where on the panel the user clicked. The attached image shows the panel with
   the pin drawn on it. `wholeVideo: true` means the whole storyboard (order, pacing, adding or cutting shots).
5. **Next version:** update or regenerate the images, then `add_version({ reviewId, note })`. With no media it re-reads
   the same `panelsDir` and keeps titles and captions for files that are still there; pass `panels` again to change the
   order, titles or captions. Earlier versions keep their own copies of the images.
6. When the user approves the storyboard, build the video shot by shot from the panels and captions, and open it as a
   normal video project (a new `open_review` with the render as `videoPath`).
