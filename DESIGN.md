---
name: Overload
description: The coach's plan sheet. Every screen is a position on the training plan, and today is the highlighted cell.
colors:
  canvas: "#fcfcfb"
  surface: "#ffffff"
  surface-raised: "#f0f1f0"
  ink: "#15171a"
  ink-muted: "#585f66"
  ink-subtle: "#666d74"
  ink-ghost: "#6b7279"
  line: "#dcdedd"
  line-strong: "#8d9399"
  grid: "rgb(21 23 26 / 0.16)"
  pen: "#2f4bc8"
  pen-strong: "#213aa6"
  pen-soft: "#e6eafb"
  highlight: "#ffd933"
  highlight-strong: "#f2c90f"
  highlight-soft: "#fff3b8"
  on-highlight: "#15171a"
  success: "#1d7a4a"
  warning: "#8a5a00"
  danger: "#c0282f"
  focus: "#2f4bc8"
  series-1: "#15171a"
  series-2: "#2f4bc8"
  series-3: "#a67c00"
  series-4: "#8a3fb0"
  volume-0: "#ebecea"
  volume-1: "#fff3b8"
  volume-2: "#ffe36b"
  volume-3: "#ffd933"
  volume-4: "#c99d00"
  backdrop: "rgb(21 23 26 / 0.5)"
typography:
  display:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tabular-nums"
  small:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  label:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: "1rem"
    letterSpacing: "0.08em"
  data:
    fontFamily: "Barlow Semi Condensed, Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.25rem"
    fontFeature: "tabular-nums"
  measure:
    fontFamily: "Barlow Semi Condensed, Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontFeature: "tabular-nums"
rounded:
  control: "0.25rem"
  card: "0.375rem"
  sheet: "0.875rem"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.25rem"
  "6": "1.5rem"
  "7": "2rem"
  "8": "2.5rem"
  page-gutter: "clamp(1rem, 4vw, 1.25rem)"
  panel-padding: "clamp(0.875rem, 3.5vw, 1rem)"
  section-gap: "clamp(1.5rem, 5vw, 2rem)"
  control-height: "2.75rem"
  nav-height: "3.75rem"
  content-max: "34rem"
components:
  button-primary:
    backgroundColor: "{colors.highlight}"
    textColor: "{colors.on-highlight}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0.5rem 1rem"
    height: "2.75rem"
  button-primary-active:
    backgroundColor: "{colors.highlight-strong}"
    textColor: "{colors.on-highlight}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0.5rem 1rem"
    height: "2.75rem"
  button-secondary-active:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.pen}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0.5rem 1rem"
    height: "2.75rem"
  button-ghost-hover:
    textColor: "{colors.pen-strong}"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0.5rem 1rem"
    height: "2.75rem"
  badge-neutral:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0.125rem 0.375rem"
  badge-accent:
    backgroundColor: "transparent"
    textColor: "{colors.pen}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0.125rem 0.375rem"
  badge-highlight:
    backgroundColor: "{colors.highlight}"
    textColor: "{colors.on-highlight}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0.125rem 0.375rem"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 0.75rem"
    height: "2.75rem"
  input-focus:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
  set-cell:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.data}"
    rounded: "{rounded.control}"
    padding: "0 0.25rem"
    height: "3rem"
  segmented-track:
    backgroundColor: "{colors.surface-raised}"
    rounded: "{rounded.control}"
    padding: "0.25rem"
  segmented-cell:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.small}"
    rounded: "{rounded.control}"
    padding: "0.25rem"
    height: "2.5rem"
  segmented-cell-checked:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
  nav-tab:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 0.125rem"
  nav-tab-active:
    backgroundColor: "{colors.highlight}"
    textColor: "{colors.on-highlight}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.panel-padding}"
  row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "0.75rem 0"
    height: "3.5rem"
  row-active:
    backgroundColor: "{colors.surface-raised}"
  sheet-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
    padding: "{spacing.panel-padding}"
  cycle-cell-today:
    backgroundColor: "{colors.highlight}"
    textColor: "{colors.on-highlight}"
    typography: "{typography.data}"
    rounded: "{rounded.control}"
    height: "2.75rem"
  cycle-cell-done:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    typography: "{typography.data}"
    rounded: "{rounded.control}"
    height: "2.75rem"
---

# Design System: Overload

## Overview

**Creative North Star: "The Coach's Plan Sheet"**

