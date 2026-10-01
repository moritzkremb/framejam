# Frame Jam

**Agent-native video review and style presets for [Hyperframes](https://github.com/heygen-com/hyperframes).**
Frame Jam is a small local app that runs next to your coding agent (Cursor, Claude Code, ChatGPT desktop). It does two jobs
that chat does badly:

- **Pick a style.** Browse a gallery of example videos and press *Use*. The agent gets back a structured
  `style.json` (palette, fonts, easing, transitions, text animations, pacing, and a style guide) plus a working
  Hyperframes template.
- **Give feedback.** Pause anywhere and type what should change, click the video to point at something, or drag
  across the filmstrip to pick a range. Then press **Send to agent**. The agent's blocked `wait_for_feedback` tool call returns immediately with timestamps,
  pin positions, frame thumbnails and, for live compositions, **the DOM element you clicked and the GSAP tween that
  was animating it**.

Everything is local. One Node process serves the web UI on `http://localhost:4517`, runs MCP over stdio and streamable
HTTP, and keeps reviews as JSON files in `~/.framejam`. It's built for a half-screen browser pane next to the chat.

Upgrading from framecut: the first start moves `~/.framecut` to `~/.framejam`, and the old `FRAMECUT_*` environment
variables still work. Re-add the MCP server under its new name (`framejam`) in your agent app.

## Quick start

```bash
npm install
npm run build
npm start                 # http://localhost:4517  (MCP at http://localhost:4517/mcp)
```

Then connect your agent (below), pick a style at `/styles`, and ask the agent to *"make a 7-second launch teaser
with Frame Jam and open it for review"*. With no reviews yet, the home page walks you through these three steps.

### Try the whole loop without an agent

```bash
npm start                 # terminal 1
npm run e2e               # terminal 2 — plays the agent: picks a preset, opens a review, blocks on wait_for_feedback
```

Open the printed review URL, add a few comments and press **Send to agent**. The script prints what the agent
received, then posts v2, and you can watch the page move to it live.
`npx tsx scripts/ui-demo.ts` does the browser side automatically (headless Chrome) and saves screenshots.

## Connect your agent

The package isn't on npm yet. Until it is, replace `npx -y framejam` below with
`node /absolute/path/to/framejam/dist/server/cli.js`.

### Cursor

`~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project):

```json
{
  "mcpServers": {
    "framejam": {
      "command": "npx",
      "args": ["-y", "framejam", "--stdio"]
    }
  }
}
```

Open `http://localhost:4517` in Cursor's built-in browser so the review sits beside the chat.

### Claude Code

```bash
claude mcp add framejam -- npx -y framejam --stdio
# optional: teach Claude the loop
mkdir -p ~/.claude/skills && cp -r skills/framejam ~/.claude/skills/
```

### ChatGPT desktop (or any remote MCP client)

ChatGPT connects to MCP servers over HTTP. Run `npm start`, turn on developer mode for connectors in ChatGPT's
settings, and add a custom connector with this URL:

```
http://localhost:4517/mcp
```

If your ChatGPT build requires an https URL, expose the port with a tunnel (for example
`cloudflared tunnel --url http://localhost:4517`) and set `FRAMEJAM_PUBLIC_URL` to the tunnel URL so the review links
it hands out are reachable.

### Teach the agent the loop

[`skills/framejam/SKILL.md`](skills/framejam/SKILL.md) is a skill/rules file. Drop it into Claude Code skills, a Cursor
rule (`.cursor/rules/framejam.mdc`), or `AGENTS.md`. It walks the agent through: pick a preset → build → render →
`open_review` → `wait_for_feedback` (and call it again while the result is `pending`) → edit → `add_version` with a note.

## MCP tools

| Tool | What it does |
| --- | --- |
| `open_review({ title?, videoPath?, compositionDir?, reviewId?, note? })` | Opens a review and returns `{ reviewId, url, version }`. Calling it again on the same project adds v2, v3, and so on. |
| `wait_for_feedback({ reviewId, timeoutSeconds? })` | Blocks until the user presses **Send to agent**. Returns `{ status: "pending" }` after about 50s; call it again. Sends progress notifications while waiting. |
| `get_feedback({ reviewId?, include? })` | Returns the newest round of comments right away. Without `reviewId` it picks the review whose comments haven't reached the agent yet; unsent comments are sent (and their version locked). Use it when the user says "apply my Frame Jam feedback". |
| `list_reviews()` | Lists reviews with their URL and where each round stands (`awaiting_user`, `user_commenting`, `sent_not_delivered`, `delivered_to_agent`). |
| `add_version({ reviewId, videoPath?, compositionDir?, note? })` | Attaches a new render as the next round. It starts with no comments; the `note` is shown to the user. |
| `resolve_comments({ reviewId, ids, note? })` | Optional bookkeeping for the agent. The UI shows each version as one round instead. |
| `list_presets({ mood?, pacing?, format?, query? })` | Lists the style presets. |
| `get_preset({ id })` | Returns `style.json`, the guide, and the template source files. |
| `get_selected_preset()` | Returns the preset the user picked with *Use this style*. |

Feedback comes back three ways: as JSON (`comments[]` with `at`, `time`, `endTime`, `position`, `element.selector`,
`element.clip`, `element.tweens[]`, `thumbnailPath`), as a markdown prompt, and as inline JPEG frames.

## The review page

- **One round per version.** You add comments to the latest version, then press **Send to agent**. That locks the
  version: its comments stay with it, read-only. The agent's next version starts with an empty list, and older
  versions show their comments greyed out.
- **The comment box** is pinned to the bottom like a chat input. It's attached to the current time by default; click
  the video to attach a spot (in live compositions that records the CSS selector, the text, the owning clip and the
  active GSAP tween), drag across the filmstrip to attach a range, or choose *Whole video*. Enter adds the comment.
- **After Send** the box becomes a card that says whether the agent got the comments. If the agent wasn't waiting in
  `wait_for_feedback`, it shows a sentence to paste into the chat ("Apply my Frame Jam feedback for rev_…") and
  switches to "Your agent is making version N" once the agent picks it up.
- **Layout follows the video.** Vertical videos sit beside the comments. 16:9 videos stay pinned on top while only the
  comment list scrolls, and from 1000px wide the comments move into a sidebar that collapses.
- **What plays.** The latest version plays the live composition (with the official Hyperframes runtime injected from
  `@hyperframes/core`), so clicks can target elements. Older versions play their mp4 snapshot, so they look as they
  did then.
- **Keys.** `Space` play/pause, `←/→` step one frame, `Shift+←/→` step one second, `C` focus the comment box,
  `Esc` clear, `?` shortcuts.
- **Copy comments as text** (version menu) copies a version's comments as markdown for harnesses without MCP.

## Presets

Presets live in `presets/<id>/` (built-in) and `~/.framejam/presets/<id>/` (yours):

```
presets/neon-terminal/
  style.json          # palette, fonts, easing, transitions, textAnimations, rhythm, guide, format, size
  composition/        # Hyperframes source (index.html + assets)
  preview.mp4         # rendered with `npx hyperframes render`
  poster.jpg
```

Built-in presets (21):

- **Swiss Editorial**, **Neon Terminal**, **Soft Gradient SaaS**, **Kinetic Captions** (9:16), **Noir Quote**,
  **Data Story**, **Retro Pop** (1:1), and **Mono Changelog**.
- Studied from the Skillry Opus 5.5 gallery and What Ships launch films, with original copy and no brand assets:
  **Paper Marker**, **Bauhaus Grid** (1:1), **Dot Matrix**, **Verb Reel** (9:16), **Mincho Editorial**,
  **Red Band Title**, **Pixel Arcade** (1:1), **Midnight Launch**, **Cream Serif Launch**, **Agent UI Demo**,
  **Dot Field Showreel**, **Blueprint Explainer**, and **Topo Credits**.

Every one passes `hyperframes lint` with no errors. To re-render the previews:

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
| `src/server/cli.ts` | CLI entry. `framejam` starts HTTP; `framejam --stdio` runs MCP on stdio and also hosts the UI when the port is free. |
| `src/server/mcp.ts` | MCP tool definitions. |
| `src/server/store.ts` | JSON file store. Every call re-reads from disk, so several processes can share `~/.framejam`. |
| `src/server/app.ts` | Hono routes: REST, SSE change feed, media with HTTP range support, composition serving, `/mcp`. |
| `src/web/` | React front end styled by the design system (`src/web/styles/`, generated from `design/`). `lib/composition.ts` handles live playback and element/tween resolution. |
| `design/` | The Frame Jam design system: brand book, tokens, component CSS and screen mockups. Open `design/index.html`. |

Configuration: `--port` / `FRAMEJAM_PORT` (default 4517), `--host` / `FRAMEJAM_HOST` (default 127.0.0.1),
`--data-dir` / `FRAMEJAM_HOME` (default `~/.framejam`), and `FRAMEJAM_PUBLIC_URL` (the base URL used in links).

## Limitations (v1)

- **One UI host per port.** If several harnesses each start `framejam --stdio`, the first one hosts the web UI and the
  others reuse it through the shared data directory. If the hosting process exits, restart one of them (or run
  `npm start` separately).
- **Live preview follows the files on disk.** The live composition always shows the files as they are now, which is
  why older versions play their mp4 snapshot. A version without an mp4 falls back to the current files.
- **Element resolution covers the top-level document.** Sub-compositions mounted with `data-composition-src` play
  correctly, but a click resolves to the mount element, not to nodes inside the sub-composition.
- **Frame thumbnails in live compositions come from the render.** A browser can't rasterise an iframe, so those
  comments get their thumbnail (and the filmstrip its frames) from the version's mp4 when one exists.
- **No MCP Apps embedding yet.** The UI is a plain web page, ready to be embedded later.
