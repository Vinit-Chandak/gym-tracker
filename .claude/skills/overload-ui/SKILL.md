---
name: overload-ui
description: Overload's house rules for interface, design, motion and PWA work in this repository. Which installed design skill owns which job, which rule wins when those skills disagree with each other or with Overload's own decisions, the motion and performance limits in force, how to verify UI changes, and the checklist for feeling native as an installed app on iPhone and Android. Read before using impeccable, better-colors, frontend-design, the ux-* skills, the motion skills, view transitions or modern-web-guidance here.
---

# Overload interface house rules

Overload is a phone-first PWA (Next.js App Router, React 19, Tailwind CSS v4) installed from
Safari on iPhone and Chrome on Android, with native iOS and Android apps planned. The skills
in `.claude/skills/` come from several authors who disagree on details. This page settles who
owns what and which rule wins.

## Precedence

1. The user's request in this session.
2. Overload's own decisions: `docs/decisions/`, `docs/ui-redesign/`, the
   [revamp decisions](../../../docs/ui-redesign/revamp/README.md#decisions) and, once
   written, the revamp's `PRODUCT.md` and `DESIGN.md` at the repository root. The
   [feature inventory](../../../docs/ui-redesign/revamp/features.md) is the contract for
   what each redesigned screen must still do, and the
   [decisions that implementation must preserve](../../../docs/ui-redesign/README.md) bind
   every redesign.
3. This skill.
4. The third-party skills. Each names its source in `UPSTREAM.md`.

When a third-party skill contradicts 1–3, follow 1–3 and say so in one line.

**These rules are living, not scripture** (owner, 24 October 2026). Precedence settles a
disagreement; it does not make a rule right. When a screen shows that a rule here or in
`DESIGN.md` is wrong, or says nothing where it should (unequal buttons, a field with no box, a
heading in body type, a gap padded twice), fix the screen and rewrite the rule in the same change,
dated and attributed, so the next change cannot repeat it. An owner's complaint about something
basic is evidence that a rule was missing or wrong, never only that one screen slipped.

## One owner per job

| Job                                                                                           | Owner                               | Supporting                                    |
| --------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------- |
| Direction, critique, audit, polish, the design memory                                         | `impeccable`                        | `frontend-design`, `taste-app-screens`        |
| The colour system: ramps, roles, tokens, measured contrast, light and dark                    | `better-colors`                     | `ux-color`, `/impeccable colorize`            |
| Forms: fields, labels, layout, validation, what is asked and what is worked out               | `ux-inputs-and-forms`               | `ux-error-recovery`, `accessibility`          |
| Errors, refused saves, undo against confirm, failures and dead ends                           | `ux-error-recovery`                 | `/impeccable harden`, `/impeccable clarify`   |
| Icons: metaphors, one style, filled for state, labels                                         | `ux-iconography`                    | `emil-design-eng`                             |
| Spacing, grouping, grids and hierarchy by space                                               | `ux-layout-spacing-grids`           | `/impeccable layout`                          |
| Cards and panels                                                                              | `ux-cards`                          | `ux-layout-spacing-grids`                     |
| Empty states                                                                                  | `ux-empty-states`                   | `/impeccable onboard`                         |
| A second opinion on how a screen looks: hierarchy, emphasis, clutter, generated-looking tells | `ux-aesthetics-audit`               | `frontend-design`, `taste-app-screens`        |
| Information architecture: which screens exist, where each fact lives, labels across screens   | `ux-information-architecture-audit` | `/impeccable critique`, `/impeccable distill` |
| Navigation model and tab bar                                                                  | `ux-navigation`                     | `mobile-native`                               |
| Walking a task across screens                                                                 | `/cognitive-walkthrough`            |                                               |
| Where motion belongs in a design                                                              | `impeccable`                        | `find-animation-opportunities`                |
| How an animation is built: curve, duration, spring, interruption                              | `animate`, `apple-design`           | `emil-design-eng`                             |
| Planning motion across the app                                                                | `improve-animations`                | `find-animation-opportunities`                |
| Reviewing motion                                                                              | `/review-animations`                | `fixing-motion-performance`                   |
| Route, shared-element and loading transitions                                                 | `vercel-react-view-transitions`     | `modern-web-guidance`                         |
| Feeling installed on a phone                                                                  | `mobile-native`, `apple-design`     | [the PWA checklist](reference/pwa.md)         |
| Platform patterns and browser support                                                         | `modern-web-guidance`               |                                               |
| Rule-based UI review                                                                          | `web-design-guidelines`             | `accessibility`                               |
| On-screen words: what a screen says, and what moves behind an ⓘ or a fold                     | `/impeccable clarify`, `distill`    | `design:ux-copy`                              |
| Accessibility                                                                                 | `accessibility`                     | `web-design-guidelines`, `/impeccable audit`  |
| Several versions to choose between                                                            | `/prototype`                        |                                               |
| Choosing a library                                                                            | `/pick-ui-library`                  |                                               |

- The design memory is Impeccable's `PRODUCT.md` and `DESIGN.md`. Do not start another one
  (`.interface-design/`, `MASTER.md`, `.ux-profile.md` and the like).
- No one skill is the whole answer (owner, 21 October 2026). Before proposing a direction, run
  the process of every skill that owns a part of it: Impeccable's colour strategy, `better-colors`'
  measured ramps, `frontend-design`'s plan, review against its list of generated defaults and
  self-critique, and the tells in `taste-app-screens`. Present one committed direction with its
  reasons, not a menu of safe options.
- The Uxcel skills and `better-colors` hand off to siblings that are not installed. Read their
  names as these installed skills: `ux-heuristics-audit` and `ux-dark-patterns-audit` →
  `/impeccable critique`; `ux-accessibility-audit` and `better-accessibility` → `accessibility`;
  `ux-microcopy-audit` → `/impeccable clarify`; `ux-mobile-responsiveness-audit` →
  `mobile-native`; `better-ui` → `emil-design-eng`; `ux-notifications-and-toasts` and
  `ux-modals-and-dialogs` → `DESIGN.md` (Inputs and choices, Sheets). Their
  `docs/orchestration-policy.md` and `ux-design-review` do not exist here: offer a lens, never run
  it unasked.
- When `/impeccable init` asks for the platform in this repository, the answer is **web**: this
  codebase is the PWA, and a native answer loads iOS and Android guidance (SF Symbols, the
  Simulator) meant for native code. The native apps will get their own setup.

## Where the skills disagree

| Topic                    | The disagreement                                                                                                                                               | The rule here                                                                                                                                                                                                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reduced motion           | `vercel-react-view-transitions` sets durations to zero; `animate`, `apple-design` and Next.js's own guide prefer short crossfades                              | `DESIGN.md` decides. Until it does, shipped code keeps Overload's current rule: reduced motion zeroes the motion tokens (`docs/ui-redesign/03-themes-and-performance.md`)                                                                                                                                                |
| How much to animate      | `vercel-react-view-transitions` says to implement every applicable pattern                                                                                     | Animate only what explains navigation or a change of state, and only what the task asks for                                                                                                                                                                                                                              |
| Overscroll               | `mobile-native` puts `overscroll-behavior: none` on `html` and `body`, which also removes iPhone rubber-banding; `contain` on the scrolling element keeps it   | Keep what `src/app/globals.css` does today; change it only as a decision recorded in the brief                                                                                                                                                                                                                           |
| Motion library           | `animate` escalates from CSS to the Web Animations API to Motion; the view-transitions skill needs no library                                                  | CSS transitions and React `<ViewTransition>` first. A spring or gesture library is allowed for the revamp, adopted once, app-wide, with its bundle cost recorded in `DESIGN.md`                                                                                                                                          |
| Typefaces                | Impeccable treats system fonts as an overused default; `apple-design` builds on the system face                                                                | Typography is redesigned from the ground up. Choose faces licensed for the web and for embedding in the iOS and Android apps; do not keep Form's system face by default                                                                                                                                                  |
| Copy                     | `web-design-guidelines` asks for Title Case, and the Uxcel skills' examples use it                                                                             | Sentence case, in British English                                                                                                                                                                                                                                                                                        |
| Helper text              | `/impeccable onboard` and `clarify`, `design:ux-copy` and the Uxcel skills add helper lines, empty-state explanations and first-run tips                       | `DESIGN.md`'s Need-to-Know Rule: a screen shows only what the athlete needs; every explanation sits behind an ⓘ (`InfoTip`, or a field's `info`) or a fold (`Disclosure`), never as running text. Labels, a rule or format a value must meet, errors, status and irreversible consequences are not helper text, and stay |
| Accessibility and words  | The Need-to-Know Rule moves words off the screen; `accessibility` requires labels and instructions where input is asked for                                    | Accessibility wins for labels, input rules, errors, status and consequences (WCAG 3.3.1, 3.3.2, 4.1.3); everything else follows the Need-to-Know Rule                                                                                                                                                                    |
| Website navigation       | `ux-navigation` teaches website conventions: a logo top-left linking home, breadcrumbs, footers, mega menus                                                    | They do not apply to this phone app's tab bar and stack navigation                                                                                                                                                                                                                                                       |
| Information architecture | `ux-information-architecture-audit` accepts an item listed in more than one place                                                                              | `PRODUCT.md`'s information map gives one line per fact, naming the screen it lives on; other screens may link to that fact but never restate it. The audit checks every change against the map                                                                                                                           |
| How much colour          | `taste-app-screens` measures premium screens at about 3% coloured pixels; Impeccable says a grey screen with one accent is the category default, not restraint | `DESIGN.md`'s Colour Is Information Rule: a sport's pigment on its own prints, marks and data, red and green as the only signals, ink for the chrome. Colour is never added to repeat what a figure says                                                                                                                 |
| The primary action       | `better-colors` fills it with the accent; `taste-app-screens` finds it near-black on premium screens                                                           | Ink, inverted in dark (The One Filled Action Rule). A sport's colour is never a button                                                                                                                                                                                                                                   |
| Status colours           | `better-colors` builds only the status ramps the product renders; the Uxcel skills assume four                                                                 | Two: danger and success. A notice is a tray in ink with its glyph; there is no warning amber                                                                                                                                                                                                                             |
| Glass, blur, gradients   | `apple-design` uses translucent materials; `taste-app-screens` and `frontend-design` read glass and gradient washes as generated                               | No glass, blur or decorative gradient. A fade at a scroll edge, where content passes under pinned actions, is the one gradient, because it says there is more                                                                                                                                                            |
| Fact separators          | `frontend-design` lists meta strings joined by middle dots as template chrome                                                                                  | A meta line's facts keep the app's separator (`FACT_SEPARATOR`), because they are facts the athlete reads in a row; never use it as decoration or to join words a sentence could join                                                                                                                                    |
| Validation timing        | `ux-inputs-and-forms` and `ux-error-recovery` validate a field when it is left; Overload's forms check what can be checked as it is typed                      | A rule a value must meet is said before typing; a field is marked in red when it is left or when Save is refused, never while it is being typed; the mark stays until the value can be saved and never waits for a save to go through, while the refused save's bar goes after four seconds (owner, 24 October 2026)     |
| How long a message stays | `ux-error-recovery` keeps an error until it is fixed; toast guidance runs four to ten seconds                                                                  | `DESIGN.md`, Inputs and choices: a record kept stands three seconds (held while touched or focused, so Undo is never pulled away), a refused save's bar four, a failure with Retry until it is taken; nothing that reports a moment stays on the screen                                                                  |
| Spacing scale            | `ux-layout-spacing-grids` builds an 8-pt scale and lets each layout pick its steps                                                                             | `DESIGN.md`'s Rhythm Rule: six named gaps, each with one job (header, section, heading, stack, block, a card's inset), every gap from one source, no twin padding or margins. A new gap is a new rule, never a one-off value                                                                                             |

