# ADR 0060: Every page under its tab, one home for the coach, and readings where they are logged

Date: 2026-10-20
Status: accepted by the owner ("Do the structural moves", 20 October 2026), on an information
architecture audit of every screen (findings M1, M5, M7, M8 and M9). The naming of unplanned
workouts is the owner's own ("name them by their first exercise, or just have a generic name");
the shape of Plan's week was left to us ("Speak what you feel is the right thing for it").
Amends ADR 0020 (decision 4), ADR 0026 (an unplanned workout's name), ADR 0053 (decision 2),
ADR 0055 (decision 3) and ADR 0058 (decisions 4, 5 and 10, Words and Redirects).

## Context

ADR 0058 gave each fact one home, but many pages still lived at another tab's path. A session, a
strength day, a draft, a coach request, past requests and changes and the strength builder sat
under `/profile/programme` and `/training`, so their back links said "Profile" while Plan was lit,
a hand-kept list decided which tab to light, and a running change opened cold went back to the
strength programme. Profile's AI coach carried Plan's coach loop in three tabs: a programme
picker, every programme's requests and changes, and a second way to ask for a change that ADR
0058 had given to the programme's page. Three intakes started a strength programme with the
coach, and the full one, with plans and reports to attach, was reachable only from AI coach.
Edit profile held units, the time zone and body weight beside who you are, behind a pencil with
no word, so "units" could not be found, and body weight, a dated reading, was changed as if it
were a setting: Progress and Food explained in sentences where to find it. Plan's week drew a
lifting day twice for an athlete behind the calendar, once where the calendar put it (Missed)
and once on today, and a lifting row opened the programme rather than the day it named. A
finished workout started from nothing read "Unplanned session" everywhere, a dozen alike in
History.

## Decision

1. **A page's route begins with its home's tab** (M9). A run, ride or swim's session is
   `/plan/sessions/[id]`, a strength day `/plan/strength/days/[dayId]`, a draft
   `/plan/drafts/[id]` (and `/programme`), a coach request `/plan/requests/[id]`, past requests
   and changes `/plan/history`, the strength builder `/plan/strength/edit`; the run, ride and swim
   form is `/today/log/new`, and a logged run, ride or swim `/progress/activities/[id]` (with
   `/edit` and `/counts-as`), still lighting the tab its link names. `/workouts`, `/gyms`,
   `/exercises` and `/u` stay sections the shell maps to a tab. Every old path redirects
   permanently, with its query (Redirects, below). A back link names the page it returns to: a
   programme's page by its title ("Running programme"), and History, Calendar, My foods, Targets,
   Log, New programme and AI coach by theirs; a logged run, ride or swim is named by the page linking to it. A
   draft opened cold goes back to its own programme's page.
2. **Plan's This week stays a list of days** (M5). A strip of seven days was set aside: it hides
   most of the week behind taps. A day gone by is one closed row naming the day and what became
   of it ("Mon 19 Oct · 2 done", "Thu 15 Oct · 1 done · 1 skipped"), its sessions a tap away;
   today and the days to come stand open. A lifting day is drawn once: done or skipped, on the day
   it was; still owed, where the sequence will reach it (ADR 0051), the day Today offers on today
   and each after it on the programme's next training date, never also on the date the calendar
   first gave it, so it is never Missed on the week; Today keeps the missed count and Pick up from
   today. A lifting row opens its day's page. The skips Pick up from today records stand on the
   days they were due, not all on the day it was tapped.
3. **The coach's work on a programme is that programme's page's** (M1). Above the weeks (or
   strength's days), Waiting for you: changes to review, the coach's questions to answer, and a
   new programme it wrote. Under them: With the coach (folded), Updated by the coach, Request a
   change, the coach review, and that programme's Past requests and changes
   (`/plan/history?sport=`). The strength programme keeps these under Changes, now strength's
   alone. A decision on a change returns to its programme's page.
4. **Profile › AI coach is one page, without tabs:** its switch, with how it works behind ⓘ; Working
   on, the coach's requests named as Plan names them ("New running programme · Being written",
   "Running programme · Being reviewed"), with the coach's activity folded under them; Waiting for
   you, one row per programme naming only its state ("Running programme · Needs your answer"),
   which opens the programme's page (a first programme, with no page yet, opens its review); notes
   for every programme at once, with Send; what the coach remembers and your notes, folded; and
   Access tokens, which was Profile's Coach access. Its programme picker and scope filters went.
