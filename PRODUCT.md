# Product

<!-- impeccable:product-schema 1 -->

Written on 2 October 2026 from the repository, without the usual interview. The lines first
marked _(inferred)_ were checked the same day against the code and against the owner's notes on
the Form v2 canvas: kept where the code bears them out, corrected where it did not, and marked
with their evidence. _Undecided_ marks what nobody has decided yet.

## Platform

web

## Users

- People who train, often at more than one gym, and record it on their phone: lifting first,
  with runs, rides, swims, mobility and food beside it. Overload began as one lifter's app and
  became an account per person once friends wanted to use it
  ([ADR 0010](docs/decisions/0010-multi-user-accounts.md)). The app calls them athletes.
- The scene is the gym floor between sets: one hand, sweaty, glancing at the screen, in bright
  gyms and dark ones ([the revamp brief](docs/ui-redesign/revamp/README.md)).
- The job: know what is owed today and where, record every set as it happens with the
  suggestion for the next one in view, and afterwards see how training, recovery, body weight
  and food are going.

## Product Purpose

Overload is a workout tracker: "Progressive overload, one set at a time." It says what is owed
today from a programme, records every set with its own load, reps and effort, suggests the next
load from what was done before, and keeps machine history per gym and per machine, so stack
numbers from different equipment are never mixed. Beside lifting it records runs, rides and
swims, recovery check-ins, body weight and food, and an optional AI coach plans the next
session. Friends can follow each other and compare what each chooses to share.

What success means has not been written down. _Undecided._

## Positioning

What a neighbouring tracker could not truthfully copy (checked against the code, 2 October 2026):

- **History per gym and per machine.** A machine's stack numbers are its own: never converted,
  never mixed with another gym's, never compared or ranked between friends (machine and cable
  exercises are `equipment_specific` in the seeded library and left out of leaderboards and
  comparisons: `src/domain/leaderboard.ts`, `src/domain/shared-stats.ts`).
- **A suggestion for every exercise, with its reason.** Add load, Hold, Repeat, Reduce, Step
  back, Add time, Add distance and Starting guess come from the athlete's own history; an
  exercise with none says so ("No history"). Why is one tap away (`src/lib/labels.ts`,
  `src/domain/progression.ts`).
- **A coach that writes the programme and prepares each session.** It drafts a programme from
  the athlete's answers, prepares each session overnight for the gym the athlete will train at,
  and reviews the programme each week; a change to the split or schedule waits for the
  athlete's approval ([ADR 0018](docs/decisions/0018-ai-house-coach.md),
  `docs/coach-automation.md`, `src/app/(app)/profile/ai-coach/`). Corrected: the first reading
  had it only planning the next session.
- **One record for every sport a day owes:** lifting, running, cycling, swimming, mobility and
  food on the same day, each its own task.

## Operating Context

- A phone-first PWA installed from Safari on iPhone and Chrome on Android. Native iOS and
  Android apps are planned, and the design has to translate to them.
- A session starts on Today at a chosen gym (a gym, outdoors or home), which stays fixed for
  that session. A short check-in (sleep hours, sleep quality, fatigue, soreness) comes first,
  then the exercises in any order, then Finish with notes and body weight.
- Programmes run in cycles of days: "8-Week Strength + Aesthetics Hybrid" is 8 cycles of 7 days,
  from Lower A to Rest + Mobility. Ad hoc sessions carry no programme.
- The rest timer, when turned on, runs on every screen and survives reloads. Offline, drafts stay
  on the device and saving retries when the connection returns.
- The coach plans daily at 04:00 and on request (three requests a day), and writes summaries,
  notes, warnings and questions that the app shows as text.
- Each account sets its units (kilograms and centimetres, or pounds and feet) and its time zone.

## Capabilities and Constraints

**What it does.** Five destinations: Today, Training, Food, Progress, Profile. What each core
screen must keep is [the feature inventory](docs/ui-redesign/revamp/features.md): a redesign
may move, regroup, rename or put behind a tap anything listed there, never drop it.