## Limits in force

Form's motion limits in `docs/ui-redesign/03-themes-and-performance.md` (about 120 ms feedback,
180 ms sheets, no spring-physics bundle, no page-wide choreography) are retired for the revamp:
the user asked for richer motion on 30 September 2026, and `DESIGN.md` sets the new motion
rules. Until it does:

- motion still earns its place: it explains a change of state, responds to touch or marks a
  moment that matters, and never makes a user wait before a control works;
- mockups and prototypes may explore freely; code merged to `main` keeps Form's limits until
  `DESIGN.md` replaces them;
- the JavaScript budgets (+5 KiB gzip shared shell, +15 KiB per route) stay as targets; any
  excess is recorded in `DESIGN.md` with its reason;
- System, Light and Dark appearance; tap targets and editable text never shrink to fit.

## Portable to the native apps

Native iOS and Android apps are planned, so the design system must survive translation to
SwiftUI and Jetpack Compose:

- tokens (colour, type, spacing, radius, elevation, motion) are named and valued in
  platform-neutral terms, not in CSS-only ones;
- components follow patterns both platforms have: tab bar, stack navigation, sheets, lists,
  steppers; nothing central depends on hover or a web-only effect;
- motion is specified as durations, curves and springs (response and damping), which all three
  platforms can reproduce;
