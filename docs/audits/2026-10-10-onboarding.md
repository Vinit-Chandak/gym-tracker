# Onboarding audit — 10 October 2026

Branch: `claude/compassionate-johnson-4d92ww`, created from `main` at
`e0c21797f52d40e52d7ec9a594f0d6d55471a8ca`.

Sign-up through to Today, walked as a beginner and as an experienced lifter on a local stack,
on seven phone sizes, in both themes and at 200% text, with every row the flow writes read back
from the database. It records what the flow is, what it asks twice or asks too early, the bugs
found on the way, and a shorter flow for each kind of athlete.

The shorter flow was built on 11 October 2026: [What was built](#what-was-built-11-october-2026)
records it and where each finding stands, and
[ADR 0053](../decisions/0053-a-setup-that-asks-once.md) the decisions.

## How it was run

| Component      | Where                                                                              |
| -------------- | ---------------------------------------------------------------------------------- |
| Application    | `next dev` on `http://127.0.0.1:3100` (`node scripts/dev/audit.mjs dev`)           |
| Authentication | `scripts/dev/auth-stub.mjs` on `127.0.0.1:54321` (sign-up signs straight in)       |
| Database       | PostgreSQL 16, `overload_audit_onboarding`: migrations and the shared library only |
| Browser        | Chromium 141 with each phone's size, pixel ratio, touch and user agent             |
| Coach          | Not configured locally, so "Create my programme" cannot be pressed                 |

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

## The flow on 10 October

Both kinds of athlete go through the same six screens; the answer to "Which sounds like you?"
changes only the machines step and, later, the coach's questions.

| #   | Screen                              | What it asks                                                                                                                                                                                                                                              |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Sign up `/signup`                   | Name, username (optional), email, password, confirm password                                                                                                                                                                                              |
| 1   | You `/welcome`                      | A print of four sports and its key; name and username again; "Which sounds like you?" (required, no default); weight units; time zone as free text                                                                                                        |
| 2   | Sports `/welcome/sports`            | Strength, Running, Cycling, Swimming — Strength and Running already ticked. Without Strength, jumps to 5                                                                                                                                                  |
| 3   | Gym `/welcome/gym`                  | Name, then Gym, Outdoor or Home; Add gym, or Skip for now (to 5)                                                                                                                                                                                          |
| 4   | Machines `/welcome/equipment`       | At a gym, "Usually here (18)" with Review. **New:** 12 illustrated machines to tick; a family asks which variant ("Which chest press?"). **Experienced:** every other type, about 75 rows in seven groups, searchable. Continue, Add N and continue, Skip |
| 5   | Plan `/welcome/programme`           | One template, already chosen: 8-Week Strength + Aesthetics Hybrid (six lifting days in seven, 70–100 min). Start date. Create with the coach, Build it yourself, I'll train without a programme; pinned: Start training, Just track my workouts           |
| 5a  | Coach `/welcome/programme/create`   | New: one screen (goal, height, weight, age, injuries, days, gym or home, a free-text box). Experienced: five steps (You, Your week, Your training, Starting point, Review)                                                                                |
| 5b  | Builder `/welcome/programme/manual` | Programme name, weeks, notes; per day: name, weekday, focus, warm-up, time, notes, exercises, run                                                                                                                                                         |
| —   | Today                               | The first programme day, an "add a gym" screen, or "No programme"                                                                                                                                                                                         |

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

| ID  | Severity | What                                                                                                                                                                                                                                                                                                       | Where                                                        |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| B1  | High     | An account that only swims, runs or cycles is told "Only lifting needs a gym set up", then lands on Today with "Add a gym to start training" as its only action                                                                                                                                            | `today/today-view.tsx:582`                                   |
| B2  | High     | "I'm new to this" changes nothing on the plan step: the only template, pre-chosen behind "Start training", is six lifting days a week at 70–100 minutes. A beginner's first Today is Lower A, 70–90 min. A swimmer is offered the same lifting programme                                                   | `welcome/programme/page.tsx`, `db/seed/data/templates.ts`    |
| B3  | High     | The machine search leaves out the 18 basics a gym is assumed to have: "pec deck" finds only Rear delt machine, "lat pulldown" only two combination machines, "leg curl" not the seated one. The experienced test lifter ended up with "Lat pulldown and low row" and "Leg press and hack squat" registered | `lib/machines-step.ts:197`                                   |
| B4  | Medium   | Unfinished setup resumes on the machines step whenever the gym has no machine rows, which is what Continue with nothing ticked leaves: the usual beginner path. Anyone who has done that step is sent back to it                                                                                           | `server/queries/onboarding-entry.ts:29`                      |
| B5  | Medium   | "Add a custom exercise to your library" on the setup builder opens `/exercises/new`, which sends a not-yet-onboarded account back to the machines step (B4); the builder's unsaved work is lost                                                                                                            | `components/coaching/builder-page.tsx`                       |
| B6  | Medium   | Back on the plan step is fixed to the machines step; with no client history (a reload, a link) a swimmer lands on the gym step they were meant to skip                                                                                                                                                     | `welcome/programme/page.tsx:40`                              |
| B7  | Medium   | After "Just track my workouts", Today's main action is "Choose a programme", under the title "No programme"                                                                                                                                                                                                | `today/today-view.tsx:591`                                   |
| B8  | Medium   | Skip for now on the gym step lets a lifter start a programme, then Today refuses to start it until a gym is added                                                                                                                                                                                          | `welcome/skip-link.tsx`, `today/today-view.tsx:582`          |
| B9  | Low      | Skip for now on the machines step drops whatever was ticked, without a word                                                                                                                                                                                                                                | `welcome/equipment/equipment-step-form.tsx:382`              |
| B10 | Low      | Running is switched on for every new account; a beginner who only lifts has to untick it                                                                                                                                                                                                                   | `server/repositories/sport-preferences.ts:25`                |
| B11 | Low      | Pounds and a US time zone still leave running in kilometres; distance units are never asked or inferred                                                                                                                                                                                                    | `server/repositories/sport-preferences.ts:71`                |
| B12 | Low      | The coach's five steps accept nothing at all and say so only on Create, in one sentence at the foot                                                                                                                                                                                                        | `components/coaching/intake-form.tsx:184`                    |
| B13 | Low      | A lifter who skipped the gym and left mid-setup resumes on step 1, answering name and experience again                                                                                                                                                                                                     | `server/queries/onboarding-entry.ts:27`                      |
| U1  | Medium   | "Choose the one that sounds like you." stays under the choice after it is made                                                                                                                                                                                                                             | `welcome/profile-step-form.tsx:63`                           |
| U2  | Medium   | A time zone error drops the units control out of line with the time zone box (the row aligns to its foot)                                                                                                                                                                                                  | `welcome/profile-step-form.tsx:77`                           |
| U3  | Medium   | The coach's Back and Continue float as a shadowed card the colour of the cards under it, with the next box showing beneath; "Create my programme" breaks over two lines at 402 pt. DESIGN.md: flat, and pinned actions run to the foot in ground                                                           | `globals.css` `sticky-actions`, `intake-form.tsx:405`        |
| U4  | Medium   | The coach and the builder leave the setup frame: no step dots, boxed cards (DESIGN.md: no boxed lists), Form v1 type sizes, a second progress bar                                                                                                                                                          | `components/coaching/*`                                      |
| U5  | Low      | On 320 × 568 the plan step's Create with the coach, Build it yourself and "train without a programme" sit under the pinned actions; at 200% text the machines step's pinned actions cover 39% of the screen                                                                                                | `welcome/programme/page.tsx`, `onboarding.css`               |
| U6  | Low      | One selection drawn two ways: square tick boxes on the tiles, round marks in the full list                                                                                                                                                                                                                 | `equipment-step-form.tsx`                                    |
| U7  | Low      | "Strength" on the sports tile, "Lifting" in the print's key and the note under the tiles                                                                                                                                                                                                                   | `domain/activity.ts:22`, `welcome/page.tsx:15`               |
| U8  | Low      | The gym step's field is labelled "Name" (of what?), and its action says "Add gym" for a home or an outdoor place                                                                                                                                                                                           | `welcome/gym/first-gym-form.tsx`                             |
| U9  | Low      | Two of the twelve beginner tiles (hip abduction, hip adduction) have no drawing; on a first visit the drawings arrive after the tiles                                                                                                                                                                      | `equipment-step-form.tsx`, `server/queries/equipment-art.ts` |
| U10 | Low      | The coach's two large boxes write their examples in `control` grey on surface: 3.3:1, under the 4.5:1 body text needs (Impeccable's detector, confirmed by hand). Every other field uses ink 2                                                                                                             | `components/ui/dictation.tsx:305`                            |
| U11 | Low      | Sign-up and every setup step have no `main` landmark, so nothing outside the header is in a region (axe `landmark-one-main`, `region`, at 390 and 320 pt; no WCAG A or AA violations otherwise)                                                                                                            | `(auth)/layout.tsx`, `(onboarding)/layout.tsx`               |
| U12 | Low      | The coach and builder pages in setup have no page title of their own ("Overload"), and the builder shows two `h1`s                                                                                                                                                                                         | `welcome/programme/create`, `welcome/programme/manual`       |
| U13 | Low      | The step dots count by position, so a swimmer's dots (and their spoken labels) mark Gym and Machines "completed"                                                                                                                                                                                           | `welcome/steps.tsx`                                          |
| U14 | Low      | Sign-up stands in a box; DESIGN.md puts the sign-in screens "on the ground at the gutter, never in a box"                                                                                                                                                                                                  | `(auth)/signup/page.tsx`, DESIGN.md                          |
| U15 | Low      | An invalid username reads as a grey hint until Continue; the coach's file drop is drawn dashed, which DESIGN.md keeps for "skipped"                                                                                                                                                                        | `components/username-field.tsx:131`, `intake-form.tsx:1180`  |

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

