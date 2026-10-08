# Feature inventory: the core loop

What the four anchor screens of the revamp do today, read from the code on 30 September 2026
(branch `claude/lucid-hamilton-17hwib`, based on `4e5e928`). It describes **what** each screen
shows and does, never how it looks. A redesign may move, regroup, rename or put behind one tap
anything below; it may not drop it. Where this page and the code disagree, the code wins and
this page is corrected.

Each section lists the information shown, the actions, the states a design must cover, what
must survive any redesign, and sample content from the repository for mockups. The sample
content is real: it comes from the seed data, the preview fixtures and the audit seed, never
invented. Elsewhere, quoted labels show the wording and format the app uses; the numbers inside
them are illustrative.

## Everywhere: the shell

Code: `src/app/(app)/layout.tsx`, `src/components/shell/`, `src/lib/nav.ts`.

- **Five destinations:** Today, Training, Food, Progress, Profile. Workout screens count as
  Today unless opened from elsewhere (Training, History, the programme, a shared link).
  Exercises, gyms and people's pages count as Profile.
- **Headers:** a top-level screen has a title, one fact about it (a date, a period, a count)
  and at most one action. A nested screen has a back link that names where it goes ("Today",
  "History", "My foods") and returns to the previous in-app page, or to that destination when
  there is none.
- **The session strip:** while a workout is unfinished, every screen except Today and the
  workout itself shows "In progress · {session name}" with Resume.
- **The rest timer** (only when turned on in Profile): "Rest" and an m:ss countdown, +30 s and
  Stop, then "Go", which clears after 60 s. It survives navigation and reloads and stays in
  step across tabs, and shows on every screen including Today.
- **Offline:** a banner ("You're offline. Set and activity drafts stay on this device; retry
  saving when connected."). Drafts are kept on the device; saving retries when the connection
  returns.
- **Slow and failed navigation:** progress on every link; after 8 s "Taking longer than
  usual…" with Retry; a clear offline message when a page cannot load.
- **Loading and errors:** each screen has a loading state with Retry, and an error state with
  "Try again", "Back to Today" and, when there is one, a reference code. Inside a workout the
  error reassures that drafts are kept.
- **Accessibility and reach:** a "Skip to content" link, 44 px targets, zoom never disabled,
  System, Light and Dark appearance, usable at 320 px wide and at 200% text.

## Today

Code: `src/app/(app)/today/` (`page.tsx`, `today-view.tsx`, `gym-switcher.tsx`,
`plan-actions.tsx`, `coach-actions.tsx`, `choose/`), `src/components/activities/today-activities.tsx`.

**Purpose:** what the athlete owes today (the programme day, its runs, rides and swims, and
anything scheduled), where they will train, and one tap to start or resume it.

### Shown

- **The date** and the app's name.
- **Where:** the gym the next session will use, with Change. Without any gym, a prompt to add
  one replaces it.
- **An unfinished session** that is not today's offered day (an unplanned session, or a day
  started early): its name, gym, start time and number of sets, with Resume. Only one Resume
  ever appears on Today.
- **The offered lifting day:**
  - where it sits in the programme ("Cycle 1 of 8 · Day 1"), its name ("Lower A"), its focus
    and time ("Squat + quads · 70–90 min");
  - a note with the day's effort guidance and notes;
  - a status: "22 days behind" or "On track" while pending (behind = days since the programme
    started minus days completed or skipped), otherwise Done or Skipped; "Coach" when the
    coach planned it;
  - **the plan**, one tap away: "6 exercises · 16 sets", then each exercise with its
    prescription ("3 × 8–12 @ 1–2 RIR", or metres or seconds for carries and holds), with
    supersets grouped. When the coach planned the day, each exercise also shows its machine,
    loads in the account's unit, the coach's notes, exercises dropped for today, and any
    warnings.
- **The coach's status**, when the coach is on: planning (the screen updates itself), could
  not finish, has not planned yet, planned for a different gym, or fell back to the
  programme's own targets.
- **A rest day:** the same header information, plus the warm-up or mobility protocol: its
  name, how many drills, and each drill with its dose.
