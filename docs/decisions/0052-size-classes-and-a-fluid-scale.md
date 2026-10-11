# ADR 0052: Size classes and a fluid scale

Date: 2026-10-11
Status: accepted

## Context

Overload is drawn for phones. DESIGN.md lays out every screen for a device: 402 × 874, 440 × 956,
375 × 667, 320 × 568, and Android at 360 × 800. Every length is a fixed point size that grows
only with the reader's text.

On 11 October 2026 the owner asked for an app that "seamlessly adapts to any screen size, and
the size of the font and the components and the boxes and the margins and everything else
changes accordingly". The native apps for Android and iOS come next. The audit found what the
web app did beyond a phone:

- Every screen stayed a 32rem (512 px) column. On a tablet that left more than a third of the
  screen empty, and on a desktop more than half.
- Type, spacing and targets were the phone's on a 27-inch screen.
- The workout layer had no column at all. On a tablet, load, reps and RIR drifted to the
  thirds of the screen and Save spanned 780 px.
- The session strip ran edge to edge on tablets. Pinned actions stood 20 px outside the page's
  left edge.
- In landscape, the session layer ran under the notch.
- Several controls were a fixed 44 px on Android, against the 48-dp rule.
- The radar's labels were 10.8 px on a 320-pt phone, under the 12-px floor, and did not grow
  with text.

The owner chose **adaptive + fluid**:

- Three size classes.
- Inside them, type, spacing and components grow smoothly between a minimum and a maximum.
- The reader's own text size still multiplies everything.
- A phone stays exactly as DESIGN.md draws it.

## Decisions

1. **Three size classes, named as the native apps will name them.**
   - **Compact**, under 600 pt: a phone, laid out exactly as before.
   - **Medium**, 600–1023 pt: a tablet, or a large phone on its side. The tab bar stays.
   - **Expanded**, 1024 pt and up: navigation becomes the side rail.

   Each sets three widths (`globals.css`):

   | Width                                                  | Compact | Medium | Expanded |
   | ------------------------------------------------------ | ------- | ------ | -------- |
   | `--content-width` (reading and form screens)           | 32rem   | 44rem  | 46rem    |
   | `--content-width-wide` (screens of cards and sections) | 32rem   | 62rem  | 78rem    |
   | `--sheet-width`                                        | 32rem   | 36rem  | 38rem    |

2. **A fluid scale on top, from 600 px of viewport to 1440 px.**
   - `--ov-fluid` runs from 0 to 1 px across that span: `clamp(0px, (100vw - 600px) / 840, 1px)`.
   - Every type token adds a multiple of it. The title, for example, is up to 6 px larger at
     1440 px and beyond.
   - So do the spacing tokens, the gutter (20 → 40), targets (+4), radii, panel padding, section
     gaps and icons.
   - Component styles write their lengths in `--ov-u`, a pixel that is 1 px on a phone and an
     eighth larger at 1440 px. Hairlines, outlines and query thresholds stay in plain px.
   - Tailwind's `--spacing` is fluid the same way.
   - The scale adds to the reader's text size and never replaces it. Zooming or a larger text
     setting still multiplies everything.
   - Under 600 px every length is exactly what it was. Pixel diffs of Today, Training, Food,
     Progress and Profile at 320, 360 and 390 px against the previous build show no change.

3. **Which screens widen.**
   - A reading or form screen (a settings list, a form, the check-in, a detail page) takes
     `--content-width`, a readable column.
   - A screen of cards and sections takes `page-wide` and lays them out with `adaptive-grid`:
     one column on a phone, two on a tablet, three on a wide desktop. The column minimum is in
     rem, so larger text means fewer, wider columns rather than squeezed ones.
   - Today holds at most two columns (62rem). A day with one card gives it the whole row. A
     Today with no card stands in the reading column, as every other screen does, and keeps its
     buttons at a phone's width.
   - Training is a screen of tiles. It is wide, with the cycle's days in as many columns as fit
     and the next day across two, and its header widens with it.
   - The Progress overview and Food split in two: the month and its totals beside History, and
     the day's bowl and macronutrients beside its meals. Each pane is a phone's width or more,
     22rem, so they split only where the column holds 46rem (two panes and the gap): a tablet
     or a desktop at 100% text. At larger text, or narrower, they stay one column. To hold two
     such panes the two screens are wide, their headers with them, up to 62rem as Today is: two
     panes need no more. The reading column (44–46rem) held two panes of about 20rem, where
     "Sleep 7.25 h" broke onto two lines.
   - The other Progress sections, graphs read one at a time, stay one column at the reading
     width, so Progress narrows from its overview to them.
   - The calendar is wide, its months side by side as many as each keep a phone's month (21rem),
     read across then down, oldest first: two on a tablet, three on a desktop. It opens with this
     month's name just under its header that stays, on every screen.
   - Friends' four shortcuts stand in one row beyond a phone, where their words fit.
   - Profile, settings, forms and detail pages stay one readable column.

4. **The workout is the page's column, centred.** The session layer still covers the screen.
   - It pads its sides to the size class's content width. On a phone in landscape it pads them
     to the safe-area insets, less the gutter.
   - Its container queries and the logger's measure read that column, not the screen.
   - The session strip and pinned actions stand over the same column at every width. Pinned
     actions clear the home indicator in landscape.
   - A page of the session's own (Log a run, the check-in, Add exercise) has no navigation, so
     at the expanded size it keeps no room for the rail either: it stands in the middle of the
     screen. Its pinned actions follow the page there instead of the screen's foot, half a tall
     screen below the fields: they ride the foot while it scrolls and rest after its last field.

5. **Targets go through the platform's target.** Shared controls are sized with `--ov-target`
   or `--ov-target-header`, never Tailwind's fixed `min-h-11` or `size-11`. That makes them 48 dp
   on Android, 44 pt elsewhere, and they grow with the text. Fixed sizes remain only where the
   design asks for a figure's 44-pt target that must not grow (the 1–5 scales, the week's day
   tiles).

6. **Drawings size their words against the width they are drawn at.** The radar measures its
   box and draws its labels at 12 px or more at 100% text, growing with the text. The shape
   shrinks, to a third at most, to leave the labels room.

## Consequences

- The native apps can take the same three classes and the same tokens. Compose's
  `WindowSizeClass` and SwiftUI's horizontal size class map to them directly.
- A new screen picks a width: `page-width` alone for reading, or `page-width page-wide` with
  `adaptive-grid` for cards.
- A new length in a component stylesheet is written in `--ov-u`, and a new target in
  `--ov-target`.
- The pixel-diff check at 320, 360 and 390 px is how a change to the scale proves a phone did
  not move.
