# ADR 0059: Running programmes, laps and heart-rate zones

Date: 2026-10-20
Status: proposed, built on the owner's request of 20 October 2026 ("revamp the program for
running … a custom running prompt … if we can log intervals, tempos, long runs … custom zones …
a field for maximum heart rate … automatically update that based on the heart rate during the
previous runs"). Takes up ADR 0058's follow-up "race goals and training zones". Decisions 1
(the intake's time), 2 (the running context) and 10 (how a week reads) amended by
[ADR 0063](0063-running-plans-read-and-asked-plainly.md).

## Context

Running programmes could be built by hand, edited and ended, but a programme from the coach was
written from the strength reference (which says of itself that it does not prescribe running)
and one policy paragraph, after the strength questions. The coach saw a runner's logs as raw
rows, with no weekly volume, longest run or best effort worked out, and nothing that said which
days the strength programme loads the legs. A planned run could ask for a time, a distance and an
effort out of five, but not a pace or a heart-rate zone, and the builder kept structured steps
without letting anyone write them. A logged run was one distance and one time: no laps, no kind
of run. The app had no heart-rate zones at all.

Runna, Garmin Coach, COROS, Polar and Nike Run Club ask the same things before they write a
plan, because a plan cannot be written without them: the goal (a race distance on a date, or a
goal without one), one honest piece of fitness evidence (a recent race or time trial), what the
runner does now (weekly distance and longest run), and when they can run (runs a week, which
days, the long run's day and length). Their workouts are steps, each ended by a time or a
distance, with a pace or heart-rate target, and repeats of a rep and its recovery. Their logs are
laps with distance, time, pace and heart rate, indoor or out. The training research behind this
ADR, with its citations, is in
[`docs/planning/COACH_RUNNING_REFERENCE.md`](../planning/COACH_RUNNING_REFERENCE.md).

## Decision

1. **A runner's own intake.** New programme › Running › With the coach asks the goal (a race
   on a date, get faster at a distance, run further, build a base, start running, come back after
   a break, keep running going), the distance from 100 m to an ultra, the race date and an
   optional goal time; a recent race or time trial; a usual week and the longest run this month;
   runs a week, which days, the long run's day and minutes; places and terrain; and anything that
   limits their running. Weekly distance, longest run and best effort are filled in from the
   runner's logs, said to be, and can be changed. Nothing is guessed in (`running-intake.ts`).
2. **Running's own reference and context.** A running job reads a running reference, not the
   strength one: intensity distribution, how each kind of session is prescribed, plans by
   distance from sprints to the marathon, progression and injury risk, concurrent strength and
   running, heart-rate zones and race prediction, each claim tagged by the strength of its
   evidence (`coach-running-reference.ts`, condensed from the research brief). The context adds
   `runningContext`, worked out once by the server: sixteen weeks of running week by week, recent
   weekly distance and the peak week, the longest run of the last 30 days, best efforts and their
   Riegel predictions, the mix of run kinds and places, the heart-rate zones, the confirmed goal
   and schedule, and how hard each weekday of the other programmes is on the legs
   (`running-context.ts`). Running's policy rules reach running jobs only. Contract version 8.
3. **What the server holds a coach's running programme to.** Beyond the schema, the athlete's own
   answers, checked: every session has its kind; a quality session (tempo, intervals, hills,
   fartlek, progression, race pace, sprints, time trial) is written as steps; no week holds more
   runs than they confirmed, on days they did not offer; and a race plan ends with the race on its
   date and nothing after it. Each refusal names the session it is about. How fast to build and
   what each week holds stay the reference's, not a refusal's (`running-programme-checks.ts`).
4. **A programme may say its start.** `startsOn` on a blueprint says which date its first day
   is; review offers it as the start date, so a race plan that ends on race day stays that way.
5. **A planned run can ask for a pace and a zone, and says what kind of run it is.** Steps and
   whole-session targets take `paceSecondsPerKm` (fastest first, kept to a tenth of a second so a
   pace typed per mile reads back as typed) and `heartRateZones` of the athlete's five. Both are
   optional fields, so a stored prescription still compares equal to itself. `running.sessionType`
   names the kind: easy, recovery, long, tempo, intervals, hills, fartlek, progression, race pace,
   sprints, time trial, race or run-walk.
6. **Steps written by hand.** The programme builder writes a run's steps: a warm-up, the work as
   one step or a repeated block of a rep and its recovery, and a cool-down, each ended by a time or
   by a distance in metres or the athlete's unit, with an optional pace, zone and note; a run's
   kind is chosen beside its name, and an easy run can carry a whole-run pace or zone.
7. **Logging a run.** The run form takes its kind, outdoor or treadmill (with incline), a surface
   (road, track, trail…) and its laps from the watch: each a distance, a time or both, with its
   average and highest heart rate, up to 100. A planned session can lay its laps out empty, what
   the plan asked shown as a placeholder; one tap fills in the planned distances and times where
   the athlete ran them as planned, and nothing is filled in without it (ACTUAL-01). Laps may say
   less than the run, never more: longer or further than the whole is refused as a typo.
8. **A logged run's page** lists its laps in a table that fits a phone, with each lap's pace and
   zone, and the time in each zone read from the laps' averages, said to be an approximation. Its
   heart rate is given with its zone and its share of the maximum.
9. **Heart-rate zones.** Profile › Heart rate zones holds the maximum and resting heart rate and
   how zones are worked out. The maximum is the one the athlete entered, else the highest
   plausible reading of their runs in the last year, else Tanaka's 208 − 0.7 × age, said to be an
   estimate and typically ten beats out. A run that records a higher maximum raises it (no
   reading above 230 counts), and the athlete can turn that off. The five zones are 50, 60, 70, 80
   and 90 per cent of the maximum (as Garmin and Polar default), or of the heart-rate reserve
   (Karvonen) with a resting heart rate, or floors of the athlete's own. A zone in a plan is shown
   in the athlete's beats wherever it is read.
10. **How a plan reads.** A session is named by its main work: a repeated block, unless work
    written on its own is more of it (an easy run with strides is its run), then its overall
    targets, then its one work step (a tempo's twenty minutes, a race's distance). A week reads as
    its distance and the time of what is run by time, kept apart and never converted at a guessed
    pace ("24.2 km + 68 min"). A session's page is named for the session, placed by its week, and
    lists its steps a line each, a block's rep and recovery on lines of their own.
11. **A running programme takes over running from its start.** An older combined strength
    programme still owns the easy runs it was built with; starting a programme of a sport
    withdraws that sport's pending, unanswered sessions other programmes carry from its start
    date, so a day never shows two runs. What was logged, skipped or due before the start stays,
    as do other sports and the athlete's own unplanned sessions.
12. **A first programme waits on Plan.** From the moment the coach is asked for a programme of a
    sport that has none yet (New programme › With the coach), Plan lists it beside the programme
    cards with where it stands, Being written, Needs your answer or Could not finish, opening its
    request. Once a draft exists, the coach's answer or one being built by hand, the card is the
    draft's (New programme to review, Draft in progress) until it is started or discarded. Only the
    sport's latest request counts, and a draft or programme made since it was asked ends it. The
    request's page says it waits on Plan.
13. **Tested by coaching it.** A first marathon from about 8 km a week and a 200 m sprint block
    were written through the real coach workflow against the local app, and the reference was
    revised where those coaches found it silent or read two ways: sprint goals as their own
    section, one rule for week one, the single-run step above a marathon's long-run peak, a goal
    faster than the evidence, and best efforts read with the effort the athlete reported. The
    conventions this added are listed in the research brief.

## Consequences

- Migration 0063 adds `run_type` and `laps` to a run's details and the heart-rate columns to the
  profile, each with its checks; existing rows read as before (no kind, no laps, zones by maximum).
- The coach contract is version 8: a routine on an older checkout is told to refresh.
- Plans written before this ADR keep their steps and targets; they gain the new fields only when
  edited.
- `scripts/dev/seed-audit-running.ts` writes a 5K block in kilometres and a 10K block in miles,
  logged runs with laps, and heart-rate settings of each kind for the local audit;
  `scripts/dev/audit-running.mjs` checks every running screen against them.

## Not changed

A run's distance and duration stay required; pace stays derived, never stored. The effort out of
five and its meaning. Cycling and swimming prescriptions, which take neither a pace nor a running
kind. Nothing imports from a watch yet: laps are typed in.

## Follow-ups

Importing runs, laps and heart rate from Garmin, Apple Health or Strava files; lactate-threshold
and pace zones beside heart-rate ones; the coach preparing a single run against the athlete's
zones in beats; editing a swim's or ride's steps in the builder.
