# Onboarding audit — 10 October 2026

Branch: `claude/compassionate-johnson-4d92ww`, created from `main` at
`e0c21797f52d40e52d7ec9a594f0d6d55471a8ca`.

Sign-up through to Today, walked as a beginner and as an experienced lifter on a local stack,
on seven phone sizes, in both themes and at 200% text, with every row the flow writes read back
from the database. It records what the flow is, what it asks twice or asks too early, the bugs
found on the way, and a shorter flow for each kind of athlete.

## How it was run

| Component       | Where                                                                               |
| --------------- | ----------------------------------------------------------------------------------- |
| Application     | `next dev` on `http://127.0.0.1:3100` (`node scripts/dev/audit.mjs dev`)            |
| Authentication  | `scripts/dev/auth-stub.mjs` on `127.0.0.1:54321` (sign-up signs straight in)         |
| Database        | PostgreSQL 16, `overload_audit_onboarding`: migrations and the shared library only |
| Browser         | Chromium 141 with each phone's size, pixel ratio, touch and user agent              |
| Coach           | Not configured locally, so "Create my programme" cannot be pressed                  |

Phones: 320 × 568 (iPhone SE, first generation), 360 × 740 (Galaxy S8), 375 × 667 (iPhone SE,
installed), 390 × 664 (iPhone 13 in Safari, bars included), 402 × 874 (iPhone 17, installed),
412 × 839 (Pixel 7) and 440 × 956 (iPhone Pro Max), plus 280 × 653 (a folded phone's cover
screen) as a stress test below the app's 320 floor. Each screen was probed for sideways
overflow, text cut off in its box, targets under 44 pt, content that cannot scroll clear of the
pinned actions, and whether the main action is on the first screen. Console errors, page errors
and failed requests were recorded on every step.

Limits: WebKit could not start in this container, so iPhone sizes ran in Chromium; native
keyboards, pickers, safe areas and Safari's own bars still need a real device. Email
confirmation is not part of the local stand-in. The coach's writing of a programme was not
exercised.

No overflow, clipped text, console error or failed request was found on any phone. What follows
is about the flow itself.

## The flow today

Both kinds of athlete go through the same six screens; the answer to "Which sounds like you?"
changes only the machines step and, later, the coach's questions.

| #   | Screen                              | What it asks                                                                                                                                                                                                                                         |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Sign up `/signup`                   | Name, username (optional), email, password, confirm password                                                                                                                                                                                         |
| 1   | You `/welcome`                      | A print of four sports and its key; name and username again; "Which sounds like you?" (required, no default); weight units; time zone as free text                                                                                                  |
| 2   | Sports `/welcome/sports`            | Strength, Running, Cycling, Swimming — Strength and Running already ticked. Without Strength, jumps to 5                                                                                                                                              |
| 3   | Gym `/welcome/gym`                  | Name, then Gym, Outdoor or Home; Add gym, or Skip for now (to 5)                                                                                                                                                                                     |
| 4   | Machines `/welcome/equipment`       | At a gym, "Usually here (18)" with Review. **New:** 12 illustrated machines to tick; a family asks which variant ("Which chest press?"). **Experienced:** every other type, about 75 rows in seven groups, searchable. Continue, Add N and continue, Skip |
| 5   | Plan `/welcome/programme`           | One template, already chosen: 8-Week Strength + Aesthetics Hybrid (six lifting days in seven, 70–100 min). Start date. Create with the coach, Build it yourself, I'll train without a programme; pinned: Start training, Just track my workouts     |
| 5a  | Coach `/welcome/programme/create`   | New: one screen (goal, height, weight, age, injuries, days, gym or home, a free-text box). Experienced: five steps (You, Your week, Your training, Starting point, Review)                                                                       |
| 5b  | Builder `/welcome/programme/manual` | Programme name, weeks, notes; per day: name, weekday, focus, warm-up, time, notes, exercises, run                                                                                                                                                    |
| —   | Today                               | The first programme day, an "add a gym" screen, or "No programme"                                                                                                                                                                                    |

