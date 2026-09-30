---
name: overload-ui
description: Overload's house rules for interface, design, motion and PWA work in this repository. Which installed design skill owns which job, which rule wins when those skills disagree with each other or with Overload's own decisions, the motion and performance limits in force, how to verify UI changes, and the checklist for feeling native as an installed app on iPhone and Android. Read before using impeccable, the motion skills, view transitions or modern-web-guidance here.
---

# Overload interface house rules

Overload is a phone-first PWA (Next.js App Router, React 19, Tailwind CSS v4) installed from
Safari on iPhone and Chrome on Android. The skills in `.claude/skills/` come from several
authors who disagree on details. This page settles who owns what and which rule wins.

## Precedence

1. The user's request in this session.
2. Overload's own decisions: `docs/decisions/`, `docs/ui-redesign/` and, once written, the
   revamp's `PRODUCT.md` and `DESIGN.md` at the repository root. The
   [decisions that implementation must preserve](../../../docs/ui-redesign/README.md) bind
   every redesign.
3. This skill.
4. The third-party skills. Each names its source in `UPSTREAM.md`.

When a third-party skill contradicts 1–3, follow 1–3 and say so in one line.

## One owner per job

| Job                                                              | Owner                           | Supporting                                   |
| ---------------------------------------------------------------- | ------------------------------- | -------------------------------------------- |
| Direction, critique, audit, polish, the design memory            | `impeccable`                    |                                              |
| Where motion belongs in a design                                 | `impeccable`                    | `find-animation-opportunities`               |
| How an animation is built: curve, duration, spring, interruption | `animate`, `apple-design`       | `emil-design-eng`                            |
| Planning motion across the app                                   | `improve-animations`            | `find-animation-opportunities`               |
| Reviewing motion                                                 | `/review-animations`            | `fixing-motion-performance`                  |
| Route, shared-element and loading transitions                    | `vercel-react-view-transitions` | `modern-web-guidance`                        |
| Feeling installed on a phone                                     | `mobile-native`, `apple-design` | [the PWA checklist](reference/pwa.md)        |
| Platform patterns and browser support                            | `modern-web-guidance`           |                                              |
| Rule-based UI review                                             | `web-design-guidelines`         | `accessibility`                              |
| Accessibility                                                    | `accessibility`                 | `web-design-guidelines`, `/impeccable audit` |
| Several versions to choose between                               | `/prototype`                    |                                              |
| Choosing a library                                               | `/pick-ui-library`              |                                              |

- The design memory is Impeccable's `PRODUCT.md` and `DESIGN.md`. Do not start another one
  (`.interface-design/`, `MASTER.md`, `.ux-profile.md` and the like).
- When `/impeccable init` asks for the platform, the answer is **web**. Overload is not a native
  app, and a native answer loads iOS and Android guidance (SF Symbols, the Simulator) that does
  not apply.

## Where the skills disagree

| Topic               | The disagreement                                                                                                                                             | The rule here                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reduced motion      | `vercel-react-view-transitions` sets durations to zero; `animate`, `apple-design` and Next.js's own guide prefer short crossfades                            | Overload's current rule stands: reduced motion zeroes the motion tokens (`docs/ui-redesign/03-themes-and-performance.md`) until the revamp brief replaces it                  |
| How much to animate | `vercel-react-view-transitions` says to implement every applicable pattern                                                                                   | Animate only what explains navigation or a change of state, and only what the task asks for                                                                                   |
| Overscroll          | `mobile-native` puts `overscroll-behavior: none` on `html` and `body`, which also removes iPhone rubber-banding; `contain` on the scrolling element keeps it | Keep what `src/app/globals.css` does today; change it only as a decision recorded in the brief                                                                                |
| Motion library      | `animate` escalates from CSS to the Web Animations API to Motion; the view-transitions skill needs no library                                                | CSS transitions and React `<ViewTransition>` first. The current limits forbid a spring-physics bundle; adding a motion library is a brief decision, not a component-level one |
| Typefaces           | Impeccable treats system fonts as an overused default; `apple-design` builds on the system face                                                              | Undecided until the brief. Do not swap typefaces in passing, and do not treat the system face as a defect meanwhile                                                           |
| Copy                | `web-design-guidelines` asks for Title Case                                                                                                                  | Sentence case, in British English                                                                                                                                             |

## Limits in force

Until the revamp brief replaces them, the Form rules in
`docs/ui-redesign/03-themes-and-performance.md` apply:

- transform and opacity transitions only where they explain an interaction, about 120 ms for
  feedback and up to 180 ms for a sheet; content readable and controls working before the
  animation ends;
- no looping ambient animation, blur-heavy backdrop, animated gradient, spring-physics bundle or
  page-wide entry choreography;
- at most +5 KiB gzip of shared-shell JavaScript and +15 KiB per route against the route's
  baseline;
- System, Light and Dark appearance; tap targets and editable text never shrink to fit.

View transitions stop the page from scrolling while they run: use them for navigation, never for
taps inside the workout logger. For directional slides, follow the Next.js guide
(`node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`): key enter and exit by
transition type with `default: 'none'`, so an untyped navigation such as a browser swipe back
does not play a second slide over Safari's own.

## Verifying UI work

- `npm run check` before every commit.
- Capture screens with `scripts/dev/audit-browser.mjs` at the iPhone 17 viewport in both themes
  and compare them with the catalogue in `docs/audits/iphone17-design-screenshots-2026-09-30.md`.
  The script uses WebKit, which a cloud session has only if the environment's setup script
  installs it.
- Let a reviewer with fresh context judge the pixels, not the author of the change.
- Judge motion and touch on a real iPhone and a mid-range Android phone with the app installed,
  reduced motion on and off. Emulation does not show tap delay, sticky hover, safe areas, the
  keyboard or rubber-banding.
