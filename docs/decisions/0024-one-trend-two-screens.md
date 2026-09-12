# 0024 — One trend, two screens

Status: accepted, 2026-09-12. Follows [0022](0022-a-status-bar-at-the-bottom-of-the-screen.md),
whose navigation frame this replaces, and
[0023](0023-a-masthead-not-a-stack.md).

## Context

**An exercise's own page said everything about the movement except how it is going.** Settings ›
Exercises opens a page with the prescription, the equipment, where it fits in the programme, the
gyms that have it, and the last ten sessions as rows of numbers. The one thing it did not have
was the picture: Load, Reps, Volume, RIR and e1RM over a range, which Progress › Strength has
had all along for whichever exercise you pick out of a list. Reading a trend meant leaving the
page you were already on, opening Progress, and finding the exercise again in a select.

**The navigation island was in the wrong place at launch, and corrected itself on the first
scroll.** 0022 moved the island and the resume strip inside one `position: fixed` frame of
`height: 100dvh` so the two would never disagree about where the bottom of the screen is. Its
follow-up recorded that a cold-launch offset survived that change and remained unverified on the
phone it happens on. A `dvh` length has to be resolved, and iOS resolves it against the viewport
it expects rather than the one on screen until something makes it recompute — a scroll, most
obviously, which is exactly the gesture that was putting the island back.

**A date read higher in its box than the fields above it.** Dropping the native appearance from
`input[type="date"]` — done so two of them could share a row on iOS without the first
disappearing under the second — leaves Safari laying the value out at the top of the field's
content box instead of on its centre line. Body weight and Height sat centred; Date of birth sat
high, in the same column, three rows apart.

## Decisions

1. **The strength trend is one component, mounted by two screens.** `StrengthTrend` carries the
   five measurements, the headline and its change, the machine in the corner and the chart.
   Progress passes an exercise chooser into its `picker` slot; the exercise page passes none,
   because the screen you are on already answered that question. Everything below the chooser is
   the same component drawing the same numbers, so a load on one screen cannot disagree with the
   load on the other. `Headline` moved to `components/ui` alongside it, where the body-weight
   chart already wanted it.

2. **Both screens read those numbers from the same function.** `performanceSeries` is the series
   builder lifted out of `trainingAnalytics`, which now calls it. Given an `exerciseId` it builds
   the series for that movement only, so the exercise page reads the sessions the movement was
   actually in — `readWorkouts`' existing exercise filter — rather than a whole account's
   training to throw almost all of it away. The window is the account's own default of twelve
   weeks, changed from the same filter sheet Progress uses, and it lives in the URL, so the
   machine you picked and the dates you chose are answered by the server rather than by a second
   copy of the data in the browser.

3. **The mobile chrome frame is pinned to four edges, not given a height.** `.viewport-chrome` is
   `position: fixed; inset: 0`. The browser sizes it against the same viewport it anchors a
   bottom-fixed element to, so there is no length left to be stale at first paint, and the island
   and resume strip keep the one containing block and one bottom gap that 0022 gave them.

4. **A date field centres its value on its own row.** `input[type="date"]` is a single-cell grid
   with `align-items: center`. Grid rather than flex: a grid item still fills the field's width,
   which keeps Chrome's calendar button on the right-hand edge instead of leaving it to trail the
   date. The value stays left-aligned, like every other field's.

## How it was checked

`npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run build` and the 419 tests in
65 files all pass.

The date field was rendered in Chromium at both `display` values and measured: the field keeps
its 44px height and its width in a two-column grid, the value stays left-aligned, and the
calendar button stays on the right-hand edge.

The exercise page's new card was rendered at 390px in light and dark against the real components
and the app's own palette: the heading and range, the filter control, the five measurement pills,
the headline and its change, the machine picker and the chart's "View values" table are all in
place, with no horizontal overflow. The plot itself measures its own width from the client, and
this sandbox's dev server does not hydrate, so the line inside the chart was not drawn in those
renders; the chart component and the props it is given are unchanged from Progress.

**The navigation frame is not verified on an iPhone.** Removing the computed `dvh` length is the
cause this repository can act on from here, and it is the one this screen's symptom — wrong at
launch, right after a scroll — points at. `env(safe-area-inset-bottom)` is the other value in the
island's position that iOS can report late on a cold launch; if the offset survives this change,
that is where to look next, and it needs the phone.
