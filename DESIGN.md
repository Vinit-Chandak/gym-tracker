---
name: Overload — Form
description: A compact training instrument — warm neutral surfaces, charcoal-green ink and one copper accent, in light and dark.
colors:
  canvas: "#f4f3ee"
  surface: "#fffdf8"
  surface-raised: "#ebece6"
  ink: "#222b28"
  ink-muted: "#4d5b54"
  ink-subtle: "#56635b"
  ink-ghost: "#8a948e"
  line: "#cfd5ce"
  line-strong: "#747f76"
  accent: "#8b4c2f"
  accent-strong: "#733b24"
  accent-soft: "#eadcd2"
  on-accent: "#fffdf8"
  success: "#285d40"
  warning: "#7b510d"
  danger: "#9b382e"
  over: "#b4333d"
  focus: "#1d6b80"
  nav-island: "rgb(244 243 238 / 0.94)"
  canvas-dark: "#171c1c"
  surface-dark: "#202626"
  surface-raised-dark: "#2b3330"
  ink-dark: "#f0eee8"
  ink-muted-dark: "#a8b5b0"
  ink-subtle-dark: "#a1aca6"
  ink-ghost-dark: "#77857f"
  line-dark: "#3c4946"
  line-strong-dark: "#7c8d85"
  accent-dark: "#e1a483"
  accent-strong-dark: "#efb898"
  accent-soft-dark: "#3c3029"
  on-accent-dark: "#191e1d"
  success-dark: "#99c7a7"
  warning-dark: "#e8c181"
  danger-dark: "#f0a18d"
  over-dark: "#f07575"
  focus-dark: "#98cbd8"
  nav-island-dark: "rgb(23 28 28 / 0.94)"
typography:
  title:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    fontSize: "clamp(1.5rem, 1.2rem + 1.25vw, 2rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  section:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    fontSize: "clamp(1rem, 0.95rem + 0.25vw, 1.125rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  body:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    fontSize: "clamp(0.875rem, 0.8rem + 0.3vw, 1rem)"
    fontWeight: 400
    lineHeight: 1.45
  small:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    fontSize: "clamp(0.8125rem, 0.78rem + 0.15vw, 0.875rem)"
    lineHeight: 1.45
  label:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.025em"
  input:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    fontSize: "max(1rem, 16px)"
  figures:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    fontFeature: '"tnum" 1'
  mono:
    fontFamily: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace'
rounded:
  control: "0.25rem"
  card: "0.75rem"
  sheet: "0.75rem"
  island: "1rem"
spacing:
  space-1: "0.25rem"
  space-2: "0.375rem"
  space-3: "0.5rem"
  space-4: "0.75rem"
  space-5: "1rem"
  space-6: "1.25rem"
  space-7: "1.5rem"
  page-gutter: "clamp(0.75rem, 3.8vw, 1.25rem)"
  panel-padding: "clamp(0.75rem, 3.5vw, 1.125rem)"
  section-gap: "clamp(1rem, 4.5vw, 1.5rem)"
  control-height: "2.75rem"
  nav-height: "4rem"
  content-max: "32rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    padding: "0.5rem 1rem"
    height: "{spacing.control-height}"
  button-primary-active:
    backgroundColor: "{colors.accent-strong}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.5rem 1rem"
    height: "{spacing.control-height}"
  button-ghost:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.control}"
    padding: "0.5rem 1rem"
    height: "{spacing.control-height}"
  button-danger:
    textColor: "{colors.danger}"
    rounded: "{rounded.control}"
    padding: "0.5rem 1rem"
    height: "{spacing.control-height}"
  box:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "{spacing.panel-padding}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.input}"
    rounded: "{rounded.control}"
    padding: "0 0.75rem"
    height: "{spacing.control-height}"
  sheet:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.sheet}"
    padding: "{spacing.panel-padding}"
  nav-island:
    backgroundColor: "{colors.nav-island}"
    rounded: "{rounded.island}"
    height: "{spacing.nav-height}"
  nav-tab-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  badge:
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0.125rem 0.375rem"
---

<!-- Records Form exactly as shipped on 2026-09-29, before the 2026 redesign (docs/redesign-2026/README.md). The runtime source of truth is src/styles/form/foundation.css and form.css; when the new system lands, regenerate this file with /impeccable document. -->

# Design System: Overload — Form

## Overview

