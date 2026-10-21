# Product

<!-- impeccable:product-schema 1 -->

Written on 2 October 2026 from the repository, without the usual interview. The lines first
marked _(inferred)_ were checked the same day against the code and against the owner's notes on
the Form v2 canvas: kept where the code bears them out, corrected where it did not, and marked
with their evidence. _Undecided_ marks what nobody has decided yet.

Programme ownership and logging were updated on 16 October 2026 against the shipped flows and
[ADR 0056](docs/decisions/0056-independent-sport-programmes.md). Today, Plan and Log were updated
on 20 October 2026 against [ADR 0058](docs/decisions/0058-today-and-plan.md).

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
  and reviews each sport at its own cadence. It reads the other programmes as coordination
  context; a proposed change to another sport is reviewed separately. Changes to the split or
  schedule wait for the athlete's approval ([ADR 0018](docs/decisions/0018-ai-house-coach.md),
  [ADR 0056](docs/decisions/0056-independent-sport-programmes.md), `docs/coach-automation.md`).
- **One record for every sport a day owes:** lifting, running, cycling, swimming, mobility and
  food on the same day, each its own task.

## Operating Context

- A phone-first PWA installed from Safari on iPhone and Chrome on Android. Native iOS and
  Android apps are planned, and the design has to translate to them.
- A live lifting session starts on Today at a chosen gym (a gym, outdoors or home), which stays
  fixed for that session. A short check-in (sleep hours, sleep quality, fatigue, soreness) comes
  first, then the exercises in any order, then Finish with notes and body weight.
- Strength, running, cycling and swimming each have at most one active programme and progress
  independently. Strength follows its sequence of programme days and cycles; endurance follows
  dated sessions. A missed run, ride or swim stays on its original date, Missed on Plan's week
  and offered by Log, and blocks no sport.
- The tabs divide by time ([ADR 0058](docs/decisions/0058-today-and-plan.md)). Today is now: a
  card for each session still owed (the strength programme's next day, unless one was done
  today, and each run, ride or swim dated today), a row for each session done today, and Log for
  anything else. Plan is next: This week's sessions by date for every sport, a card per
  programme, and Past programmes. Progress is done: history, records and trends.
- Log asks what was done, which planned session it counts as, and when. Counts as lists the
  sport's open sessions from 14 days back to 6 ahead, or for a workout the strength cycle's days,
  then Unplanned. Only the session named counts toward its programme; an unplanned log carries no
  invented programme, cycle or day. A saved run, ride or swim can change what it counts as on its
  own page.
- Retrospective logging records the actual training date and time. A lifting entry started from
  Log's Done earlier has no live rest timer or abandoned-workout prompt, asks for its actual
  finish time, and returns to Today. Prescribed performance is never pre-filled as actuals.
- The rest timer, when turned on for a live workout, runs on every screen and survives reloads.
  This is an online PWA: private pages and submissions need a connection, while unsent drafts
  stay on the device for recovery. Private pages are not cached by the service worker.
- The coach plans daily at 04:00 and on request (three requests a day), and writes summaries,
  notes, warnings and questions that the app shows in the coach's note: two lines, then More.
  How the coach works is never said on a screen.
- Each account sets its units (kilograms and centimetres, or pounds and feet) and its time zone,
  in Profile › Units and time zone.

## Capabilities and Constraints

**What it does.** Five destinations: Today, Plan, Food, Progress, Profile. What each core
screen must keep is [the feature inventory](docs/ui-redesign/revamp/features.md): a redesign
may move, regroup, rename or put behind a tap anything listed there, never drop it.

Plan holds what comes next and how it is built. This week lists every sport's sessions by date,
Monday to Sunday, each day gone by folded to what became of it: today's point to Today, past ones
read Done, Skipped or Missed, a run, ride or swim opens its page to move or skip it, and a lifting
day opens its day's page, drawn once, where it was done or skipped or where the sequence will reach
it. Each existing programme has a card (its sport, name, how it runs, where it has got to and any
change waiting) and one page, `/plan/[sport]`, with its weeks or days, Edit programme, what waits
for you from the coach, what is with the coach and what it changed on its own, Request a change,
coach review and that programme's past requests and changes (strength's under Changes). Replace,
Duplicate and End programme sit under the page's More options; an ended or replaced programme is
under Past programmes. New programme asks for a sport, then Repeating, Progressive or With the
coach, which for strength is its whole intake, plans and reports to attach included; there are no
templates. Profile › AI coach keeps the coach's switch, what it is working on, notes for every
programme at once, what it remembers and the access tokens; it names a programme waiting for you
only by its state and links to that programme's page. Each sport has its own intake, review cadence
and programme requests; the account switch, request quota and evidence history remain shared.
Existing drafts and history remain reachable ([Plan direction](docs/ui-redesign/training-programmes.md),
[ADR 0060](docs/decisions/0060-every-page-under-its-tab.md)).

