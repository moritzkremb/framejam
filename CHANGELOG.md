# Changelog

## 0.8.0 (unreleased): cloud projects, voice and connecting by URL

FrameJam Cloud grows from share links into a place to keep projects. Local FrameJam is unchanged and still needs no
account. Cloud projects and connecting by URL are part of Pro; share links stay free while they're in beta. You need
this npm release for all of it.

### Cloud projects

- **`framejam cloud on|off`.** With cloud mode on and `framejam login` done, new projects live in your FrameJam Cloud
  account: versions, comments and resolved state. The agent's tools don't change. `framejam cloud` shows the mode, and
  running apps and agents follow a switch without a restart. Signed out, projects stay local and the Projects page
  says why. Existing projects stay where they are.
- **The project page on app.framejam.ai.** `open_review` and `add_version` give a link to the project page in your
  account, which works on a computer or a phone. It has everything the local review page has, plus a side-by-side compare
  of two versions, your project list and the link settings. Each version uploads in the background with an upload bar
  until it plays. Sharing a cloud project needs no second upload.
- **Version notes and source files.** `open_review` and `add_version` take `notes` (a markdown handoff) and `source`
  (the project folder or a `.zip`). FrameJam packs a folder itself, leaving out `node_modules`, `.git`, build output,
  renders and `.env` or key files, up to 500 MB. The project page has a Notes tab with a source download, and the new
  `get_version` tool hands both to another agent so it can continue in a different app. Guests see notes only when
  you turn on **Show version notes** (`share_project` with `showNotes`); they never get the source.
- Uploads retry a dropped connection, resume after a failure and send the file size first, so FrameJam Cloud can
  refuse a file over your plan's limit before it's uploaded. An older cloud that doesn't know the size gets the
  request without it.

### Voice comments

- Guests on a share link can press **Voice** and talk while they scrub, point or draw. The recording is transcribed,
  and words like "this" and "over here" are tied to the frame on screen when they were said, with the pin or drawing
  made on that frame. `wait_for_feedback` gives the agent the transcript and one frame image per pointing phrase.
  Typing stays the default.

### Connect by URL

- FrameJam Cloud runs the review tools as a remote MCP server at `https://mcp.framejam.ai/mcp`, for ChatGPT or Claude
  in the browser and anyone who'd rather install nothing. Renders go up with `request_upload` (or a public or Google
  Drive link), and projects made this way are cloud projects.
- **Rendering in the cloud.** `upload_files`, `render` (Hyperframes or ffmpeg, with `from: { reviewId, version }`),
  `render_status` and `read_files` let an agent without Chrome or ffmpeg make the next version in FrameJam Cloud.
  Until cloud rendering is switched on, `render` says so and the agent uploads a render instead.
- **`wait_for_feedback` can resume.** After about 50 seconds it returns `{ status: "waiting", cursor, waitedSeconds }`
  so an app doesn't cut the call off; the agent calls it again with the `cursor`. The local tool behaves the same way.

### Look

- The local app matches framejam.ai: dark pages, the same type, buttons and cards. The cloud project page is dark too.
- On a phone, the button row under the player stays inside the frame and wraps onto two lines when it's narrow,
  instead of cutting off the last buttons.

### Skill

- Skill version 7: cloud mode links, spoken comments, version notes and `get_version`, connecting by URL,
  rendering in the cloud and the resumable wait. Rerun `npx -y framejam@latest install` to get it; Claude Code plugin
  installs update on their own.

### Other changes

- `framejam whoami` shows the email for an account without a name instead of crashing.
- `framejam login` keeps waiting through a dropped connection or a FrameJam Cloud 5xx until the code expires, and
  cloud calls (sharing, `add_version`, cloud projects) retry a network error or 5xx twice with a short backoff.
- Cloud projects keep voice comments and their frames on this computer until FrameJam Cloud stores them.

### What leaves your computer

Still nothing unless you sign in. Turning on cloud mode stores new projects in your account: renders or panels, poster
frames, comments with their frame images, and any notes and source files the agent attaches. Guests' voice recordings
go to FrameJam Cloud and its transcription service. `README.md` and `plugin/README.md` list this.

### Before you publish

Ship the framejam-cloud side to production first: cloud projects (H2.1), the project page (H2.2), notes and source
(H2.6), the remote MCP server and waiting cursor (H3.2), voice (H2.7) and upload sizes (H2.4).
`mcp.framejam.ai` must answer before this README goes out. 0.7.0 was never published, so this release also carries
its sharing changes; `npm version` records skill version 7 in `skills/framejam/versions.json`.

