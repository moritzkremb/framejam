# Button

Every action is a Button; the screen's single most important action is the only `primary`.

- `primary`: lime in dark theme, near-black in light. One per screen: **Send N to agent** on a review, **Use this style** on a style, **Copy** for step 1 of setup. Use `lg` when it lives in the dock.
- default (`surface-2`): common secondary actions (*Copy prompt*).
- `outline`: a secondary action standing next to a primary.
- `ghost`: row actions inside comments and toolbars; `round icon` for ⋯ and close.
- `danger`: only Delete.

Labels are short, start with a verb, and include the count when there is one. Icon-only buttons need an `aria-label`. A disabled primary is fine to show only when the dock explains why ("Add feedback to send").
