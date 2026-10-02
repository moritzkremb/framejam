Frame Jam opens in a browser pane **next to a coding agent**, usually Claude, ChatGPT or Cursor taking up the other half of the screen. Someone watches the video their agent made, points at what's wrong, and sends it back. The interface should feel as easy as leaving a comment in a chat app.

## Principles

1. **Feels like chat.** Feedback is typed into a box at the bottom of the screen, like a message. Press Enter to add a comment, then send them all at once. No forms, switches or modes to learn.
2. **Point, don't describe.** Click the video to attach a spot. Drag on the timeline to attach a range. The box shows what's attached as a chip you can remove.
3. **Always know whose turn it is.** Every review, list row and feedback box answers one question: is the agent waiting for me, working, or done? Blue is the agent, lime is you.
4. **One main action per screen, always in reach.** *Send N to agent*, *Use this style* and *Browse styles* are each the only `primary` button on their screen. On a review or a style, that button sits in a dock pinned to the bottom of the screen.
5. **Quiet surfaces.** Separate areas with tone (`bg` → `surface` → `surface-2`) and spacing, not boxes and borders. Use hairlines (`border`) only under the header and inside the dock.
6. **The video never scrolls away.** A review page doesn't scroll as a whole; only the feedback list does. The layout follows the video's shape (see Review layouts).
7. **Half a screen first.** Design at `pane` (560px). Everything must still work at `pane-min` (360px).

## Screens

| Screen | Job | Primary action |
| --- | --- | --- |
| Welcome (no reviews yet) | Get from zero to a first video in three ticked-off steps | Whichever step is current |
| Reviews | Show whose turn it is on each video. Reviews waiting for you sort first. | none (each card opens its review) |
| Review | Watch, point, comment, send, and know your agent got it | Send N to agent (in the dock), then Copy in the handoff card if your agent wasn't listening |
| Styles | Pick a look by watching it | **Use** on each card; clicking the card opens its details |
| Style | See it, understand it, use it | Use this style (in the dock) |
| States | Loading, not found, server offline | Recover (back, or the restart command) |

## Review layouts

The layout depends on the video's shape, so the video and the feedback are always on screen together.

| Video | Half screen (`pane`, 560px) | Full window (≥ `pane-split`, 1000px) |
| --- | --- | --- |
| **9:16 vertical** | Side by side: the video fills the height on the left, feedback on the right. Filmstrip and box run full width below. | Same, with more room for both. |
| **16:9 horizontal** | Video pinned on top; the feedback list scrolls in the space under it. | Feedback in a right sidebar (`rail`) that collapses to a 64px rail. The rail shows not-sent and with-agent counts, and the feedback box moves under the video. |
| **1:1 square** | Like 16:9. | Like 16:9. |

Below 480px, vertical videos fall back to the pinned-on-top layout with a shorter player.

## The review, step by step

