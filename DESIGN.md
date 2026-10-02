---
name: Overload
description: "Form v2, the art is your training: a black-and-white phone interface whose only colour is prints drawn from what the athlete logged."
colors:
  ground: "#ffffff"
  surface: "#f4f4f5"
  surface-2: "#e9e9ec"
  ink: "#16171b"
  ink-2: "#5b5d64"
  control: "#85878e"
  hair: "#e6e6e9"
  on-ink: "#ffffff"
  on-ink-2: "#b4b6bd"
  scrim: "rgba(22, 23, 27, 0.42)"
  ground-dark: "#111214"
  surface-dark: "#1b1c20"
  surface-2-dark: "#26272c"
  ink-dark: "#edeef0"
  ink-2-dark: "#a3a6ae"
  control-dark: "#73767e"
  hair-dark: "#26272c"
  on-ink-dark: "#111214"
  on-ink-2-dark: "#4c4f57"
  scrim-dark: "rgba(0, 0, 0, 0.6)"
  ultra: "#2b40c8"
  on-ultra: "#ffffff"
  on-ultra-2: "#dde1fb"
  ultra-t: "#9aaaf0"
  ultra-t-dark: "#27317a"
  print-paper: "#f2eee5"
  print-ink: "#16171b"
  print-label: "#615c50"
  print-dot: "#cfc9bc"
  print-paper-dark: "#23211d"
  print-ink-dark: "#ece7dc"
  print-label-dark: "#b4ad9f"
  print-dot-dark: "#4a463e"
  print-strength: "#2b40c8"
  print-run: "#e5432a"
  print-ride: "#6b48c0"
  print-swim: "#1d7a62"
  print-mobility: "#c8487a"
  print-food: "#f2b12a"
  print-play: "#8a5a2b"
  print-strength-todo: "#9aaaf0"
  print-run-todo: "#f6a08a"
  print-ride-todo: "#bfb1ff"
  print-swim-todo: "#7cd1b6"
  print-mobility-todo: "#f89fbb"
  print-food-todo: "#e3b667"
  print-play-todo: "#d9b48c"
  print-ochre: "#c98712"
  print-straw: "#f7d47e"
  on-food: "#16171b"
  print-strength-dark: "#8796f5"
  print-run-dark: "#f2704f"
  print-ride-dark: "#a08cf0"
  print-swim-dark: "#45b593"
  print-mobility-dark: "#e07aa3"
  print-food-dark: "#f2b12a"
  print-play-dark: "#c4925e"
  print-strength-todo-dark: "#555c89"
  print-run-todo-dark: "#8b4936"
  print-ride-todo-dark: "#625787"
  print-swim-todo-dark: "#346b58"
  print-mobility-todo-dark: "#824e60"
  print-food-todo-dark: "#8b6924"
  print-play-todo-dark: "#745a3e"
typography:
  figure-xl:
    fontFamily: "'Jost', system-ui, sans-serif"
    fontSize: "64px"
    fontWeight: 600
    lineHeight: 1
    fontFeature: '"tnum" 1, "lnum" 1'
  display:
    fontFamily: "'Jost', system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.012em"
  entry:
    fontFamily: "'Jost', system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 1.15
    fontFeature: '"tnum" 1, "lnum" 1'
  figure:
    fontFamily: "'Jost', system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1
    fontFeature: '"tnum" 1, "lnum" 1'
  heading:
    fontFamily: "'Atkinson Hyperlegible Next', system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "'Atkinson Hyperlegible Next', system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.45
  caption:
    fontFamily: "'Atkinson Hyperlegible Next', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.4
  button:
    fontFamily: "'Atkinson Hyperlegible Next', system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1
  tab:
    fontFamily: "'Atkinson Hyperlegible Next', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.2
  print-label:
    fontFamily: "'Atkinson Hyperlegible Next', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1
rounded:
  prints: "0px"
  set-tiles: "4px"
  segments: "10px"
  buttons: "14px"
  steppers: "18px"
