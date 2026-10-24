# ADR 0063: Running plans read and asked plainly

Date: 2026-10-24
Status: accepted, built on the owner's request of 24 October 2026, after reviewing a coach's
half-marathon draft ("the coach is getting all my running history … we need to give the history
in a structured manner"; "the running time per day should be optional … if I give one, you can
incorporate that"; "8 km + 74 min … should we represent both in kilometres, or both in minutes?
You need to decide"; "go ahead, do all of them"). Amends ADR 0059 (the running intake, the
running context, how a plan's week reads) and its review screen.

## Context

The owner asked the coach for a half marathon on 1 January 2027 and reviewed the draft on Plan.
Read against the code, the flow showed:

- **The coach saw less history than it seemed to.** Sixteen weeks reached it as weekly totals
  only; eight weeks as one line a run with no pace and no heart rate; full laps for the last seven
  days. The average and highest heart rate typed on a run were never sent at all. Its plan said
  "pace and feel lead" and guessed at what a usual run took.
- **Time was required, as one figure.** "Minutes on a usual run" was required by the form and by
  the server for every endurance sport, and the long run's minutes were a separate optional field.
  The athlete gave 40, left the long run blank, and the coach had to say in its doubts that the
  long runs would grow to two hours, "say if that does not fit".
- **A week read "8 km + 74 min".** ADR 0059 kept distance and time apart rather than convert "at a
  guessed pace". The owner read it backwards (the 8 km was Sunday's long run, the 74 minutes the two
  weekday runs), and no two weeks could be compared, though every run carried its own pace.
- **The race could move.** Every session is dated from the start chosen at review, which defaulted
  to today once the coach's start had passed: started a day late, the race moved a day.
- **There was no way to answer the coach.** Its doubts mixed questions only the athlete could answer
  with notes, and the review offered Start, Edit draft and Discard. Setup's "Ask for changes"
  existed and was not offered on Plan. Run days the coach chose could only be moved one session at
  a time, about ten edits a weekday.
- **Its sums were not checked.** "Easy run + strides, 30–35 min" had steps adding up to 32–39
  minutes, and its 48–60 s walks read "0.8–1 min". Each step repeated the pace and effort its
  session had just said.

## Decision

1. **The coach reads a runner's months run by run.** `runningContext` adds `runs` (every run of
   the sixteen weeks, newest first: kind, place, km, minutes, a whole-run pace, average and highest
   heart rate, the zone of its average, effort, climb and notes; a run's heart rate is its own, else
   its laps' weighted by their time), `typical` (each kind of run's and each effort's middle pace
   and heart rate over eight weeks), `habits` (the weekdays run on in at least three of the last
   eight complete weeks, a usual run's length with each week's longest set aside, the longest run by
   time), `consistency` (weeks with a run, the longest stretch without one) and `effortShare` (how
   eight weeks' running minutes divide by reported effort). Worked out once by the server
   (`src/domain/running-context.ts`), so the coach reads them rather than dividing seconds by
   metres sixty times.
2. **Time is a limit on the days that have one, and optional.** "Any days with a time limit?" asks
   each day the athlete can run (every day where they named none) for minutes, a blank day having
   none; it replaces "Minutes on a usual run" and "Minutes for the long run" (`timeLimits` in the
   running answers). With no limit at all the coach sizes each run from the goal and the runner's
   usual run and says the longest run's time. The server no longer requires a session length for
   running; a ride or swim is still asked one. An older intake's minutes are read as before: every
   run but the long run, and the long run's.
3. **Run days start from the logs.** With no saved answers, "Days you can run" is filled in from
   the days the runner usually runs, said to be, where those hold the runs a week the logs show;
   fewer days than runs a week is refused at asking. With no days confirmed, the coach puts the runs
   on those days where they suit the plan.
4. **A later race may be named** for the block to lead into (`nextRace`: a distance and a date
   after the goal). The programme still ends with its goal; the coach builds it as a first step
   towards the later race and says when the gap is short.
5. **A week reads as one distance.** A timed run that carries a pace has a distance: its time (the
   upper end, as a week's distance counts the upper end) at the middle of its pace. Running with no
   pace of its own (a warm-up by zone, a stride) is read at the plan's easiest pace. The week reads
   "≈ 16 km" when any of it came from a pace, to the whole kilometre or mile, and "23.1 km" when all
   of it was asked by distance; walks and rests are no distance. A plan with no pace anywhere still
   reads its time ("+ 40 min" beside a distance, or the week's minutes alone), as a run-walk plan
   does. This replaces ADR 0059 §10: the pace is the plan's own, not a guess.
6. **A race stays on race day.** A plan that ends with a race counts every date from its own start
   whatever day it is started: a later start leaves out the sessions before it, said under the
   field ("Leaves out 1 session before Wed 28 Oct"), and a start after the race is refused. Any
   other plan opened after its start is offered the next day on its own weekday, so its runs keep
   their days, and still moves with the day chosen (`src/domain/programme-start.ts`).
7. **The coach's questions are its own.** A programme result may carry `toConfirm`: at most four
   questions only the athlete can settle, each answerable in a few words, never also in
   `uncertainties`. A draft keeps them (`program_drafts.to_confirm`, migration 0064); the review,
   setup's ready programme and a proposed change show them under "The coach asks", in view beside
   the decision. The contract stays at version 8: the field is optional and additive.
8. **Ask for changes on Plan's review.** A first programme can be sent back with an answer to each
   question and anything else, each answer filed in the intake's `clarifications` beside its
   question verbatim. The draft closes in the same write as the new request, so a request that
   cannot be made (the day's three spent) leaves it to start, and the words are kept.
9. **Run days move at once.** A dated run, ride or swim plan's review shows the days it runs on
   with Change: each day, with what it mostly holds (long runs, hard sessions, easy runs), takes a
   new one, and every week's sessions move to that day of their week. The race stays; a session
   whose new day is before the start, on or after the race, or kept by another stays where it was,
   and what moving leaves (sessions that stayed, hard days back to back) is said before saving
   (`src/domain/run-days.ts`). It saves as an edit of the draft, checked again as it starts.
10. **The server checks the coach's sums.** A running programme is refused, naming the session,
    when a session's steps add up to more or less than its own duration range (a minute or 5% of
    slack), or a run takes longer than its day's limit at the slow end of its pace; a race is the
    race. A race on a weekday the athlete did not offer to run is no longer refused: it is on the
    date they gave, which a plan with confirmed run days could otherwise never meet.
11. **Said once.** A step leaves out a pace, zone or effort its session's own line already says
    where the screen says it (a session's page and Today's card; the log's plan keeps every step
    whole). A range from under a minute to two reads in seconds: "48–60 s", never "0.8–1 min".

## Consequences

- The running reference is version 2026-10-24.1 and its editorial source records these
  conventions; the coach procedure and policy say the new refusals.
- Migration 0064 adds `program_drafts.to_confirm`, an empty list on every existing draft.
- Every plan with paces reads its weeks in approximate kilometres at once, drafts and active
  programmes alike; `scripts/dev/audit-running.mjs` expects "4 runs · ≈ 34 km · 19 Oct".
- An intake saved before this keeps its minutes; opened again, they fill each offered day's limit
  except the long run's day, and the athlete can clear any.

## Not changed

Distance and duration stay required on a logged run. Cycling and swimming keep their session
length. Strength's intake and its questions. Nothing imports from a watch yet.

## Follow-ups

A weekly chart of the planned kilometres on the review; moving run days on an active programme;
the coach reading heart rate against pace across a run (drift) once runs carry a stream.