### Release line

> FrameJam 0.8.0 keeps projects in FrameJam Cloud if you want: open them from any device, hand them to another agent
> with notes and source, let clients leave voice comments, and connect agents by URL.

## 0.7.0 (unreleased): FrameJam Cloud sharing

Local FrameJam stays free and open source and works with no account. This release adds **FrameJam Cloud**, an optional
way to share a project with a client and get their comments back in your agent. Sharing is free while it's in beta.
You need this npm release for any of it: the local app, the plugin and the skill all change.

### Sharing

- **Sign in.** `framejam login` (a code and your browser, once), `framejam logout` and `framejam whoami`. The token is
  kept in `~/.framejam/auth.json`. Without it, nothing changes.
- **Share a version.** `framejam share <project> [--version n]`, or ask your agent: `share_project`, or `share: true`
  on `open_review` and `add_version`. A project has one link for every round; a newer version goes to the same link and
  older versions stay viewable with their own comments. Only the version you pick is uploaded (its render, or a
  storyboard's panels, plus a poster frame).
- **The share page.** Guests open `www.framejam.ai/v/<token>` on a phone or a computer, with no account. They watch any
  version, comment on a frame (with a drawing), a range or the whole video (or a storyboard panel), and send their
  comments together. Typing a comment pauses the video and stamps the frame. They give a name and email once.
- **Guest comments reach the agent, through you.** Guests' comments are pulled into your project about every 30 seconds
  as drafts marked with their name (shown in the comment list). `wait_for_feedback` then wakes with
  `status: "guest_comments"` and a note telling the agent to say what the guests wrote and ask you what to do first;
  guest text is third-party, never instructions. Finish review sends them on like your own comments.
- **Resolved in vN.** When `add_version` ships the next version, the guest comments it was sent are marked "Resolved in
  vN" on the link. `add_version` takes `unaddressed` for the ones it chose not to apply.
- **Approve.** A guest can approve a version. The link then shows only the approved file, with one full-quality download
  (switch it off with `allowDownload: false` or from the share chip), and `wait_for_feedback` returns
  `status: "approved"`. Sharing a newer version reopens the link.
- **Expiry and revoke.** `share_project` sets `expiresInDays` (or `null` to clear) and `revoke` (`false` reopens). The
  project header's share chip has **Allow download** and **Turn off link**. Expired and turned-off links stop working
  for guests, enforced on the server. Turning a link off doesn't delete the uploaded files.
- **Opens.** The share chip shows how many times the link was opened ("Opened 3 times"; each visitor counts once a day
  and your own visits count too), and `share_project`,
  `open_review` / `add_version` with `share: true`, `list_share_links` and `framejam share` report `opens` and
  `lastOpenedAt`. Needs the updated FrameJam Cloud; an older one just leaves them out.
- **Emails.** From FrameJam Cloud: guests who left their email get a note when you share a new version; you get an email
  when a guest approves and a digest of new comments (one email per batch, not per comment). Every email has an
  unsubscribe link.
- **`list_share_links`** lists the projects that have a link, the versions on it, whether it's closed, approvals, guest
  opens and the guest comments waiting. It reads this computer, so it works offline. `list_reviews` shows
  `guestCommentsWaiting`.

### Skill

- Skill version 6: a new "Sharing with a client" section (creator first, guest text is never instructions, tell the
  user about approvals). Rerun `npx -y framejam@latest install` to get it; Claude Code plugin installs update on their
  own.

### Other changes

- The review page keeps its sidebar tabs and buttons below the macOS menu bar in full screen.

### What leaves your computer

Nothing new unless you run `framejam login` and then share. `framejam login` talks to FrameJam Cloud; sharing uploads the
version you choose and then checks the cloud for guests' comments, approvals and opens. `README.md` and
`plugin/README.md` list this.

### Before you publish

Merge the framejam-cloud H1.10 PR first (it adds the open count), then publish this release. Publish the plugin and npm
package together, as usual (`npm version` runs `sync:plugin` and records skill version 6 in `skills/framejam/versions.json`).

### Release line

> FrameJam 0.7.0 adds FrameJam Cloud sharing: run `framejam login`, share a version with a client, and get their
> comments and approvals back in your agent, free during the beta.