A beginner who starts the template needs about fourteen answers and taps over six screens; an
experienced lifter at a well-equipped gym needs a search per unusual machine on top.

## What is asked twice, or for nothing

1. **Name and username, twice.** Sign-up asks for both, then step 1 asks again, pre-filled
   (`signup-form.tsx`, `profile-step-form.tsx:47-62`). A blank username becomes the email's
   first twenty characters (`bea.iphone17.light.m`).
2. **Confirm password.** A second password box on the one form that is already longer than a
   screen on every phone tested; Create account is below the fold everywhere.
3. **Time zone as a text box.** It is detected from the browser and correct for nearly everyone,
   but is shown as an editable IANA name. "London" is refused ("That is not a time zone this app
   recognises").
4. **The print and its key on step 1** name the four sports one screen before step 2 asks
   about them. At 320 pt and at 200% text the first screen holds the print, the title and
   Continue, and no question.
5. **Two ways to say "no programme".** "I'll train without a programme" and "Just track my
   workouts" end the same way (`welcome/programme/page.tsx:56-65`).
6. **Experience asked again by the coach.** "How long have you been training?" (defaulting to
   "Not sure") after "I already train"; "Runs a week" after Running was ticked, and Review says
   "Running: None".
7. **Gym name and kind.** A home gym is typed "Home" and then tapped "Home".
8. **Three ways on from a revisited gym step:** Continue, Add gym and Skip for now.
9. **The machines step against the workout's own question.** The step asks a beginner to
   recognise machines up front, while the workout already asks "Yes, it's here / Not here"
   the first time an exercise needs one (owner decision of 4 October). A newcomer cannot tell
   a chest press machine from an iso-lateral plate-loaded press before standing in front of it.
10. **Two titles and two Backs** on the coach and builder screens ("Create a programme" over
    "About you"; "Programme builder" over "Build your programme"), and a second five-step
    progress bar inside the fifth onboarding step.

## Bugs

| ID  | Severity | What                                                                                                                                                                                                                                                                                                                                                      | Where                                                                                                   |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| B1  | High     | An account that only swims, runs or cycles is told "Only lifting needs a gym set up", then lands on Today with "Add a gym to start training" as its only action                                                                                                                                                                                           | `today/today-view.tsx:582`                                                                              |
| B2  | High     | "I'm new to this" changes nothing on the plan step: the only template, pre-chosen behind "Start training", is six lifting days a week at 70–100 minutes. A beginner's first Today is Lower A, 70–90 min. A swimmer is offered the same lifting programme                                                                                                 | `welcome/programme/page.tsx`, `db/seed/data/templates.ts`                                              |
| B3  | High     | The machine search leaves out the 18 basics a gym is assumed to have: "pec deck" finds only Rear delt machine, "lat pulldown" only two combination machines, "leg curl" not the seated one. The experienced test lifter ended up with "Lat pulldown and low row" and "Leg press and hack squat" registered                                            | `lib/machines-step.ts:197`                                                                              |
| B4  | Medium   | Unfinished setup resumes on the machines step whenever the gym has no machine rows, which is what Continue with nothing ticked leaves: the usual beginner path. Anyone who has done that step is sent back to it                                                                                                                                         | `server/queries/onboarding-entry.ts:29`                                                                 |
| B5  | Medium   | "Add a custom exercise to your library" on the setup builder opens `/exercises/new`, which sends a not-yet-onboarded account back to the machines step (B4); the builder's unsaved work is lost                                                                                                                                                      | `components/coaching/builder-page.tsx`                                                                  |
| B6  | Medium   | Back on the plan step is fixed to the machines step; with no client history (a reload, a link) a swimmer lands on the gym step they were meant to skip                                                                                                                                                                                                 | `welcome/programme/page.tsx:40`                                                                         |
| B7  | Medium   | After "Just track my workouts", Today's main action is "Choose a programme", under the title "No programme"                                                                                                                                                                                                                                          | `today/today-view.tsx:591`                                                                              |
| B8  | Medium   | Skip for now on the gym step lets a lifter start a programme, then Today refuses to start it until a gym is added                                                                                                                                                                                                                                       | `welcome/skip-link.tsx`, `today/today-view.tsx:582`                                                     |
| B9  | Low      | Skip for now on the machines step drops whatever was ticked, without a word                                                                                                                                                                                                                                                                              | `welcome/equipment/equipment-step-form.tsx:382`                                                         |
| B10 | Low      | Running is switched on for every new account; a beginner who only lifts has to untick it                                                                                                                                                                                                                                                                 | `server/repositories/sport-preferences.ts:25`                                                           |
| B11 | Low      | Pounds and a US time zone still leave running in kilometres; distance units are never asked or inferred                                                                                                                                                                                                                                                   | `server/repositories/sport-preferences.ts:71`                                                           |
| B12 | Low      | The coach's five steps accept nothing at all and say so only on Create, in one sentence at the foot                                                                                                                                                                                                                                                   | `components/coaching/intake-form.tsx:184`                                                               |
| B13 | Low      | A lifter who skipped the gym and left mid-setup resumes on step 1, answering name and experience again                                                                                                                                                                                                                                              | `server/queries/onboarding-entry.ts:27`                                                                 |
| U1  | Medium   | "Choose the one that sounds like you." stays under the choice after it is made                                                                                                                                                                                                                                                                          | `welcome/profile-step-form.tsx:63`                                                                      |
| U2  | Medium   | A time zone error drops the units control out of line with the time zone box (the row aligns to its foot)                                                                                                                                                                                                                                                | `welcome/profile-step-form.tsx:77`                                                                      |
| U3  | Medium   | The coach's Back and Continue float as a shadowed card the colour of the cards under it, with the next box showing beneath; "Create my programme" breaks over two lines at 402 pt. DESIGN.md: flat, and pinned actions run to the foot in ground                                                                                                     | `globals.css` `sticky-actions`, `intake-form.tsx:405`                                                   |
| U4  | Medium   | The coach and the builder leave the setup frame: no step dots, boxed cards (DESIGN.md: no boxed lists), Form v1 type sizes, a second progress bar                                                                                                                                                                                                       | `components/coaching/*`                                                                                 |
| U5  | Low      | On 320 × 568 the plan step's Create with the coach, Build it yourself and "train without a programme" sit under the pinned actions; at 200% text the machines step's pinned actions cover 39% of the screen                                                                                                                                            | `welcome/programme/page.tsx`, `onboarding.css`                                                          |
| U6  | Low      | One selection drawn two ways: square tick boxes on the tiles, round marks in the full list                                                                                                                                                                                                                                                                | `equipment-step-form.tsx`                                                                               |
| U7  | Low      | "Strength" on the sports tile, "Lifting" in the print's key and the note under the tiles                                                                                                                                                                                                                                                                 | `domain/activity.ts:22`, `welcome/page.tsx:15`                                                          |
| U8  | Low      | The gym step's field is labelled "Name" (of what?), and its action says "Add gym" for a home or an outdoor place                                                                                                                                                                                                                                         | `welcome/gym/first-gym-form.tsx`                                                                        |
| U9  | Low      | Two of the twelve beginner tiles (hip abduction, hip adduction) have no drawing; on a first visit the drawings arrive after the tiles                                                                                                                                                                                                                    | `equipment-step-form.tsx`, `server/queries/equipment-art.ts`                                            |
| U10 | Low      | The coach's two large boxes write their examples in `control` grey on surface: 3.3:1, under the 4.5:1 body text needs (Impeccable's detector, confirmed by hand). Every other field uses ink 2                                                                                                                                                         | `components/ui/dictation.tsx:305`                                                                       |
| U11 | Low      | Sign-up and every setup step have no `main` landmark, so nothing outside the header is in a region (axe `landmark-one-main`, `region`, at 390 and 320 pt; no WCAG A or AA violations otherwise)                                                                                                                                                         | `(auth)/layout.tsx`, `(onboarding)/layout.tsx`                                                          |
| U12 | Low      | The coach and builder pages in setup have no page title of their own ("Overload"), and the builder shows two `h1`s                                                                                                                                                                                                                                      | `welcome/programme/create`, `welcome/programme/manual`                                                  |
| U13 | Low      | The step dots count by position, so a swimmer's dots (and their spoken labels) mark Gym and Machines "completed"                                                                                                                                                                                                                                       | `welcome/steps.tsx`                                                                                     |
| U14 | Low      | Sign-up stands in a box; DESIGN.md puts the sign-in screens "on the ground at the gutter, never in a box"                                                                                                                                                                                                                                              | `(auth)/signup/page.tsx`, DESIGN.md                                                                     |
| U15 | Low      | An invalid username reads as a grey hint until Continue; the coach's file drop is drawn dashed, which DESIGN.md keeps for "skipped"                                                                                                                                                                                                                    | `components/username-field.tsx:131`, `intake-form.tsx:1180`                                             |

