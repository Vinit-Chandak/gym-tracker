# Form: one design, two palettes, one row per set

Implements the package in [`docs/ui-redesign/`](../ui-redesign/README.md) against `c61024b`.
The specification there is the contract; this record covers what was decided while building
it and what was measured afterwards.

## Theme

The two theme files move into `src/styles/form/` and are imported by `globals.css`, which
aliases the Tailwind names the screens already use onto the semantic `--ov-*` tokens through
`@theme inline`. `inline` is the whole point: `bg-canvas` compiles to `var(--ov-canvas)`
rather than to a copy of its build-time value, so the light/dark choice happens where the
utility lands and one component tree serves both palettes.

Appearance is System, Light or Dark, kept on the device. System is the plain
`prefers-color-scheme` query in `foundation.css` and needs no JavaScript at all; only an
explicit override writes `data-overload-mode`, which a bounded script at the top of the body
does before the first paint.

**Decided: an initializer, not a cookie.** The alternative was mirroring the preference to a
cookie and reading it with `cookies()` in the root layout. That would opt every route into
dynamic rendering — including the public auth screens, which are static today — for one
three-value enum. The plan allows either and asks for the consequence to be reviewed; this is
that review. Hydration-warning suppression is scoped to the `<html>` element, which is the
only thing the script touches.

The fixed dark assumptions went with it: the root `color-scheme`, the single theme colour,
the chart series hexes that were validated against one surface, the body map's volume ramp,
and the offline page, which carries its own copy of the two canvases because it has no
account and no network. The manifest still holds one colour and says so in a comment: a
platform reads it before the app runs, so a light-mode user gets a dark splash handing over
to a light interface.

## Set logging

Each set owns its values. The row is identity/options, load, reps or seconds, RIR and save,
with the labels and unit in the header once. Four sets holding the same numbers are four
rows, because they are four records.

**Decided: silence and a decision are different.** Drafts now record which fields the user
actually set. An untouched field still takes its row's suggestion — that is what the greyed
number in the field means — but a field the user has been in saves exactly what it shows,
empty included. Without the distinction, clearing an optional RIR would silently restore the
target it was cleared to reject. Drafts written before this are read the way they were
written, so nothing unsaved is lost on upgrade.

The steppers moved into the set options sheet with the set type and deletion. Three
two-storey controls per row is what pushed the numbers themselves off a small screen.

## Session-only supersets

`workout_exercises` gains a nullable `superset_group` (migration 0007), seeded from the
programme's grouping when a session starts.

**Decided: backfill rather than a read fallback.** The plan offered either. A fallback that
reads the programme's grouping when a session has none cannot tell "this session predates the
column" from "the user removed every group", and would resurrect groups the user had just
deleted. The migration copies the grouping onto existing rows instead, so the column is the
only source afterwards and history keeps the grouping that actually applied on the day.

Editing writes only to the workout's own rows. A group needs at least two members, an
exercise belongs to at most one, and a group left with a single member stops being a group —
enforced after every change rather than at each call site. Ungrouping takes the label and
nothing else.

## Navigation inside a workout

The overview lists every exercise; opening one swaps in a focused logger. Which exercise is
open is a search parameter moved with `history.pushState`, not component state: back, forward
and a shared link all land on a real exercise, and the change costs no navigation and no
second fetch of a session the page already has. History's filters use the same technique for
the same reason.

The active session became shell chrome. One resume strip and one rest timer sit above the
navigation on every destination, and stand down on that workout's own screens and on Today,
where the session is already the page's content with a primary Resume. The strip measures
itself and reserves that height: a constant would be wrong as soon as a long workout name or
the timer's controls wrapped, and what it would cover is the bottom row of the page.

## Responsive behaviour, measured

The set grid has three tiers, chosen by container queries in `rem` rather than viewport
breakpoints — a `rem` query reacts to an enlarged root font, which is the case that breaks
this layout while the viewport is unchanged. The thresholds are the tiers' own minimums:
17rem for the one-line grid, 13.625rem for the same without the save cell.

Measured in headless Chromium against the production stylesheet, at 320, 360, 390, 430 and
480 CSS px in both palettes, and at 320 and 390 px with a 200% root font:

- No horizontal page scrolling in any case.
- No clipped set cell, including a row carrying the maximum values the server accepts
  (2000 load, 1000 reps, 10 RIR).
- No interactive target under 44 px.
- At normal text the one-line grid holds at every width, down to `44 / 74 / 59 / 50 / 44` px
  at 320 px. At 200% it becomes one labelled value per line.

Two defects were found and fixed this way: the reflow threshold was originally set high
enough that the one-line grid never appeared on a phone at all, and a two-up button row
clipped "Complete" at 200% text. Action rows now wrap by measurement, like the tabs.

## Not measured here

Field performance on real devices — Core Web Vitals, input latency, frame time, installed
launch and OS theme changes — remains open. The targets are in
[Themes and performance](../ui-redesign/03-themes-and-performance.md) §4 and need a
production build on the agreed phone matrix, which this work could not run.