## What was built, 11 October 2026

The shorter flow is built as the canvas draws it and the owner decided above. Each screen asks
its question once, and what the phone and the earlier answers already say is filled in.

| Screen                                                   | Who sees it              | What it asks                                                                                                                                                                                                                                   |
| -------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign up `/signup`                                        | Everyone                 | Name (optional), email, password with Show. The username is made from the name (`bea.newcomer`), else from the email, and numbered when taken                                                                                                  |
| You `/welcome`                                           | Everyone                 | "Which sounds like you?" and "What do you train?", nothing ticked. Units and time zone are one line from the phone ("lb · miles · New York time", naming only what the chosen sports use) with Change. Someone who does not lift finishes here |
| Where do you train? `/welcome/gym`                       | Lifters                  | Gym, Home or Outdoors, then a name (optional)                                                                                                                                                                                                  |
| What do you have? `/welcome/equipment`                   | At home or outdoors      | The place's short set as pictures to tick; Browse all for anything else                                                                                                                                                                        |
| Anything unusual? `/welcome/equipment`                   | Already trains, at a gym | Optional. The basics as one line with Review; five machines often missed; one search over every type, the basics included and marked "Usually here, counted already" with Not here; Browse all                                                 |
| Your first programme `/welcome/programme`                | New to this              | The coach's questions on one screen: goal, days, height, weight and age, "Anything that hurts?" folded. Just log workouts for now underneath                                                                                                   |
| How do you want to start? `/welcome/programme`           | Already trains           | Log my own workouts (pinned), Set up my split, Follow a programme, Let the coach write it                                                                                                                                                      |
| Your split `/welcome/programme/split`                    | Set up my split          | Days in order, each named, with exercises at the library's usual target for three sets; repeats from a start date                                                                                                                              |
| Follow a programme `/welcome/programme/template`         | Follow a programme       | The programme's facts and a start date                                                                                                                                                                                                         |
| What should the coach plan? `/welcome/programme/create`  | Let the coach write it   | Goal, days, session length, height, weight and age; what you lift now, anything to avoid and a plan to attach, folded. What setup knows is not asked                                                                                           |
| The coach is writing `/welcome/programme/jobs/{id}`      | Whoever asked the coach  | Nothing: what the coach is working from, and Look around while you wait. It moves on by itself                                                                                                                                                 |
| Your programme is ready `/welcome/programme/drafts/{id}` | Whoever asked the coach  | The days, the first session, every exercise's targets and what the coach is unsure about; a start date; Start my programme, or Ask for changes                                                                                                 |