**Creative North Star: "The Training Instrument"**

Form treats Overload as a compact training instrument rather than a lifestyle app: calm surfaces, dense but legible rows, and one copper voice for the action that matters now. It was chosen as a single design with two complementary palettes, a warm neutral light mode and a charcoal-green dark mode, served by one component tree, one feature model and one route structure (docs/ui-redesign/README.md, decision 0013).

Later passes removed most explanatory text and moved what remained behind info tips (decision 0014), replaced ruled lists with filled grouped boxes on every screen (decision 0015), and rebuilt Today around one card per decision (decision 0016). Phone layouts lead; spacing and type adapt within readable bounds, and targets and editable text never shrink to force a fit.

**Key Characteristics:**

- System sans for everything, with tabular numerals wherever a figure can change.
- Warm neutral paper, charcoal-green ink, one dark copper accent; a pale copper accent in dark mode.
- Small radii: 4 px controls, 12 px boxes and sheets, a 16 px navigation island.
- Flat tonal layering with hairline borders; the only shadow and blur belong to the navigation island.
- Light and dark are the same design, switched by tokens, never by components.

## Colors

A warm neutral ground with charcoal-green ink and a single dark copper accent; dark mode turns the ground charcoal-green and the copper pale.

### Primary

- **Dark Copper** (`accent`): the one primary action on a screen, the selected tab's icon and label, and links.
- **Deep Copper** (`accent-strong`): the pressed state of primary buttons and the safer choice for small copper text.
- **Copper Wash** (`accent-soft`): the selected tab's pill and other quiet selected fills.
- **Paper on Copper** (`on-accent`): text on copper fills.

### Neutral

- **Warm Paper** (`canvas`): the page behind everything.
- **Card White** (`surface`): grouped boxes, sheets, inputs and secondary buttons.
- **Stone** (`surface-raised`): pressed and hovered rows, secondary fills.
- **Charcoal-Green Ink** (`ink`): primary text.
- **Moss Grey** (`ink-muted`) and **Lichen Grey** (`ink-subtle`): secondary text, labels and inactive tabs.
- **Ghost Ink** (`ink-ghost`): unconfirmed suggestions in a field, visibly fainter than anything the user typed.
- **Hairline** (`line`) and **Strong Rule** (`line-strong`): box borders and dividers; input and secondary-button outlines.
- **Glass Paper** (`nav-island`): the navigation island's 94%-opaque fill.

### Status and data

- **Forest** (`success`), **Ochre** (`warning`), **Brick** (`danger`) and **Over Red** (`over`, a macronutrient past its target, kept apart from the error colour); **Harbour Teal** (`focus`) for focus rings.
- Charts, the body map's volume ramp and the eight superset hues are defined per theme in `src/styles/form/form.css`; each superset hue holds at least 4.5:1 on its surfaces.

### Named Rules

**The Paired Palette Rule.** Every colour has a light and a dark value, and components use only the semantic token; no mode's hex appears in a component.

**The One Copper Rule.** Copper marks the one primary action and the current tab; it is not decoration.

## Typography

**Display Font:** none; the system sans (SF Pro on iPhone, Roboto on Android) sets headings too.
**Body Font:** the system sans stack.
**Label/Mono Font:** the system mono stack, used selectively for a few small labels.

**Character:** Native and quiet: the platform's own face, set tight in headings and relaxed in body text, with tabular numerals so columns of loads and reps never jitter.

### Hierarchy

- **Title** (600, `title`, line-height 1.15, tracking −0.025em): the page masthead.
- **Section** (600, `section`, line-height 1.15, tracking −0.025em): box and section headings.
- **Body** (400, `body`, line-height 1.45): everything read in sentences.
- **Small** (`small`): secondary lines and metadata.
- **Label** (500, 12 px, tracking 0.025em, uppercase in section eyebrows): column headers and section eyebrows.
- **Input** (16 px minimum): every editable field, so iOS never zooms.

### Named Rules

**The Tabular Figures Rule.** Any number that can change between sets or days uses tabular numerals.

**The Sixteen Pixel Rule.** Editable text never drops below 16 px.

## Layout