- **Other sports:** one card per run, ride or swim owed today: the sport, its target
  ("30 minutes", "5 km", "6 × 400 m"), "Part of Easy Run + Arms" when the programme placed it,
  a scheduled time if set, and Skipped or Coach. Logged ones stay on the day as cards inked
  done, after what is still owed, each with "See what you logged" (since 4 October 2026: one
  collapsible card per activity, each with its own next step; see `DESIGN.md`, Activity cards).
- **Days with no lifting**, no programme, or a finished programme each have their own message
  and offer only real next steps.
- **Once the day is done:** "Done. Nothing left to do here today." (or "Rest day done."), and
  the next day on offer under "Up next".

### Actions

- **Start workout** at the chosen gym, which goes to a short check-in and then the workout.
  If a session is already open, it resumes that one instead.
- **Resume**; **Discard** an unfinished session that has no sets (anything logged is
  finished, never discarded).
- **Change gym** (a sheet of gyms with their kind: gym, outdoor or home; Manage gyms).
- **Log it** for a run, ride or swim, carrying its target; **see what you logged**.
- **On a rest day:** Mark rest day done, or start the next training day instead.
- **Unplanned session**, when there is no programme day to offer.
- **Choose a programme** or **plan the next block**, when there is none or it has ended.
- **More options**, one control for everything that is not the offered day: train another
  day (a list of the programme's days, each with Start, Start next cycle or Start skipped
  workout), start an unplanned session, ask the coach to plan, re-plan or prepare this session
  (with a gym choice, an optional note, and "3 requests a day"), and skip this session (with
  an optional reason; skipping the workout never skips a run on the same day).

### States to design

No gym; no default gym; no programme; programme complete; lifting day; lifting plus run;
run only; rest day; behind schedule; session in progress (for the offered day or another);
done or skipped today; the coach off, planning, failed, planned for another gym, or out of
requests; offline; loading; error.

### Must survive

- One unfinished workout at a time.
- The gym is chosen before starting and fixed for that session.
- One card per task: the workout and each run are separate, and starting one never hides
  the other.
- Everything that is not the offered day sits behind one More options control, and stays
  reachable.
- Unplanned sessions carry no programme, cycle or day.

### Sample content

