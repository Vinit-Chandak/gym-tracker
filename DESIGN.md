---
name: Overload — Stack
description: A bright, sporty training tracker — a cool mist canvas with white cards, one colour per sport, and the one number or name that matters set large in a condensed display face.
colors:
  canvas: "#e7eaf0"
  surface: "#ffffff"
  surface-raised: "#f0f2f6"
  surface-selected: "#ffffff"
  line: "#e2e5eb"
  line-strong: "#8e94a3"
  ink: "#141824"
  ink-muted: "#555c6e"
  ink-subtle: "#5f6677"
  ink-ghost: "#8d93a2"
  accent: "#2f4cf2"
  accent-strong: "#2238c9"
  accent-soft: "#e3e8ff"
  on-accent: "#ffffff"
  success: "#0f7539"
  warning: "#9a4f00"
  danger: "#c42431"
  over: "#c42431"
  focus: "#2f4cf2"
  lift: "#2f4cf2"
  on-lift: "#ffffff"
  lift-soft: "#e3e8ff"
  lift-ink: "#2940d8"
  run: "#ff6a33"
  on-run: "#141824"
  run-soft: "#ffe6da"
  run-ink: "#b53a0a"
  ride: "#6647f0"
  on-ride: "#ffffff"
  ride-soft: "#ece7ff"
  ride-ink: "#5537d9"
  swim: "#16b3c7"
  on-swim: "#141824"
  swim-soft: "#d9f3f6"
  swim-ink: "#0a6e7c"
  food: "#ffc53d"
  on-food: "#141824"
  food-soft: "#fff1cc"
  food-ink: "#7f5700"
  rose: "#f2638c"
  on-rose: "#141824"
  rose-soft: "#ffe3eb"
  rose-ink: "#b22a55"
  nav-island: "rgb(255 255 255 / 0.9)"
  canvas-dark: "#0b0d12"
  surface-dark: "#1a1d26"
  surface-raised-dark: "#252a36"
  surface-selected-dark: "#3a4152"
  line-dark: "#2c313d"
  line-strong-dark: "#737a8a"
  ink-dark: "#f2f4f8"
  ink-muted-dark: "#a9afbd"
  ink-subtle-dark: "#9aa0af"
  ink-ghost-dark: "#737a8a"
  accent-dark: "#8b9dff"
  accent-strong-dark: "#a7b5ff"
  accent-soft-dark: "#1f2856"
  on-accent-dark: "#0b0d12"
  success-dark: "#45cf88"
  warning-dark: "#f2a93b"
  danger-dark: "#ff6b70"
  lift-dark: "#3651f0"
  run-dark: "#ff7a45"
  ride-dark: "#6647f0"
  swim-dark: "#22c3d8"
  food-dark: "#ffc53d"
  rose-dark: "#ff7aa0"
  nav-island-dark: "rgb(26 29 38 / 0.9)"
typography:
  display:
    fontFamily: '"Big Shoulders", "Avenir Next Condensed", "Roboto Condensed", "Arial Narrow", sans-serif'
    fontWeight: 800
    lineHeight: 0.95
    use: "The one figure or name that leads a screen: today's day, the kcal left, a set's load and reps."
  display-xl:
    fontSize: "5rem"
  display-l:
    fontSize: "3.25rem"
  display-m:
    fontSize: "2.25rem"
  display-s:
    fontSize: "1.625rem"
  title:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
  small:
    fontSize: "0.875rem"
    lineHeight: 1.45
  label:
    fontSize: "0.8125rem"
    fontWeight: 600
  input:
    fontSize: "max(1rem, 16px)"
  figures:
    fontFeature: '"tnum" 1'
rounded:
  hero: "1.75rem"
  card: "1.375rem"
  tile: "1.125rem"
  control: "0.875rem"
  chip: "999px"
  sheet: "1.75rem"
  island: "2.125rem"
spacing:
  space-1: "0.25rem"
  space-2: "0.5rem"
  space-3: "0.75rem"
  space-4: "1rem"
  space-5: "1.25rem"
  space-6: "1.5rem"
  space-7: "2rem"
  page-gutter: "1rem"
  panel-padding: "1.25rem"
  section-gap: "1.25rem"
  control-height: "3rem"
  nav-height: "4.25rem"
  content-max: "32rem"