spacing:
  space-4: "4px"
  space-8: "8px"
  space-12: "12px"
  space-16: "16px"
  space-20: "20px"
  space-24: "24px"
  space-32: "32px"
  space-48: "48px"
  gutter: "20px"
  gutter-narrow: "16px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.buttons}"
    padding: "0 20px"
    height: "56px"
  button-tonal:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.buttons}"
    padding: "0 20px"
    height: "56px"
  button-waiting:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-2}"
    typography: "{typography.button}"
    rounded: "{rounded.buttons}"
    padding: "0 20px"
    height: "56px"
  button-outline:
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.buttons}"
    padding: "0 20px"
    height: "48px"
  set-tile-saved:
    backgroundColor: "{colors.ultra}"
    textColor: "{colors.on-ultra}"
    typography: "{typography.figure}"
    rounded: "{rounded.set-tiles}"
    padding: "8px 10px 9px"
    height: "78px"
  set-tile-current:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.set-tiles}"
    padding: "6px 8px 7px"
    height: "78px"
  set-tile-todo:
    backgroundColor: "{colors.ultra-t}"
    textColor: "{colors.ink}"
    rounded: "{rounded.set-tiles}"
    padding: "8px 10px 9px"
    height: "78px"
  set-tile-warm-up:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.set-tiles}"
    padding: "8px 10px 9px"
    height: "78px"
  stepper:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.entry}"
    rounded: "{rounded.steppers}"
    padding: "9px 6px 8px"
  stepper-suggested:
    textColor: "{colors.ink-2}"
    typography: "{typography.entry}"
  stepper-button:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "12px"
    size: "44px"
  rir-tray:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.buttons}"
    padding: "4px"
  rir-segment:
    textColor: "{colors.ink}"
    rounded: "{rounded.segments}"
    height: "48px"
  rir-segment-chosen:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.segments}"
    height: "48px"
  coach-note:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.buttons}"
    padding: "12px 14px"
  field:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.buttons}"
    padding: "0 16px"
    height: "52px"
  tab-bar:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink-2}"
    typography: "{typography.tab}"
    height: "74px"
  tab-bar-active:
    textColor: "{colors.ink}"
    typography: "{typography.tab}"
  session-strip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "16px"
    padding: "0 6px 0 16px"
    height: "56px"
---

# Design System: Overload

## Overview

**Creative North Star: "The art is your training"**

Overload is a black-and-white instrument that stays out of the way between sets: ink on white,
light ink on near-black in dark, two typefaces, flat surfaces and hairlines. The only colour is
the art. Prints are generative, Bauhaus-like compositions drawn from what the athlete has logged
and nothing else, so the art is the record and the reward at once. A day's print says what is
owed and fills with ink as it is done; a quarter's print is the season's training.

The prints have a grammar. Each family of sport is one shape in one pigment: a slab for load, a
disc on foot, a dome on wheels, a wave in water, a quarter disc for practice, a bowl for food
and a triangle, reserved, for play. Context, structure and size mean the same on every shape,
and state is thinned, full or dashed. The grammar grows with the app: a sport the app does not
know yet gets its family's plain shape and its own name, so anything logged can be printed on
day one. Nothing is drawn as a sequence: the parts of a day, the exercises of a workout and the
meals are rows taken in any order.

Motion is ink, not decoration: a press answers a touch, pigment rolls into a shape when
something is done, words swap in place, sheets follow the finger. With reduced motion nothing
moves; state changes cross-fade in 150 ms.

**Status.** The direction was chosen on the Claude Design canvas (Form page, Version 8,
1 October 2026) and is being refined; nothing in the application is built yet. Its boards,
generated tokens, screenshots and the generator they come from are in
[`docs/ui-redesign/revamp/form-v2/`](docs/ui-redesign/revamp/form-v2/README.md). This file is
normative: change the generator's tokens and this frontmatter together. Screens not yet rebuilt
keep Form's tokens and limits.