- Programme "8-Week Strength + Aesthetics Hybrid": 8 cycles, 56 days. Days: Lower A ("Squat +
  quads", 70–90 min, "2–3 RIR compounds"), Upper A ("Bench + back"), Easy Run + Arms
  ("Aerobic + arms/forearms", 70–100 min), Lower B ("Deadlift + posterior chain"), Upper B,
  Easy Run + Light Upper, Rest + Mobility ("Recovery", 10–15 min). (`src/db/seed/data/program.ts`)
- Lower A: High-bar barbell squat 3 × 4–6, 45° leg press, Seated leg curl, Leg extension,
  Smith machine calf raise, Cable crunch. (`src/db/seed/data/exercises.ts`)
- Easy Run + Arms, as previewed on Fri 11 Sept (Cycle 1 of 8 · Day 3): Barbell curl 3 × 8–12,
  Rope triceps pushdown, Farmer's carry 3 × 20–40 m, Wrist curl, and a 25–30 min run
  ("Talk-test; slower than push pace"). (`src/app/(preview)/preview/page.tsx`)
- Gyms "Anytime Fitness" (gym) and "Home" (home). Warm-up "Daily mobility": 90/90 hip switches
  6–8 per side, Cat-cow 6–8. (`src/db/seed/data/warmups.ts`)

## A workout and logging a set

Code: `src/app/(app)/workouts/[sessionId]/` (`workout-view.tsx`, `workout-overview.tsx`,
`exercise-logger.tsx`, `set-grid.tsx`, `set-options.tsx`, `use-set-rows.ts`, `next-load.tsx`,
`superset-sheet.tsx`, `session-details.tsx`, `check-in/`, `finish/`, `add-exercise/`),
`src/components/shell/rest-timer.tsx`, `src/server/actions/sessions.ts`.

**Purpose:** record every set of one workout at one gym, exercise by exercise in any order,
then close it as a permanent record.

**The flow:** Start workout on Today → a short check-in (Save and start, or Skip) → the
workout's exercise list → open an exercise and log its sets → Complete it and move to any
other → Finish session (notes and body weight) → the finished record, with any records set.
An unplanned session starts empty; a programme day arrives with its exercises, fallbacks,
supersets and any coach plan already applied.

### The check-in

Four readings before the session: sleep hours, sleep quality, fatigue and soreness. Warnings
from them become a "Recovery check" on the workout ("Sleep {hours} h: hold loads today rather
than adding, and keep the RIR honest").

### The workout

- **Header:** the day's name or "Unplanned session", and the gym, said once for the whole session.
- The recovery check and the coach's summary, when present.
- **Warm-up**, when the day has one: the number of drills or the coach's lines, each drill
  with its dose, and Mark done.
- **Each exercise:** its order, name, machine, progress ("2 of 3 sets", warm-ups not counted),
  the working sets so far ("60×5, 62.5×4"), and Start, Resume, Done or Skipped. Supersets are
  grouped visibly.
- **Actions:** open an exercise; Add exercise (search by name, muscle or equipment); Superset
  (group two or more exercises for this workout only); Session details (gym, start, duration,
  programme day, cycle, body weight, notes, the check-in); Finish session, which waits until
  no unsaved drafts remain ("Save drafts first").

### Logging an exercise

- **The exercise:** name, status, and its equipment ("Smith machine", "Free weights",
  "Bodyweight", "Machine not chosen", "· instead of 45° leg press" when substituted).
- **The prescription, shown once above the sets:** "3 × 4–6 @ 2–3 RIR · rest 3–4 min", or
  "2 × 20–45 s per side · report RPE · rest 60 s". Only a set that differs shows its own
  target.
- **The suggestion for today:** one of Add load, Hold, Repeat, Reduce, Step back, Add time, Add
  distance, Starting guess, No history or Coach plan, with a line such as "Next: 65 kg × 4+" or
  "Keep 62.5 kg", and why, one tap away.
- **One row per set**, each its own record:
  - the set number and type: Warm-up, Working, Back-off, Drop, AMRAP or To failure;
  - load: kg or lb for free weights (the account's unit), added load for bodyweight moves (0
    means bodyweight), or the machine's own unit (plates or stack number), never converted;
  - reps, seconds or metres, depending on how the exercise is counted;
  - effort: RIR for reps, RPE 1–10 for time and distance; required on working sets, optional
    on warm-ups, and never pre-filled;
  - Save, then a confirmed check. Untouched load and reps take the suggested value, shown
    faintly until saved; effort never does.
- **Set options** for a row: its type, steppers for load (in the machine's real increments),
  reps (1), seconds (5), metres (5) and effort (1), and remove the row or delete the set.
- **Saving a set** confirms it, adds an empty row for the next, and starts the rest timer: the
  coach's rest, else the plan's, else the exercise's own default, else 90 s. A light first set saved without effort before any
  working set becomes a warm-up, with Undo.
- **Also:** edit a saved set (Update), add a set (up to 50), Complete the exercise (Reopen
  afterwards), Skip it with an optional reason before any set is logged, and on a machine
  whose next weight is unknown, record it ("Next up from 45 kg").
- **Technique** (owner decision, 4 October 2026): the exercise's guide, the same as the
  library's (Setup, Steps, Cues, Common mistakes), then How to log, then "Programme cue" when the
  slot has one, then "Watch demonstration" (opens YouTube) and "Open in the exercise library". No
  guide yet says "Guide not available yet." and keeps what is written about the exercise; a
  custom exercise shows its own notes. The programme's target-load and progression notes and the
  substitution reason are no longer shown in the workout: the line under the name says "instead
  of …", the coach's note explains a coach's swap, and the notes stay in the programme.
- **Today's targets:** when the coach planned the session, the line under the name, the
  workout list and the rest are the coach's, like the entry, the RIR target, the set count and
  the timer; without a coach plan they are the programme's; an exercise added on the spot shows
  its own defaults.
- **History:** the previous comparable session on this machine ("Previous on this machine:
  60 kg × 5, 62.5 kg × 4 · 8 Sep"), a warning after two sessions in decline, and why today's
  suggestion is what it is.
- **When the machine is not settled:** use it, use a fallback, add a fallback (remembered for
  this gym), or register the machine with its details. Asked with the machine's picture (owner
  decision, 4 October 2026): a gym basic nobody has confirmed takes one tap ("Yes, it's here",
  "Not here", and "A different one" for a family's variants); any other machine nobody has
  answered for takes "Available" (registered at once, staying in the workout), "Not here" or "Not
  sure". "Not here" against a registered machine asks whether it has gone (archive it, history
  kept) or is out of use today (a substitute, not remembered); gone, that kind is recorded as not
  here when nothing else there has it, so the fallbacks follow, and the machine leaves the
  workout's other exercises with nothing logged on it; one found there later is a new machine
  with its own history. While the question is open and nothing is logged, Save waits and points
  at it, since the machine goes on the exercise only before the first set ("Not sure" lets it
  be); a set typed first does not hold the answers back, and goes with the exercise onto the
  machine the answer chose. "Register with details" opens Add machine on the type being asked
  about. An exercise already on a machine is asked, before its first set, about what that machine
  is used with when nobody has said (a bench for a Smith hip thrust at home); Save does not wait
  on that.
- **Fallbacks:** a fallback replaces the planned exercise only when that cannot be done: one
  remembered for this gym when its equipment is unknown or marked not here, the programme's once
  it is marked not here. A gym basic is here until someone says otherwise, so a swap remembered
  once never replaces a lift that can be done; a machine basic is confirmed in the workout, and
  its "Not here" offers the fallbacks. Targets, rest, notes and per side the coach wrote keep
  the exercise they were written for, and stay with it if the exercise is swapped. A machine
  chosen for an exercise still needs the rest of what that exercise uses with it.

### Finishing and the record

- **Finish:** what was recorded (sets per exercise, "60 kg × 5, …"), what was not done
  ("Nothing logged", "Skipped: travelling"), notes, and body weight.
- **The finished workout:** read only, with its records ("Barbell bench press · Est. 1RM 88 kg
  (was 85 kg)"; also top weight, best set, most reps, longest hold and longest carry), and
  "Save or repeat this workout" as a routine.

### States to design

Unplanned and programme sessions; an empty session; supersets; timed and distance exercises;
machine, free-weight and bodyweight exercises; an unsettled machine; a suggestion of each
kind; no history; a saving, saved and failed set; offline, with drafts kept on the device and
restored on return; drafts left on a completed exercise; a set changed on another device; a
completed and a skipped exercise; the finished record.

### Must survive

- Load, reps (or time or distance) and effort belong to each set; identical sets stay
  separate records, and editing one never touches another.
- Effort is always entered by the athlete and never pre-filled; an empty effort is unknown,
  not zero. A suggested value looks unconfirmed until saved.
- One unfinished workout at a time; the gym is fixed for the session and said once.
- Free movement between exercises, in any order; completing one never jumps to the next.
- Exercises are only added (at the end) or skipped, never reordered or deleted. Supersets
  apply to this workout only and never change the programme.
- A set counts as saved only once the server confirms it; a double tap never duplicates it;
  a failed save keeps its draft; unsaved drafts block finishing.
- A session with sets can never be discarded. A finished session is read only and keeps what
  was skipped.

### Sample content

- **Gyms:** Anytime Fitness (default), Samsung Gym, Society Gym, Home, Outdoor. **Machines:**
  Smith machine, Cable station, Assisted pull-up machine, Seated leg curl, Pec deck, 45° leg
  press. (`src/db/test/fixtures.ts`)
- **Lower A:** High-bar barbell squat 3 × 4–6 @ 2–3 RIR, rest 180–240 s, cue "Brace; whole
  foot; controlled depth", progression "+2.5 kg after 3×6"; 45° leg press 3 × 6–10 @ 1–2;
  Seated leg curl 3 × 8–12 @ 1–2, rest 120 s. (`src/db/seed/data/program.ts`)
- **Upper A:** Barbell bench press 4 × 3–5 @ 2; Pull-up, "Bodyweight; log added load only".
- **Timed and distance:** Side plank 2 × 20–45 s per side, rest 60 s; Farmer's carry 20–40 m.
- **Superset:** Wrist curl + Reverse wrist curl, 2 × 12–20, rest 60 s.
- **Warm-up:** Lower-body warm-up (easy bike or treadmill 4–5 min, 90/90 hip switches 6–8 per
  side, …) ending in the ramp "40% × 8; 55–60% × 5; 70–75% × 2–3". (`src/db/seed/data/warmups.ts`)
- **Sets:** bench 60 kg × 5 @ 2 RIR, then 62.5 kg × 4 @ 1 RIR; a Hold suggestion of 62.5 kg ×
  3 @ 2. (`src/server/repositories/sessions.test.ts`)

## Progress

Code: `src/app/(app)/progress/` (`page.tsx`, `progress-view.tsx`, `progress-sections.tsx`,
`sections/`, `history/`), `src/components/graph/`, `body-map.tsx`, `filter-sheet.tsx`,
`src/domain/graph-range.ts`, `src/domain/progress-graphs.ts`, `src/server/repositories/graphs.ts`.

**Purpose:** how training is going over a chosen date range (totals, trends, recovery, body
weight and muscle volume), and every past entry, which can be opened, corrected or deleted.

### Sections

One picker offers seven sections: **Overview** (where the tab opens, with **History** under its
month), **Strength**, **Muscles**, **Running**, **Food**, **Recovery** and **Body weight**. The
header says "Progress" with the dates the section is drawn over ("8 Sept – 7 Oct 2026"), except
where a section leads with a clock of its own, which has no funnel either: Overview its month
(ADR 0045), Muscles its week (ADR 0046). Every graph is the one `Graph` (ADR 0042) and carries
the same spans, 1M, 3M, 6M, 12M and All: a month by default, one span for every graph,
remembered once chosen. The funnel holds custom dates, which leave no span chosen until one is.

- **Overview:** this month on paper and its totals as its key, each sport's count with its
  distance and time this month ("3 Runs · 9.2 km · 1 h 9 min"); then **History**, the ten newest
  workouts, runs, rides and swims, running back into the month before (named) when this one
  holds fewer, with All at its head for every entry. No span and no funnel: the training totals
  over a span were dropped at the owner's request (ADR 0045).
- **Strength:** two selects, a muscle group (all, or chest, back, legs, shoulders, arms or core)
  and then an exercise filed under it ("All exercises", then each exercise ever logged there,
  each under the group of its first primary muscle). **All exercises:** the group's total volume
  as bars, load × reps of kg and lb working sets in the account's unit; the total and the weekly
  figure over the weeks trained ("158,639 kg · 31,728 kg a week · 24 workouts"); a bar reads its
  volume and sets ("8,910 kg · 9 sets") and opens its workout; a group that lifted nothing with a
  load says bodyweight and timed sets add no volume. **An exercise:** estimated 1RM, max weight,
  max reps and max volume (the best single set), and max time or distance for holds and carries,
  only those with data; a line with a point per workout (past about sixty, the best of each week
  or month); its best in the span and the set behind it ("145.7 kg · 115 kg × 8 · Fri 2 Oct"). Where the exercise was done on several machines, choose
  one ("Seated leg curl · Anytime Fitness") or "Across gyms"; loads from different machines never
  share a line.
- **Muscles:** the working sets a week gave each muscle (ADR 0046), on its own week arrows,
  named as a graph names a week ("This week", "28 Sept – 4 Oct") and stopping at this one: front
  and back body figures shaded by working sets (15+, 10–14, 5–9, 1–4, none), a legend and a
  table; tapping a muscle shows "Chest · 6 sets".
- **Running:** distance and duration as bars, with the total and the count of runs; pace as a
  line, a point per run (past about sixty, each week's or month's pace over all its kilometres),
  faster higher, with the average over all their kilometres, outdoor and treadmill never mixed
  (the choice shows only when both were run).
- **Food:** calories or protein a day as bars, today's target as a rule; the average a day over
  the days logged ("2,000 kcal · 26 of 30 days logged · target 2,600").
- **Recovery:** sleep, sleep quality, fatigue or soreness; sleep as bars against 6 h, the 1–5
  answers as lines on their whole scale, fatigue and soreness drawn 1 at the top so a fresher day
  is higher; the average over the days that gave the answer, a day checked in twice counted once.
- **Body weight:** as recorded, a point per reading, in the account's unit; the latest and its
  change ("75.2 kg · −1 since Tue 8 Sept").
- **History** (Overview's All, a page under Progress with its range under its title, ADR 0045):
  "79 entries · page 1 of 8", newest first, ten to a page with the page tabs under
  the list (every page up to five, else the first, the last and the page read with its
  neighbours), each entry marked Workout, Run, Ride, Swim or Recovery. A workout shows its name, date, time,
  gym, sets and sleep; a run "Outdoor · 5 km", "30:34 · 6:07/km" and its effort; a ride or swim
  its distance and time; a recovery entry its readings. Filters: dates, activity, gym, exercise
  and machine, with a count of filters set and Clear filters; a filter starts again at page 1.

### Actions

Switch section; choose a span, or custom dates behind the funnel; choose what a section draws
(group or exercise, machine, measure, outdoor or treadmill, food or recovery measure); step
through body-map weeks; tap or drag a graph to read a mark, and open the workout, run, day, week
or food log behind it; step through the marks with the arrow keys; open "View values" for every
value, each opening its record; open any entry from History (a finished workout, read only, or an
activity page with its time, distance, pace or speed, effort and notes); correct an activity;
delete an activity (always confirmed).

### States to design

Nothing recorded in the range; one sport only; a sport turned off (its history still shows);
a partial week; missing answers and missing distances (gaps, not zeros); more than 500
records (a sample, with a warning); an invalid range; pounds, miles and yards; loading;
error; offline.

### Must survive

- All seven sections stay reachable, and History stays its own page. The span is remembered
  for every graph; custom dates and filters live in the URL, so Back and reload restore them.
- Strength's numbers are the same as the exercise page's; loads from different machines never
  share a series.
- Missing data is never zero: blanks stay blank, a gap breaks a bucketed line, and no average
  counts a day with nothing logged.
- Every chart keeps a table of its values, the body map keeps its table, and colour never
  carries meaning alone.
- Explanations live in help notes one tap away, not in running text.
- Deleting an activity always asks for confirmation.

### Sample content

From the audit seed (`scripts/dev/seed-audit-history.ts`, `docs/audits/local-56-months.md`),
56 months of history, February 2022 to September 2026:

- Strength sessions at Anytime Fitness, 42–60 min, 9 sets: Barbell bench press reaching 62 kg
  × 8–10 at 2 RIR in August 2026; Goblet squat; Farmer's carry; Plank holds of 55 s.
- Runs: "Outdoor · 3 km, 17:20 · 5:47/km"; 4 km in 23:47; 5 km in 30:34 at 6:07/km.
- A 50 min indoor ride with no distance; a swim of 48 lengths of 25 m.
- Body weight: 1 Aug 75.96 kg, 15 Aug 76.67 kg, 1 Sep 76.28 kg, 15 Sep 77.32 kg, 28 Sep
  77.47 kg.
- A daily recovery check-in: sleep 7 h, quality 3, fatigue 3, soreness 1.

## Food

Code: `src/app/(app)/food/`, `src/components/food/`, `src/domain/nutrition.ts`,
`src/domain/food-days.ts`, `src/server/actions/nutrition.ts`.

**Purpose:** log what was eaten, by hand, into seven fixed meals on any day up to today, and
see calories, carbs, fat and protein against targets that start from the training goal.

### Shown on the day

- **The day:** a strip of weeks that always ends on today (at least 8 weeks, reaching back up
  to 53), with today and the day on screen marked, and each logged day marked as logged, goal
  met or over. The month opens a calendar.
- **The summary**, when a target exists: calories eaten against the target with "1,147.5
  left", "Goal met" (90–110% of the target) or "236 over"; a calorie bar showing the goal
  band's two ends; carbs, fat and protein, each eaten against its target with its state
  (under, over for carbs and fat, reached for protein).
- **Without a target:** "No daily target yet", the goal and its split ("Build muscle · 55 /
  25 / 20") and Set target.
- **Seven meals, always, in eating order:** Breakfast, Morning snack, Lunch, Afternoon snack,
  Evening snack, Dinner, Late-night snack. Each shows the foods in it and its calories, or an
  invitation to add when empty.
- **My foods** ("10 foods · 2 meals") and **Targets** ("2,300 kcal" or "Not set"), with a
  warning when there is nothing left for carbs or protein needs a body weight.

### A meal

- The meal's name and date, its total (calories and macros, "Saved as Usual breakfast" when
  it matches a saved meal) and a star to save it as a meal; one row per food eaten with its
  portion and calories.
- **Adding:** a search over the athlete's own foods, and a list in this order: Quick add
  (calories and macros just this once, always first), saved meals, foods ("100 g · 389 kcal"),
  and New food only when a search finds nothing.
- **Portion sheet:** the food per portion, the amount eaten in the food's own unit, one-tap
  ½, 1, 1½ and 2 portions, a live total, Add or Save, and Remove when editing.

### My foods, meals and targets

- **My foods:** search, New food, New meal, saved meals (name, "3 foods · 445 kcal") and
  foods, most recently used first. A food has a name, a portion in one of 12 units, calories
  (required) and optional carbs, fat and protein.
- **Meal builder:** a name, the foods and amounts in it with a running total, Save meal, and
  Delete for an existing meal.
- **Targets:** daily calories; the goal (read only); protein in g per kg of body weight ("134 g
  at 74.5 kg"); fat as a percentage; "Use 55 / 25 / 20" to return to the goal's split; a live
  preview of the carbs, fat and protein in grams.
- **Macro breakdown**, from each macro row: "53 g of 134 g", "81 g to go", and every food that
  gave it, merged across meals, with foods of unknown value last.

### Actions

Open any day up to today from the strip or the calendar; open a meal; search; quick add; add
a food, a saved meal or a new food; edit a portion; remove by swipe (which only reveals
Remove) or from the sheet; star or unstar a meal; build, edit and delete saved meals; create
and edit foods; set targets.

### States to design

Nothing logged; no target; no body weight; nothing left for carbs; under, met and over the
band; a past day; a new account with no foods; offline (what was typed stays); loading;
errors inline beside the field.

### Must survive

- Exactly seven meals, in eating order, never chosen from the clock.
- Entries and saved meals are copies: editing a food never changes a day already logged.
- Foods are logged in their own unit; nothing is converted.
- Only calories are required; a missing macro is unknown, not zero.
- The goal band is 90–110%, and a day under it is never called missed. Protein is a minimum;
  carbs and fat are limits, and their "over" must not look like the calorie bar's.
- Swipe actions always also exist in a sheet; there are no confirmation dialogs.
- Food opens on today; past days are fully editable; future days cannot be opened.
- Not built, on purpose: a food database, barcode or photo lookup, recipes, estimated
  maintenance, per-day targets, weekly charts. Food data reaches no other part of the app.

### Sample content

From `src/app/(preview)/preview/food/page.tsx` (today 25 Sep 2026):

- Targets 2,300 kcal, 1.8 g/kg protein, 25% fat, body weight 74.5 kg, goal Build muscle:
  carbs 297 g, fat 64 g, protein 134 g.
- Breakfast 445 kcal: Milk 300 ml (156 kcal), Morning dry fruits 1 serving (150 kcal),
  MuscleBlaze Biozyme whey 1 scoop (139 kcal).
- Lunch 647.5 kcal: Home food 2 servings (400 kcal, no macros), Cooked chickpea 150 g
  (247.5 kcal).
- Afternoon snack: Fruit 1 piece (60 kcal).
- Day: 1,152.5 / 2,300 kcal, 1,147.5 left; carbs 86/297 g, fat 24/64 g, protein 53/134 g.
- Saved meals: "Post-workout shake" (whey 1.5 scoops and milk 250 ml, 338.5 kcal), "Usual
  breakfast" (3 foods, 445 kcal). Other foods: Oats 100 g 389 kcal, Paneer 100 g 265 kcal.
