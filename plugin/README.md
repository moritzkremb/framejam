# FrameJam

FrameJam helps you make videos with your coding agent. Pick a style or a playbook, let the agent build the video with
any tool (Hyperframes, Remotion, Motion Canvas, ffmpeg or screen recordings), then review the render: click a moment
or a spot in the frame, say what to change, press **Finish review**, and the agent makes the next version.

Everything runs on your computer. There's no account unless you run `framejam login` (optional; FrameJam Cloud).
Your videos and comments are only uploaded when you share a version with `framejam share`; projects are saved in
`~/.framejam`.

Install it in Claude Code:

```
/plugin install framejam --marketplace moritzkremb/framejam
```

What leaves your computer, and only to framejam.ai, npm, Hugging Face or FrameJam Cloud:

- The Styles and Playbooks pages stream their example videos from framejam.ai.
- The app downloads playbook and style updates, including the scripts and files they come with, from
  `framejam.ai/catalog/v1` (at start and then every 6 hours). Every file is checked against a signature and hashes
  before it's used, and nothing about you or your projects is sent. Set `FRAMEJAM_CATALOG_URL=off` to turn it off.
- The app asks the npm registry whether a newer FrameJam is out (at most every 6 hours; set
  `FRAMEJAM_NO_UPDATE_CHECK=1` to turn it off; that also turns off playbook and style updates).
- The **Feedback** button sends the note you write, and your email if you add one, to framejam.ai.
- The **Get updates** form sends the email you enter to framejam.ai, to send you release news.
- If you press **Transcribe** and have no speech model yet, the app downloads one (574 MB) from Hugging Face.
  Transcription itself runs on your computer; your videos are never uploaded.
- `framejam login` talks to FrameJam Cloud to sign you in and stores a token in `~/.framejam/auth.json`.
- `framejam share` uploads the version you choose (its render, or a storyboard's panels, and a poster frame) to
  FrameJam Cloud, and the app then checks the cloud for comments guests left on the link and brings them into your
  project. Nothing is uploaded or checked until you run `framejam login` and `framejam share`.

Nothing is sent from your agent's conversation.

This plugin adds the FrameJam tools and three commands:

- `start`: make or review a video with FrameJam
- `playbook`: pick the method for your kind of video on a page
- `style`: pick a look on a page

It needs Node 22 or newer and ffmpeg. Docs: https://www.framejam.ai
