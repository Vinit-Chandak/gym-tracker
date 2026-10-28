# Feature inventory: the core loop

What the four anchor screens of the revamp do today, read from the code on 30 September 2026
(branch `claude/lucid-hamilton-17hwib`, based on `4e5e928`); Today was rewritten, and Plan and
Log added, from the code on 20 October 2026 (ADR 0058). It describes **what** each screen
shows and does, never how it looks. A redesign may move, regroup, rename or put behind one tap
anything below; it may not drop it. Where this page and the code disagree, the code wins and
this page is corrected. Quoted wording is the app's when it was read: a sentence that explains
how the app, the coach or a plan works is not a feature to keep on a screen, and moves into an ⓘ
or a fold, or goes (`DESIGN.md`, The Need-to-Know Rule).

Each section lists the information shown, the actions, the states a design must cover, what
must survive any redesign, and sample content from the repository for mockups. The sample
content is real: it comes from the seed data, the preview fixtures and the audit seed, never
invented. Elsewhere, quoted labels show the wording and format the app uses; the numbers inside
them are illustrative.

## Everywhere: the shell

Code: `src/app/(app)/layout.tsx`, `src/components/shell/`, `src/lib/nav.ts`.

- **Explanations** are a tap away, in an ⓘ or a fold, never running text on a screen. A feature
  moved behind a tap is still listed here, and still counts as present.
- **Five destinations:** Today, Plan, Food, Progress, Profile. Workout screens count as
  Today unless opened from elsewhere (Plan, History, the programme, a shared link). Logging a
  run, ride or swim counts as Today; a planned session's page, a programme day's page and the
  strength programme's builder and drafts count as Plan. Exercises, gyms and people's pages
  count as Profile.
- **Headers:** a top-level screen has a title, one fact about it (a date, a period, a count)
  and at most one action. A nested screen has a back link that names where it goes ("Today",
  "History", "My foods") and returns to the previous in-app page, or to that destination when
  there is none.
- **The session strip:** while a workout is unfinished, every screen except Today and the
  workout itself shows "In progress · {session name}" with Resume. At large text, on a screen
  with its own pinned actions, the strip folds into them as a key that keeps one-tap Resume and
  the rest's time, with the session's name in its accessible name.
- **The rest timer** (only when turned on in Profile): "Rest" and an m:ss countdown, +30 s and
  Stop, then "Go", which clears after 60 s. It survives navigation and reloads and stays in
  step across tabs, and shows on every screen including Today.
- **Offline:** a banner ("You're offline. Drafts stay on this device."). Drafts are kept on the
  device; saving retries when the connection returns.
- **Slow and failed navigation:** progress on every link; after 8 s "Taking longer than
  usual…" with Retry; a clear offline message when a page cannot load.
- **Loading and errors:** each screen has a loading state with Retry, and an error state with
  "Try again", "Back to Today" and, when there is one, a reference code. Inside a workout the
  error reassures that drafts are kept.
- **Accessibility and reach:** a "Skip to content" link, 44 px targets, zoom never disabled,
  System, Light and Dark appearance, usable at 320 px wide and at 200% text.

## Today

Code: `src/app/(app)/today/` (`page.tsx`, `today-view.tsx`, `gym-switcher.tsx`,
`plan-actions.tsx`, `coach-actions.tsx`), `src/components/activities/today-activities.tsx`.

**Purpose:** what the athlete owes today and where they will train, one tap to start, resume or
log each session, and what is done today. Nothing that is not today's: where a programme has got
to and what comes next are Plan's, and logging anything else is Log's (ADR 0058).

### Shown

- **The date**, and **Log** beside it unless the page is empty (below).
- **After missed days:** from the second missed training day, how many ("36 missed"), under the
  date, one quiet row with Pick up from today.
