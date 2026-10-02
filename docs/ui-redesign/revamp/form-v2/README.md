# Form v2: the art is your training

The revamp's direction, refined on the Claude Design canvas **Overload revamp: Form v2, refined**
(2 October 2026) and kept here with its source, tokens and screenshots. Nothing in the
application has changed. The revamp's [`PRODUCT.md`](../../../../PRODUCT.md) and
[`DESIGN.md`](../../../../DESIGN.md), at the repository root, record the product and this design
system; this folder is the evidence they point to.

Form v2 replaces the current interface, Form ([decision 0013](../../../decisions/0013-form-interface.md)),
and shares nothing with its look.

<p>
  <img src="screenshots/Today.png" width="180" alt="Today">
  <img src="screenshots/Workout.png" width="180" alt="The workout">
  <img src="screenshots/Log.png" width="180" alt="Logging a set">
  <img src="screenshots/Progress.png" width="180" alt="Progress">
  <img src="screenshots/Food.png" width="180" alt="Food">
</p>

## The idea

A black-and-white app that stays out of the way. Every colour on screen is a print: generative,
Bauhaus-like art drawn from what the account has logged and nothing else, so the art is the
record and the reward at once. How the body moves gives the form and its pigment: a block for
load, a stride for on foot, a wheel for on wheels, a wave for in water, a fan for practice, a
bowl for food. Thinned pigment with an edge is still to do; full is done; a dashed edge is
skipped. Every form stands on one module grid and one ground line, a print carries no words,
and the rows under it are its legend, each led by a small copy of its part.

## What changed in this refinement

The canvas was redrawn from scratch after the owner's notes on the first version:

| The note                                                     | What the boards do now                                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Better art for runs, cycling and other sports; fix alignment | A new alphabet on one module grid and one ground line: block, stride, wheel, wave, fan, bowl                              |
| Keep the cycle and the rest timer minimal                    | The cycle is seven squares; rest is one pill, a dial that empties from twelve                                             |
| Minimal text, nothing repeated                               | No words on prints; state shown by ink, not words; each fact once per screen                                              |
| Revamp logging; Log, Technique, History; warm-ups faded      | A ledger, one row per set, with the entry docked below it; History lists every session; warm-ups are grey                 |
| RIR as minus, a figure, plus                                 | RIR is a stepper that starts empty, its target beside it                                                                  |
| Equipment and outdoor or treadmill as icons                  | Glyphs for free weights (a kettlebell), machine, cable, Smith machine, bodyweight; outdoors, treadmill, indoor bike, pool |
| Start everything at the left edge                            | One 20-pt mark column and one name edge on every list                                                                     |
| Progress congested: one month, every activity, a calendar    | One month, two marks a row, `+N`, the week's count; the calendar scrolls month by month; a day opens on its print         |
| Less padding under the tab bar                               | 64 pt                                                                                                                     |
| Over-full food without breaking the bowl                     | The food heaps above the rim as one symmetric mound                                                                       |
| More pages, the coach among them                             | 74 boards: the AI coach and its proposed change, Training, Friends, Gyms, the first run, every Progress section and more  |
| Native apps; text never runs off                             | An iOS and Android board, Android-size boards, typed entry, wrap and fit rules                                            |
| The weight chart's coloured point; blue text selection       | Both ink                                                                                                                  |

## What is here

| Path                                       | What it is                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [`screenshots/`](screenshots/)             | Every board (phone boards at 2×, wide boards at 1×) and five frames of the signature moment        |
| [`canvas/`](canvas/)                       | The 74 boards as on the canvas, and the `canvas.json` that places them on nine pages               |
| [`tokens/tokens.css`](tokens/tokens.css)   | Colour (light and dark), print palettes, fonts, radii, spacing and motion as CSS custom properties |
| [`tokens/tokens.json`](tokens/tokens.json) | The same, plus the type roles, the print grid and the layout rules                                 |
| [`source/`](source/)                       | The generator the boards are drawn with (below)                                                    |

`canvas/` and `tokens/` are written by `source/build.mjs`; change the source and rebuild rather
than editing them.

## The canvas

| Page                     | Boards                                                                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read me                  | [What changed, how to read the canvas, where the figures come from, the critiques](screenshots/Main.png)                                                                                                                              |
| Today and the session    | Today, with the coach planning, More options, Check-in; the workout three ways, Add exercise, a fallback; logging (warm-ups, a set, typing a load, the ink moment, Why, Technique, History, a superset); Finish, the summary, offline |
| Training                 | Training, a programme day, logging a run, a ride and a swim, a run read back                                                                                                                                                          |
| Progress                 | The month, the calendar, a day, a past workout; History, Running, Recovery, Body, an exercise's whole life                                                                                                                            |
| Food                     | The day's bowl, over the target, adding to dinner, a portion                                                                                                                                                                          |
| Profile, coach, people   | Profile, Edit profile, Appearance, Privacy, Delete account; the AI coach, its proposed change, Friends, Gyms, a gym                                                                                                                   |
| First run                | Welcome, sports, a gym, its machines, a programme                                                                                                                                                                                     |
| Sizes, themes, platforms | Dark; 375 and 320 (pounds, whole scrolls); 440; Android 360 × 800; 200% text                                                                                                                                                          |
| System                   | [The system](screenshots/System.png), [the alphabet](screenshots/Alphabet.png), [iOS and Android](screenshots/Platforms.png)                                                                                                          |