- **New to this, at a gym:** sign-up, You, Where and Your first programme: four screens and ten
  answers, the coach's included, for a programme written around their week. The template took
  about fourteen answers and taps over six screens, and gave everyone six days a week.
- **Already trains, logging their own:** sign-up, You, Where, Anything unusual? (Continue) and
  How do you want to start?: five answers to Today.
- **Runs, rides or swims only:** sign-up and You, then Today, with a Log button for each sport.

Setup resumes from what is saved: the first step's answers, then a place, then a programme the
coach is writing or has written. A step that may be passed with nothing chosen is never resumed.

### Where each finding stands

| ID  | Now              | What changed                                                                                                                                                                                                                                            |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Fixed            | Today asks for a gym only when the athlete lifts. Someone who only runs, rides or swims sees "Nothing planned" with Log a run, a ride or a swim for each sport chosen                                                                                   |
| B2  | Fixed            | A beginner's plan is the coach's, written around their days. The template is one of four choices for someone who already trains, never chosen for them. A swimmer never reaches the plan step                                                           |
| B3  | Fixed            | The search covers the basics, marked "Usually here, counted already" with Not here beside them. "pec deck" and "lat pulldown" find the basic first; "leg curl" finds the seated one third, after the lying curl, which also answers to "Leg curl bench" |
| B4  | Fixed            | Resume reads the first step's answers, the place and any programme in progress; the equipment steps are never resumed                                                                                                                                   |
| B5  | Fixed            | Setup's builder no longer offers the custom-exercise link; someone who already trains sets up a split on a screen of its own, inside setup                                                                                                              |
| B6  | Fixed            | Back from the plan step goes to the step before it on the athlete's own path: the equipment step at home, outdoors or for someone who already trains, the place step for a beginner at a gym                                                            |
| B7  | Fixed            | After Log my own workouts, Today says "Ready when you are", with Start a workout first and Choose a programme beneath                                                                                                                                   |
| B8  | Fixed            | The place step has no Skip. A lifter chooses Gym, Home or Outdoors, and only the name is optional, so Today always has a place to start a workout                                                                                                       |
| B9  | Fixed            | The equipment step has no Skip: Continue keeps what is ticked and says how many ("Add 2 and continue")                                                                                                                                                  |
| B10 | Fixed            | Nothing is ticked until the athlete taps, and the sports are saved exactly as chosen. Older accounts keep their defaults until they choose                                                                                                              |
| B11 | Fixed            | Units come from the phone's language: pounds, miles and yard pools where its region is the United States, Liberia or Myanmar, metric elsewhere. Distances and pool lengths are saved with the sports                                                    |
| B12 | Fixed in setup   | Each of the coach's questions in setup says what it still needs, all at once on Create, and the sentence goes as soon as it is answered. Profile's five-step coach form is unchanged                                                                    |
| B13 | Fixed            | As B4: a lifter without a place resumes on Where do you train?                                                                                                                                                                                          |
| U1  | Fixed            | Each question's sentence goes as soon as it is answered                                                                                                                                                                                                 |
| U2  | No longer arises | The time zone is a list in the units sheet, by region, with the phone's own first: nothing to mistype                                                                                                                                                   |
| U3  | Fixed in setup   | Setup's coach screens pin their actions flat on the ground, Create my programme on one line at 402 pt. Profile's coach form keeps its floating card                                                                                                     |
| U4  | Fixed            | The coach's questions, the writing and ready screens, the split and the template are inside the setup frame, with its dots, on the ground, in Form v2's type                                                                                            |
| U5  | Fixed            | How do you want to start? lists its choices as rows above one pinned action, and nothing on any setup screen stays under the pinned actions on any phone walked (see below)                                                                             |
| U6  | Kept             | DESIGN.md draws ticks on tiles as boxes and rows chosen from a list as rings. Setup shows both only at home, where Browse all opens the list under the tiles                                                                                            |
| U7  | Fixed            | The print and its key are gone; setup calls the sport Strength throughout                                                                                                                                                                               |
| U8  | Fixed            | The kind comes first and Continue serves all three. The field is "Gym name" at a gym and "Name" at home or outdoors, with an example of each                                                                                                            |
| U9  | No longer arises | A beginner at a gym sees no machine tiles. At home and outdoors every tile's drawing is still a draft, so all show or none do                                                                                                                           |
| U10 | Fixed in setup   | Setup's text boxes hold no example; each question says what to write above its box, in ink 2. Profile's coach form keeps its grey examples                                                                                                              |
| U11 | Fixed            | Sign-up and setup are in a `main` landmark                                                                                                                                                                                                              |
| U12 | Fixed            | Every setup screen has its own title and one `h1`                                                                                                                                                                                                       |
| U13 | Fixed            | The dots follow the athlete's own path: three or four for a lifter, none for someone who does not lift                                                                                                                                                  |
| U14 | Fixed            | Sign-up stands on the ground at the gutter, like sign-in                                                                                                                                                                                                |
| U15 | No longer arises | No username is asked at sign-up or in setup, and setup's file attachment is a plain row                                                                                                                                                                 |

