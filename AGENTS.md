# FrameJam

FrameJam is a plugin for Claude Code, ChatGPT (Work and Codex) and Cursor, plus a small local app that sits next to
the agent and helps the user make videos with it. The agent builds the video with whatever tool the project already
uses (Hyperframes, Remotion, Motion Canvas, ffmpeg, screen recordings) and talks to FrameJam over MCP. It's one Node
server plus a React UI, with no account and no upload: projects are JSON files in `~/.framejam`. Published to npm as
`framejam`; source on GitHub at `moritzkremb/framejam`, which is also the plugin's marketplace for Claude and ChatGPT.

## What it does

The core of the app, and what every change should be judged against:

- **Styles.** 30 built-in style presets with example videos. A style is a look, not a starting video: the user
  names one (or picks it on a page) and the agent builds that subject in the style's palette, textures, fonts, motion
  and pacing, bending them where needed. Nothing is selected ahead of time; a pick is saved on the project. The `guide` holds look rules that work for any subject; `example` says what the preview shows so agents
  don't copy that scene. Users can add their own.
- **Video review.** The agent renders an mp4 and opens it as a project. The user comments at a time, on a spot in the
  frame, on a range of the timeline or on the whole video, then presses **Finish review**. The agent gets every
  comment with its timestamp and a frame image (with the pin drawn on it), makes the next version, and the round
  repeats.
- **Storyboards.** The same review loop on a set of still panels, one per shot, before anything is animated.
- **Playbooks.** The method for one kind of video (a music video, a talking-head short, a product launch...): what the
 user brings, the steps, the tools it needs and the quality bar, as defaults the user's request overrides. Styles set
 the look; playbooks set how it's made. The user names one, or picks on a page (`/framejam playbook` → `open_picker`,
 then `wait_for_pick`). Each playbook is an agent skill
 folder plus a `playbook.json` with a creator, so outside creators can submit their own later.
- **Any video tool.** FrameJam always reviews the rendered file. It doesn't care how the video was made.

**Styles vs playbooks.** A playbook is what you're making and how (inputs, steps, tools, length, story arc,
quality bar); a style is how it looks (palette, type, texture, motion, tempo), never a beat order or content rules.
Two checks for anything new: a style should make sense for a launch, an explainer and a talking-head short; a
playbook should still be the same playbook in three very different styles. If the steps or what the user brings
change, it's a new playbook; if only the look changes, it's a style. A playbook can list styles made for it
(`featuredStyles`: a note, ready `settings` for its template, and its own example video in `previews/<style id>/`);
any other style still works as its `styles` field says. `examples` adds more finished videos made with a playbook
that aren't a library style (another route or look), with their own `previews/<id>/`. Style names describe the look ("Midnight Glow"), not a kind
of video.

**A toolkit, not a process.** FrameJam should feel like an extension of the user's agent: fast, flexible, with as few
prescribed steps as possible. Skills and playbooks give defaults, never gates: no question rounds before building, no
plans to approve, no mandatory storyboards or planning documents. The user's request always wins.