- icons and illustrations are kept as vector sources.

View transitions stop the page from scrolling while they run: use them for navigation, never for
taps inside the workout logger. For directional slides, follow the Next.js guide
(`node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`): key enter and exit by
transition type with `default: 'none'`, so an untyped navigation such as a browser swipe back
does not play a second slide over Safari's own.

## Verifying UI work

- **Carry out the task, not the page** (`PRODUCT.md`, principle 9). For every task a change
  touches, do it in the running app as an athlete would, with the variants they bring: an
  interval session entered as laps alone, a total typed against its laps, a swim by lengths, a
  ride in miles, a workout whose save fails, a refused save that must keep every value and choice.
  A route that opens is not a task that works, and an audit that only opens routes says so in its
  title. A walk that will be repeated becomes a script under `scripts/dev/` that fails when the
  task fails.
- Before a commit, a push or a merge: typecheck, lint and format the changed files, and run the
  tests relevant to them (`npx vitest related --run <files>`); the whole suite runs only for a
  change that spans most of the app at once (`AGENTS.md`, Testing: only what changed).
- **Show a design proposal on the owner's phone.** Publish renders as a claude.ai artifact (the
  Design canvas, phone-sized boards), not inline chat widgets, which do not render on a phone.
  Name what the renders are for (a colour study is not a layout).