A single phone column, centred at up to 32 rem. Page gutters, panel padding and section gaps scale with the viewport (`page-gutter`, `panel-padding`, `section-gap`) within fixed bounds; the rhythm runs 4, 6, 8, 12, 16, 20 and 24 px (`space-1` to `space-7`). The floating navigation island (64 px tall) reserves its height plus a safe-area-aware gap at the bottom of every page, and the page header reserves the control height plus padding at the top. The set grid gives each set row five columns: set identity and options (44 px), load, reps or seconds or metres, RIR or RPE, and a 44 px save action, with labels and units in the header once. Layouts are verified from 320 to 480 px and at 200% text.

## Elevation & Depth

Form is flat and conveys depth by tone: `canvas` below `surface` boxes, `surface-raised` for pressed and selected rows, and hairline borders (`line`) around boxes. The only lifted object is the navigation island: a 94%-opaque fill with a 1.5 rem backdrop blur (saturate 180%) and a soft shadow (`0 0.5rem 1.5rem rgb(15 23 20 / 0.12)` in light, `0 0.5rem 1.5rem rgb(0 0 0 / 0.45)` in dark), falling back to an opaque island where backdrop filters are unsupported. Sheets sit over a dimming backdrop (`rgb(15 23 20 / 0.48)` light, `rgb(0 0 0 / 0.64)` dark).

### Named Rules

**The Legible Glass Rule.** Glass is used only on the navigation island and is always mostly opaque, because blur alone cannot keep labels legible over a copper button or a chart passing beneath.

## Shapes

Small, consistent corners: 4 px on buttons, inputs and badges (`control`); 12 px on grouped boxes and the top of sheets (`card`, `sheet`); 16 px on the navigation island (`island`), softer than a card and well short of a capsule. Borders are one pixel. Sheets carry a 40 × 4 px grabber with full rounding.

## Components

### Buttons

- **Shape:** gently squared corners (4 px); every size is at least 44 px tall.
- **Primary:** copper fill with paper text, 8 × 16 px padding; darkens to deep copper while pressed.
- **Secondary:** card-white fill, charcoal-green text and a strong-rule outline; stone fill on hover.
- **Ghost:** transparent with moss-grey text that darkens to ink; stone fill while pressed.
- **Danger:** transparent with a brick outline and brick text, so the outline carries the meaning at 3:1.
- **States:** colour transitions over 120 ms on the standard curve (`cubic-bezier(0.2, 0, 0, 1)`); disabled at 45% opacity.

### Badges

- **Style:** outline chips in the tone's colour (accent, success, warning, danger, neutral), 12 px medium text, 4 px corners.

### Cards / Containers

- **Corner Style:** 12 px.
- **Background:** card white on warm paper.
- **Shadow Strategy:** none; see Elevation & Depth.
- **Border:** one-pixel hairline.
- **Internal Padding:** `panel-padding`.

### Inputs / Fields

- **Style:** 44 px tall, 4 px corners, strong-rule outline, card-white fill, 16 px text; suggestions shown in ghost ink until the user types.
- **Focus:** the outline turns copper; focusable controls elsewhere show a 2 px harbour-teal ring offset by 3 px.
- **Disabled:** 50% opacity.

### Navigation

- **Style:** a floating island clear of all four edges, 64 px tall with 16 px corners, holding five labelled tabs (Today, Training, Food, Progress, Profile).
- **States:** inactive tabs in moss grey; the current tab gets a copper-wash pill around both icon and label, with copper text; a pressed tab flashes stone.

### Set Row (signature)

- The logging grid's row: set identity and options, load, reps (or seconds or metres), RIR or RPE, and its own save action. Each set keeps its own values even when they match, because each is its own record.

### Sheet

- **Style:** card-white panel rising from the bottom with 12 px top corners, a grabber, a 44 px close control and safe-area padding; it enters over 180 ms on the standard curve, and under reduced motion simply appears.

## Do's and Don'ts

### Do:

- **Do** use the semantic tokens (`bg-canvas`, `text-ink`, `bg-accent` and the rest), which resolve per mode through `@theme inline`.
- **Do** keep every target at least 44 px and every editable field at 16 px or more.
- **Do** set changeable figures in tabular numerals.
- **Do** verify every change in light and dark, and from 320 px wide.

### Don't:

- **Don't** write a hex value in a component or nest a `@theme` block under a mode.
- **Don't** shrink tap targets or editable text to make a layout fit.
- **Don't** use backdrop blur without the mostly-opaque fill and the opaque fallback.
- **Don't** merge identical sets into one row; each set is its own record.
