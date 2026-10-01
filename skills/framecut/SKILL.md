---
name: framecut
description: Build Hyperframes videos with the user in the loop. Use when making or editing an HTML/GSAP/Hyperframes video, when the user wants to pick a visual style, or when they want to review a render and send timestamped feedback. Requires the framecut MCP server.
---

# Framecut: style presets + one-click video review

Framecut runs next to your chat at http://localhost:4517. It gives you two things the chat is bad at:
**choosing a style** (a structured `style.json` + working template) and **precise feedback**
(timestamped, pinned comments with the clicked DOM element, its active GSAP tween, and a frame image).

## The loop

1. **Style.** Call `get_selected_preset`. If it returns `selected: null`, either ask the user to pick one at
   http://localhost:4517/presets (then call it again), or pick one yourself with `list_presets({ mood, pacing, format })`
   and `get_preset(id)`.
   - Follow `style.guide` literally. Use the exact `palette` hex values, `fonts`, `easing` names, `transitions`,
     `textAnimations` and `rhythm.averageShotSeconds`.
   - `templateFiles` is a working Hyperframes composition. Copy it into the project and replace the copy, rather than
     starting from a blank file.
2. **Build** the Hyperframes composition (`index.html` with a root `data-composition-id` + `data-width`/`data-height`,
   `.clip` elements with `data-start`/`data-duration`/`data-track-index`, and a paused GSAP timeline registered in
   `window.__timelines["<id>"]`). Run `npx hyperframes lint` and fix errors.
3. **Render** to a *new file per version*, e.g. `renders/v1.mp4`:
   `npx hyperframes render -o renders/v1.mp4`.
4. **Open the review:** `open_review({ title, videoPath: "<abs>/renders/v1.mp4", compositionDir: "<abs project dir>" })`.
   Use absolute paths. Passing `compositionDir` enables the live player and element/tween resolution.
   Give the user the returned `url` (open it in the harness browser if you can) and tell them:
   "Click the frame or press C to comment, drag on the timeline for a range, then press **Send to agent**."
5. **Wait:** call `wait_for_feedback({ reviewId })`.
   - `status: "pending"` means nothing was sent in the last ~50s. **Call it again immediately**, without asking the
     user. Keep looping. Only stop if the user tells you to in chat.
   - `status: "feedback"` returns `comments[]`, a markdown summary, and frame images.
6. **Apply every comment.**
   - `at` / `time` / `endTime` is where in the video. `position` is where in the frame.
   - `element.selector` is the DOM node that was clicked. `element.clip` is its Hyperframes clip. `element.tweens` are the
     GSAP tweens on it at that moment (`relation: "active" | "previous" | "next"`, with start, end, props and ease).
     Edit those exact lines first.
   - `wholeVideo: true` means a global note (pacing, colour, music, and so on).
   - `message` is a general note sent alongside the batch.
7. **Ship the next version.** Re-render to `renders/v2.mp4`, then call `add_version({ reviewId, videoPath, note })`
   (or `open_review` again with the same `compositionDir`). Then call
   `resolve_comments({ reviewId, ids, note })` with the ids you addressed and a one-line note per batch.
   Leave comments you could not address open, and say why in chat.
8. Go back to step 5.

## Other ways in

- If the user says "apply my feedback" or "check the review", call `get_feedback({ reviewId })`. It returns every open
  comment, including ones they haven't sent yet.
- If MCP isn't connected, the user can press **Copy as prompt** in the review page and paste the result into chat.
  The same comment ids work with `resolve_comments` later.

## Rules

- Don't ask the user to describe timestamps in chat. Send them to the review URL.
- Never fake a render. If rendering fails, open the review with `compositionDir` only; the live player still works.
- Keep the review URL stable: one review per project, with a new version for each render.
