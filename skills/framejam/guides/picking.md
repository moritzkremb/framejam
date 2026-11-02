# Playbooks and styles

> When the user picks or names a playbook or a style: opening the pick page, then following the playbook and building in the style.

## Picking (only when asked)

If the user names a playbook or style, use it (`get_playbook(id)` / `get_preset(id)`). Open the pick page only when
they ask to choose (`/framejam playbook`, `/framejam style`, "let me pick a style") or when the request is too open to
start from. Otherwise just build.

- Call `open_picker({ title, kinds })` (`kinds` defaults to both; `["playbook"]` or `["style"]` for just one), open the
  returned `url` in the built-in browser, post it in chat as a clickable link, then call `wait_for_pick({ pickId })`.
  While it returns `pending`, call it again; after 6 pending results in a row, ask in chat instead.
- When the pick arrives, say in one line what you're using ("Using the Clean Cut playbook and no style"), with links
  to their pages.
- A `null` playbook or style means the user chose none. Pass `playbookId` and `styleId` to `open_review` so later
  versions keep them; existing projects return them from `get_feedback` and `wait_for_feedback`.

## Following a playbook

Its `skill` is a recipe for this kind of video, with defaults the user's request overrides. Use the review loop for
every render. Read files in `playbookDir` when the method points to them, and copy its scripts, engine or template into
the project before using them; never edit `playbookDir`. `stylesSentence` says how the style combines with it. Some
playbooks list styles made for them (`featuredStyles`); when the picked style is one, call
`get_playbook({ id, styleId })` and use `styleForThisPlaybook.settings` where the playbook's skill says, since they
match its example video.

## Building in a style

- **A style is a look, not a starting video.** First plan the video from what the user asked for (a rocket launch is
  about the rocket), then build that subject in the style's visual language: its `palette`, textures and backgrounds,
  `fonts`, `easing`, `transitions`, `textAnimations` and pacing, as `guide` describes them. Treat it as a strong
  starting point, not a rulebook: bend it where the subject or the user's request needs it.
- `example` says what the style's preview video shows. Don't reuse that scene (its subject, props, layout or story,
  like the computer in Cyanotype Mac) unless the user asks for it.
- The example composition in `templateDir` is a reference, not a skeleton. Don't copy it in and swap the text. Open a
  file from `templateFiles` (or call `get_preset({ id, includeTemplate: true })`) only to see how a technique is built,
  such as a texture filter or a title reveal, and rebuild that technique in your own composition.
- In another tool (Remotion, Motion Canvas, ffmpeg), use the style's look in the tool's own terms.

On FrameJam Cloud, playbooks come from `list_playbooks` and `get_playbook` on that server. Styles come with the local
tools; if the user names one there, build in that spirit from what they describe.