components:
  hero-card:
    backgroundColor: "the sport's fill: {colors.lift}, {colors.run}, {colors.ride}, {colors.swim}, {colors.food} or {colors.rose}"
    textColor: "the fill's own ink: {colors.on-lift} and so on"
    rounded: "{rounded.hero}"
    padding: "1.25rem"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.chip}"
    height: "{spacing.control-height}"
  button-primary-toned:
    backgroundColor: "the sport's fill"
    textColor: "the fill's own ink"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.chip}"
  button-secondary-toned:
    backgroundColor: "the sport's soft wash, e.g. {colors.run-soft}"
    textColor: "the sport's ink, e.g. {colors.run-ink}"
  button-ghost:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.chip}"
  button-danger:
    textColor: "{colors.danger}"
    border: "1px solid {colors.danger}"
    rounded: "{rounded.chip}"
  box:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "{spacing.panel-padding}"
  input:
    backgroundColor: "{colors.surface}"
    border: "1px solid {colors.line-strong}"
    textColor: "{colors.ink}"
    typography: "{typography.input}"
    rounded: "{rounded.control}"
    height: "{spacing.control-height}"
  set-well:
    backgroundColor: "{colors.surface-raised}"
    typography: "{typography.display} at 1.625rem"
    rounded: "{rounded.control}"
    height: "3rem"
  sheet:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.sheet} {rounded.sheet} 0 0"
    padding: "{spacing.panel-padding}"
  nav-island:
    backgroundColor: "{colors.nav-island}"
    rounded: "{rounded.island}"
    height: "{spacing.nav-height}"
  nav-tab-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.chip}"
  badge:
    typography: "{typography.label} at 0.75rem"
    rounded: "{rounded.chip}"
    padding: "0.25rem 0.625rem"
---

<!-- The runtime source of truth is src/styles/stack/foundation.css (scale, motion, mode selection) and stack.css (palette), mapped to Tailwind in src/app/globals.css. Change a value there and here together. Decided in docs/redesign-2026/README.md. -->

# Design System: Overload — Stack

## Overview

Overload is used between sets, on a phone, with a pulse of 150. Stack is built for that
glance: one bright card per screen says what the screen is about, in the colour of the sport
it belongs to, with its one number or name set large enough to read at arm's length. Everything
around it is quiet: white cards on a cool mist canvas, sentence-case labels, and explanations
kept behind a small ⓘ rather than written across the screen.

Three ideas carry the whole system:

1. **Colour means sport.** Lifting is cobalt, running tangerine, cycling violet, swimming aqua,
   food sunflower and recovery rose. Nothing else on screen is coloured, so a colour always
   says which sport it is about. Charts, chips, tiles and buttons all follow it.
2. **One hero per screen.** The thing the screen is for is a filled card in its sport's colour
   (today's session, the next exercise, the set being logged, the kcal left). Everything else is
   a white card, a row or a pill.
3. **Numbers are the interface.** The figure that matters is set in Big Shoulders, a condensed
   display face, at 36 to 80 px. Everything else is the phone's own UI font.

## Colors

### Neutrals

Mist canvas `#e7eaf0` with white cards `#ffffff` in light; night `#0b0d12` with slate cards
`#1a1d26` in dark. Controls sit on `surface-raised` (`#f0f2f6` / `#252a36`). The chosen segment in a
pill track is `surface-selected`, which lifts off the track in both modes. Ink is `#141824` /
`#f2f4f8`, never pure black or white on the canvas.

### Sports

| Sport    | Fill           | Ink on fill | Soft wash           | Text on white      |
| -------- | -------------- | ----------- | ------------------- | ------------------ |
| Lifting  | `lift` #2f4cf2 | white       | `lift-soft` #e3e8ff | `lift-ink` #2940d8 |
| Running  | `run` #ff6a33  | ink         | `run-soft` #ffe6da  | `run-ink` #b53a0a  |
| Cycling  | `ride` #6647f0 | white       | `ride-soft` #ece7ff | `ride-ink` #5537d9 |
| Swimming | `swim` #16b3c7 | ink         | `swim-soft` #d9f3f6 | `swim-ink` #0a6e7c |
| Food     | `food` #ffc53d | ink         | `food-soft` #fff1cc | `food-ink` #7f5700 |
| Recovery | `rose` #f2638c | ink         | `rose-soft` #ffe3eb | `rose-ink` #b22a55 |

`src/lib/sport-tone.ts` maps each sport to its tone and gives the class pairs (`TONE_FILL`,
`TONE_SOFT`). The chart series follow the same order: series 1 is lifting, 2 running, 3 cycling,
4 swimming.

### Status

`success`, `warning` and `danger` are for state only (saved, behind, over, delete), usually as a
badge wash with its ink. `accent` is cobalt, the same as lifting in light and a lighter periwinkle
in dark so it can be read as text.

### Named Rules

- **A colour is a sport.** Do not use a sport's colour for anything that is not about that sport.
  Food's macronutrients are all `food-ink`, not three hues.
- **Every pair is measured.** Text pairs meet 4.5:1 (3:1 for display sizes), in both modes,
  including translucent text on every hero fill.

## Typography

- **Display (Big Shoulders 800, 0.95 line height):** the one name or figure that leads a screen.
  `display-xl` (5rem, never wider than 21vw) for the kcal left; `display-l` 3.25rem for today's
  day and the exercise being logged; `display-m` 2.25rem for page titles, secondary heroes and
  tile figures; `display-s` 1.625rem for previous sets. Set-row numbers use it at 1.625rem.
- **Everything else is the system UI font:** `headline` 1.0625rem semibold for card and row
  titles, body 1rem regular, `callout` 0.9375rem for the line under a hero's name, small
  0.875rem, labels 0.8125rem semibold. Figures use tabular numerals.

### Named Rules

- **Sentence case, no eyebrows.** No ALL-CAPS labels, no tracked-out captions above headings.
- **Two weights in body text:** regular and semibold. Nothing is set in medium.
- **Commas, not middle dots.** A meta line reads as a phrase ("Cycle 1 of 8, day 3"; "4 exercises,
  11 sets"), not as "A · B · C".

## Layout

Phone first: a 1rem gutter, cards 1.25rem inside, 1.25rem between sections, a 32rem column on wider
screens. A top-level screen opens with its name in the display face and its qualifying fact (the
date, the range) small above it. A screen one level down has a compact bar with the way back named,
its title, and the title's qualifying fact under it.

The floating tab bar is a white capsule 4.25rem tall; the active tab is an ink pill.

## Elevation & Depth

Flat. Cards are separated from the canvas by colour alone, with no border and no shadow. The only
shadows are on things that float: the tab bar, the gym pill, the chosen segment, the rest-timer
pill, and sheets.

## Shapes

Radius follows hierarchy rather than one value everywhere: hero 1.75rem, card 1.375rem, tile
1.125rem, control 0.875rem, chip fully round. Buttons and tabs are pills. Sheets rise with 1.75rem
top corners.

## Components

### Hero card (signature)

`HeroCard` (`src/components/ui/hero-card.tsx`) takes a `tone`. Inside it the palette is re-pointed
(`.hero-card` in globals.css): ink, muted text, lines, badges and buttons take the fill's own ink,
so a primary button becomes the fill's opposite (white on cobalt with cobalt text; ink on sunflower
with sunflower text) and a secondary button a translucent wash. Notes and sheets that open from
inside a hero are drawn in page colours again. One hero per screen.

### Buttons

Pills, 44 to 56px tall, semibold labels. `primary` is cobalt; with a `tone` it takes that sport's
fill. `secondary` is a raised grey pill; with a `tone` it takes the sport's soft wash and ink (Log
it on a run). `ghost` is text only; `danger` is outlined.