## The signature moment

A set is inked only when the server has it. Save presses (120 ms) and reads Saving…; the set's
mark turns while the server answers; on the answer ultramarine rolls up the mark (420 ms,
`cubic-bezier(0.65, 0, 0.35, 1)`) and Save reads Saved; then set 4 takes the outline, the
values go back to suggestions, RIR empties and rest restarts at 3:00.

<p>
  <img src="screenshots/Moment@500ms.png" width="150" alt="Armed">
  <img src="screenshots/Moment@1600ms.png" width="150" alt="Saving">
  <img src="screenshots/Moment@2150ms.png" width="150" alt="Inking">
  <img src="screenshots/Moment@2400ms.png" width="150" alt="Saved">
  <img src="screenshots/Moment@2800ms.png" width="150" alt="Set 4">
</p>

## Where the content comes from

Every name, figure and line of copy is taken from this repository; where a figure is worked
out, it is worked out with the app's own rule. `source/data.mjs` names the source beside each.

| Content                                                    | Source                                                                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Today: Fri 11 Sept, Easy Run + Arms, its run and superset  | `src/app/(preview)/preview/page.tsx`                                                      |
| The programme, its days and targets, Upper B               | `src/db/seed/data/program.ts`, `warmups.ts`                                               |
| Logging the bench: sets, the Hold and its reason, the ramp | `src/server/repositories/sessions.test.ts`, `src/domain/progression.ts`, `warmup-ramp.ts` |
| Pounds: the squat at 135 and 140 lb                        | `scripts/dev/audit-workout.mjs`                                                           |
| The coach's Lower A, its status and its proposed change    | `coach-plans.test.ts`, `coach-actions.tsx`, `src/app/(preview)/preview/coaching/page.tsx` |
| The AI coach page: question, notes, memo                   | `scripts/dev/seed-audit.ts`                                                               |
| Progress, calendar, History, Running, Recovery, Body       | the audit database for `vinit` on 29 Sept 2026 (`scripts/dev/audit.mjs` and its seeds)    |
| Food: Fri 25 Sept, its over state, the food library        | `src/app/(preview)/preview/food/page.tsx`                                                 |
| Friends' activity, the profile's counts                    | `scripts/dev/seed-people.ts`, summarised as `activity-row.tsx` writes it                  |
| Gyms and machines                                          | `src/db/test/fixtures.ts`, `src/db/seed/data/equipment-types.ts`                          |
| Exercise search results                                    | `src/lib/exercise-search.ts`, run over the seeded library                                 |
| Every interface string                                     | the screens under `src/app` and `src/components`                                          |

## The generator

| File                                                       | What it draws                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| `art.mjs`                                                  | The prints: families, the module grid, day and month prints, the bowl    |
| `kit.mjs`, `icons.mjs`, `lib.mjs`, `color.mjs`             | Tokens, devices, components, glyphs, the page wrapper                    |
| `data.mjs`                                                 | Every figure and line, with its source                                   |
| `today.mjs`, `session.mjs`, `progress.mjs`, `food.mjs`     | The core screens                                                         |
| `more.mjs`, `people.mjs`, `extra.mjs`, `variants.mjs`      | Training, the coach, Profile, the first run, people and places, the rest |
| `system.mjs`, `alphabet.mjs`, `native.mjs`, `readme.mjs`   | The wide boards                                                          |
| `build.mjs`, `render.mjs`, `heights.json`, `critique.json` | The canvas, the tokens and the screenshots                               |

```sh
node docs/ui-redesign/revamp/form-v2/source/build.mjs              # boards, canvas.json, tokens
NODE_USE_ENV_PROXY=1 node docs/ui-redesign/revamp/form-v2/source/render.mjs --measure  # heights
node docs/ui-redesign/revamp/form-v2/source/build.mjs              # again, with the heights
NODE_USE_ENV_PROXY=1 node docs/ui-redesign/revamp/form-v2/source/render.mjs            # screenshots
```

`render.mjs` uses Playwright's Chromium (or `CHROMIUM_PATH`) and fetches the fonts from Google
Fonts through Node, so it works behind a proxy (`NODE_USE_ENV_PROXY=1`).

## How it was checked

See the read-me board's critique section and [`source/critique.json`](source/critique.json).