Logging is Today's. A card starts or logs the session it stands for, and Log takes anything
else: late, early, unplanned or done earlier, and a body weight reading, as a workout's Finish
does. A saved run, ride or swim changes what it counts as on its own page (Counts as). Session templates, saved routines and Save as routine, the
session library, one-off scheduling (Scheduled by you) and single sessions from the coach are
set aside for now: a session is planned by a programme or unplanned. Their pages redirect, and
their data and server code are kept ([ADR 0058](docs/decisions/0058-today-and-plan.md)).

Running has its own way in ([ADR 0059](docs/decisions/0059-running-programmes-laps-and-heart-rate-zones.md)).
With the coach, a running programme starts from the runner's goal (a race on a date, or a goal
without one), a recent race or time trial, their usual week and longest run, and the days they can
run, filled in from their logs where it can be; the coach writes it from running's own reference,
the runner's logged weeks and their other programmes, keeping hard running off heavy leg days
where it can. A planned run says its kind (easy, long, tempo, intervals and so on) and is written
as steps, each ended by a time or a distance, with a pace or a heart-rate zone. A logged run keeps
its kind, outdoor or treadmill, and its laps from the watch with their heart rate. Heart-rate
zones are the athlete's own: Profile › Heart rate zones holds the maximum (entered, raised by a
harder run, or estimated from age), the resting heart rate and how the zones are worked out.