Each version is one round. A version is either **open** (you're commenting on it) or **sent** (locked). Comments themselves have no states.

1. **Pause anywhere and type.** The box is already attached to the current time (*At 0:04*).
2. **Click the video** to attach a spot (*0:04 · on the yellow word*), or **drag on the filmstrip** to attach a range (*0:02 – 0:04*). *Whole video* detaches it.
3. **Enter** adds the comment to the list. Everything on the open version stays editable.
4. **Send N to agent** sends the whole version and locks it. Its comments stay together, read-only, and the comment box is replaced by the handoff card in the same spot:
   - *Your agent was listening*: "Your agent is making version 3."
   - *It wasn't*: **"Sent. Now tell your agent."**, with the sentence to paste into the chat (with the review id) and a Copy button. It switches to "Your agent is making version 3" by itself once the agent picks the comments up.
5. **Version 3 opens** with an empty list and the comment box back, and a toast quotes the agent's note about what changed.
6. **Older versions** (version menu in the header) show their comments greyed and read-only, with a "Go to latest" button.

Forgot something after sending? Write it on the next version. A sent version never reopens.
## What the player shows

There is one player and no source choice. The app picks automatically:
- **The latest version** plays the live composition, so clicking can target the exact word or shape and its animation.
- **Older versions** play their exported video, so they look exactly as they did then.

Never ask people to choose between "live" and "rendered", and never use those words in the interface.

Keyboard: `Space` play/pause · `←`/`→` previous/next frame · `C` focus the box at the playhead · `Enter` add · `⌘Enter` send · `Esc` clear · `?` show all shortcuts.
## Voice and copy

- Write plainly, in sentence case. Address the person as "you" and say "your agent", never "the LLM" or "the MCP client".
- **Call them comments, and give them no states.** Only a version has a state: the latest is open until you send it, then it's sent. Never label a comment "open", "resolved" or "fixed".
- Buttons start with a verb and include the count when there is one: "Send 3 to agent", "Use this style", "Browse styles", "Copy prompt".
- Status lines are sentences: "Waiting for your feedback", "Agent is working on v3", "All done", "3 comments not sent".
- Empty states ask or invite: "What should change?", "Make your first video". Error states say what happened and how to fix it: "Frame Jam isn't running. Start it again in your terminal."
- Tool names (`wait_for_feedback`) appear only on the setup screen, and only as code.
- The technical name (package, command, MCP server, data folder) is `framejam`, one word, lowercase. Use it only in commands.
- No exclamation marks, no emoji.

## Colour

- **Surfaces:** `bg` (page), `surface` (cards, dock, menus), `surface-2` (controls at rest), `surface-3` (hover).
- **Text:** `text`, then `text-2` for descriptions, then `text-3` for placeholders and timestamps.
- **`video`** is black in both themes. Anything drawn on it uses `on-video` or the fixed pin colours.
- **Lime means you.** `accent` marks your pins, the playhead and selected ranges on video. `accent-text` is for the number dots of comments on the open version, and for the wordmark. The `primary` button is lime in dark theme and near-black in light theme, because lime is too light to fill a button on white.
- **Blue means the agent:** `agent` is used for the status line and the "Your agent is making version 3" card. Comments on a sent version are grey, not blue: that round is over from your side.
- **Green is only for health:** `positive` is used for *Connected* and finished setup steps. It is never a second accent.
- **Red is only for errors and delete:** `danger`.
- Never rely on colour alone. A sent version is grey *and* says so in the header subline ("Version 2 · sent") and in the card that replaces the comment box. The style in use has a lime ring *and* the words "In use".
- **Focus ring:** 2px solid `focus` with a 2px offset, on every interactive element, in both themes.
- **Dark is the default theme.** Light is a full equal, not an afterthought.

## Type

- **Geist** for the interface, **Geist Mono** only for times, hex values and things to copy.
- Styles: `display` (one per screen), `title` (header, cards), `body` (14px, the default), `body-medium` (buttons, names), `caption` (12px, the minimum size).
- Times are written `0:04.1`. Ranges use an en dash with spaces: `0:02 – 0:04`.

## Shape, depth, motion

- Radii: `radius-md` for controls, `radius-lg` for cards, the player and the filmstrip, `radius-xl` for the dock and menus, `radius-full` for badges, pins and round icon buttons.
- Shadows: `shadow-dock` lifts the dock off the scrolling list, `shadow-pop` is for menus and toasts, and `shadow-sm` is for the selected segment. Nothing else casts a shadow.
- Motion: transitions take 150ms (colour, a 2px card lift on hover, a 0.98 press). The only things that loop are the waiting ring on the agent status and the loading shimmer.

## Iconography

- **lucide** (`lucide-react`, already installed): 18px in buttons, 16px in small controls, 14px in chips, `currentColor`, 1.8 stroke.
- Common icons: `play`, `send`, `check`, `x`, `ellipsis`, `chevron-left`/`right`/`down`, `map-pin` (spot), `clock` (at time), `move-horizontal` (range), `mouse-pointer-click`, `message-square-plus`, `pencil`, `trash-2`, `copy`, `palette`, `layers` (new version), `film`/`code` (video/live), `search`, `wifi-off`.
- **There is no logo.** The wordmark is "Frame **Jam**" in Geist Bold, with "Jam" in `accent-text`. Don't draw a mark.
- **Name in text:** always "Frame Jam": two words, both capitalised.

## Components

The components are plain CSS in `components/bundle.css` (prefix `fc-`) on top of `tokens.css`. Each component card shows its markup and rules.

- **Actions:** Button, Segmented
- **Navigation:** Header, Tabs, Menu
- **Status:** Badge, AgentStatus, Toast, EmptyState
- **Review:** Player, Pin, Timeline, Comment, FeedbackPanel, FeedbackDock, HandoffCard
- **Library:** ReviewCard, StyleCard, FilterBar, SetupSteps, CodeBlock, Swatches
- **Screens:** ReviewVertical, ReviewHorizontal, ReviewAfterSend, ReviewFirstLook, ReviewOldVersion, ReviewWide, ReviewWideCollapsed, ReviewsScreen, WelcomeScreen, StylesScreen, StyleDetailScreen, StatesScreen

## In the app

The app (`src/web/`) is built on this system:

- `src/web/styles/tokens.css` is generated from `tokens.json`. Dark is the default; `data-theme="light"` switches, following the OS.
- `src/web/styles/components.css` is this folder's `components/bundle.css`, without the preview-only stand-ins.
- `src/web/styles/app.css` holds the few app-only rules (page scaffolding, the review layouts in a real window, Radix menu and toast glue).

Change a token or component here first, then copy it into `src/web/styles/`.
