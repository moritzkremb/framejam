# FrameJam

A local app (Node server + React UI) that lets coding agents open videos and storyboards for review and pick style
presets, over MCP. Published to npm as `framejam`; source on GitHub at `moritzkremb/framejam`. The website
(framejam.ai, with docs) is a separate repo: `../framejam-site`.

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

To release (`npm version` refuses while `videos/` has uncommitted work, so bump by hand):

```bash
npm version patch --no-git-tag-version
git add package.json package-lock.json && git commit -m "0.1.x" && git tag v0.1.x
npm publish        # the user runs this: it needs their 2FA code. It builds and tests first.
git push origin main --tags
```

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