Overload is one sheet of paper, not a stack of cards. Every screen is a position on the training plan drawn on the same page: paper-white in daylight, graphite-black at the gym, and in both a faint construction grid (one dot every 20px) shows through the canvas. The sheet is written in four instruments, and the whole system is the discipline of which instrument writes what. Ink is what is true and confirmed. Pencil (a grey with a dotted underline) is what the coach proposes and the athlete has not yet confirmed. Pen (ballpoint blue) is the coach's own hand and every word that can be tapped. The highlighter (fluorescent yellow with black ink on it) marks today, the current step and the one primary action on a screen, and nothing else.

The density is that of a data document read at arm's length between sets: Barlow for prose, the semi-condensed cut for every measure, tabular numerals wherever a number lives, hairline rules instead of boxes, and nearly square corners (4px). Depth is almost absent; the page is flat and only a sheet that lifts off it (the bottom sheet) casts a shadow. Motion is the sound of a pen: ink settles in over 160ms, a bottom sheet rises on a 240ms spring, a tab crosses in 120ms, and nothing animates on page load.

It refuses the fitness dashboard (a hero ring, a grid of stat cards, a neon start button, a streak) and the calm-journal opposite (cream paper, serif type, terracotta boxes). The one signature graphic is the periodisation chart: the cycles banded across the span, each week's work as a stepped bar inked over them, the plan as a pencil step, today as a pen line.

**Key Characteristics:**

