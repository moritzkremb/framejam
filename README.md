# framecut

**Agent-native video review and style presets for [Hyperframes](https://github.com/heygen-com/hyperframes).**
Framecut is a small local app that runs next to your coding agent (Cursor, Claude Code, ChatGPT desktop). It does two jobs
that chat does badly:

- **Pick a style.** Browse a gallery of example videos and press *Use this style*. The agent gets back a structured
  `style.json` (palette, fonts, easing, transitions, text animations, pacing, and a style guide) plus a working
  Hyperframes template.
- **Give feedback.** Click on the video at 0:04 and type what should change, or drag on the timeline to mark a range.
  Then press **Send to agent**. The agent's blocked `wait_for_feedback` tool call returns immediately with timestamps,
  pin positions, frame thumbnails and, for live compositions, **the DOM element you clicked and the GSAP tween that
  was animating it**.

Everything is local. One Node process serves the web UI on `http://localhost:4517`, runs MCP over stdio and streamable
HTTP, and keeps reviews as JSON files in `~/.framecut`.

## Quick start

```bash
npm install
npm run build
npm start                 # http://localhost:4517  (MCP at http://localhost:4517/mcp)
```

Then connect your agent (below), select a preset at `/presets`, and ask the agent to *"make a 7-second launch teaser
with framecut and open it for review"*.

### Try the whole loop without an agent

```bash
npm start                 # terminal 1
npm run e2e               # terminal 2 — plays the agent: picks a preset, opens a review, blocks on wait_for_feedback
```

Open the printed review URL, pin a few comments and press **Send to agent**. The script prints what the agent
received, then posts v2 and resolves your comments, and you can watch both arrive live in the UI.
`npx tsx scripts/ui-demo.ts` does the browser side automatically (headless Chrome) and saves screenshots.

## Connect your agent

The package isn't on npm yet. Until it is, replace `npx -y framecut` below with
`node /absolute/path/to/framecut/dist/server/cli.js`.

### Cursor

`~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project):

```json
{
  "mcpServers": {
    "framecut": {
      "command": "npx",
      "args": ["-y", "framecut", "--stdio"]
    }
  }
}
```

Open `http://localhost:4517` in Cursor's built-in browser so the review sits beside the chat.

### Claude Code

```bash
claude mcp add framecut -- npx -y framecut --stdio
# optional: teach Claude the loop
mkdir -p ~/.claude/skills && cp -r skills/framecut ~/.claude/skills/
```

### ChatGPT desktop (or any remote MCP client)

ChatGPT connects to MCP servers over HTTP. Run `npm start`, turn on developer mode for connectors in ChatGPT's
settings, and add a custom connector with this URL:

```
http://localhost:4517/mcp
```

If your ChatGPT build requires an https URL, expose the port with a tunnel (for example
`cloudflared tunnel --url http://localhost:4517`) and set `FRAMECUT_PUBLIC_URL` to the tunnel URL so the review links
it hands out are reachable.

### Teach the agent the loop

[`skills/framecut/SKILL.md`](skills/framecut/SKILL.md) is a skill/rules file. Drop it into Claude Code skills, a Cursor
rule (`.cursor/rules/framecut.mdc`), or `AGENTS.md`. It walks the agent through: pick a preset → build → render →
`open_review` → `wait_for_feedback` (and call it again while the result is `pending`) → edit → `add_version` →
`resolve_comments`.

## MCP tools

| Tool | What it does |
| --- | --- |
| `open_review({ title?, videoPath?, compositionDir?, reviewId?, note? })` | Opens a review and returns `{ reviewId, url, version }`. Calling it again on the same project adds v2, v3, and so on. |
| `wait_for_feedback({ reviewId, timeoutSeconds? })` | Blocks until the user presses **Send to agent**. Returns `{ status: "pending" }` after about 50s; call it again. Sends progress notifications while waiting. |
| `get_feedback({ reviewId, include? })` | Returns open comments right away, including unsent drafts. Use it when the user says "apply my feedback". |
| `resolve_comments({ reviewId, ids, note? })` | Marks comments fixed (pass `["all"]` for every sent comment). The UI shows them checked off. |
| `add_version({ reviewId, videoPath?, compositionDir?, note? })` | Attaches a new render. Open comments carry over. |
| `list_presets({ mood?, pacing?, format?, query? })` | Lists the style presets. |
| `get_preset({ id })` | Returns `style.json`, the guide, and the template source files. |
| `get_selected_preset()` | Returns the preset the user picked with *Use this style*. |

Feedback comes back three ways: as JSON (`comments[]` with `at`, `time`, `endTime`, `position`, `element.selector`,
`element.clip`, `element.tweens[]`, `thumbnailPath`), as a markdown prompt, and as inline JPEG frames.

## The review page

- **Render / Live toggle.** *Render* plays the mp4. *Live* loads the Hyperframes composition in an iframe with the
  official Hyperframes runtime injected (`@hyperframes/core`), so seeking, clip visibility and media sync match the
  renderer. Clicking a frame in Live mode records the CSS selector, the text, the owning clip and the active GSAP tween.
- **Timeline.** The top bar scrubs. The lane below shows comment markers; drag on it to comment on a time range.
- **Keys.** `Space` play/pause, `←/→` step one frame, `Shift+←/→` step one second, `C` comment at the playhead,
  `V` switch between the latest and previous version, `L` switch between Render and Live, `Esc` cancel.
- **Versions.** Each version is its own tab. The mp4 is copied into the store, so v1 stays watchable after the agent
  overwrites the file. Unresolved comments from earlier versions stay on the timeline, faded.
- **Copy as prompt.** Copies the open comments as markdown, with timestamps, element info and frame links, for
  harnesses without MCP.

## Presets

Presets live in `presets/<id>/` (built-in) and `~/.framecut/presets/<id>/` (yours):

```
presets/neon-terminal/
  style.json          # palette, fonts, easing, transitions, textAnimations, rhythm, guide, format, size
  composition/        # Hyperframes source (index.html + assets)
  preview.mp4         # rendered with `npx hyperframes render`
  poster.jpg
```

Built-in presets: **Swiss Editorial**, **Neon Terminal**, **Soft Gradient SaaS**, **Kinetic Captions** (9:16),
**Noir Quote**, **Data Story**, **Retro Pop** (1:1), and **Mono Changelog**. Every one passes `hyperframes lint` with
no errors. To re-render the previews:

```bash
npm run render:presets            # or: npm run render:presets -- noir-quote
```

## Development

```bash
npm run dev        # API on :4517 (tsx watch) + Vite UI on :4518 with a proxy
npm test           # vitest: MCP tools (in-memory, streamable HTTP, stdio) + REST API
npm run typecheck
npm run lint
```

| Path | Contents |
| --- | --- |
| `src/server/cli.ts` | CLI entry. `framecut` starts HTTP; `framecut --stdio` runs MCP on stdio and also hosts the UI when the port is free. |
| `src/server/mcp.ts` | MCP tool definitions. |
| `src/server/store.ts` | JSON file store. Every call re-reads from disk, so several processes can share `~/.framecut`. |
| `src/server/app.ts` | Hono routes: REST, SSE change feed, media with HTTP range support, composition serving, `/mcp`. |
| `src/web/` | React + Tailwind + shadcn/ui front end. `lib/composition.ts` handles live playback and element/tween resolution. |

Configuration: `--port` / `FRAMECUT_PORT` (default 4517), `--host` / `FRAMECUT_HOST` (default 127.0.0.1),
`--data-dir` / `FRAMECUT_HOME` (default `~/.framecut`), and `FRAMECUT_PUBLIC_URL` (the base URL used in links).

## Limitations (v1)

- **One UI host per port.** If several harnesses each start `framecut --stdio`, the first one hosts the web UI and the
  others reuse it through the shared data directory. If the hosting process exits, restart one of them (or run
  `npm start` separately).
- **Live preview follows the files on disk.** Live mode always shows the composition as it is now. Only the mp4 is
  snapshotted per version.
- **Element resolution covers the top-level document.** Sub-compositions mounted with `data-composition-src` play
  correctly, but a click resolves to the mount element, not to nodes inside the sub-composition.
- **Frame thumbnails in Live mode come from the render.** A browser can't rasterise an iframe, so Live-mode comments
  get their thumbnail from the version's mp4 (via ffmpeg) when one exists.
- **No MCP Apps embedding yet.** The UI is a plain web page, ready to be embedded later.
