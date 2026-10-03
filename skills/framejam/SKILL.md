---
name: framejam
description: Build Hyperframes videos and storyboards with the user in the loop. Use when making or editing an HTML/GSAP/Hyperframes video, when the user wants a storyboard or shot list reviewed before animating, when they want to pick a visual style, or when they want to review a render and send timestamped feedback. Requires the framejam MCP server.
---

# FrameJam: style presets + one-click video and storyboard review

FrameJam runs next to your chat at http://localhost:2400. It gives you two things the chat is bad at:
**choosing a style** (a structured `style.json` + working template) and **precise feedback**
(timestamped, pinned comments with the clicked DOM element, its active GSAP tween, and a frame image).

## 0. Open FrameJam in the built-in browser (always do this first)

As soon as this skill is used, open FrameJam where the user can see it, without being asked:

- **Cursor:** use the built-in browser tool (`cursor-ide-browser` → `browser_navigate`) with
  `position: "side"` so it opens beside the chat. Open `http://localhost:2400/styles` when the user still needs a style,
  or the review `url` once you have one.
- **Other harnesses:** use their browser/preview tool if there is one. Otherwise give the user the link.
- If the page doesn't load, nothing is hosting the UI. The framejam MCP server hosts it while it's connected; otherwise
  run `npx framejam` (or `node <framejam>/dist/server/cli.js`) in a background terminal.

## The loop

1. **Style.** Call `get_selected_preset`. If it returns `selected: null`, ask the user to pick one on the Styles page you
   just opened (then call it again), or pick one yourself with `list_presets({ mood, pacing, format })` and `get_preset(id)`.
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
   Open the returned `url` in the built-in browser (step 0) and tell the user in one line:
   "Click the video to point at something (or pause and type), then press **Finish review**."
5. **Wait, in the same turn:** call `wait_for_feedback({ reviewId })` right after opening the review. Don't end your turn
   first — the review page shows "Agent listening" only while you're in this loop, and feedback that arrives while you're
   not waiting sits there until the user pastes a line into the chat.
   - `status: "pending"` means nothing arrived in the last ~50s. **Call it again immediately**, without asking the
     user. Keep looping. Only stop if the user tells you to in chat.
   - `status: "feedback"` returns `comments[]`, a markdown summary, and frame images.
   - `revised: true` means the user reopened their review after you got it and changed the comments. The new list
     **replaces** the old one: drop changes from the old list that aren't in the new one.
6. **Apply every comment.**
   - `at` / `time` / `endTime` is where in the video. `position` is where in the frame.
   - `element.selector` is the DOM node that was clicked. `element.clip` is its Hyperframes clip. `element.tweens` are the
     GSAP tweens on it at that moment (`relation: "active" | "previous" | "next"`, with start, end, props and ease).
     Edit those exact lines first.
   - `wholeVideo: true` means a global note (pacing, colour, music, and so on).
7. **Ship the next version.** Re-render to `renders/v2.mp4`, then call
   `add_version({ reviewId, videoPath, note })` (or `open_review` again with the same `compositionDir`).
   The `note` is a one-line summary of what you changed; the user sees it when the new version arrives and in the version menu.
   Each version is one round: the user's "Finish review" locked the previous version, and the new one starts with no
   comments. If you couldn't address a comment, say why in chat and in the note.
8. Go back to step 5.

## Storyboards (before there's a video)

Use a storyboard review when the user wants to agree on the shots first, or asks for a storyboard, shot list, or
"frames before we animate". Same loop, but each version is a set of still panels instead of a render.

1. **Make the panels.** One image per shot (png, jpg, webp, gif or svg), all the same aspect as the final video, in one
   folder, named so they sort in order: `storyboard/01.png`, `02.png`, … Good sources, in order of preference:
   - Hyperframes snapshots of a rough composition (`npx hyperframes snapshot --at 0.5,2.5,4.5 -o storyboard`).
   - Images you generate, one per shot.
   - Quick HTML mockups you screenshot.
2. **Open it:** `open_review({ title, panelsDir: "<abs>/storyboard", panels: [{ path: "01.png", title: "Cold open",
   caption: "Slow push in. VO: 'Every team ships faster now.' 2s" }, …] })`. `panels` is optional; without it every image
   in the folder is used in file-name order. Titles and captions are what the user reads under each panel, so put the
   shot name, the action or camera move, the voiceover line and the duration there.
3. **Wait** with `wait_for_feedback`, exactly as for videos (open the URL in the built-in browser first).
4. **Read the comments by panel.** `at` is `"panel 3 (Cold open)"`, `panel` has the number, title, caption and the
   panel's `imagePath`, and `position` is where on the panel the user clicked. The attached image shows the panel with
   the pin drawn on it. `wholeVideo: true` means the whole storyboard (order, pacing, adding or cutting shots).
5. **Next version:** update or regenerate the images, then `add_version({ reviewId, note })`. With no media it re-reads
   the same `panelsDir` and keeps titles and captions for files that are still there; pass `panels` again to change the
   order, titles or captions. Earlier versions keep their own copies of the images.
6. When the user approves the storyboard, build the Hyperframes composition shot by shot from the panels and captions,
   and open it as a normal video review (a new `open_review` with `compositionDir`).

## Other ways in

- If the user says "apply my FrameJam feedback" (with or without a review id), call `get_feedback()`. Without a
  `reviewId` it picks the review whose comments haven't reached you yet. If the user typed comments but never pressed
  Finish review, they're handed over now. `list_reviews()` shows every project and where its round stands.
- If MCP isn't connected, the user can use **Copy comments as text** in the review page's version menu and paste the
  result into chat.

## Rules

- Don't ask the user to describe timestamps in chat. Send them to the review page.
- Never fake a render. If rendering fails, open the review with `compositionDir` only; the live player still works.
- Keep the review URL stable: one review per project, with a new version for each render.