### Sport chip and tiles

`SportChip` is the sport's figure on its soft wash, 36 or 44px, before any word. Sport tiles (Log an
activity, Training totals) are the sport's fill or soft wash with the figure in the display face.

### Cards and rows

White `box` cards; rows inside them are separated by a hairline and lead with a 36px icon chip
(`RowIcon`). A disclosure is its own card whose summary row opens it in place.

### Inputs

1px `line-strong` border on white, 0.875rem corners, a 2px accent ring on focus, 16px text so iOS
never zooms.

### Set row (signature)

Set number in a round chip; load, reps (or seconds or metres) and effort as big display-face
numbers in raised wells; a round 56px check to save (44px on a 320px phone). Suggestions are the
placeholder, lighter and fainter than anything typed. A row that has been typed into fills its
check cobalt to ask to be saved. Under the set being done, one-tap efforts (RIR 0 to 4, or RPE 6
to 10) save it as suggested with the effort tapped: effort is always the athlete's, never copied.
A saved set tints the row `lift-soft`, drops the wells and fills its check with a short pop (none
under reduced motion). Complete stays secondary until the sets asked for are saved.

### Supersets

Named by letter, as a gym writes them: A1, A2, then B1, B2, in the number chip. The group is a
neutral bracket (an ink bar and a raised wash), never a colour, because colour means a sport.

### Navigation

Floating capsule with five tabs; the active tab is an ink pill with its label. At large text
sizes the capsule grows with the text and a label wraps rather than being cut. The session in
progress and the rest timer are floating pills above it.

### Sheet

Bottom sheet on the native `<dialog>`, rising on the drawer curve with a grabber and a round close
button.

## Do's and Don'ts

### Do:

- Give each screen one hero in its sport's colour and let everything else be white and quiet.
- Lead with the number that answers the screen's question, in the display face.
- Put explanations behind an ⓘ tip beside the thing they explain.
- Keep every target at least 44px, and keep the numbers in line.

### Don't:

- Don't colour anything that is not about a sport or a state.
- Don't write ALL-CAPS eyebrows, "A · B · C" meta strings or medium-weight text.
- Don't put a border or a shadow on a card that does not float.
- Don't add a second hero, or a paragraph of help text, to a screen.