**What must not change** ([decisions implementation must preserve](docs/ui-redesign/README.md#decisions-that-implementation-must-preserve)):

- Load, reps (or time or distance) and effort belong to each set; identical sets stay separate
  records, and editing one never touches another.
- An identical prescription shows once above its sets. Effort is entered by the athlete, never
  pre-filled; a suggested value looks unconfirmed until saved.
- One unfinished workout at a time; the gym is chosen before starting and fixed for the session.
- Exercises are only added or skipped, never reordered or deleted; supersets apply to this
  workout only and never change the programme.
- Unplanned sessions carry no invented programme, cycle or day.
- A scheduled log explicitly names its endurance occurrence and revision or lifting cycle and
  day. Choosing a date never matches a programme implicitly; changing or completing one sport
  never replaces or advances another. Past sessions of a continuing programme keep their
  prescriptions and remain loggable after future edits.
- Progressive disclosure changes placement, not availability.
- Each fact has one home ([Information map](#information-map)); another screen links to it by
  name and never restates it.
- System, Light and Dark appearance, changed locally and at once.

**Terminology.** RIR (reps in reserve) for rep-based sets, RPE 1–10 for timed sets and carries.
An exercise counts reps, seconds or metres. Set types: Warm-up, Working, Back-off, Drop, AMRAP,
To failure. Targets read "3 × 8–12 @ 1–2 RIR"; a programme's place reads
"Every week · Week 3 of 8" or "Progressive · Day 12 of 40". A planned session is Done, Skipped
or Missed, and one no programme planned is Unplanned. A planned session is named by its title,
else its kind, else its sport ("Tempo run", "Easy run", "Run"), the same on Today, Plan, Log and
its page, with its figure beside it ("30 min", "2.5–3.0 km"), never in its place. A workout is
named by its programme day, else the routine it was started from, else, once finished, its first
two exercises with a set logged ("Pull-up, Bent-over row"); one still open, or with nothing
logged, is "Unplanned session", and a friend reads "Workout". The coach's
settled requests and changes are "Past requests and changes", never History, which is
Progress's. The words Today
and Plan replaced are listed in [ADR 0058](docs/decisions/0058-today-and-plan.md), Words.

**Technical.** Next.js 16 (App Router), React 19, Tailwind CSS v4, Supabase and Drizzle. The
JavaScript budgets are targets: +5 KiB gzip on the shared shell and +15 KiB per route, with any
excess recorded in `DESIGN.md` with its reason ([overload-ui](.claude/skills/overload-ui/SKILL.md)).

**Undecided.**

- The oldest supported iPhone and Android browser and the weakest target phone, which set the
  first-paint, memory and frame budgets.

## Information map

Where each fact lives. Another screen may link to it by name, never restate its details or
repeat its button ([ADR 0058](docs/decisions/0058-today-and-plan.md)). A date that orients a list
(a week's range, a session's weekday) is not a restated fact, and stands wherever the list
stands.

A page's route begins with its home's tab, and that tab is the one lit: `/today` (Log's form is
`/today/log/new`, a body weight `/today/log/body-weight`), `/plan` (a session `/plan/sessions/…`, a
strength day `/plan/strength/days/…`, each builder `/plan/[sport]/edit`, the coach's questions
`/plan/new?…&method=coach`, drafts, requests and past requests), `/food`, `/progress` and
`/profile` (Units and time zone `/profile/units`); or with a section the shell maps to a tab:
`/workouts` (a session is Today's), and `/gyms`, `/exercises` and `/u` (Profile's). A record more
than one tab opens, a finished workout or a logged run, ride or swim (`/progress/activities/…`),
keeps the tab its link names, else Progress. A back link names the page it returns to ("Running
programme"). Old paths redirect permanently ([ADR 0060](docs/decisions/0060-every-page-under-its-tab.md)).

| Fact                                                                               | Home                                           |
| ---------------------------------------------------------------------------------- | ---------------------------------------------- |
| Today's sessions, every sport's                                                    | Today, a card each                             |
| Starting or resuming a workout                                                     | Today, the workout's card                      |
| Logging a session owed today                                                       | Today, its card                                |
| Logging anything else: late, early, unplanned or done earlier                      | Today › Log                                    |
| A body weight reading                                                              | Today › Log › Body weight; a workout's Finish  |
| Skipping today's workout; the coach's preparation                                  | Today, the workout card's More options         |
| Picking up from today after missed days                                            | Today, under the date                          |
| What was done today                                                                | Today › Done, a row each that opens its record |
| This week's sessions by date                                                       | Plan › This week                               |
| Moving or skipping a run, ride or swim                                             | Plan › This week › the session's page          |
| How a programme runs and where it has got to                                       | Plan › the programme's card and page           |
| A programme's progress, weeks or days; editing or ending it                        | Plan › the programme's page                    |
| A programme day's exercises and targets                                            | Plan › the day's page                          |
| Starting a new programme                                                           | Plan › New programme                           |
| A first programme, from the request to its start                                   | Plan, beside the programme cards               |
| Asking the coach about a programme; its changes, questions and past requests       | Plan › the programme's page                    |
| Programmes ended or replaced                                                       | Plan › Past programmes                         |
| What a logged run, ride or swim counts as                                          | Its page › Counts as                           |
| History, records, the calendar and trends                                          | Progress                                       |
| Body weight over time                                                              | Progress › Body weight                         |
| Meals, foods and food targets                                                      | Food                                           |
| The coach's switch, work in hand, notes for every programme, memory, access tokens | Profile › AI coach                             |
| Name, username, height, date of birth, sex and training goal                       | Profile › Edit profile                         |
| Units and time zone                                                                | Profile › Units and time zone                  |
| Sports, gyms and machines                                                          | Profile                                        |
| Maximum and resting heart rate, and the zones                                      | Profile › Heart rate zones                     |
| A run's laps and its time in each zone                                             | Its page                                       |

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

- The shared library: 376 exercises, 93 kinds of equipment, warm-up protocols and the
  programme templates (`src/db/seed/data/`).
- Development previews of Today, Plan, logging, coaching, food and Progress's Overview against
  fixed data (`src/app/(preview)/preview/`).
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
6. **Say it once, and only what is needed.** A screen says each thing once, in as few words as it
   needs, and shows state rather than spelling it out. It carries what the athlete needs to act
   or to know where they stand, and nothing about how the app, the coach or a plan works; an
   explanation someone may want is a tap away, in an ⓘ or a fold (owner, 20 October 2026;
   `DESIGN.md`, The Need-to-Know Rule). Added from the owner's notes on the Form v2 canvas. The
   [Information map](#information-map) lists each fact's home; elsewhere it is a link by name
   ([ADR 0058](docs/decisions/0058-today-and-plan.md)). Where another rule here, in `DESIGN.md`
   or in the feature inventory asks a screen to show more, this principle wins, except for what
   accessibility needs on the screen itself: a control's label, a rule or format a value must
   meet, an error and its fix, a change of status and a consequence that cannot be undone. Those
   are not explanations, and they stay.

## Accessibility & Inclusion

- Targets of at least 44 px, zoom never disabled, usable at 320 px wide and at 200% text, and a
  "Skip to content" link ([the shell](docs/ui-redesign/revamp/features.md#everywhere-the-shell)).
- Tap targets and editable text never shrink to fit a layout.
- Reduced motion is honoured; `DESIGN.md` sets how.
- An ⓘ is a button beside the words it explains: opening it keeps focus where it is, and its note
  is read next. A fold is a `Disclosure` named for what it holds. Neither covers what it explains
  at 320 px and 200% text.
- The audit scripts run axe. _Undecided:_ whether a named standard, such as WCAG 2.2 AA, is
  required.
