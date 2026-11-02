# Reading feedback

> When a feedback result has something beyond plain comments: transcripts, spoken comments, a revised round, or the user coming back later.

## What `wait_for_feedback` can return

- `status: "waiting"`: nothing yet. Call it again right away with the same `reviewId` and the `cursor` it gave you.
  Stop after about 10 minutes in total (`waitedSeconds`), then end your turn with the project's `url` and: "Press
  **Finish review** when you're done, then paste the line the page shows (or say `apply my FrameJam feedback`) and
  I'll pick it up." The comments are saved either way.
- `status: "feedback"`: `comments[]`, a markdown summary and frame images. Apply them.
- `status: "guest_comments"` or `"approved"`: something happened on the share link. Read the `sharing` guide; don't
  change the video yet.
- `revised: true`: the user reopened their review after you got it and changed the comments. The new list **replaces**
  the old one: drop changes from the old list that aren't in the new one.

## Reading a comment

- `at` / `time` / `endTime` is where in the video. `position` is where in the frame. The frame image for a pinned
  comment has the pin drawn on it: look at what's under the pin, then find that element in your source at that time.
- `wholeVideo: true` is a global note (pacing, colour, music, and so on).
- With a transcript, `spoken` quotes the words in a range comment and `spokenAround` those near a moment. They come
  from the transcript, so names and rare words may be misheard: use them to find the spot, not as the script.
- A **spoken comment** (`voice`) has the reviewer's words as its text and one frame image per pointing phrase ("this",
  "over here"), labelled with the phrase and its time. Match each phrase to its frame to see what it points at. If
  `voice.status` isn't `transcribed`, there's no text yet: say so and ask the user what was meant.
- `author` is set on comments someone other than the user wrote (a guest on the share link). The user saw and sent
  them with **Finish review**, so apply them like the others.

## Transcripts

If the video has speech and you already have word timings (captions you burned in, a voiceover with timestamps, a
transcription you ran), pass `transcriptPath` (an `.srt`, `.vtt` or word-timings JSON such as Whisper's) to
`open_review` or `add_version`. The user reads along under the timeline and can comment on words. Without one, FrameJam
transcribes the render itself when whisper.cpp is installed, so don't transcribe only for this. Pass a new one when the
timing of the speech changed.

## Other ways in

- "Apply my FrameJam feedback" (with or without a review id): call `get_feedback()`. Without a `reviewId` it picks the
  project whose comments haven't reached you yet; comments the user typed but never sent are handed over now.
- `list_reviews()` shows every project and where its round stands: `sent_not_delivered` means call `get_feedback`;
  `user_commenting` with `guestCommentsWaiting` means guests commented (see `sharing`); `awaiting_user` means open its
  `url` and wait.
- Without MCP, the user can use **Copy comments as text** in the review page's version menu and paste it into chat.
