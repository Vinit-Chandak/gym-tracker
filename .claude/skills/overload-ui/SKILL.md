---
name: overload-ui
description: Overload's house rules for interface, design, motion and PWA work in this repository. The sheet design world (DESIGN.md), the hard rules that keep it one world, which installed design skill owns which job and which rule wins when they disagree, the motion and performance limits in force, how to verify UI changes with screenshots, and the checklist for feeling native as an installed app on iPhone and Android. Read before using impeccable, the motion skills, view transitions or modern-web-guidance here.
---

# Working on Overload's interface

Overload's one visual world is **the sheet**: every screen is a position on the training plan,
drawn on one page with a faint construction grid. `DESIGN.md` at the repository root is the
design authority (tokens, type, components, states, motion); `.impeccable/design.json` is its
machine-readable sidecar; `docs/decisions/0041-the-sheet.md` records why. This file is the
working agreement around them. When this file and a skill's defaults disagree, this file wins;
when this file and `DESIGN.md` disagree, `DESIGN.md` wins and this file needs a fix.

## The world in one paragraph

Ink is what is true and confirmed. Pencil (`ink-ghost`, the `pencil` utility) is what the coach
proposes and the athlete has not yet confirmed. Pen (`pen`) is the coach's own hand and every
word that can be tapped. The highlighter (`highlight`, black ink on it) marks today, the current
step and the one primary action on a screen, and nothing else: a chosen cell in a segmented
control is inked in (`bg-ink text-canvas`), and a marked row or tile in a picker or multi-select
takes the soft tint (`highlight-soft`) with a pen check, and the wordmark is ink alone inside the
app (its stroke, `<Wordmark mark />`, belongs to the sign-in screens). Groups are ruled blocks (`box`, `box-rows`,
`ruled-list`), never boxes in boxes; the one opaque container is `panel`, for a thing that must
stand off the page. Numbers live in the data voice (`font-data`, `measure`, tabular). The
daylight and graphite sheets are the same world; everything is right in both or it is not done.

## Hard rules

1. One `primary` button per screen. Lists of similar choices are never rows of primaries.
2. No cards: no `rounded-xl`, `shadow-*`, gradients, glass or blur; no `panel` inside a `panel`.
3. No eyebrow label directly above a heading. A small-caps label may be a section heading.
4. Tokens only (`tokens.css` through the Tailwind names in `globals.css`); never a raw hex in a
   component. Charts use `series-*`, `volume-*`, `group-*`.
5. Keep every feature, action and test-asserted string. Change user-visible copy only with its test.
6. Icons come from `src/components/ui/icons.tsx` (Phosphor regular, one stroke); add new glyphs
   there, never import an icon library elsewhere.
7. 44 px targets, visible focus, colour never the only signal, text that wraps at 200 % zoom.
8. A progress section shows one plot at full width, never a grid of small charts; the
   periodisation chart (`src/components/periodisation-chart.tsx`) is the signature graphic, and
   every other chart draws on `src/components/ui/chart.tsx` with lettering no smaller than 12 px.

## Which skill owns which job

- **impeccable** owns design work: new surfaces, redesigns, critiques, audits, polish. Run its
  `context` step first; the direction contract lives under `.impeccable/surfaces/`. A new
  surface inside the sheet inherits the world: no concept tournament, no DESIGN.md change.
- **animate** owns new motion; **review-animations** critiques it; **improve-animations** plans
  a codebase-wide pass; **animation-vocabulary** only names effects. **emil-design-eng** is the
  craft reference for press feedback, easing and springs.
- **vercel-react-view-transitions** owns route transitions. The app already has them:
  `src/app/(app)/template.tsx` turns the sheet on every navigation, keyed by the link's
  `transitionTypes` (`nav-tab` crosses, `nav-forward` slides in, `nav-back` slides out, untyped
  swaps). Give new links the right type; never add a second page-level `<ViewTransition>`.
- **mobile-native** owns the platform layer (viewport, touch, scroll, safe areas, theme-colour);
  **modern-web-guidance** is consulted before building a UI behaviour from scratch; **dataviz**
  owns any chart or stat tile; **accessibility** and **web-design-guidelines** audit the result.
- **apple-design** informs gesture and sheet physics; it does not import Apple's visual language.

## Limits in force

- Motion: 100–160 ms press, 160 ms ink arriving, 240 ms sheets, 120 ms tabs; ease-out from an
  already visible state; transform, opacity and colour only; nothing on page load; one authored
  moment per screen; `prefers-reduced-motion` holds a still (tokens zero the durations).
- Performance: no scroll listeners for decoration; no backdrop filters; SVG charts drawn from
  data at runtime; icons imported per module; images none (the art is inline SVG in
  `src/components/art`).
- Density: phone first at 402 px; nothing fixed-width; 320 px must not overflow; the desktop rail
  at 64 rem is the same sheet with the tabs down the left.

## Verifying a UI change

1. `npm run lint`, `npm run format:check`, `npm run typecheck`, and the test files beside the
   screens you touched (`npx vitest run <paths>`); `npm run check` before a pull request.
2. Run the app against the seeded audit database (`docs/local-dev.md`): `npm run audit:setup`
   once, then `npm run audit:auth` and `npm run audit:dev`.
3. Screenshot both palettes at phone size: `node scripts/dev/screenshot.mjs vinit both <prefix>
<route>…` (`WIDE=1` for desktop, `FULL=1` for full page; `CHROMIUM=/path` when the installed
   Playwright browsers are older than the package). Look once, fix everything you see, confirm
   once; do not loop on screenshots.
4. `sh .claude/skills/impeccable/scripts/impeccable detect --json <files>` for the mechanical
   design checks before asking for a review.

## Feeling native as an installed app

- `viewport-fit=cover` with `env(safe-area-inset-*)` on the tab bar, headers and sheets.
- Inputs at 16 px, `inputmode`/`enterkeyhint` set; never `user-scalable=no`.
- `-webkit-tap-highlight-color: transparent` plus a real `:active` state on every control.
- `overscroll-behavior: none` on the root and `contain` on inner scrollers (sheets).
- `100dvh`, never `100vh`, for anything pinned to the bottom.
- `theme-color` per scheme (the appearance script patches it on an explicit choice); the manifest
  keeps the graphite canvas for the splash.
- Hover only inside Tailwind's `hover:` (gated to fine pointers); `user-select: none` on controls,
  never on content.
- Test on a phone before calling it done: emulation cannot show sticky hover, the tap delay,
  rubber-banding, safe areas or the keyboard.