**Videos are mp4-only.** The review page always plays the rendered file. There used to be a beta live Hyperframes
player (`compositionDir`) that resolved clicks to DOM elements; it was removed because it could show something other
than the render. Don't bring back composition playback. A pinned comment's frame image has the pin drawn on it, which
is how the agent sees what was clicked. MCP tools still accept and ignore `compositionDir` from older skills. Style
presets ship their example as a Hyperframes project, as plain files agents can look at for techniques (not copy as a
starting point); the app itself doesn't run Hyperframes. Don't
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
npm run sync:plugin # same, for the plugin's copy of the skill and its manifests
claude plugin validate ./plugin --strict   # before a release that changes plugin/
```

Run typecheck, lint and tests before every commit.

The skill has a `Skill version: N` line. Raise N whenever the skill changes after a release: `npm version` records each
released skill's fingerprint in `skills/framejam/versions.json` and fails if a released version's text changed. The app
and the MCP server tell users when an installed copy of the skill is older than the one FrameJam ships.

Work and commit directly on `main`. This is a solo project, so don't create feature branches or pull requests unless
asked. Push to GitHub yourself without asking (in both repos), once the checks pass and the release order below allows
it. The only step the user has to do is `npm publish`, because it needs their 2FA code.

## Layout

- `src/server/cli.ts`: CLI (`install`, `start`, `serve`, `--stdio`). `src/server/install.ts`: what `framejam install` does
 (installs the plugin in each app and removes the setup from before plugins; from a source checkout it adds the MCP
 server and skill instead, so the apps run the checkout's build).
- `plugin/`: the plugin, one folder for all three apps. Claude reads `.claude-plugin/plugin.json`; ChatGPT and Cursor
 read the portable `plugin.json` and `mcp.json`; all read `skills/` (`start`, `playbook`, `style`, so the commands are
 `/framejam:start` etc.). The manifests, `mcp.json` and `skills/start` are generated by `npm run sync:plugin` from
 `package.json` and the main skill; edit `skills/playbook`, `skills/style` and `README.md` there by hand. The MCP
 server is pinned to the npm version (`npx -y framejam@X.Y.Z --stdio`). The repo lists it in
 `.claude-plugin/marketplace.json` (Claude) and `.agents/plugins/marketplace.json` (ChatGPT). Cursor also loads plugins installed in Claude
 Code, so it only gets its own copy (`~/.cursor/plugins/local/framejam`, from the npm package) when Claude Code doesn't
 have FrameJam; otherwise Cursor would list it twice.
- `src/server/mcp.ts`: MCP tools. `src/server/store.ts`: JSON store in `~/.framejam`. `src/server/app.ts`: HTTP routes.
- `src/web/`: the UI. `src/web/components/setup-steps.tsx` has the setup prompt.
- `skills/framejam/SKILL.md`: the agent skill. `.cursor/rules/framejam.mdc` is generated from it.
- `playbooks/`: the built-in playbooks, one folder each: `playbook.json` (schema in `src/shared/types.ts`, checked by
 `validatePlaybook` in `src/shared/playbooks.ts`), `SKILL.md` (the method), optional `references/`, `scripts/`,
 `engine/` or `template/`, and `poster.jpg`. Like styles, their `preview.mp4` lives only on the website
 (`../framejam-site/public/playbooks/<id>/`). Users' own playbooks go in `~/.framejam/playbooks/`.
- `presets/`: the 30 built-in styles. Their `preview.mp4` files aren't in the npm package; the app streams them from
  `framejam.ai/presets/<id>/preview.mp4`, which the website serves from `../framejam-site/public/presets`.
- `videos/`: the landing video and other video projects. Ignored by git and kept only on the user's machine; never
  delete or rewrite them unless asked. `design/`: the design system. Neither is shipped.

## Releasing: what needs npm and what doesn't

A push to GitHub doesn't reach users of the npm package. When you finish a change, tell the user which of these it is.

**Needs an npm release** (users only get it after publishing): anything in `src/` (UI, MCP tools, CLI, install
messages), `presets/` (styles and templates), `playbooks/`, `plugin/`, `skills/framejam/SKILL.md`, and `package.json`
dependencies.

**The plugin and the npm package ship together.** Claude Code and ChatGPT fetch the plugin from GitHub `main`, and
the plugin runs the exact npm version it names. So the version bump (`npm version`, which also runs `sync:plugin` and
stages `plugin/`) and `npm publish` must happen before the push, as the release command below does: pushing a
plugin that names an unpublished version breaks every install. Plugin users only get a skill change when the version
changes, so skill edits go out with the next release. Claude Code installs update on their own; everyone else gets
the new version by rerunning `npx -y framejam@latest install`, which the app's update notice tells them.

**Anthropic's directory.** The plugin is submitted at claude.ai/directory/manage (folder `plugin`, branch `main`,
listed on Claude Code only, since claude.ai chat can't run its local server). The directory scans every new commit on
`main`, and each new version is held for a reviewer because the plugin launches FrameJam from npm; the reviewer has
to approve it before it can be published from the plugin's page. The listing reads `plugin/.claude-plugin/plugin.json`
and `plugin/README.md`; keep the README's list of what leaves the user's computer accurate, since the submission's
data-handling answers rely on it.

**Doesn't need one:**
- Preview videos and the website: they deploy from `../framejam-site`.
- `README.md` (the npmjs.com copy only refreshes on the next release, which is fine), `design/`, `tests/`,
  `scripts/`.

Release when a batch of user-facing changes is ready, not per commit. Version bumps: patch for fixes, minor for new
features, major for breaking changes.

To release, the user runs one command (it needs their 2FA code for `npm publish`, which builds and tests first).
Whenever a change needs a release, give the user this as a single line with the version filled in. `npm version`
refuses to commit when anything else is uncommitted, hence `--no-git-tag-version` and the manual commit and tag. The last part
deploys the website, so it comes after the publish:

```bash
cd "/Users/moritzkremb/Coding Projects/framejam" && npm version X.Y.Z --no-git-tag-version && git add package.json package-lock.json && git commit -m "X.Y.Z" && git tag vX.Y.Z && npm publish && git push origin main --tags && cd ../framejam-site && git push origin main
```

If `npm publish` fails with `E404 Not Found - PUT https://registry.npmjs.org/framejam`, the npm login expired (`npm whoami`
returns 401). The bump, commit and tag already happened, so continue with
`npm login && npm publish && git push origin main --tags && cd ../framejam-site && git push origin main`.

Push to `main` only after the npm release is live if the README or website already describe the new behavior.

## Keep in sync

- **Plugin:** after editing the skill or bumping the version, run `npm run sync:plugin` (`npm version` does it for
 you); tests fail when `plugin/` is stale. The commands users type are `/framejam:start`, `/framejam:playbook` and
 `/framejam:style`; keep them the same in the app's UI, `README.md` and the website.
- **Install prompt:** `setupPrompt()` in `src/web/components/setup-steps.tsx` and `installPrompt()` in
  `../framejam-site/lib/site.ts` must match word for word.
- **Commands and options:** if you change CLI commands, MCP tools, env vars or install steps, update `README.md` and
  the website docs (`../framejam-site/app/docs/`) too.
- **Styles:** adding or removing a built-in preset also means adding or removing its folder in
 `../framejam-site/public/presets` (preview.mp4, poster.jpg and style.json) and updating the counts and lists in `README.md`.
- **Playbooks:** the same for `../framejam-site/public/playbooks` (preview.mp4, poster.jpg and an identical
 playbook.json, plus `previews/<id>/preview.mp4` and `poster.jpg` for each featured style and example) and the list in `README.md`. The display helpers in `src/shared/playbooks.ts` (needs groups, cost badge,
 styles sentence, copy prompt) have a copy in `../framejam-site/lib/playbooks.ts`; change both together.

## Writing

User-facing text (UI, README, docs, CLI output) is plain and short. Say "project" to users, not "review". Present
FrameJam as a plugin for Claude, ChatGPT and Cursor; users understand that better than "MCP server".
