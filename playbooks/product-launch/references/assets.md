# Assets: collecting the real product

The video is only as good as the real material. Collect it first, list it, then plan.

## Recording the app

- Window at 1440×900 logical (2880×1800 on a Retina screen). Record the window or a crop, not the whole desktop.
- Clean state: demo account with realistic data, no notifications, no personal names or emails, light or dark theme
  matching the brand.
- One action per take, 3–10 s each: open, type, click, result. Leave 1 s of stillness before and after.
- Note the timings of each take in `ASSETS.md` (e.g. "review.mp4: 7.0 click on mascot, 7.6 pin appears, 8.2–9.6
  typing, 10.1 comment lands"). Those are your cue points.
- If you can script the browser (Playwright, Puppeteer), record deterministic takes with a drawn cursor; re-recording
  after a UI change is then free.
- Screen Studio-style auto zoom is optional; you can do the zoom inside the product window instead.

## Capturing a website

- The hero video (often an mp4 in the page source), full-page and section screenshots at 2x, the logo as SVG, the
  fonts (only if the license allows embedding in video), exact headlines, stats and the customer logo wall.
- With Hyperframes: `npx hyperframes capture <url> -o capture --json` writes screenshots, assets, tokens and visible
  text. Check `ok: true` and that no `BLOCKED.md` exists; a failed capture is a stop, not a reason to invent the page.
- Show the captured page as the real page. Rebuild only the one component that needs to move (a search input that
  types), matching it 1:1.

## ASSETS.md

One line per file: path — what it shows — size — key moments. This is the only inventory the storyboard may use.

```md
- assets/ui/hero.mp4 — official hero video, Ramp HQ board, agent avatars dragging cards — 1920x1200, 11 s
- assets/ui/meetings.webp — Meetings database, rows with team tags — 1740x1740 on white
- assets/logos/slack.svg — Slack mark (integration shown on the product's own site)
```

## Brand truth

- Colors: canvas, ink, muted text, hairline, one accent (exact hex from the site CSS or the user's brand file).
- Fonts: display and body (the product's own if licensed, else the closest free font), plus a mono for kickers.
- UI surfaces: radius, border, shadow, how windows look. Product windows in the video use these.

## Rights

- Real UI and copy of the user's own product: fine.
- Customer and integration logos: only ones the product itself shows publicly, in their official colors.
- No real people (photos, faces) without consent. Characters and illustrations only if they are the product's own.
- Music: licensed, owned, or generated locally (`scripts/launch_bed.py`).
- Demo videos of someone else's product (like the Notion demo) are for practice; label them unofficial and don't
  publish them as the brand's own.
