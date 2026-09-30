# Feature inventory: the core loop

What the four anchor screens of the revamp do today, read from the code on 30 September 2026
(branch `claude/lucid-hamilton-17hwib`, based on `4e5e928`). It describes **what** each screen
shows and does, never how it looks. A redesign may move, regroup, rename or put behind one tap
anything below; it may not drop it. Where this page and the code disagree, the code wins and
this page is corrected.

Each section lists the information shown, the actions, the states a design must cover, what
must survive any redesign, and sample content from the repository for mockups. The sample
content is real: it comes from the seed data, the preview fixtures and the audit seed, never
invented.

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
- **An unfinished session** that is not today's offered day (an ad hoc session, or a day
  started early): its name, gym, start time and number of sets, with Resume. Only one Resume
  ever appears on Today.
- **The offered lifting day:**
  - where it sits in the programme ("Cycle 1 of 8 · Day 3"), its name ("Lower A"), its focus
    and time ("Squat + quads · 70–90 min");
  - a note with the day's effort guidance and notes;
  - a status: "2 behind" or "On track" while pending (behind = days since the programme
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
  a scheduled time if set, and Skipped or Coach. Logged ones collapse into "Completed · N".
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
- **Ad hoc session**, when there is no programme day to offer.
- **Choose a programme** or **plan the next block**, when there is none or it has ended.
- **More options**, one control for everything that is not the offered day: train another
  day (a list of the programme's days, each with Start, Start next cycle or Start skipped
  workout), start an ad hoc session, ask the coach to plan, re-plan or prepare this session
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
- Ad hoc sessions carry no programme, cycle or day.

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