The independent design review (Impeccable critique, Nielsen heuristics) scored the flow 25 of
40, "acceptable": strongest on system status, control, recognition and help (3 each), weakest on
real-world match, consistency, error prevention, efficiency and recovery (2 each). Impeccable's
detector found nothing in the source, and axe found no WCAG A or AA violations.

## A shorter flow for each kind of athlete

The rules it follows: ask each thing once, infer what the browser already knows, let the
first question decide how much else is asked, leave machines to the workout that needs them,
and finish on a real first workout.

**Sign-up:** name (optional), email, password with Show, Create account. No username (made
from the name or email, changed later in Profile or the first time Friends opens), no confirm
box. One screen on a 320 × 568 phone.

**Beginner (new to this), three screens:**

1. **You** — "Which sounds like you?" as two large choices, then "What do you train?" as
   tiles with nothing ticked but what the athlete taps. Units and time zone are one quiet line,
   "kg · London time · Change", inferred from the browser.
2. **Where** (lifters only) — Gym, Home or Outdoors first, then an optional name. At a gym
   nothing more is asked: the basics are assumed and anything else is confirmed in the workout.
   At home, the eight-tile "What do you have?" set, because nothing is assumed there.
3. **Plan** — one recommended beginner programme (three full-body days, under an hour) with
   Start, the coach's one-screen route as the alternative, and Just log workouts. A non-lifter
   skips this and lands on Today with their sports' shortcuts.

**Experienced lifter (already trains), three screens and one optional:**

1. **You** — as above.
2. **Where** — as above, plus "Anything unusual there?": one search over every type, basics
   included and marked "Usually here", for the belt squat or the GHD. Optional and skippable.
3. **Plan** — Just log workouts first (most experienced lifters arrive with their own plan),
   then the templates, Build your own and the coach's detailed route.

**Today** honours the answer: a programme's first day; for a logger, Start a workout first and
Choose a programme quietly after; for a non-lifter, their sports, never "Add a gym".

## Owner decisions, 10 October 2026

- **Mock it first.** The shorter flow is drawn on a Claude Design canvas ("Overload onboarding
  redesign") for sign-off before any application code changes.
- **Machines in setup.** Dropped for anyone new at a gym: the basics are assumed and the
  workout asks about anything else. Optional for experienced lifters, as one search that also
  finds the basics. Home and outdoors keep a short pick, because nothing is assumed there.
  This revises the 4 October onboarding-equipment decision.
- **A beginner's plan.** The coach writes it: its one-screen questions are the beginner's plan
  step, with what setup already knows filled in.
- **Sign-up.** Name (optional), email and a password with Show. The username is made for the
  athlete and changed later; setup asks none of these again.