- One sheet, two palettes (daylight and graphite) with the same semantic tokens; everything is right in both or it is not done.
- Four instruments with fixed meanings: ink (confirmed), pencil (proposed), pen (coach's hand and anything tappable), highlighter (today, current step, one primary action).
- Ruled blocks, never boxes in boxes; the only opaque container is the pinned panel.
- Numbers always in the data voice: Barlow Semi Condensed, tabular, in a column.
- Flat by default; one shadow, cast only by the bottom sheet as it lifts.
- Phosphor regular as the single icon stroke; no glyph icons, no second weight.

## Colors

A paper-and-stationery palette: a near-white canvas with a faint ink grid, one blue pen, one yellow highlighter, and a short ramp of greys that are all ink at different pressures. Values in the frontmatter are the daylight sheet; the graphite sheet is the same set of roles re-tuned (see the sidecar) and selected by `data-overload-mode` or the system preference.

### Primary

- **Highlighter** (`highlight`): fluorescent yellow with black ink on it (`on-highlight`). Marks today's cell in the cycle strip, the current set's number and Save in the logger, the current cycle in the periodisation chart, the selected tab in the tab bar, and the screen's one primary button. Also the text selection colour. `highlight-strong` is its border and pressed state; `highlight-soft` is the tint a marked row or tile takes in a picker, and the band of the current cycle behind the chart.
- **Pen** (`pen`): ballpoint blue, the coach's own hand and every interactive word: coach notes and reasons, ghost buttons, the back link, the "Resume" link, the chart's today line, the progress bar fill, the caret and native accent colour, and the focus ring. `pen-strong` is its hover; `pen-soft` the wash behind a pen-marked state.

### Neutral

- **Canvas** (`canvas`): the sheet itself, with `grid` dots printed on it at 20px.
- **Surface** (`surface`): the opaque white of a field, a pinned panel, a bottom sheet, the sticky actions strip and the session line.
- **Surface raised** (`surface-raised`): the pressed state of every row and ghost control, the segmented control's track, skeleton rows, the chart's alternating cycle bands.
- **Ink** (`ink`): body text, the inked-in cell (done days, chosen segments), the chart's bars.
- **Ink muted / subtle** (`ink-muted`, `ink-subtle`): section labels, metadata, inactive tabs, row chevrons and axis labels.
- **Pencil** (`ink-ghost`): proposals and prefills: placeholder text, the plan's dashed step on the chart, a day not in the programme. Still 4.5:1 on the canvas; told apart by weight and a dotted rule, never by contrast alone.
- **Line / Line strong** (`line`, `line-strong`): the hairline that rules every block, row and tab bar; the stronger hairline that bounds a field, a secondary button and a struck cell (3:1 against the sheet).
- **Status pens** (`success`, `warning`, `danger`): outlined badges and the danger button, always paired with a border or a word so colour is never the only signal.
- **Series and volume** (`series-1..4`, `volume-0..4`): charts draw ink first, then pen, then the highlighter deepened to an ochre that holds 3:1; the muscle-volume map is the highlighter laid down in passes, then ink. Eight **group pens** (`group-1..8`) rule a superset's rows down the left in order of first appearance.

### Named Rules

**The One Highlighter Rule.** The highlighter marks today, the current step and the one primary action, and nothing else. A chosen cell in a segmented control is inked in (`ink` on `canvas`), and a marked row or tile in a picker takes `highlight-soft` with a pen check; neither takes the full highlighter. The wordmark carries a highlighter stroke only on the sign-in screens, where there is no today to mark.

**The Pen Is Tappable Rule.** Blue means the coach wrote it or you can press it. No decorative blue; no tappable grey.

**The Pencil Rule.** Anything proposed and not yet confirmed is set in `ink-ghost` at regular weight (placeholders, prefills, the plan's step), and becomes ink the moment the athlete confirms it.

## Typography

**Display Font:** Barlow (with ui-sans-serif, system-ui, sans-serif), self-hosted, weights 400/500/600/700 and 400 italic.
**Body Font:** Barlow, the same family.
**Label/Mono Font:** Barlow Semi Condensed (weights 500/600/700), the data voice; `ui-monospace` is mapped but not used for display.

**Character:** One family carries the whole sheet. The regular width is the prose; the semi-condensed cut is every measure that has to sit in a narrow cell and be read at arm's length. Headings are set semibold with slight negative tracking (-0.01em) and balanced wrapping; body is regular at a 1.5 line height; every number anywhere is tabular.

### Hierarchy

- **Display** (600, 2rem, 1.1): the day's name on Today, a chart's headline figure (`measure text-2xl`), a block head set at its largest.
- **Headline** (600, 1.5rem, 1.15): the page title on a top-level screen (the wordmark on Today, "History", "Progress").
- **Title** (600, 1.125rem, 1.15): a nested screen's title, a block head, the sheet's title, an empty state's heading.
- **Body** (400, 1rem, 1.5): running text, row titles (500), coach lines in pen.
- **Small** (400, 0.875rem, 1.25rem): subtitles, metadata, segmented and tab labels (500), the desktop rail.
- **Label** (600, 0.75rem, 0.08em, uppercase): section headings ("THE PLAN", "CYCLE 3 OF 8"), set-grid column heads (0.06em). The label is the heading of its block, sitting on the rule beneath it.
- **Data** (Barlow Semi Condensed 500, 0.875rem, tabular): prescriptions ("3 × 8–12 @ 1 RIR"), the header's date, row meta, cycle numbers, axis ticks.
- **Measure** (Barlow Semi Condensed 600, 1.5rem to 2.75rem, line-height 1, -0.01em, tabular): the `measure` utility for a stat tile, a rest countdown, a chart headline. Fields in the logger take the same voice at 1.125rem to 1.25rem.

### Named Rules

**The Tabular Rule.** `font-variant-numeric: tabular-nums` is set on the body and on every input. A digit never shifts a column.

**The Data Voice Rule.** A number that must be read at a glance is set in Barlow Semi Condensed, 500 or 600, never in the prose cut.

**The 16px Field Rule.** Every input is at least 16px (`max(1rem, 16px)`) so iOS never zooms on focus; zoom itself stays enabled.

## Layout

One column, phone first at 402px, never fixed-width, no overflow at 320px. The page runs to a 34rem maximum (`content-max`) with a gutter of `clamp(1rem, 4vw, 1.25rem)` padded out to the safe area; sections are separated by `clamp(1.5rem, 5vw, 2rem)` (the page stack), a pinned panel or sheet pads `clamp(0.875rem, 3.5vw, 1rem)`, and rows inside a block pad 0.75rem vertically at a minimum height of 3.5rem (56px, for gym use). Space is on a 4px base (0.25rem to 2.5rem in eight steps). Every control clears a 44px target (`control-height` 2.75rem); buttons at md are 2.75rem, at lg 3rem.

The sheet's rhythm is the hairline. A block (`box`) is ruled above and below and open at the sides so its text starts where its rules start; a list (`box-rows`, `ruled-list`) is the same block cut into rows by one hairline each; a pair of hairlines (`rule-top`, `rule-bottom`) separates without boxing. Blocks stack into one ruled document and are never placed inside one another.

The construction grid is real: the body prints one 1px dot at every 20px intersection in `grid` (ink at 16% opacity in daylight, 10% in graphite). Text runs over it; layouts reflow by whole cells.

**Chrome.** The page header is a slim sticky line on the canvas (minimum 3.25rem, safe-area top), ruled off below: the title owns the baseline and its one qualifying fact (the date, the range, the gym) sits at the far end in the data voice. One level down, the back link (chevron and destination name in pen) sits before a centred title. The tab bar is five sheet tabs along the bottom edge, 3.75rem tall plus the home-indicator inset, ruled off above, on the canvas. An optional session line (rest timer, "In progress · name", Resume in pen) sits between page and tab bar and measures its own height into `--session-chrome-height` so the page reserves exactly that. Multi-step actions sit in a sticky, ruled, opaque strip above whatever owns the bottom of the screen (`sticky-actions`); two actions share a row until each would be narrower than 8.5rem, then stack (`action-row`).

**Responsive.** At 64rem and above the tab bar becomes a 13rem rail down the left margin of the same sheet, ruled off on its right, with the wordmark and "The coach's sheet." at its head; content shifts right by 13rem. Short landscape screens (under 30rem tall) let the chrome scroll. Stat tiles sit four across from 440px and two by two below. The set grid chooses one of three tiers by container width in rem (18rem, 13.625rem) rather than viewport width, so an enlarged root font stacks a row before it clips a value.

## Elevation & Depth

The sheet is flat. Depth is conveyed by rules and by opacity of surface, not by shadow: a ruled block sits on the grid; a pinned panel (`surface` inside a `line` hairline) stands off the page by being the one thing that is opaque; a field is a white cell inside a stronger hairline; the pressed state of a row or ghost control is a wash of `surface-raised`. Dialog backdrops dim the page to `backdrop` (ink at 50%, black at 70% in graphite).

### Shadow Vocabulary

- **Sheet lift** (`box-shadow: 0 -8px 32px rgb(21 23 26 / 0.18)`; graphite `0 -8px 32px rgb(0 0 0 / 0.55)`): the bottom sheet as it rises, cast upward because the sheet lifts from the bottom edge. The only ambient shadow in the system.
- **Nav hairline** (`box-shadow: 0 -1px 0 rgb(21 23 26 / 0.08)`): the tab bar's rule, kept as a token for the island; the bar itself draws a `line` border.
- **Note lift** (`box-shadow: 0 4px 16px rgb(0 0 0 / 0.14)`): the info tip's note, a small card that floats over the page from a circled "i". A lifted surface, like the sheet; not available to anything resting on the page.

### Named Rules

**The Only a Lifted Sheet Casts a Shadow Rule.** Nothing at rest on the page has a shadow, a gradient, a blur or a glass effect. A surface earns a shadow only by lifting off the sheet (the bottom sheet, the info note), and loses it in forced-colors mode.

## Shapes

Nearly square. Controls, badges, fields, cells, highlighter marks and skeleton rows round at 4px (`control`); a pinned panel and a floating note at 6px (`card`); only the bottom sheet rounds its top corners, at 14px (`sheet`). Circles are reserved for what is round by nature: the switch track and knob, the circled "i", the sheet's drag handle. Rules are 1px hairlines in `line`; boundaries that must read as edges (fields, secondary buttons, struck cells) use `line-strong`. A proposal's cell is dashed (`border-dashed` in `line`); a skipped item is struck through; a done cell is filled with ink. Tabs are underlined by a 3px highlighter bar, not boxed. The highlighter over a word (`highlight` utility) is a yellow field with square-ish 4px ends.

## Components

### Buttons

Four pens for four kinds of action. Every size clears 44px; only padding and label size change (sm: 2.75rem, 0.5rem 0.75rem, small text; md: 2.75rem, 0.5rem 1rem; lg: 3rem, 0.75rem 1rem). Labels are medium weight, centred, wrapping rather than truncating.

- **Shape:** nearly square (4px).
- **Primary:** the highlighter: `highlight` with `on-highlight` text inside a `highlight-strong` hairline; pressed goes `highlight-strong`. One per screen; on Today it is the full-width "Start workout" bar above the tab bar.
- **Secondary:** ruled: `surface` with ink text inside a `line-strong` hairline; hover and pressed wash to `surface-raised`.
- **Ghost:** a tappable word in pen; hover `pen-strong`, pressed washes `surface-raised`.
- **Danger:** the red pen, outlined in `danger` so colour is never the only signal.
- **Feedback:** background, colour, border and transform transition in 120ms ease-out; pressed scales to 0.98; disabled sits at 45% opacity.

### Badges

A small ruled label, not a pill: 0.75rem medium text inside a 1px hairline at 4px. Neutral is `line-strong` and `ink-muted`; accent is the pen outlined in pen; success, warning and danger outline in their own pen; highlight is the one filled badge (`highlight` on `highlight-strong`), for the one thing on the screen that is current.

### Blocks, Rows and Panels

- **Block (`box`):** a `section` ruled above and below in `line`, open at the sides, 1rem vertical padding, 0.75rem between its children. The grouping for a summary, a decision or a form section.
- **List (`box-rows`, `ruled-list`):** rows ruled from each other by one hairline; `plain` drops the outer rules inside a block, disclosure or sheet.
- **Row:** 3.5rem minimum, 0.75rem vertical padding, no horizontal padding (text flush with the rules), title at medium weight with a small muted subtitle, meta in tabular small text and a `ChevronRight` in `ink-subtle` at the trailing edge. A pressable row washes `surface-raised` on press and draws its focus ring inset by 2px because an outset ring has nowhere to go. A row into a detail carries the `nav-forward` transition.
- **Panel (`panel`):** the one opaque container: `surface` inside a `line` hairline at 6px. For a thing that must stand off the page (a proposal, a form, the session in progress, a shortcut tile). Never nested, never the page's default container.
- **Superset row:** a 1px rule down the left in the group's pen (`--superset-color`), with the margin number in the same pen; nothing washed behind the row.
- **Disclosure:** a native `details` in three cuts (its own ruled block, an inline ruled row, or a block's footer row) whose chevron rotates 180° in 120ms.

### Inputs / Fields

- **Style:** a cell on the sheet: 2.75rem tall, `surface` inside a `line-strong` hairline at 4px, 0.75rem horizontal padding, text at 16px minimum, placeholder in pencil.
- **Focus:** the border and a 1px ring turn to pen; the global focus ring elsewhere is a 2px `focus` outline offset 2px.
- **Error / Disabled:** `aria-invalid` turns the border `danger`; disabled sits at 50% opacity.
- **Number field:** label in `ink-subtle` small caps-free text above a two-row cell: the value centred in the data voice at 1.25rem semibold over minus and plus steppers (2.75rem, ruled off above and between). The pencil prefill is the placeholder.
- **Set cell (logger):** 3rem tall, centred, data voice at 1.125rem semibold; what the coach proposes sits in it as a pencil placeholder, what the athlete types is ink.
- **Segmented control:** a radio group on a `surface-raised` track inside a `line` hairline with 0.25rem padding; each cell 2.5rem minimum, small medium text in `ink-muted`; the chosen cell is inked in (`ink` background, `canvas` text). Never the highlighter. Segmented links are the same shape for navigation.
- **Switch:** a 44px square target holding a 3rem by 1.75rem round track; on is the highlighter with an ink knob, off is `surface-raised` inside `line-strong` with a white knob.
- **Tabs (in-page):** equal-width cells wrapping on one `line` rule; the current tab is underlined by a 3px `highlight` bar and set in ink, the rest in `ink-muted`.

### Navigation

- **Tab bar:** five tabs along the bottom edge in a 3.75rem bar on the canvas, ruled off above, padded to the home indicator. A tab is a column of icon (1.5rem, Phosphor regular) and label (clamp 0.6875rem to 0.75rem, 500) in `ink-muted`; the current (or pending) tab is filled with the highlighter around icon and label together, at 4px. A press scales the tab to 0.96 and washes a non-active tab `surface-raised`; colour transitions in 120ms. The tab link carries `nav-tab`, which crosses to the next sheet.
- **Desktop rail (64rem+):** the same tabs as 2.75rem rows (icon left, small label) down a 13rem rail on the left, ruled off on its right.
- **Page header:** sticky, on the canvas, ruled off below; title at headline size, meta in the data voice; nested screens put the back link (chevron and section name in pen) first and the title centred.
- **Route transitions:** a tab change cross-fades (110ms out, 180ms in); a row into a detail slides the next sheet in from the right (40px, 240ms) while the old slides 24px left; a back link reverses it; anything untyped swaps at once. Fixed chrome never takes part. Reduced motion disables all of it.

### Bottom Sheet

A native `dialog` pinned to the bottom edge at up to 32rem wide and 94% of the visual viewport tall. The panel is `surface` with a `line` rule and 14px top corners, padded by `panel-padding` and the safe area, with a 2.25rem by 0.25rem `line-strong` drag handle, a title at title size with a 44px close button, a scrolling body and an optional ruled footer kept in view. It rises 1.5rem on a 240ms spring (`cubic-bezier(0.32, 0.72, 0, 1)`) from 40% opacity and casts the sheet lift shadow over a dimmed backdrop; reduced motion zeroes the duration so it simply appears.

### Cells

The number in the margin, drawn like a day in the cycle strip: a 2.25rem square (2.75rem tall in the strip) at 4px in the data voice, semibold, tabular. Outlined in `line` with `ink-muted` while still to come; under the highlighter (with a `highlight-strong` border) when current; inked in (`ink` fill, `canvas` text) once done; `line-strong` outline, `ink-subtle` and struck through when skipped; dashed in `line` with pencil text when not in the programme.

### Coach Line and Pencil

A line in the coach's hand is small text in pen with a `Pencil` glyph beside it; the athlete's own ask is the same in pen with a `ChatText` glyph. A proposal that changes a value prints the old value struck through in the data voice and the new value semibold in ink; an added row is set in pen; a removed row is struck through. The `pencil` utility sets a proposed value in `ink-ghost`, regular weight, with a dotted 1px underline in `line-strong` offset 0.18em.

### The Periodisation Chart (signature)

An SVG drawn from data at runtime, 190px tall at full width, never a grid of small charts. The cycles are banded across the span (`surface-raised` alternating with transparent); the current cycle's band is `highlight-soft` and its number along the foot sits on its own highlighter cell. Each week's working sets are a stepped bar in ink, the running week hatched in ink over canvas. The plan is a pencil step (`ink-ghost`, 1.5px, dashed 2 3) that enters at the first day and leaves at the last. Today is a 1.5px pen line down the sheet. Ticks are dotted hairlines (1 3) in `line` with the baseline and axis solid; labels are 12px in the data voice, `ink-subtle`. A legend of three swatches sits beneath, and the full table of values is rendered for screen readers. Nothing moves; the chart is read, not watched. Other charts take the same conventions: series 1 is ink, series 2 pen, bars for magnitudes from zero, lines for measurements over time, every series labelled.

### Icons

Phosphor regular, one stroke weight, every glyph exported from one module. Sizes follow the text: 1.25rem in a control, 1.375rem leading a row, 1.5rem in the tab bar, 1.75rem in an empty state's ruled cell. Icons are never the only label.

### Empty State, Skeleton, Progress

An empty region shows the feature icon in a 3rem ruled cell (`line-strong`, `surface`), a title at title size and small muted text, with the way out beneath; the screen's one highlighter stays with the action that fills it. Skeleton rows are a `surface-raised` wash at 4px that breathes (opacity to 0.55 over 1.4s), never a spinner in the middle of content. The progress bar is a 0.375rem `surface-raised` track with a pen fill scaled from the left in 240ms. The route progress line is 2px of `highlight-strong` under the status bar. The rest timer counts down in the measure voice with a 2px highlighter bar draining above it, and the figure takes the highlighter when it reaches zero.

## Do's and Don'ts

### Do:

- **Do** use exactly one primary (highlighter) button per screen, placed within thumb reach; lists of similar choices are never rows of primaries.
- **Do** set every number in the data voice (Barlow Semi Condensed, tabular) and keep the body at `tabular-nums`.
- **Do** group with rules: `box`, `box-rows`, `ruled-list`, `rule-top`, `rule-bottom`; reach for `panel` only when a thing must stand off the page, and never put one inside another.
- **Do** consume tokens only, through the Tailwind names mapped in globals.css; charts use `series-*`, `volume-*`, `group-*`.
- **Do** keep targets at 44px (56px rows), show a visible focus ring in pen, wrap text at 200% zoom, and pair every colour with a border, a weight or a word.
- **Do** make every surface right on both the daylight and graphite sheets before calling it done.
- **Do** give every link its transition type (`nav-tab`, `nav-forward`, `nav-back`) and animate only transform, opacity and colour, from an already visible state, in 120 to 240ms ease-out.
- **Do** hold a single still under `prefers-reduced-motion`; the tokens already zero the durations.

### Don't:

- **Don't** use the highlighter for anything but today, the current step and the one primary action; a chosen segment is inked in and a marked picker row takes `highlight-soft` with a pen check.
- **Don't** draw cards: no large radii, no resting shadows, no gradients, glass or blur; only a lifting sheet or note casts a shadow.
- **Don't** set pen blue on anything that is neither the coach's hand nor tappable, and don't make a tappable word grey.
- **Don't** confirm a proposal visually before the athlete does: a prefill stays in pencil until it is inked over.
- **Don't** write a raw hex in a component, import an icon from anywhere but `icons.tsx`, or use a second icon weight.
- **Don't** animate on page load, add a second page-level view transition, or move anything in a chart.
- **Don't** show a grid of small charts; one plot owns its screen at full width.