Also fixed on the way: sign-in's Show was 38 to 43 pt wide and is now 44, like sign-up's; and at
200% text on a 320-pt phone, "Something else? Browse all equipment" wrapped centred with its box
off the screen's edge, and now keeps the screen's one left edge.

### How it was checked

- `npm run check`: lint, formatting, types and 2,477 tests, new ones among them for the setup
  path, units from the phone, the split, usernames from names, the first step, the coach's
  questions, resuming, the equipment step and Today.
- The local stack as above, with the coach switched on and pointed at a routine that never
  answers, so requests wait in the queue; the coach's part was played through
  `scripts/coach/workflow.ts`. A beginner's programme came back, was there on signing in again,
  started, and Today showed its first day.
- Every path walked on the iPhone 17 (402 × 874): a beginner through the coach, a split, a
  template, the coach for someone who already trains, a home lifter who logs, and a swimmer. The
  beginner, split, home and swimmer paths again on 320 × 568, 360 × 740, 412 × 839 and
  440 × 956; in dark and at 200% text on the iPhone 17; and the home path at 200% text on
  320 × 568. No console error, sideways overflow, clipped text, target under 44 pt or content
  left under the pinned actions. Sign-up fits one screen down to 320 × 568; at 200% text,
  Create account is a scroll away. The pinned actions take at most 20% of a 320 × 568 screen,
  and 34% at 200% text (the machines step took 39%).
- axe at 390 and 320 pt in both themes, over sign-up and every setup screen: 44 scans, no
  violations.
- The database, read back: usernames from names, US units and time zone, the sports exactly as
  ticked, one place per account, the equipment chosen and marked not here, the programme
  started, logging chosen by the logger, and setup finished.

### Still open

- Real phones: WebKit cannot start here, so keyboards, pickers, safe areas and Safari's bars
  are unchecked.
- The coach end to end in production: here its part was played by hand.
- Outside setup, Profile's coach form keeps its five steps (B12), its floating actions (U3) and
  its grey examples (U10).
- U6 stands as DESIGN.md draws it, unless the owner wants one mark for both.