**What must not change** ([decisions implementation must preserve](docs/ui-redesign/README.md#decisions-that-implementation-must-preserve)):

- Load, reps (or time or distance) and effort belong to each set; identical sets stay separate
  records, and editing one never touches another.
- An identical prescription shows once above its sets. Effort is entered by the athlete, never
  pre-filled; a suggested value looks unconfirmed until saved.
- One unfinished workout at a time; the gym is chosen before starting and fixed for the session.
- Exercises are only added or skipped, never reordered or deleted; supersets apply to this
  workout only and never change the programme.
- Ad hoc sessions carry no invented programme, cycle or day.
- Progressive disclosure changes placement, not availability.
- System, Light and Dark appearance, changed locally and at once.

**Terminology.** RIR (reps in reserve) for rep-based sets, RPE 1–10 for timed sets and carries.
An exercise counts reps, seconds or metres. Set types: Warm-up, Working, Back-off, Drop, AMRAP,
To failure. Targets read "3 × 8–12 @ 1–2 RIR"; place in a programme reads "Cycle 1 of 8 · Day 3".

**Technical.** Next.js 16 (App Router), React 19, Tailwind CSS v4, Supabase and Drizzle. The
JavaScript budgets are targets: +5 KiB gzip on the shared shell and +15 KiB per route, with any
excess recorded in `DESIGN.md` with its reason ([overload-ui](.claude/skills/overload-ui/SKILL.md)).

**Undecided.**

- The oldest supported iPhone and Android browser and the weakest target phone, which set the
  first-paint, memory and frame budgets.

## Brand Commitments

- The name is Overload, and it stays. Everything else was reopened on 30 September 2026:
  themes, interface, experience and typography start again, aiming to be creative, minimal and
  intuitive. Form's copper, warm neutrals, wordmark and system face are not constraints
  ([revamp decisions](docs/ui-redesign/revamp/README.md#decisions)).
- Typefaces must be licensed for the web and for embedding in the native apps.
- Copy is in sentence case and British English, in plain words, with numbers in the app's own
  notation ("60 kg × 5 @ 2 RIR").

## Evidence on Hand

All real, all in the repository:

- The shared library: 276 exercises, 93 kinds of equipment, warm-up protocols and the
  programme templates (`src/db/seed/data/`).
- Development previews of Today, logging, coaching, food and Progress's Overview against fixed
  data (`src/app/(preview)/preview/`).
- Six audit accounts, four of them with 56 months of history
  ([local audit setup](docs/audits/local-56-months.md), `scripts/dev/seed-audit.ts`,
  `scripts/dev/seed-audit-history.ts`).
- Sample content for each core screen, with its source, in
  [the feature inventory](docs/ui-redesign/revamp/features.md).
- The coach's plans and texts in tests and previews (`src/server/repositories/coach-plans.test.ts`,
  `src/server/repositories/coaching-workflow.test.ts`, `src/app/(preview)/preview/coaching/`).

There are no testimonials, user numbers, reviews, press, store listings or prices. Every figure
in a design comes from the sources above; nothing is invented.

## Product Principles

Checked against the decisions above and the owner's notes (2 October 2026):

1. **Every set is its own record.** Nothing is shared between sets, pre-filled as effort or
   merged to save space.
2. **Move, never remove.** Disclosure changes where a feature is, not whether it is there.
3. **The hand between sets leads.** A glance and one thumb are enough to record a set; targets
   and editable text never shrink to fit.
4. **Only real numbers.** Suggestions, totals and records come from what the athlete logged; a
   gap is unknown, never zero.
5. **Yours unless shared.** A friend sees a short, separate list, and only once allowed to
   follow.
6. **Say it once.** A screen says each thing once, in as few words as it needs, and shows state
   rather than spelling it out. Added from the owner's notes on the Form v2 canvas.

## Accessibility & Inclusion

- Targets of at least 44 px, zoom never disabled, usable at 320 px wide and at 200% text, and a
  "Skip to content" link ([the shell](docs/ui-redesign/revamp/features.md#everywhere-the-shell)).
- Tap targets and editable text never shrink to fit a layout.
- Reduced motion is honoured; `DESIGN.md` sets how.
- The audit scripts run axe. _Undecided:_ whether a named standard, such as WCAG 2.2 AA, is
  required.
