# Player

The video and its play controls. Clicking the picture is the main way to say "this, here".

- The well is `video` black with `radius-lg`. 16:9 fills the column width; 9:16 fills the column height (see the review layouts).
- A hint pill ("Click anything to comment on it") shows on hover until the first comment exists.
- Clicking drops a lime `new` pin, pauses, and focuses the comment box with that spot attached. When the element under the click is known, it gets a dashed lime outline.
- One player, no source switch. The app picks what to play: the live composition for the latest version (so clicks can target exact elements), and the exported video for older versions (so they look exactly as they were). The person never has to know there are two.
