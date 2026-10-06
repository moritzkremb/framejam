# FrameJam

FrameJam is a small local app that sits next to a coding agent (Cursor, Claude Code, ChatGPT desktop) and helps the
user make videos with it. The agent builds the video with whatever tool the project already uses (Hyperframes,
Remotion, Motion Canvas, ffmpeg, screen recordings) and talks to FrameJam over MCP. It's one Node server plus a React
UI, with no account and no upload: projects are JSON files in `~/.framejam`. Published to npm as `framejam`; source on
GitHub at `moritzkremb/framejam`.

## What it does

The core of the app, and what every change should be judged against:

- **Styles.** 30 built-in style presets with example videos. The user presses *Use* and the agent gets the recipe
  (palette, fonts, easing, transitions, pacing, a template). Users can add their own.
- **Video review.** The agent renders an mp4 and opens it as a project. The user comments at a time, on a spot in the
  frame, on a range of the timeline or on the whole video, then presses **Finish review**. The agent gets every
  comment with its timestamp and a frame image (with the pin drawn on it), makes the next version, and the round
  repeats.
- **Storyboards.** The same review loop on a set of still panels, one per shot, before anything is animated.
- **Any video tool.** FrameJam always reviews the rendered file. It doesn't care how the video was made.

**Videos are mp4-only.** The review page always plays the rendered file. There used to be a beta live Hyperframes
player (`compositionDir`) that resolved clicks to DOM elements; it was removed because it could show something other
than the render. Don't bring back composition playback. A pinned comment's frame image has the pin drawn on it, which
is how the agent sees what was clicked. MCP tools still accept and ignore `compositionDir` from older skills. Style
presets ship a Hyperframes template as plain files for agents to copy; the app itself doesn't run Hyperframes. Don't
present FrameJam as a Hyperframes tool, and never tell agents to convert a project to another tool.

## The website

https://www.framejam.ai (landing page, Styles gallery, docs) is a separate repo:

- Local: `/Users/moritzkremb/Coding Projects/framejam-site` (`../framejam-site` from here)
- GitHub: `moritzkremb/framejam-site`
- Next.js 16 on Vercel. **Every push to its `main` deploys to production**; other branches get preview deploys.
- Where things are: `app/page.tsx` (landing page), `app/docs/` (install, review, storyboards, custom styles, MCP tools,
  troubleshooting), `lib/site.ts` (install prompt and commands), `public/presets/` (preview videos the app streams).
- Check with `npx tsc --noEmit`, `npm run lint` and `npm run build` before pushing.
- Work and commit directly on `main` there too, with no feature branches or pull requests unless asked. Since a push
  is a production deploy, push only once the checks pass.

## Commands

```bash
npm run dev         # API on :2400 (tsx watch) + Vite UI on :2401
npm test            # vitest
npm run typecheck
npm run lint        # oxlint; warnings are known, errors are not ok
npm run build       # tsc + vite + tsup → dist/
npm run sync:rule   # after editing skills/framejam/SKILL.md (a test fails if you forget)
```

Run typecheck, lint and tests before every commit.

Work and commit directly on `main`. This is a solo project, so don't create feature branches or pull requests unless
asked. Push to GitHub yourself without asking (in both repos), once the checks pass and the release order below allows
it. The only step the user has to do is `npm publish`, because it needs their 2FA code.

## Layout

- `src/server/cli.ts`: CLI (`install`, `start`, `serve`, `--stdio`). `src/server/install.ts`: what `framejam install` does.
- `src/server/mcp.ts`: MCP tools. `src/server/store.ts`: JSON store in `~/.framejam`. `src/server/app.ts`: HTTP routes.
- `src/web/`: the UI. `src/web/components/setup-steps.tsx` has the setup prompt.
- `skills/framejam/SKILL.md`: the agent skill. `.cursor/rules/framejam.mdc` is generated from it.
- `presets/`: the 30 built-in styles. Their `preview.mp4` files aren't in the npm package; the app streams them from
  `framejam.ai/presets/<id>/preview.mp4`, which the website serves from `../framejam-site/public/presets`.
- `videos/framejam-landing/`, `design/`: the landing video and design system. Not shipped. The user often has
  uncommitted work in `videos/`; never commit, stash or revert it unless asked.

## Releasing: what needs npm and what doesn't

A push to GitHub doesn't reach users of the npm package. When you finish a change, tell the user which of these it is.

**Needs an npm release** (users only get it after publishing): anything in `src/` (UI, MCP tools, CLI, install
messages), `presets/` (styles and templates), and `package.json` dependencies.

**Doesn't need one:**
- `skills/framejam/SKILL.md`: `framejam install` pulls the skill from GitHub `main`, so a push reaches new installs
  right away. Existing users get it by rerunning `npx -y framejam install` or `npx skills update`.
- Preview videos and the website: they deploy from `../framejam-site`.
- `README.md` (the npmjs.com copy only refreshes on the next release, which is fine), `videos/`, `design/`, `tests/`,
  `scripts/`.

Release when a batch of user-facing changes is ready, not per commit. Version bumps: patch for fixes, minor for new
features, major for breaking changes.

To release, the user runs one command (it needs their 2FA code for `npm publish`, which builds and tests first).
Whenever a change needs a release, give the user this as a single line with the version filled in. `npm version`
refuses while `videos/` has uncommitted work, hence `--no-git-tag-version` and the manual commit and tag. The last part
deploys the website, so it comes after the publish:

```bash
cd "/Users/moritzkremb/Coding Projects/framejam" && npm version X.Y.Z --no-git-tag-version && git add package.json package-lock.json && git commit -m "X.Y.Z" && git tag vX.Y.Z && npm publish && git push origin main --tags && cd ../framejam-site && git push origin main
```

If `npm publish` fails with `E404 Not Found - PUT https://registry.npmjs.org/framejam`, the npm login expired (`npm whoami`
returns 401). The bump, commit and tag already happened, so continue with
`npm login && npm publish && git push origin main --tags && cd ../framejam-site && git push origin main`.

Push to `main` only after the npm release is live if the README or website already describe the new behavior.

## Keep in sync

- **Install prompt:** `setupPrompt()` in `src/web/components/setup-steps.tsx` and `installPrompt()` in
  `../framejam-site/lib/site.ts` must match word for word.
- **Commands and options:** if you change CLI commands, MCP tools, env vars or install steps, update `README.md` and
  the website docs (`../framejam-site/app/docs/`) too.
- **Styles:** adding or removing a built-in preset also means adding or removing its folder in
  `../framejam-site/public/presets` (preview.mp4, poster.jpg and style.json) and updating the counts and lists in `README.md`.

## Writing

User-facing text (UI, README, docs, CLI output) is plain and short. Say "project" to users, not "review".