5. **One intake starts a strength programme with the coach** (M7): New programme › Strength ›
   With the coach, titled New strength programme, with both routes, the brief, and plans and
   reports to attach. `/profile/programme/create` redirects there. Setup asks the same questions
   in the same words (Words, below).
6. **Units and time zone have a page** (M8): Profile › Preferences › Units and time zone
   (`/profile/units`), with Weight, Distance, Pools (for a swimmer) and Time zone, moved from Edit
   profile unchanged, distances still following the weight unit unless set apart (ADR 0055). Edit
   profile keeps who you are: email, name, username, height (in the weight unit's measure), date
   of birth, sex and training goal. Profile's pencil says Edit.
7. **Body weight is logged where readings are** (M8): Today › Log has a fifth choice, Body weight
   (`/today/log/body-weight`): the day, today unless another is chosen and never a later one, and
   the weight in the account's unit, written as a workout's Finish writes one; a second reading
   that day replaces the first. Finish keeps its own field. Progress › Body weight with no reading
   says "No readings yet" with Log body weight, and Food › Targets links a missing weight to the
   same page. Body weight is no longer a profile detail: Edit profile neither asks for it nor lists
   it as missing. Log's title is Log.
8. **A finished unplanned workout is named by what it held.** A workout with no programme day or
   routine is called, once finished, after its first two exercises with a set logged ("Pull-up,
   Bent-over row", or "Pull-up" alone), on History, Overview's latest, a day of the calendar,
   Today's Done, its own page and title, and the ways back to it. One with nothing logged, or
   still open, is "Unplanned session". A friend still reads "Workout".

## Words

| Was                                                                        | Is                                                                                                  |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Log a session (Log's title)                                                | Log                                                                                                 |
| Coach access                                                               | Access tokens, on AI coach                                                                          |
| Create a programme (the coach's strength questions)                        | New strength programme                                                                              |
| Notes for the coach, Send note                                             | Notes for every programme, Send                                                                     |
| Training days, If you already lift, what are you lifting?, I’m new to this | Days you can train, What you lift now, New to this                                                  |
| Your goal, How long a session, Anything to avoid?, Attach a plan (setup)   | What are you training for?, Usual session length, Injuries or movements to avoid, Reports and plans |
| Add body weight, Add it in your profile                                    | Log body weight                                                                                     |
| Unplanned session (finished, with sets logged)                             | Its first two exercises                                                                             |

## Redirects

Permanent, each keeping its query: `/training/programme/occurrences/:id` to `/plan/sessions/:id`;
`/training/days/:dayId` to `/plan/strength/days/:dayId`; `/profile/programme/manual` to
`/plan/strength/edit`; `/profile/programme/drafts/:id` and `/drafts/:id/programme` to their
`/plan/drafts` pages; `/profile/programme/jobs/:id` to `/plan/requests/:id`;
`/profile/programme/history` to `/plan/history`; `/profile/programme/create` to
`/plan/new?sport=strength&method=coach`; `/training/new` to `/today/log/new`; and
`/training/activities/:id`, with `/edit` and `/counts-as`, to `/progress/activities/:id`. The old
`/runs` pages lead to the new paths.

## Consequences

- Which tab a page lights follows from its path; only the four mapped sections and a record's
  `?from=` need more.
- A question from the coach on a programme waits on that programme's page and is named on AI
  coach; Plan's card still says only "Changes to review" or "Draft in progress".
- The coach's notes may still link to old paths; the redirects keep them working.
- A body weight typed on Edit profile is no longer a way to correct today's reading: Log's Body
  weight is, and it replaces that day's.
- Exercise names can be long: a way back to a finished workout being changed (Add exercise, an
  exercise) says a name of up to 20 characters whole and "Workout" ("Back to the workout") for a
  longer one (ADR 0026), as "Pull-up, Bent-over row" is.

## Not changed

What each page does; the data (no migration); Finish's body weight; the sequence and its missed
days (ADR 0051); a follower's view of a workout; the strength programme's Days and Changes tabs.

## Follow-ups

Plan's card naming a question waiting ("Needs your answer"); renaming the lifting days that
still carry a run's name ("Easy Run + Arms"); native-feel checks on a real phone.