- **A card per session still owed or open**, each with one main action (one collapsible card
  per activity, each with its own next step; see `DESIGN.md`, Activity cards):
  - **An unfinished session** that is not the offered day (an unplanned session, or another day
    started from Log): its name, gym, start time and number of sets, with Resume. Only one
    Resume ever appears on Today.
  - **The offered lifting day**, while it is owed or open: its name ("Lower A"), the gym with
    Change ("Choose a gym" on the chip without a default; Start waits until one is chosen), its
    time and focus ("70–90 min",
    "Squat + quads"), and "Prepared by the coach" when the coach prepared it. One tap away, its
    exercises, each with its prescription ("3 × 8–12 @ 1–2 RIR", or metres (yards beside miles)
    or seconds for carries and holds), with supersets grouped. When the coach prepared the day,
    its summary comes first, and each exercise also shows its machine, loads in the account's
    unit, the coach's notes, exercises dropped for today, and any warnings.
  - **A rest day:** its name, time and focus, and the warm-up or mobility protocol: its name,
    how many drills, and each drill with its dose.
  - **Each run, ride or swim dated today**, whatever planned it: the sport, its target
    ("30 minutes", "5 km", "6 × 400 m"), a scheduled time if set, "Prepared by the coach" when
    it did, and how to do it one tap away. A day that only runs names its run card for the day
    ("Tempo run", its focus "Threshold").
- **The coach's status**, when the coach is on, one line each: preparing (Today refreshes by
  itself, and says nothing of it), could not finish, has not prepared it yet, prepared it for a
  different gym, or fell back to the programme's own targets.
- **Done:** a row for each session finished today, whatever planned it, named as its record is
  (a workout no day or routine names, by its first two exercises: "Pull-up, Bent-over row"), with
  what it came to ("5 km", "48 min") and "Unplanned" when it answered nothing planned; each opens
  its record. A
  run, ride or swim skipped today is a row too, Skipped, that opens its page, and a rest day
  marked done is a row of its own.
- **Nothing planned:** with nothing owed or done, "Nothing planned", or "{programme} is
  complete" once the strength programme has finished, with Log a session as the page's own
  button.
- **No gym:** a lifter with no gym, when there is no programme or the day's lifting is owed, is
  asked for one ("Add a gym to start training") in place of the workout's card.

### Actions

- **Start workout** at the chosen gym, which goes to a short check-in and then the workout.
  While a session is open, nothing on Today starts, skips or prepares another.
- **Resume**; **Discard** an unfinished session that has no sets (anything logged is finished,
  never discarded); **finish** one left open (nothing logged in it for six hours) as of its last
  set.
- **Change gym** (a sheet of gyms with their kind: gym, outdoor or home; Manage gyms).
- **Log run**, **Log ride** or **Log swim** on its card, carrying its target; **Skip or move**
  opens its page.
- **On a rest day:** Mark rest day done, or start the next lifting day instead ("Start Upper A",
  or "Start cycle 5 with Push A" when it begins the next cycle).
- **More options**, on the workout's card, holds only the coach and Skip: ask the coach to
  prepare this session, or prepare it again (with a gym choice, an optional note, and
  "3 requests left today"), and skip this session (with an optional reason; skipping the
  workout never skips a run on the same day). Another day, or something unplanned, is Log's.
- **Pick up from today:** where the programme carries on from, and that the missed days stay as
  skipped, are said once; the missed days are listed under a fold with their count, then skipped
  in one go, and the programme carries on from the day it has for today.
- **Log**, for anything the cards do not offer (Log, below); open a Done row's record; **Add
  your first gym**.

### States to design

No gym; no default gym; nothing planned (no programme, or nothing owed or done today);
programme complete; lifting day; lifting plus run; run only; rest day; two or more training days
missed; session in progress (for the offered day or another) or left open; some or all of the
day done or skipped; the coach off, preparing, failed, prepared for another gym, or out of
requests; offline; loading; error.

### Must survive

- One unfinished workout at a time.
- The gym is chosen before starting and fixed for that session.
- One card per task: the workout and each run are separate, and starting one never hides
  the other. A session done today is a row in Done that opens its record, never a card.
- Today shows only today: no programme position, no next day, and no missed run, ride or swim.
  Those are Plan's, and Log offers them.
- More options holds only the coach and Skip; anything else is Log's, one tap away in the
  header.
- Unplanned sessions carry no programme, cycle or day.

### Sample content

