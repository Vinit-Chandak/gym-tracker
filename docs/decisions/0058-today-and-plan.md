# ADR 0058: Today and Plan, split by time

Date: 2026-10-20
Status: accepted by the owner ("Go with Today and Plan, rename Training to Plan and other
recommendations", 20 October 2026). Amends ADR 0016 (Today's More options and programme
summary), ADR 0056 (Training as the logging and management hub), ADR 0057 (Training's layout)
and LIFE-04 (`docs/planning/MULTISPORT_DECISIONS.md`) for an endurance log's link alone.

## Context

The owner found the same information on Today and Training and asked whether to merge them,
with one rule above the rest: never repeat information on a screen. A read of every screen
reachable from the two tabs found the next lifting day in four places, the programme's position
in five (twice on one page), a way to log a run in six places under seven labels, drafts and
changes to review in five, and the strength programme at two addresses under Profile, which had
no row for it. On a day that lifts and runs, Today drew the run three times: in the lifting
day's name ("Easy Run + Arms", from the combined programme), on its own card and in the print;
once the day was done, it showed the next day's whole workout under Up next. The log could only
count a session dated on the day chosen, so a long run missed on Saturday and done on Tuesday
could count as Saturday's only by recording the wrong date.

Leading training apps split three jobs: do today, see the dates, manage the programme (Runna:
Today, Plan, Calendar, Progress; TrainingPeaks: Home, Calendar, Library). A merged tab and a
switch inside one tab were considered and set aside: the screen opened several times a day grows
longer, and programme management hides below it or behind a control.

## Decision

1. **Two tabs divided by time.** Today is now, Plan is next, Progress is done. Each fact and each
   action has one home; another screen may link to it by name, never restate its details or
   repeat its button. The homes are listed in `PRODUCT.md`, Information map.
2. **Training is Plan,** at `/plan`. "Programmes" truncates in a 320-pixel tab bar and would be
   a third tab beginning "Pro". The other things called "plan" were renamed: the strength
   programme's cycle tab is Days, and the coach's actions say Prepare this session.
3. **Today shows today.** One card per session still owed, each with one main action; a session done
   or skipped today is a row in Done, which opens it. No programme position, no print, no Up next:
   the next day is Plan's, and Log can start it. More options holds the coach and Skip. Log sits in
   the header; with nothing owed or done it is the page's own button.
4. **Log** (`/today/log`) takes anything the cards do not: what was done, what it counts as, and
   when. Counts as lists the sport's open sessions from fourteen days back to six ahead (today's
   first, then the missed, then the early), the strength cycle's days with the start each would
   get, and Unplanned; a sport with nothing planned skips the question. The training date and
   the session it answers are separate questions. It replaces Choose a day and Training's Log.
5. **Plan** opens with This week: every sport's sessions by date, Monday to Sunday, today's rows
   pointing to Today, past ones Done, Skipped or Missed, a run, ride or swim opening its page to
   move, skip or log it. The lifting day Today offers stands on today, wherever the calendar put it.
   Then one card per programme (its sport, name, how it runs and where it has got to, and any change
   waiting), and Past programmes. New programme asks for a sport, then Repeating, Progressive or
   With the coach. There are no templates.
6. **Each programme has one page,** `/plan/[sport]`; strength's moved from `/profile/programme`.
   A run, ride or swim programme shows its weeks without dates, which are This week's. A
   strength programme's "Does not repeat" is called Progressive; an endurance programme is
   Repeating when every session it asks for recurs unchanged, else Progressive (it is not
   stored). Retire is End programme, and Archived programmes are Past programmes.
7. **Set aside for now, data kept:** session templates, saved routines and Save as routine, the
   session library, Schedule an activity and Scheduled by you, Create a session with the coach,
   and Start from a template. A session is planned by a programme or unplanned, nothing between.
   Their server code stays, so they can return; their pages redirect.
8. **What a run, ride or swim counts as can change** after it is saved (Counts as, on its page).
   LIFE-04 fixed the link at save; it is now its own explicit step, checked as a new log is:
   the sport's, still open, answered by nothing else. A session of a programme that has ended
   keeps its answer (ADR 0054). Both sessions' histories record it. The sport stays fixed, and a
   workout's programme day is still chosen when it starts.
9. **Missed runs, rides and swims stay off Today** (ADR 0056). They are Missed on Plan's week and
   offered by Log's Counts as.

## Words

| Was                                                                                                     | Is                                           |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Training (tab)                                                                                          | Plan                                         |
| Add programme, Create your first programme, Create a programme, Choose a programme, Plan the next block | New programme                                |
| Retire programme, Archived programmes                                                                   | End programme, Past programmes               |
| Unplanned session, Log another session, independent, ad hoc                                             | Unplanned                                    |
| Log a session, Log training, Log this session, Log a workout                                            | Log (Today), Log a session (its page)        |
| Location, Add a training location                                                                       | Gym                                          |
| Lifting programme                                                                                       | Strength programme                           |
| Not done, Not logged, N sessions behind                                                                 | Missed (with Done and Skipped)               |
| Does not repeat                                                                                         | Progressive                                  |
| Plan (the cycle tab), Ask the coach for a plan, Re-plan with the coach                                  | Days, Prepare this session, Prepare it again |

## Redirects

Permanent: `/training` to `/plan`; `/training/programmes/new`, `/archived`, `/:sport` and
`/:sport/edit` to their `/plan` pages; `/profile/programme` to `/plan/strength`; `/training/log`
to `/today/log`; `/today/choose` to `/today/log?sport=strength`. Temporary, as the features may
return: `/training/schedule`, `/training/scheduled`, `/training/templates` and
`/training/programme` to `/plan`; `/profile/routines` to `/today`. Links that still say
`?from=training` mean Plan.

## Not changed

Progress, Food and Profile, apart from losing Routines; logging a workout set by set; the
sequence and its missed days (ADR 0051); a closed programme's sessions (ADR 0054); one
unfinished workout at a time; an unplanned session carries no programme, cycle or day; a
scheduled log names its session explicitly, and nothing is matched by date. Onboarding keeps its
template step until the owner decides.

## Follow-ups

Changing a workout's programme day after it is finished; importing runs, rides and swims; Progress
sections for cycling and swimming; race goals and training zones; renaming the lifting days that
still carry a run's name. Plan has a development preview at `/preview/plan`, beside Today's.