**Key Characteristics:**

- A black-and-white interface; colour only ever means a family of sport.
- Prints drawn from real records, with one grammar for every sport, today's and those to come.
- Jost for titles and figures, Atkinson Hyperlegible Next for everything read.
- Flat: hairlines and tonal surfaces, one shadow, sheets over a scrim.
- Every screen laid out from the device: figures fit rather than truncate, detail folds on short
  screens, and nothing a thumb needs is pushed off the screen.

## Colors

Ink and white for the interface; seven artist's pigments, on warm paper, for the art.

### Primary

- **Press Ink** (`ink`; `ink-dark` in dark): all text, the primary button, the chosen RIR
  segment, the current set's outline, the focus ring. On ink, text is **On-ink** white.

### Secondary

- **Ultramarine** (`ultra`, the same in both themes): a set that is done. Saved set tiles and
  records are inked in it, with `on-ultra` figures and `on-ultra-2` labels. Thinned
  (`ultra-t`; `ultra-t-dark`), it is a set still to do.

### Tertiary

The print pigments, one per family, each in full (done) and thinned (to do) strengths, with
lighter pigments for dark paper:

- **Ultramarine** (`print-strength`): load (lifting, machines, bodyweight).
- **Vermilion** (`print-run`): on foot (running; walking, hiking).
- **Violet** (`print-ride`): on wheels (cycling, spin).
- **Viridian** (`print-swim`): in water (swimming; rowing, paddling).
- **Rose** (`print-mobility`): practice (mobility, warm-ups; yoga).
- **Cadmium** (`print-food`): food, always on paper, its meals layered from **Ochre**
  (`print-ochre`) to **Straw** (`print-straw`); text on it is `on-food`.
- **Umber** (`print-play`): play, reserved (climbing, racket sports).

In the interface, a sport's mark (the small form beside its name) takes the same pigment.

### Neutral

- **Ground** (`ground`): the page. **Surface** (`surface`): coach notes, steppers, the RIR
  tray, tonal buttons. **Surface 2** (`surface-2`): warm-up tiles.
