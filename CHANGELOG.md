# Changelog

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
- `framejam whoami` shows the email for an account without a name instead of crashing.
- `framejam login` keeps waiting through a dropped connection or a FrameJam Cloud 5xx until the code expires, and
  cloud calls (sharing, `add_version`) retry a network error or 5xx twice with a short backoff.

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
