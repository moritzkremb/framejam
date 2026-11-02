# Building and rendering

> When you build or render: Hyperframes basics, other tools (Remotion, Motion Canvas, ffmpeg, recordings) and long jobs.

## Hyperframes

- **First run on this machine:** run `npx hyperframes doctor` once. It checks Node, ffmpeg and Chrome, which rendering
  needs. If something is missing, tell the user how to install it before you build.
- **Build** the composition: `index.html` with a root `data-composition-id` + `data-width`/`data-height`, `.clip`
  elements with `data-start`/`data-duration`/`data-track-index`, and a paused GSAP timeline registered in
  `window.__timelines["<id>"]`. Run `npx hyperframes lint` and fix errors.
- **Render:** `npx hyperframes render -o renders/v1.mp4`, then open it like any other render.

## Other tools

- Keep the project's own tool and render command (`npx remotion render`, the Motion Canvas exporter, an ffmpeg script,
  a screen recording). **Don't convert the project to Hyperframes.**
- Render each version to a new mp4, webm or mov file and call `open_review({ title, videoPath })`.

## Long jobs

- Start anything that takes more than a minute so it keeps running after your command returns (a background job, not a
  subshell `&` that dies with the shell), log to a file, and check on it every 30–60 s. Never wait a fixed long time on
  a job you could poll.
- Run one heavy job at a time: two renders or a render plus transcription at once make both slower.
- Tell the user what's running and how long it should take, in one line, before you wait on it.
- **Keep rounds fast:** re-render only what changed and reuse the rest.