- **Ink 2** (`ink-2`): secondary text, suggested values, the unchosen tab.
- **Control** (`control`): outlines of fields and outline buttons.
- **Hair** (`hair`): row rules and the tab bar's top edge.
- **On-ink 2** (`on-ink-2`): secondary text on ink (the session strip's gym line).
- **Print Paper** (`print-paper`; `print-paper-dark`), **Print Ink**, **Print Label** and
  **Print Dot**: the ground, figures, labels and dot grid of every print. The paper has a grain:
  multiply at 6% in light, screen at 4.5% in dark.
- **Scrim** (`scrim`; `scrim-dark`): under every sheet.

### Named Rules

**The Black-and-White Rule.** The interface is ink on ground. Colour appears only in prints
(the app's mark is one) and in sport marks, and each pigment means one family of sport. A
pigment never marks status, an error, a link, emphasis or decoration: warnings and failures are
drawn in ink.

**The Thinned, Full, Dashed Rule.** Thinned pigment (the `-todo` tints; on dark paper, a 50%
mix into the paper) is to do; full pigment is done; a dashed edge is skipped. Dashed means
skipped and nothing else.

**The Quiet Dark Rule.** In dark, prints are pulled on near-black paper with lighter pigments
and light ink, so the art is never the brightest thing on the screen. System, Light and Dark
all take the same tokens; dark swaps every token that has a `-dark` value to it, and the rest
(ultramarine on a saved set, cadmium) stay as they are.

## Typography

**Display Font:** Jost (with system-ui, sans-serif)
**Body Font:** Atkinson Hyperlegible Next (with system-ui, sans-serif)
**Figures:** Jost, tabular lining figures

**Character:** Jost is a geometric sans in the line of the 1920s German sans-serifs; its
circles and slabs rhyme with the prints and its plain zero is narrower than its O. Atkinson
Hyperlegible Next was drawn for low-vision readers; it carries every word the athlete reads,
the coach included. Both are under the SIL Open Font License, so they can be embedded in the
native apps.

### Hierarchy

- **Figure XL** (600, 64 px, 1): the one big number on a print or a summary, such as calories left.
- **Display** (700, 40 px, 1.05, −0.012em): screen titles, 34 px under 360 pt wide; exercise
  titles at 36, 32 on short screens, 28 on narrow ones. A long name steps down 4 to stay on one
  line; longer still, it steps down 6 (never below 26) and wraps.
- **Entry** (600, 40 px, 1.15; 46 on tall screens): load and reps in the steppers, stepping
  down until it fits, never below 26 px stacked or 30 px side by side.
- **Figure** (600, 20 to 30 px, 1): rest, set tiles (18 to 28), RIR digits (22), totals.
- **Heading** (700, 17 px, 1.3): "Set 3 · Working", sheet titles, a note's title.
- **Body** (500, 16 px, 1.45): coach text and everything read; two lines inline at most.
- **Caption** (500 to 700, 13 to 15 px): meta lines, labels over controls, "Rest", tab labels
  (13, or 12 under 360 pt wide; 700 where you are).
- **Print label** (700, 12 px; values at 500 in print label colour): names on prints.

### Named Rules

**The Two Voices Rule.** Jost for titles and figures only; Atkinson Hyperlegible Next for every
word read. A number inside a sentence stays in Atkinson, with its slashed zero; a range inside
a Jost figure takes Atkinson's en dash, because Jost's is as long as an em dash.

**The Figures Never Truncate Rule.** A figure steps down until it fits: never an ellipsis,
never a wrap. Fit is measured, not guessed: Jost 600's tabular digits are 0.614 em, its point
and comma 0.32 em. Load and reps share one size, and a row of set tiles shares one size.

**The 16 Px Floor Rule.** Nothing typed or entered is under 16 px, at any width.

## Layout

Every screen is laid out from its device rather than scaled from one size. Four were drawn:
402 × 874 and 440 × 956 with a home indicator (62 pt top, 34 pt bottom), and 375 × 667 and
320 × 568 without one (20 pt top). Gutters are `gutter-narrow` under 360 pt wide and `gutter`
otherwise; spacing steps through the `space-` scale.

- **Tab bar:** 4 pt, then 50 pt of targets, then 20 pt above a home indicator or 8 pt without
  one: 74 pt or 62 pt.
- **Heights:** short screens (under 800 pt) fold detail behind a tap: Today keeps its plan one
  tap away, and logging moves the last session into Why. Tiny screens (under 600 pt) draw
  Today's print 88 pt tall. Tall screens (860 pt and over) give the spare height to figures and
  controls: tiles 86 pt, RIR 52 pt, entry 46 px.
- **Logging:** the record (title, set tiles, the suggestion, rest) scrolls; the entry (set,
  steppers, RIR, Save) is docked above the tab bar, which stays. At 320 pt the whole screen
  scrolls and Save stays pinned. At 200% text, the entry comes first, under the title.
- **Set tiles:** one row. As many as fit at 74 pt share the width; past that the row scrolls
  sideways to the screen's edge, opened at the set you are on.
- **Steppers:** load and reps side by side only where both fit at 30 px or more (each box needs
  108 pt besides its figure); otherwise stacked, each the full width.
- **RIR:** seven segments in a row while each is at least 44 pt wide; four and three below that.
- **Prints:** each form keeps a slot of at least 40 px. When names no longer fit over their
  forms they share one label line; past what fits, the print shows `+N`. Shapes never overlap.
- **Lists:** rows separated by `hair` rules, never boxed in cards.

### Named Rules

**The Docked Entry Rule.** On logging, RIR and Save are always on the first screen. A long
exercise name, more sets or a wide figure scrolls the record, never the entry.

**The Fold, Never Shrink Rule.** When height runs out, detail folds behind a tap. Targets
(44 pt), entry text (16 px) and figures keep their size.

## Elevation & Depth

Flat. Depth comes from tone (ground, surface, surface 2) and from 1 px `hair` rules, not
shadows. The session strip is the only thing that floats, and only in light; in dark it sits
flat, ink on ground. Sheets rise over a scrim and sit above everything, Save included. Prints
are flat paper with a faint grain.

### Shadow Vocabulary

- **Floating** (`box-shadow: 0 10px 28px rgba(22, 23, 27, 0.2)`): the session strip, light only.

### Named Rules

**The One Shadow Rule.** One shadow in the whole system. Anything else that needs to stand out
does it with ink, tone or a scrim.

## Shapes

The interface is rounded by role: `set-tiles` (4 px), `segments` (10 px), `buttons` and coach
notes (14 px), `steppers` (18 px); the session strip is 16 px and the tag on a suggestion 8 px.
A control inside a tray takes the tray's radius minus its inset: RIR segments 10 in a 14 tray
with a 4 inset, stepper buttons 12 in an 18 box with a 6 inset. Prints are cut square.

The print forms are geometric primitives: slab, disc, dome, wave, quarter disc, bowl and
triangle. Context reads the same on every form: a bar under a mark is indoors (a treadmill, an
indoor ride, a pool); segments are its structure (sets, intervals, drills); size is time or
distance. Variants are one cut each: walking is a ring, hiking a notched disc, spin a dome with
its hub cut out, yoga a quarter disc with an arc drawn in, rowing one crest and an oar,
paddling a filled crest, climbing a stepped triangle, racket sports a triangle with its ball.

Icons sit on a 24-unit grid with a 2.0 stroke and round caps and joins. The five destination
icons are drawn from the print forms: outlined, filled where you are. The mark is a small
print, an ultramarine slab and a vermilion disc standing on an ink line; the wordmark sets it
beside "Overload" in display type. The app icon is the mark on print paper (light) or on ink
(dark), with corners of 22.5% of its size.

### Named Rules

**The Square Print Rule.** Prints have square corners (`prints`, 0 px); only the interface is
rounded.

**The One Cut Rule.** A sport is its family's shape with one change cut into the shape, never
into the ground under it. It must read at 12 px beside its name, and colour never carries it
alone.

## Components

Quiet, solid and thumb-sized. Every target is at least 44 pt, and every control answers a press.

### Buttons

- **Shape:** gently rounded (`buttons`, 14 px); 56 pt tall by default, 48 or 44 pt where
  space is short.
- **Primary:** ink with on-ink text (Start workout, Save set 3 · 62.5 kg × 3 @ 2).
- **Tonal:** surface with ink text (Log it, Retry). **Waiting:** tonal with ink 2 text, for a
  button that is waiting on something (Choose RIR to save).
- **Outline:** a 1.5 px `control` border (Finish). **Text:** ink, no fill (+30 s, Stop).
- **Press:** scale 0.97 in 120 ms, `cubic-bezier(0.23, 1, 0.32, 1)`; no scale with reduced
  motion.
- **Focus:** a 3 px ink outline at 2 px offset, ringed in ground so it shows on ink.

### Set tiles (signature)

- **Saved:** ultramarine, square-ish (`set-tiles`, 4 px), 78 pt tall (86 on tall screens):
  "Set 1", its load ("60") and "× 5 @ 2", the notation the targets use.
- **Current:** ground with a 2.5 px ink outline: "Set 3", "Now", its target.
- **To do:** thinned ultramarine with ink text. **Warm-up:** surface 2, "× 8" without RIR.
- **Saving, failed:** thinned with a turning arc and "Saving"; outlined in ink with a warning
  glyph and "Not saved", the message below and Retry.
- **A set is inked:** Save presses (120 ms), the tile's text clears (80 ms), ultramarine fills
  it from its bottom edge (420 ms, `cubic-bezier(0.65, 0, 0.35, 1)`), the next set takes the
  outline, the values go back to suggestions, RIR clears and rest restarts. With reduced motion
  the tile cross-fades in 150 ms.

### Steppers

- **Box:** surface, `steppers` (18 px), the label in caption ("Load · kg") over − value +.
- **Buttons:** 44 pt, ground, 12 px corners; load steps by the machine's real increment
  (2.5 kg, 5 lb), reps by 1.
- **Suggested until touched:** a value is ink 2 with a 2 px dotted underline until it is
  touched or RIR is chosen; then it is ink, because it is what Save records.

### RIR

- **Tray:** surface, 14 px, 4 px inset, 2 px gaps; segments 48 pt tall (52 on tall screens).
- **Chosen:** ink with on-ink digits. **Target:** a 4 px dot under each value in the target
  range, and "Target 2" beside the label. `6+` opens 6 to 10. Required: Save waits on it.

### Coach note

- **Style:** one quiet block, surface, 14 px corners, 12 × 14 px padding: the speech glyph and
  "Coach · context" (caption, 700), an optional heading, then body text.
- **Length:** two lines at most, clamped by the browser so it holds at any text size; More
  opens the whole text in a sheet that scrolls.
- **Statuses:** take the note's place with their own glyph: a turning arc while planning, a
  warning when the coach could not finish.
- **Placement:** at most one per screen; never on a print, never in colour, never between the
  steppers and Save.

### Inputs / Fields

- **Style:** 52 pt tall, ground, a 1.5 px `control` border, 14 px corners, 16 px text; the
  label above (14 px, 700) with "Optional" at its end; help text below in caption.
- **Focus:** the same 3 px ink ring as every control.

### Navigation

- **Tab bar:** five destinations (Today, Training, Food, Progress, Profile) on ground under a
  `hair` rule; 24 pt icons over 13 pt labels. Where you are is ink, its icon filled and its
  label 700; the rest are ink 2, outlined.
- **Headers:** a top-level screen has a display title, one fact under it and at most one
  action; a nested screen has a back link that names where it goes.
- **Session strip:** while a workout is unfinished, every screen but Today and the workout
  itself shows it above the tab bar: ink, 56 pt, 16 px corners, the session and gym, rest as
  one figure, and Resume on on-ink. It carries the system's only shadow.

### Sheets

- Rise from the bottom edge over the scrim and follow the finger: a spring with a 0.4 s
  response and 0.92 damping; the scrim fades in 200 ms. With reduced motion a sheet fades in
  and out in 150 ms.

### Prints (signature)

- Drawn from the account's records and nothing else, on print paper with square corners.
- **The day inks up:** when Today next shows, each part done since turns from thinned to full
  ink, 420 ms each, one shape at a time, 80 ms apart; with reduced motion, a 150 ms cross-fade
  in place.

## Do's and Don'ts

### Do:

- **Do** take every figure and line of copy from the repository's seed, preview, test and
  audit data; a print draws only what was logged.
- **Do** give a new sport its family's shape with one cut, check it reads at 12 px beside its
  name, and name it in words as well.
- **Do** swap a word or a figure in place: out in 80 ms, then the new one in over 120 ms, never
  both at once.
- **Do** lay a new screen out at 320, 375, 402 and 440 pt wide, in light and dark, and at 200%
  text, before calling it done.
- **Do** build the sheet spring with CSS (`linear()`) or the platform first; a spring or gesture
  library is adopted once, app-wide, with its gzip cost recorded here.

### Don't:

- **Don't** use a pigment for anything but a family of sport: not for errors, warnings, links,
  emphasis or charts of other things.
- **Don't** draw a dashed edge for anything but skipped.
- **Don't** put coach text on a print, in colour, or between the steppers and Save.
- **Don't** truncate a figure, shrink a target under 44 pt or entry text under 16 px to make a
  layout fit.
- **Don't** add a second shadow, or box list rows into cards.
- **Don't** pre-fill RIR or show a suggested value in ink before it is touched.
- **Don't** let the art be the brightest thing on a dark screen.