- Programme "8-Week Strength + Aesthetics Hybrid": 8 cycles, 56 days. Days: Lower A ("Squat +
  quads", 70–90 min, "2–3 RIR compounds"), Upper A ("Bench + back"), Easy Run + Arms
  ("Aerobic + arms/forearms", 70–100 min), Lower B ("Deadlift + posterior chain"), Upper B,
  Easy Run + Light Upper, Rest + Mobility ("Recovery", 10–15 min). (`src/db/seed/data/program.ts`)
- Lower A: High-bar barbell squat 3 × 4–6, 45° leg press, Seated leg curl, Leg extension,
  Smith machine calf raise, Cable crunch. (`src/db/seed/data/exercises.ts`)
- Easy Run + Arms, as previewed on Fri 11 Sept: Barbell curl 3 × 8–12, Rope triceps pushdown,
  Farmer's carry 3 × 20–40 m, Wrist curl, and a 25–30 min run ("Talk-test; slower than push
  pace"). (`src/app/(preview)/preview/page.tsx`)
- Gyms "Anytime Fitness" (gym) and "Home" (home). Warm-up "Daily mobility": 90/90 hip switches
  6–8 per side, Cat-cow 6–8. (`src/db/seed/data/warmups.ts`)

## Log

Code: `src/app/(app)/today/log/` (`page.tsx`, `log-choices.ts`),
`src/app/(app)/today/start-option.ts`, `src/app/(app)/today/log/new/` (the form for a run, ride
or swim), `src/app/(app)/workouts/start/` (the check-in),
`src/app/(app)/progress/activities/[activityId]/counts-as/`,
`src/server/repositories/activities.ts` (`relinkActivity`), `src/app/(app)/today/log/body-weight/`
(a body weight reading, `src/server/actions/body-weight.ts`).

**Purpose:** log what Today's cards do not offer (late, early, unplanned or done earlier): what
was done, which planned session it counts as, if any, and when. The training date and the
session it answers are separate questions, so a run missed on Saturday and done on Tuesday
counts as Saturday's, logged on Tuesday. It replaced Choose a day and Training's Log (ADR 0058),
and takes a body weight reading too (ADR 0060).

### Shown

- **Log:** the athlete's sports, as Workout, Run, Ride and Swim (all four when none is set),
  then Body weight.
- **Counts as**, under the sport's title ("Log a run", "Log a workout"), then Unplanned
  ("Unplanned run"); a sport with nothing planned skips the question:
  - a run, ride or swim: the sport's open sessions from 14 days back to 6 ahead, today's first,
    then the missed, most recent first, then the early, each with where it stands ("Today",
    "Sat 17 Oct · missed", "Sun 18 Oct · skipped", "Thu 22 Oct · early") and its target, each
    named as Today names it (its title, else its kind such as "Long run", else the sport);
  - a workout: the strength cycle's days, the one Today offers first, each with the start it
    would get ("Next in your programme", "This cycle", "Skipped this cycle",
    "Done this cycle", "Cycle 2").
- **When**, under what it counts as ("Counts as {session}", or "Unplanned"): for a run, ride or
  swim, the date it was done, today or earlier (the header's Counts as line names the session
  and its date), then its form; for a workout, the gym and Start workout, or Done earlier with the date and the
  time it started.
- **A workout already open:** "Finish or discard your open workout first.", with Resume.
- **No gym:** a workout asks for one first (Add your first gym).
- **Counts as, once saved:** a run, ride or swim's page has one Counts as row, "Unplanned" or the
  session and the day it was planned for ("Tempo run · Thu 20 Aug"), which opens Counts as: the
  sport's sessions from 14 days before the day it was done to 6 after, the current one marked
  Current, opening its session's page, and Unplanned. A session whose programme has ended keeps
  its answer (ADR 0054), and its row opens that session's page.
- **Body weight** (Log body weight): the date, today unless another is chosen and never a later
  one, and the weight in the account's unit, with what the scale said last under it ("Last 75.2
  kg · Sat 17 Oct"), or "Replaces 75.2 kg" when the newest reading is that day's; one reading a
  day, behind ⓘ.

### Actions

- **Choose** what was done, then what it counts as, or Unplanned.
- **A run, ride or swim:** choose the date, today or earlier, then Continue to its form, which
  saves it as that session's answer, or as unplanned. A run's form takes its kind, outdoor or
  treadmill, and its laps from the watch; a planned run lays its laps out empty, and Fill in the
  planned distances and times copies the plan's figures only when tapped.
- **A workout:** choose the gym, then Start workout, a live session through its check-in; or
  Done earlier, with the gym, date and start time, then Log this workout, which has no live rest
  timer or abandoned-workout prompt, asks for its finish time and returns to Today.
- **Change what a saved run, ride or swim counts as**, from its page: another session or
  Unplanned changes it at once, and a refusal says why beside the rows.
- **Body weight:** Save. Opened from Progress or Food's Targets, it goes back there, where the
  reading now shows; opened from Log, it lands on Progress › Body weight.

### States to design

One sport or several; a sport with nothing planned; sessions today, missed, skipped and early;
the strength cycle's days in each kind of start; a workout already open; no gym; done earlier;
Counts as changed, refused, or not offered for a session of a programme that has ended; a body
weight with no reading yet, replacing that day's, or refused; offline; loading; error.

### Must survive

- The athlete names the session, or none; nothing is matched by date.
- The training date and the session it answers are separate questions.
- One unfinished workout at a time.
- An unplanned session carries no programme, cycle or day.
- What a run, ride or swim counts as changes only by its own step, checked as a new log is: the
  sport's, still open, answered by nothing else. A session of a programme that has ended keeps
  its answer (ADR 0054); a workout's programme day is chosen when it starts.
- A body weight reading is one a day, today or earlier, in the account's unit; a workout's Finish
  keeps its own field.

### Sample content

- Counts as on Tue 20 Oct: "Today", "Today · skipped", "Sat 17 Oct · missed",
  "Sun 18 Oct · skipped", "Thu 22 Oct · early"; a lifting day's start: "Next in your
  programme", "This cycle", "Skipped this cycle", "Done this cycle",
  "Cycle 2". (`src/app/(app)/today/log/log-choices.test.ts`)

## Plan

Code: `src/app/(app)/plan/` (`page.tsx`, `plan-view.tsx`, `[sport]/`, `new/`, `past/`),
`src/domain/plan-week.ts`, `src/server/repositories/plan-week.ts`,
`src/server/repositories/sport-programmes.ts`, `src/components/coaching/programme-tools.tsx`,
`src/app/(app)/plan/sessions/[occurrenceId]/` (a session's page),
`src/app/(app)/profile/programme/changes.tsx` (a programme's dealings with the coach),
`src/app/(app)/plan/history/` (its past requests and changes),
`src/components/coaching/strength-coach-intake.tsx` (strength's questions with the coach).

**Purpose:** what comes next and how it is built: this week's sessions for every sport, by date,
and each programme, how it runs and where it has got to. Starting, logging and skipping today's
sessions are Today's; what has been done is Progress's (ADR 0058).

### Shown

- **This week**, Monday to Sunday, as Plan's title with its dates under it ("19 – 25 Oct") and
  its two round steps at its end, heard as Last week and Next week (owner, 28 October 2026). The
  week is one card: each day with something planned has its weekday and date in a column, today's
  date in the one ink disc, and its sessions beside it, every sport's, lifting first, each with
  its sport's sign and name ("Upper A", "Tempo run", or "Run" when nobody named it), a run, ride or
  swim with its figure where the name does not say it ("30 min"). Each reads Done or Skipped once
  answered; a run, ride or swim reads Missed once its day has passed without; today's and one to
  come say nothing. The days gone by fold into one closed row at the card's top, saying what
  became of them ("Mon 19 – Tue 20, 3 done · 1 missed"), opening to their sessions; today and the
  days to come are open, and a week gone by, opened on purpose, is shown whole. A lifting
  day appears once: done or skipped, on the day it was; still owed, where the sequence will reach
  it, the day Today offers on today and each after it on the programme's next training date,
  never also on the date the calendar first gave it. Days with nothing planned are left out, and
  a week with none says "Nothing planned."
- **Programmes:** one card under the Programmes heading, + New at the heading's end, a row per
  active programme with its sport's sign, its name, how it runs and where it has got to ("Every week · Week 3 of 8", "Progressive · Day 12 of 40", "Progressive · Starts Mon
  26 Oct" before a run, ride or swim programme's first day, or "Complete"), and "Changes to
  review" or "Draft in progress" while a change waits. Never its next session, which is Today's,
  and never a bar, which is its page's. Beside them, a first programme from the moment the coach
  is asked for it ("New running programme" with "Being written", "Needs your answer" or "Could
  not finish", opening its request), then its draft ("New programme to review" or "Draft in
  progress") until it is started or discarded.
- **Past programmes**, the last row of the Programmes card, to every sport's programmes that
  ended or were replaced, newest first, each with its name, sport and version ("Running ·
  Version 2").
- **A programme's page** (`/plan/[sport]`): its name and its sport's sign, how it runs and for
  how long ("Every week · 8 weeks", "Repeating · 12 weeks"), a bar of the days or sessions done
  with where it has got to under it ("Week 3 · 12 of 79 sessions done"), Edit programme and More
  options, its notes and dates under More options (Programme details).
  - **A run, ride or swim programme:** its weeks, each with what it asks for, the day it starts
    and where it stands ("Week 3", "Mon 19 Oct · 4 runs · 24.2 km + 68 min", "Done", "1
    missed"), the current one open; each session named as This week names it (its title, else its
    kind of run, else its sport), with its kind and target under it only where the name does not
    say them ("Tempo" over "20 min"; "Long run 4.5 mi" alone), and Done, Skipped or Missed,
    opening its page. Above the weeks, Waiting for you when anything waits (changes to review,
    the coach's questions to answer, a new programme it wrote); under them, With the coach
    (folded), Updated by the coach, Request a change and the coach review while the coach is on,
    and this programme's Past requests and changes.
  - **The strength programme:** where it has got to, once and in its card's words ("Week 2 of 8 ·
    40 days left · 3 skipped"; "Cycle 5 of 14" when its cycle is not a week; "Day 12 of 40" when
    progressive),
    then Days and Changes. Days lists every day in order, each opening to its exercises and
    targets (a progressive programme's sequence seven days at a time). Changes holds what the
    coach has proposed, asked or changed for this programme alone, with what waits for the
    athlete counted on the tab ("Changes (2)"), and its Past requests and changes.
- **A session's page** (a run, ride or swim): its name ("Run" when nobody named it), its sport
  where the name does not say it, its week and the date it is planned for, its target and how to
  do it (one tap away in a fold; Stop if stays in view) — each step a line, a repeated block's rep
  and recovery on lines of their own, with its pace and its zone in the athlete's beats ("Zones
  4–5 (163–191 bpm)") — Next, Missed or Skipped (why a passed date is still Next, or "Still to
  do", one tap away), "Moved from {date}." and, once logged, the planned line and See what you
  logged, with the day it was logged.
- **New programme:** the four sports, then Repeating ("Same week or cycle, on repeat"),
  Progressive ("Builds week by week") and With the coach ("Answer a few questions"). A sport with a programme says what a new
  one replaces ("Replaces {programme} when you start it. Your history stays."). Strength's With
  the coach is the whole intake (New to this or I already train, the brief, plans and reports to
  attach), titled New strength programme. Running's asks Your goal, Your fitness now, When you
  can run and Where you run; cycling's and swimming's ask the same sections in their words, with
  What you ride (swim) now and the days. Every sport's takes Reports and plans (each kept file
  ticked for this request or not, Download, Remove), What the coach asked (folded), and Ask the
  coach for a programme pinned with Save answers under it; while the coach takes no new
  programmes it says so in one line, with Build it yourself when nothing was answered yet
  (ADR 0061).

### Actions

- **Step** to the week before or after; the tab comes back to this week.
- **Open a session** from the week: today's goes to Today, a run, ride or swim opens its page,
  and a lifting day opens its day's page (`/plan/strength/days/[dayId]`); a day gone by opens
  first, to its sessions.
- **On a session's page:** Log run (Log ride, Log swim), its one primary, while it is no more than
  six days ahead, as Log takes it; Skip this session, or Put it back; Move it to another date;
  Remove from the calendar, for one no programme planned.
- **Open a programme** from its row; **New programme**, at the end of the Programmes heading, or
  as the page's own button with none.
- **On a programme's page:** Edit programme, a draft of the current block applied once
  reviewed; under More options, Replace programme, Duplicate programme and End programme. Ending
  is confirmed in place: its sessions from today on are removed, any it still owes can then only
  be logged as unplanned, everything logged stays, and it moves to Past programmes. A finished
  programme offers New programme instead of Edit programme.
- **Changes:** open a draft in progress to go on with it, or changes to review to apply them;
  answer the coach's question or withdraw an ask; Request a change ("Sent to the coach."); ask the
  coach for a review (Coach review); open this programme's Past requests and changes. A decision
  returns to its programme's page.
- **Past programmes:** Duplicate programme.
- **New programme:** choose the sport, then Repeating or Progressive, which open the builder
  already set to run that way, or With the coach, which opens the sport's questions.

### States to design

No programme (New programme as the page's own button); a week with nothing planned; this week
and another; sessions done, skipped, missed, today's and to come; lifting and a run on one day;
a day gone by, closed and open; a week gone by; an athlete behind the calendar, each lifting day
once from today; a day finished today; a day of many skips after Pick up from today; a finished
programme; a change waiting (a draft
in progress, or changes to review); a first programme asked of the coach (being written, needs
your answer, could not finish) or drafted; a run, ride or swim programme still to start; strength and endurance, repeating and progressive, weekly
and rolling; a progressive strength sequence longer than a week; no past programmes; the coach
on or off; offline; loading; error.

### Must survive

- Plan is next: today's sessions point to Today, which starts, logs and skips them.
- One active programme per sport; starting, editing or ending one never replaces or advances
  another.
- Each programme has one page. Its card says how it runs and where it has got to, and opens that
  page; it never names the next session or repeats the page's buttons.
- A run, ride or swim programme's weeks carry the day each starts, which orients the list
  (PRODUCT.md, Information map); a session's own date is This week's and its page's.
- This week is a list of days; a lifting day appears on it once, where it was done or skipped or
  where the sequence will reach it, and opens its day's page.
- What the coach does about a programme is that programme's page's; AI coach names a programme
  waiting for you only by its state, and links to its page.
- Ending a programme is confirmed, closes its outstanding sessions and keeps everything logged
  (ADR 0054); it moves to Past programmes, where it can be duplicated.
- A programme changes only when the athlete applies the change, whoever drafted it.

### Sample content

From the Plan preview (`src/app/(preview)/preview/plan/page.tsx`), on Tue 20 Oct 2026:

- Programmes: "8-Week Strength + Aesthetics Hybrid" (Strength), "Every week · Week 3 of 8";
  "Hybrid Half Marathon" (Running), "Progressive · Week 5 of 12", with "Changes to review"; a
  first cycling programme asked of the coach, "New cycling programme", "Being written".
- This week: Mon 19 Oct closed, "1 done · 1 missed" (Upper A Done, Easy run Missed); Tue 20 Oct,
  Lower A and Run, both Today; then Upper B, Tempo run, Lower B and Long run, one a day to
  Saturday.

## A workout and logging a set

Code: `src/app/(app)/workouts/[sessionId]/` (`workout-view.tsx`, `workout-overview.tsx`,
`exercise-logger.tsx`, `set-grid.tsx`, `set-options.tsx`, `use-set-rows.ts`, `next-load.tsx`,
`superset-sheet.tsx`, `session-details.tsx`, `check-in/`, `finish/`, `add-exercise/`),
`src/components/shell/rest-timer.tsx`, `src/server/actions/sessions.ts`.

**Purpose:** record every set of one workout at one gym, exercise by exercise in any order,
then close it as a permanent record.

**The flow:** Start workout on Today or Log → a short check-in (Save and start, or Skip) → the
workout's exercise list → open an exercise and log its sets → Complete it and move to any
other → Finish session (notes and body weight) → the finished record, with any records set.
An unplanned session starts empty; a programme day arrives with its exercises, fallbacks,
supersets and any coach plan already applied.

### The check-in

Four readings before the session: sleep hours, sleep quality, fatigue and soreness. Warnings
from them become a "Recovery check" on the workout ("Sleep {hours} h: hold loads today rather
than adding, and keep the RIR honest").

### The workout

- **Header:** the day's name, the name of the saved routine it was started from, or "Unplanned
  session", and the gym, said once for the whole session. Once finished, a workout no day or
  routine names is called after its first two exercises with a set logged ("Pull-up, Bent-over
  row"), on its page, its title and every list that names it (ADR 0060). The session strip, a way back to the
  workout and an exercise's "Back to Lower A" say a name of more than 20 characters (a routine's
  may run to 120) as "Workout" and "Back to the workout", so each stays a line or two.
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
  - reps, seconds or a distance (metres, or yards for an account that reads miles; ADR 0055),
    depending on how the exercise is counted;
  - effort: RIR for reps, RPE 1–10 for time and distance; required on working sets, optional
    on warm-ups, and never pre-filled;
  - Save, then a confirmed check. Untouched load and reps take the suggested value, shown
    faintly until saved; effort never does.
- **Set options** for a row: its type, steppers for load (in the machine's real increments),
  reps (1), seconds (5), metres or yards (5) and effort (1), and remove the row or delete the
  set.
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
  ("Skipped: travelling"), notes and body weight; with nothing logged, "Nothing logged" once, over
  Discard session.
- **The finished workout:** read only, with its records ("Barbell bench press · Est. 1RM 88 kg
  (was 85 kg)"; also top weight, best set, most reps, longest hold and longest carry). Saving it
  as a routine is set aside for now (ADR 0058).
- **Edit a finished workout** for a week after its day ([ADR 0049](../../decisions/0049-a-week-to-mend-a-finished-workout.md)):
  Edit, then each exercise, done or not, opens on its log to change, add or delete sets; Add
  exercise; Done. Each change saves as it is made. The summary offers "Edit workout" too.

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

One picker offers seven sections: **Overview** (where the tab opens, with **History** a row under
its month), **Strength**, **Muscles**, **Running**, **Food**, **Recovery** and **Body weight**. The
header says "Progress" with the dates the section is drawn over ("8 Sept – 7 Oct 2026"), except
where a section leads with a clock of its own, which has no funnel either: Overview its month
(ADR 0045), Muscles its week (ADR 0047). Every graph is the one `Graph` (ADR 0042) and carries
the same spans, 1M, 3M, 6M, 12M and All: a month by default, one span for every graph,
remembered once chosen. The funnel holds custom dates, which leave no span chosen until one is.

- **Overview:** this month on paper and its totals as its key, one card, each sport's count with
  its distance and time this month ("3 Runs · 9.2 km · 1 h 9 min"); then **History**, one row
  that opens every entry. The month already draws each activity, so the ten newest are no longer
  listed under it a second time (ADR 0045, amended 28 October 2026). No span and no funnel: the
  training totals over a span were dropped at the owner's request (ADR 0045).
- **Strength:** two selects, a muscle group (all, or chest, back, legs, shoulders, arms or core)
  and then an exercise filed under it ("All exercises", then each exercise ever logged there,
  each under the group of its first primary muscle). **All exercises:** the group's total volume
  as bars, load × reps of kg and lb working sets in the account's unit; the total and the weekly
  figure over the weeks trained ("158,639 kg · 31,728 kg a week · 24 workouts"); a bar reads its
  volume and sets ("8,910 kg · 9 sets") and opens its workout; a group that lifted nothing with a
  load says so ("No loaded sets in this range"), its ⓘ saying bodyweight, timed and stack sets add
  none. **An exercise:** estimated 1RM, max weight,
  max reps and max volume (the best single set), and max time or distance for holds and carries,
  only those with data; a line with a point per workout (past about sixty, the best of each week
  or month); its best in the span and the set behind it ("145.7 kg · 115 kg × 8 · Fri 2 Oct"). Where the exercise was done on several machines, choose
  one ("Seated leg curl · Anytime Fitness") or "Across gyms"; loads from different machines never
  share a line.
- **Muscles:** the working sets a week gave each muscle (ADR 0047), on its own week arrows,
  named as a graph names a week ("This week", "28 Sept – 4 Oct") and stopping at this one: front
  and back body figures shaded by working sets (15+, 10–14, 5–9, 1–4, none), a legend and a
  table; tapping a muscle shows "Chest · 6 sets".
- **Running:** distance and duration as bars, with the total and the count of runs; pace as a
  line, a point per run (past about sixty, each week's or month's pace over all its kilometres),
  faster higher, with the average over all their kilometres, outdoor and treadmill never mixed
  (the choice shows only when both were run).
- **Food:** calories or protein a day as bars, today's target as a rule, the bars that reach it
  set apart in ink 2; the average a day over the days logged ("2,000 kcal · 26 of 30 days logged
  · target 2,600").
- **Recovery:** sleep, sleep quality, fatigue or soreness; sleep as bars against 6 h, the 1–5
  answers as lines on their whole scale, fatigue and soreness drawn 1 at the top so a fresher day
  is higher; the average over the days that gave the answer, a day checked in twice counted once;
  a span whose check-ins left the answer blank says so ("Sleep not answered in this range.").
- **Body weight:** as recorded, a point per reading, in the account's unit; the latest and its
  change ("75.2 kg · −1 since Tue 8 Sept"). With no reading at all, "No readings yet" and Log
  body weight (Today › Log's page); with none in the span, "No readings in this range."
- **History** (Overview's History row, a page under Progress with its range under its title,
  ADR 0045):
  "79 entries", newest first, ten to a page with the page tabs under
  the list (every page up to five, else the first, the last and the page read with its
  neighbours), each entry marked Workout, Run, Ride, Swim or Recovery. A workout shows its name (an unplanned one's first two exercises), date, time,
  gym, sets and sleep; a run "Outdoor · 5 km", "30:34 · 6:07/km" and its effort; a ride or swim
  its distance and time; a recovery entry its readings. Filters: dates, activity, gym, exercise
  and machine, with a count of filters set and Clear filters; a filter starts again at page 1.

### Actions

Switch section; choose a span, or custom dates behind the funnel; choose what a section draws
(group or exercise, machine, measure, outdoor or treadmill, food or recovery measure); step
through body-map weeks; tap or drag a graph to read a mark, and open the workout, run, day, week
or food log behind it; step through the marks with the arrow keys; open "View values" for every
value, each opening its record; open any entry from History (a finished workout, read only and
editable for a week after its day, or an activity page with its time, distance, pace or speed, effort and notes); correct an activity;
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
  (calories and macros just this once, always first), saved meals under Meals (name, what they
  hold, "445 kcal"), foods under Foods (name, "100 g", "389 kcal"), each the most eaten first,
  five meals and ten foods a page, and New food only when a search finds nothing.
- **Portion sheet:** the food per portion, the amount eaten in the food's own unit, one-tap
  ½, 1, 1½ and 2 portions, a live total, Add or Save, and Remove when editing.

### My foods, meals and targets

- **My foods:** search, New food, New meal, saved meals (name, what they hold, "445 kcal") and
  foods, each the most eaten first and a page at a time; Back from a saved meal returns to the
  same search and pages. A food has a name, a portion in one of 12 units, calories (required) and
  optional carbs, fat and protein.
- **Meal builder:** a name, the foods and amounts in it with a running total, Save meal, and
  Delete for an existing meal.
- **Targets:** daily calories; the goal (read only); protein in g per kg of body weight ("134 g
  at 74.5 kg"), or, with no body weight yet, protein as a share of the target and Log body weight
  (Today › Log's page, which comes back here); fat as a percentage; "Use 55 / 25 / 20" to return
  to the goal's split; a live preview of the carbs, fat and protein in grams.
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
- Day: 1,153 / 2,300 kcal, 1,148 left; carbs 86/297 g, fat 24/64 g, protein 53/134 g.
- Saved meals: "Post-workout shake" (whey 1.5 scoops and milk 250 ml, 339 kcal), "Usual
  breakfast" (3 foods, 445 kcal). Other foods: Oats 100 g 389 kcal, Paneer 100 g 265 kcal.
