---
name: style
description: Let the user pick a FrameJam style (a look, with an example video) on a page, then make the video in it.
metadata:
  internal: true
---

Follow the FrameJam `start` skill. Open the FrameJam pick page for styles only: call
`open_picker({ kinds: ["style"] })`, open the returned url in the browser if you have a browser tool and post it in
chat as a clickable link, then call `wait_for_pick`. Load the picked style with `get_preset` and build the video in
its look, using what the user said about the video, if anything.

The pick page needs the local FrameJam tools. With only FrameJam Cloud (web and mobile chats), ask in one line what
look they want and build it.
