---
name: playbook
description: Let the user pick a FrameJam playbook (the method for one kind of video, like a music video, a talking-head short or a product launch) on a page, then make the video with it.
metadata:
  internal: true
---

Follow the FrameJam `start` skill. Open the FrameJam pick page for playbooks only: call
`open_picker({ kinds: ["playbook"] })`, open the returned url in the browser if you have a browser tool and post it in
chat as a clickable link, then call `wait_for_pick`. Load the picked playbook with `get_playbook` and make the video
with it, using what the user said about the video, if anything.

With only FrameJam Cloud (web and mobile chats) there's no pick page: call `list_playbooks`, show the user the
choices in chat, then load the one they pick with `get_playbook`.
