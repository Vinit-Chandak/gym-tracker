/**
 * The training reference a running job is given instead of the strength one (ADR 0059).
 *
 * The shared reference in `coach-training-reference.ts` is a lifting document that says of
 * itself that it "does not prescribe running", and every running job used to read it anyway:
 * a running programme was written from a hypertrophy workbook and one policy paragraph. This is
 * running's own, condensed from the research brief in docs/planning/COACH_RUNNING_REFERENCE.md,
 * which is the editorial source and carries the full citations. Update both together and bump
 * the version when the text changes.
 *
 * As with the shared reference it is guidance, not permission: the server's limits, the
 * policy's rules and the athlete's own records outrank every sentence, and a convention marked
 * as one is not evidence. It is served by the deployed app, once per job, so a routine on an
 * old checkout still reads what this deployment says.
 */
export const COACH_RUNNING_REFERENCE_VERSION = "2026-10-24.1";

export const COACH_RUNNING_REFERENCE = `# Coach running reference

## Use and limits

Write running from this reference, the athlete's confirmed intake, their logged runs in
runningContext and their other programmes. Server permissions and the policy's limits still
apply. Tags: [strong] meta-analyses or consistent trials; [moderate] a trial or large cohort;
[convention] coaching practice from Daniels, Pfitzinger, Hansons, Lydiard, Higdon or the NHS,
not directly tested. Population evidence is a starting point; adjust to the athlete's response.
Never invent a race result, a pace, a heart rate or a weekly distance the records do not hold.

## Read the athlete first

1. Goal: runningIntake.goal (race with distance and date, faster, further, base, start, return,
   maintain), the goal time if given, and the athlete's own words in goal and brief.
2. Evidence that sets paces, best first: a recent race or all-out time trial (intake recentEffort,
   then runningContext.bestEfforts) no older than 6-8 weeks; then measured heart-rate zones;
   then effort alone. A race the athlete reports need not be in the logs. An intake recentEffort
   that matches a bestEfforts entry is that logged run: read its effort, and below 5 treat it as a
   floor on fitness, not a race result, as every logged best effort is a whole run, not a race.
3. Current load: runningContext.weeks (16 weeks: runs, km, minutes, longest run per week),
   recentWeeklyKm (average of the last four complete weeks), longestRun30Days, gaps and any
   intake weeklyDistance/longestRecent the logs do not show. A week with no runs is zero runs.
   The logs are thin when the last four complete weeks average fewer than two runs a week.
   runningContext.runs is every run of those weeks with its pace, heart rate, zone and effort;
   typical says what each kind of run and each effort usually looks like; habits their usual
   days, usual run length and longest run by time; consistency how steadily they ran; and
   effortShare how much of their running was easy. A spiky history (one big week among light
   ones) is weaker evidence than its average suggests: say which weeks the plan started from.
4. Constraints: confirmed runs per week (a maximum, not a quota), run days, long-run day, each
   day's time limit (goal.timeLimits), places (outdoor, treadmill, track, trail), terrain,
   restrictions and experience. Respect them exactly; with experience unknown, plan as for a
   novice. A weekday without a limit has none, and limits are optional: with none at all, size
   each run from the goal and habits.usualRunMinutes, and say the longest run's time in the
   rationale. An older intake gives minutesPerRun (every run but the long run) and
   longRunMinutes (the long run) instead. With no run days confirmed, put the runs on the days
   habits.runDays shows where they suit the plan, and say so.
5. Heart rate: runningContext.heartRate gives the maximum, where it came from and the five
   zones in beats. With basis "estimated" the maximum is an age formula, often ten beats out:
   prefer pace and effort targets and do not write zone targets as precise. Where runs carry a
   heart rate, read their easy runs against it: an easy run held in zone 4 was not easy, and the
   easy pace should be slower than they have been running.
6. Other programmes: runningContext.otherProgrammes says which weekdays load the legs. An older
   combined programme's own runs (its runs) are withdrawn from the day the running programme
   starts: leave them out of it.

## Intensity

- Most running is easy: keep at least 75-80% of running time below the first ventilatory
  threshold, conversational pace [strong]. Recreational runners get 1-2 quality sessions a week,
  advanced 2-3 [convention]. For recreational runners a pyramidal week (some threshold, little
  VO2max work) works at least as well as a polarised one; competitive runners may gain more
  from polarised [strong]. Count intensity by time, not by sessions.
- The athlete's zones are five shares of their maximum (50, 60, 70, 80, 90%) or of their
  heart-rate reserve. Easy running is zones 2-3 (about 65-80% of maximum; Daniels' E 65-79%),
  recovery zone 1-2, marathon pace zone 4 (80-90%), threshold the top of zone 4 to zone 5
  (88-92%), intervals zone 5. In 1,411 runners the top of easy running sat near 85% of peak heart
  rate [moderate], so zone 2 alone is very easy, not the ceiling of an easy day.
- Heart rate lags short reps and drifts up in long or hot runs: prescribe intervals and
  repetitions by pace or effort, easy and long runs by zone or pace, and both where known.
- Effort is out of five: 1 recovery, 2 easy and long, 3 steady and marathon pace, 4 threshold
  and tempo, 5 intervals, repetitions and races.

## Paces from evidence

- Riegel: T2 = T1 x (D2/D1)^1.06. It predicts well up to the half marathon; for recreational
  runners its marathon prediction was 10 minutes or more too fast for half of them [moderate]:
  treat a marathon from a short race as best-case unless weekly volume is high (65 km+) and long
  runs reach 30 km.
- Daniels' VDOT gives the same paces from any race. Offsets from current 5K pace per km, across
  5K times of 18-35 min (a faster runner nearer the first figure): easy +0:50 to +2:30
  (recovery the slower half); marathon +30 to +45 s; half marathon +20 to +38 s; threshold
  about +15 s; 10K +8 to +17 s; interval (3K-5K pace) -3 to -18 s; repetition (mile pace) -20
  to -27 s. Worked out for a 25:00 5K: easy 6:03-7:14, marathon 5:38, threshold 5:16, interval
  4:51, repetition 4:36 per km [convention].
- Easy and long-run paces come from typical.byKind and typical.byEffort (the middle of many
  runs at that effort) checked against the zones where heart rate is measured, never from one
  run, and never faster than the runner's own easy runs at effort 2 [convention].
- When the goal time is faster than the evidence predicts, train at the evidence's paces and
  say the goal is ambitious. Goal pace enters race-pace work only once a race or time trial in
  the block shows it is in reach [convention]. Never change the confirmed goal.
- With no recent effort: write the first weeks by effort and zone, and put a 3K-5K time trial
  (or a parkrun) in weeks 2-4 to set paces; a sprint plan times its own distance instead (see
  Sprint goals). Recalculate after each race or trial.
- Slow paces for heat, hills, trails and altitude; run those by effort or zone. A treadmill at
  1% incline approximates flat outdoor effort [convention].

## Session types

Write sessionType on every run, and structure every quality session as steps. "Warm-up 10-15
min easy" before every quality session (with 4-6 strides before intervals or races) and a 5-10
min easy cool-down after are part of the session [convention].

- easy: 30-75 min (beginners from 20), easy pace or zones 2-3, effort 2. Optional 4-8 x 15-20 s
  strides at mile pace with 45-60 s easy jog or walk, after easy runs, 1-2 times a week.
- recovery: 20-45 min, slower than easy, zone 1-2, effort 1, usually the day after a hard day.
- long: easy pace (10-20% slower than goal marathon pace), zones 2-3. At most the lesser of 25%
  of weekly volume or 150 min (30% when weekly volume is under 64 km) [convention]. No single
  run more than 10% longer than the longest run of the past 30 days [moderate: runs 10-30%
  longer carried 1.64 times the injury rate in 5,205 runners]. Marathon peak 30-35 km, last one
  3-5 weeks out; half marathon peak 16-22 km. Late in a block it may finish at goal pace. A
  race is not held to the single-run step, and a range's upper end is the run that counts.
- A first marathon on low weekly volume: the long run is a bigger share of the week (up to
  about 40-50%), still within the single-run step and the athlete's long-run minutes, and the
  rationale says so. When the step and the race date leave the last long run short of about
  28 km three weeks out, keep the step, say so in uncertainties, and offer what would close the
  gap: a later race, a run-walk plan for the race, or a half marathon first [convention].
- medium long (marathon, 5+ runs a week): a 15-24 km easy run midweek; write it as long.
- tempo: the pace the runner could race for about an hour: half-marathon to 15K pace for
  trained runners, and 10K pace + 5-10 s/km for one whose 10K takes 50 minutes or more. Zone 4,
  effort 4. Continuous 20-40 min, or cruise intervals 3-6 x 5-10 min
  with 1-2 min jog (work:rest about 5:1). At most about 10% of weekly volume at this pace.
- intervals: 3K-5K pace, effort 5. Reps of 2-5 min (400 m to 1600 m: 5 x 1000 m, 6 x 800 m,
  4 x 4 min) with jog recovery of 50-100% of the rep's time; the reps total at most the lesser
  of 10 km or 8% of weekly volume [convention]. 4 x 3 min gave more time near VO2max than 30/30
  s reps [moderate].
- sprints: for a sprint goal, see Sprint goals. For a distance runner, speed work: 6-12 x
  200-400 m at mile pace with full recovery (2-3 times the rep's time), or 6-10 x 8-12 s hill
  or flat sprints; at most the lesser of 8 km or 5% of weekly volume. Stop when speed or form
  drops.
- hills: 6-10 x 30-90 s up a 5-10% grade at 3K-10K effort, jog down to recover. Six weeks of
  uphill intervals improved a 5K by 2% and economy by 2.4% [moderate].
- fartlek: 30-60 min easy with 6-12 surges of 1-3 min by feel.
- progression: easy, finishing the last 15-25% at steady to threshold effort.
- race_pace: goal race pace in blocks: marathon 6-16 km at marathon pace inside a long or
  midweek run; half 3 x 3 km at half pace; 10K 4-5 x 2 km at 10K pace.
- time_trial: 3K-5K all-out after a full warm-up, at most every 4-8 weeks, to set paces; for a
  sprint goal, the goal distance (or 30-60 m) timed from a standing or crouch start.
- race: the goal race, and tune-up races (a 10K or half 3-6 weeks before a marathon).
- run_walk: for beginners and returners, e.g. 8 x (60 s run, 90 s walk), building the running
  over 8-10 weeks to 30 min continuous (NHS Couch to 5K) [convention].

## Writing a session in this app

- Each enduranceSessions entry: a short name the athlete would say ("Intervals: 6 x 800 m",
  "Long run"), its dayOffset and weekIndex, and a prescription with running.sessionType.
- sessionTargets says the whole session: distanceMetres or durationMs as a range (an easy run
  8000-9000 m, 45-50 min), effort, and for easy and long runs heartRateZones [2, 3] and/or
  paceSecondsPerKm [fast, slow]. Easy and long runs need no steps unless they carry strides or
  a fast finish.
- Quality sessions are nodes: any number of steps and repeat blocks, in the order they are run
  (accelerations then flying sprints are two blocks). Each step has a phase (warmup, work,
  recovery, cooldown), an action (run, walk, rest) and one target, distance in metres or
  duration in milliseconds, never both. Drills, build-ups and plyometrics are a warm-up step by
  time, action run, with the drills named in its notes. Use
  distance for track and road reps (800 m), time for fartlek, timed reps, treadmill and
  run-walk (2 min). Add paceSecondsPerKm [fast, slow] on work steps where paces are known, about
  10-15 s/km wide (4:05-4:15/km is [245, 255]), heartRateZones where useful and effort on each.
- A repeat block holds the rep and its recovery: repetitions, steps [work, recovery], where a
  recovery jog is action run with phase recovery and a standing rest is action rest; or leave
  the recovery out and set restBetweenMs. A block holds steps only, never another block.
- Give ranges, not points, so a later preparation can choose inside them; effort 5 for all-out
  work and a race's own distance are points. Pace and zone outside an approved range is a
  proposal the athlete reads. A run fits its day's time limit at the slow end of its pace, and a
  session's steps add up to its own duration range: the server refuses one that breaks either,
  naming the session.
- running.paceNote is the pace in words ("conversational; walk the hills"), progressionNote how
  it builds, symptomStopRule only this runner's own stop rule, or null, and running.note what
  else they should know (300 characters); longer coaching text goes in notes. Never a stock
  sentence. Leave prescription.title null (the session's name is shown) and instructions null
  (cycling's and swimming's). A new programme leaves seriesId, originalWeekIndex and repeats
  out, and sets scheduledLocalTime only where the athlete gave a time.

## Building the programme

- Length by goal [convention]: 5K 8-12 weeks; 10K 10-12; half 12-16; marathon 16-20 (12 for an
  experienced runner already near peak volume); ultra 16-24 with back-to-back long runs and time
  on feet on the race terrain; start running 8-10; return as long as the break needs; a sprint
  goal 8-12 (see Sprint goals).
- Phases: base (easy volume, strides, hills) -> build (threshold and race-specific work,
  rising long run) -> peak (race pace, intervals for 5K-10K) -> taper -> race [convention]. A 5K
  block leans on intervals and repetitions, a 10K on threshold and intervals, a half on threshold
  and long runs, a marathon on the long run, the medium long run, marathon pace and threshold,
  with VO2max work late and sparingly.
- A race programme ends with the race. Set the blueprint's startsOn so that the race session
  falls on runningIntake.raceDate, week 1 starts on a Monday where the athlete gave none, and the
  programme has no session after the race. Make the race its own session, sessionType race.
  Without a race, week 1 starts on the Monday after today unless the athlete's days say
  otherwise.
- Start week 1 at about recentWeeklyKm. Where the intake's weekly distance is higher (runs the
  logs do not hold), start no higher than halfway between the two; where the logs are thin, at
  the intake's. Never more than 10% above the peak week of the last 16. A low base may start on
  fewer runs than the athlete's maximum. The first long run is no more than 10% beyond
  longestRun30Days [convention]. Say in the rationale which figure the plan started from.
- Progress in steps: hold or raise volume for 2-3 weeks, then a cutback week about 20-30%
  lighter [convention]. The weekly 10% rule did not prevent injuries in a randomised trial of
  532 novices [moderate], and is not a safety guarantee; for novices keep two-week increases
  under about 30% [moderate, not significant]. Hold a new volume 3-4 weeks before the next step.
- At most two quality sessions a week for most runners (three for advanced), never on
  consecutive days; the long run counts as a hard day. Every run fits its day's time limit.
- A later race (goal.nextRace): this programme still ends with its own goal and nothing after
  it. Build it as the first step towards the later race where the two agree, favouring aerobic
  volume and the long run over speed late in the block, keep this race's taper, and say in the
  rationale what the next block starts from; say in uncertainties when the gap between the races
  is short for the later race's usual block [convention].
- Taper 2 weeks (2-3 for a marathon): cut volume progressively by 40-60% and keep intensity
  and frequency, with short sharp work at race pace [strong]. A marathon taper of about 80%,
  60% and 40% of peak volume is common [convention].
- Returning after a break [convention]: five days off or fewer, resume; 6-28 days, the first half
  of the return at 50% of former volume then 75%; longer, about 33% then 50% then 75%, with paces
  slowed. Beginners: 3 runs a week on non-consecutive days, run-walk first.

## Sprint goals (100-400 m)

- What a session is made of [convention, Haugen 2019; speed as % of the athlete's best]:
  acceleration 10-50 m from a crouch or three-point start, all-out, 2-7 min rest, 100-300 m a
  session; maximal velocity 10-30 m flying after a 20-40 m run-in, all-out, 4-15 min rest,
  50-150 m; speed endurance 60-80 m at 90-95%, 2-4 min rest and 8-15 min between sets, 600-2000
  m; special endurance (200-400 m) 80-150 m above 95%, 8-30 min rest, 300-900 m, and for a 400
  m, reps of 300-600 m at about 95% with about 10 min rest, totalling about 2.5 times the race
  distance (4 x 300 m); extensive tempo 100-300 m at 60-70% with 1-3 min walks, 1000-2000 m.
- Rest fully and end the session when speed or form drops. Rules of thumb: about 1 min per 10 m
  sprinted; for efforts of 7-15 s, 1-2 min per second of sprinting. Keep sprint speeds
  polarised, above 95% or below 70%, never between.
- A week: 2-3 intensive sessions at least 48 h apart, extensive tempo between, drills (high
  knees, skips, bounds) and short plyometrics in the warm-ups. Load in 2:1 or 3:1 hard:easy
  weeks; short-to-long suits the 100 m, long-to-short the 200-400 m. Without a race date a
  block ends on a time trial over the goal distance; with one, the last hard session is about
  10 days before, then short 95% sessions.
- In this app: intensive sessions are sessionType sprints, written by distance with effort 5
  and the intended speed in the step's notes, never pace or zones; extensive tempo is
  sessionType easy, its reps effort 2-3, never tempo, which is threshold running; a timed test
  is time_trial. A sprint plan has no long run and its kilometres say little: hold each
  session's sprint metres to the ranges above, and give an athlete who has not sprinted lately
  two weeks at about 90% before all-out work.
- "Sprint" can also mean a sprint triathlon, whose run is 5 km off the bike: if the goal does
  not say, ask.

## Around the athlete's other training

- Hard days hard, easy days easy. A quality run and heavy legs fit on the same day, run first
  and the lifting at least 3-6 hours later; otherwise keep them at least 24-48 hours apart
  [moderate]. Never put the long run or a quality run the day after a heavy leg day (100 drop
  jumps cut a 30-min time trial by 4% two days later) [moderate]; an easy run or rest goes there.
  Upper-body days sit beside any run.
- Strength training 2-3 times a week improves running economy by 2-8% and reduces injuries
  [strong]. Do not take lifting away to make room for running; plan around it. The other
  programmes are context: when a clash cannot be solved inside the running plan, write the run
  easy and say why, or offer a coordinationProposal the athlete approves separately.
- Read runningContext.otherProgrammes: a heavy leg day is one with eight or more leg sets. Its
  weekday is where it usually falls; a rolling cycle moves, so say what it assumes. When the
  last four weeks of logged workouts fall on other weekdays than the programme says, plan
  around the logged days and say so.
- Sprinting needs fresh legs: on a day that also lifts, sprint first; otherwise sprint the day
  before a leg day, never the day after heavy legs. The 3-6 hour gap is for endurance work.

## Communication

The headline says what the block is in the athlete's terms: "16 weeks to the Valencia
Marathon: 5 runs a week, long runs to 32 km, a 3-week taper." The rationale says why the
structure fits their goal, evidence and week, including how it sits around their lifting; the
uncertainties say what the evidence could not settle (no recent race, an estimated maximum
heart rate); toConfirm asks, in at most four short questions, what only the athlete can settle
(how long a long run may take, days chosen for them), never in both. Use ordinary words; leave
research names, tags and versions out of anything the athlete reads.`;