- Capture screens with `scripts/dev/audit-browser.mjs` at the iPhone 17 viewport in both themes
  and compare them with the catalogue in `docs/audits/iphone17-design-screenshots-2026-09-30.md`.
  The script uses WebKit, which a cloud session has only if the environment's setup script
  installs it; without it, capture the Android profile in Chromium (`AUDIT_DEVICE=android`,
  `AUDIT_CHROMIUM_PATH`) and say which engine the screens came from.
- Run the consistency audit, `npm run audit:consistency`, in both themes (`AUDIT_THEME=dark`)
  against the local audit server, after any change to a shared piece (a header, a field, a
  button, a card, a token). It fails a screen whose peer actions differ in size or width, whose
  field shows no box, whose 20-pt-or-larger text is not Host Grotesk at 600 or heavier, or whose
  heading is lighter than 600, whose steppers do not line up, that repeats a sentence three times or more, or whose
  header-to-content gap is off its kind's. A fault it cannot see (a control that does nothing, a
  message that never goes) is still a fault: walk it, then teach the audit when it can be
  measured.
- Read every changed screen for words it does not need (The Need-to-Know Rule): a sentence that
  explains the app, the coach or a plan goes, and help moves into an ⓘ or a fold.
- Tests assert what a screen does (roles, names, states, figures), not its explanatory sentences;
  a sentence moved into an ⓘ is asserted by opening the ⓘ. The audit scripts in `scripts/dev/`
  find controls by their visible names: grep them when a label changes.
- Let a reviewer with fresh context judge the pixels, not the author of the change.
- Judge motion and touch on a real iPhone and a mid-range Android phone with the app installed,
  reduced motion on and off. Emulation does not show tap delay, sticky hover, safe areas, the
  keyboard or rubber-banding.
