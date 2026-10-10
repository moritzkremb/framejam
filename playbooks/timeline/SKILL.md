---
name: timeline
description: >
  Timeline: turn dates and milestones (a company's history, a product's journey, a person's life, a year in review)
  into a 20–60 s story told one milestone at a time. Each beat has a big year or number, a headline of a few words
  and one simple picture; a progress bar advances as time passes; it opens with a hook and ends on a closing card.
  Cut to music or a voice; every render reviewed in FrameJam. Works in the project's own video tool; new projects use
  Hyperframes.
---

# Timeline

> **How to use this playbook.** It's a recipe, not a set of rules: every format, length, pace and formula below is a
> default, and whatever the user asks for wins. Don't open with questions: use the defaults, build, and mention the
> defaults you chose in one line when you share the first render (ask only if something essential is missing, like the
> footage itself). The first render is the proposal, so there's no plan to approve first. Storyboards only when the
> user asks to see the shots first. Planning files the method mentions (`BRIEF.md`, `PLAN.md` and the like) are your
> own working notes: write them when they help you, never as a step for the user.

Dates go in; a story with momentum comes out. A timeline video works when each beat is instantly readable (the number,
a few words, one picture) and the rhythm makes time feel like it's moving forward.

## What goes in, what comes out
- **In:** milestones with dates, or a source to pull them from (an about page, a CV, a changelog, a Wikipedia
  article), optionally photos, logos or screenshots for some milestones, music or a voice recording.
- **Out:** a 16:9 1080p mp4 (20–60 s; 9:16 if asked) with an opener, one beat per milestone, a progress bar, music
  and a closing card. Reviewed and approved in FrameJam.

## Defaults (the user's request overrides any of them)

- **Milestones:** 5–9. Pick the ones that change the story (first, turning points, the biggest number, now); drop
  the rest. Each one: a year or number, a headline under six words, one caption line with a specific fact.
- **Order:** chronological. The opener states what this is in a few words; the last beat is "now" or the biggest
  moment; the closing card is a line that sums it up, a quote, or the call to action.
- **Length and tempo:** ~1.2 s per milestone with music only, longer when a voice reads them. Default ~20 s.
- **Sound:** a music track cut so milestones land on beats (free library or the user's track); a voiceover only if
  the user wants one (their recording or Kokoro; paid voices only with their OK).
- **Look:** use the style picked for this video, if any (from `wait_for_pick`, or `get_preset` when the user names
  one). No style: Color Wipe (`get_preset("life-timeline")`), whose example video is this playbook's example.
- **Tool:** an existing project keeps its tool; never convert it. A new project uses Hyperframes (if the Hyperframes
  skills are installed, use them for composition details).
- **Pictures:** a simple drawn picture per milestone by default; the user's real photos or screenshots in a frame
  where they have them. No third-party logos or real people's likeness without permission.

## Workflow

### 1. Milestones
- Write `TIMELINE.md`: one row per milestone with the date, the number to show big, the headline, the caption and its
  source. Check every date and number against the source; mark anything you couldn't verify and leave it out unless
  the user confirms it.

### 2. Plan the beats
- One beat per milestone, the same structure every time so the viewer learns it: the scene change, the big number,
  the headline, the caption, the picture, then one small secondary motion.
- A **progress bar** (or year bar) along the bottom advances with every beat. Give the opener and the closing card
  more time than a milestone.

### 3. Sound and timing
- Music: measure the tempo and put every milestone on a downbeat (whole bars). Voice: copy the Explainer playbook's
  scripts (`get_playbook("explainer")` returns its folder): `tts.py`, `word_times.py`, `build_timing.py`, `mix.py`,
  and start each milestone on its first spoken word.

### 4. Build, render, check
- Build from `TIMELINE.md`; render to `renders/v1.mp4`. Read a contact sheet at 2 frames a second and a full frame of
  every milestone: the number and headline readable on a phone, the bar in the right place, nothing cut off.

### 5. Review in FrameJam
- `open_review({ title, videoPath })`, open the URL, `wait_for_feedback`. Map each comment's time to its milestone,
  fix, re-render to `renders/v2.mp4`, `add_version` with a note, wait again. Stop when the comments say it's done.

## Quality bar
- **Every date and number is true** and traced to a source.
- **Each beat reads in under a second:** a big number, under six words of headline, one picture.
- **Time moves forward:** chronological, the progress bar always matches, steady tempo with a longer hold at the end.
- **Specific, not generic:** real counts, places and names in captions ("3 people in a garage", not "humble
  beginnings").
- Music and beats agree: milestones land on downbeats; the music ends with the closing card.

## Files in this playbook
- None besides this method. Narration uses the Explainer playbook's `scripts/`; the default look is the Color Wipe
  style (`get_preset("life-timeline")`).
