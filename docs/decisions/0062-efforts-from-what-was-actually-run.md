# ADR 0062: Efforts from what was actually run

Date: 2026-10-22
Status: accepted, built on the owner's request of 22 October 2026 ("the coach should get the type
of run as well, along with all the data … for intervals … the actual 2-minute lap is one in which
I could count my best effort … we have to do this for all kinds of runs … I don't want pauses that
I haven't recorded to decrease my lap times … I want actual data"). Amends ADR 0059 (best efforts,
the running intake's recent race).

## Context

ADR 0059 stored each run's kind and its laps, each lap marked warm-up, work, recovery or
cool-down, and the log already summed up the work laps. Nothing downstream read them. The coach's
run lists gave a run's totals and average pace only, so an interval session reached it as one slow
or one impossibly fast run. Best efforts were whole runs of any kind, so a session whose total held
its recoveries, or left them out, could stand as a 5K. "A recent race or time trial" was filled in
from the latest best effort, which could be any training run. Progress drew every run's average as
a pace, and a friend's best pace was the fastest whole-run average of a kilometre or more.

What others do (October 2026):

- **Strava** keeps the fastest time at each benchmark distance, 400 m to 50K, found inside each
  run, timed on elapsed time "much like a race where the clock does not stop", from GPS
  ([How Best Efforts work for running](https://support.strava.com/en-us/articles/15401661-how-do-best-efforts-work-for-running-on-strava)).
- **Garmin**, by Garmin's help text as quoted on its forums, records a best when an activity
  closely matches a standard distance; some watches find the fastest 5 km inside a longer run. Its
  race predictor reads VO2 max and training history, not reps.
- **Runna** sets paces from a current race time the athlete gives it; **Daniels' VDOT** from an
  all-out race. Interval and repetition paces are derived from race fitness, not the reverse.
- **Riegel** fitted his formula to efforts of 3.5 to 230 minutes (American Scientist, 1981).

Nobody publishes an official standard for training best efforts; official rules cover races.
Strava's documented method is the nearest, and is followed here, with laps standing in for its GPS
stream.

## Decision

1. **Every figure is one that was recorded.** A lap's time is its own; nothing is spread over the
   laps from the run's total, so time the laps do not account for (a stop or a recovery nobody
   lapped) never slows a lap, and no lap time is ever derived.
2. **A stretch is one unbroken effort the record proves:** the whole of a steady run; one lap; or
   laps run back to back, which is only when every lap has a time, the laps add up to the run's
   time within a second a lap, and no recovery lap is among them. Otherwise each lap stands alone.
   A lap without a distance joins nothing.
3. **Each kind of run, as it is run:**

   | Kind                                                                                     | Whole run                                         | Laps                                                                                                                 |
   | ---------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
   | Easy, recovery, long, tempo, progression, race pace, fartlek, time trial, race, not said | One effort, unless a lap is marked recovery       | Each lap, and every block of laps back to back                                                                       |
   | Intervals, hills, sprints, run-walk                                                      | Never: its total may hold rests or leave them out | Each rep alone (the work laps, or every unmarked lap where none is marked); never joined, recorded recoveries or not |

   A fartlek is continuous running, surges and easy running alike, so it counts whole; its marked
   recoveries break it as any run's do. A tempo done as cruise intervals breaks at its recovery
   laps. A run whose kind was not said is read as steady unless its laps say otherwise.

4. **Best efforts** are the fastest stretch at each of Strava's benchmark distances (400 m, ½ mile,
   1K, 1 mile, 2 miles, 5K, 10K, 15K, 10 miles, 20K, half marathon, 30K, marathon, 50K). A stretch
   stands for a distance when it is that far and at most 5 per cent further, scaled at its own pace;
   a longer one says nothing of a shorter distance, since nobody timed its fastest part. Each says
   where it came from ("laps 4–8", "rep 2 of 6") and whether it was a rep.
5. **Reps** are kept at their own distance and time: the fastest rep at each distance the athlete
   runs reps over (within 5 per cent is the same rep). A 500 m rep in 2:00 is 500 m in 2:00, not a
   guessed 400 m.
6. **Race predictions** come only from an unrested effort of 3.5 to 230 minutes. A rep, rested
   before and after, predicts nothing.
7. **The coach reads every run with its kind**, whether it had breaks, its reps and, for the last
   week, every lap as recorded and the time no lap holds. A run with breaks has no whole-run pace.
8. **"A recent race or time trial"** is filled in only from a run logged as a race or a time trial.
   A race stands for its course's distance at its own time when the watch measured within 3 per
   cent short to 5 per cent long; a time trial is scaled to the distance it stands for.
9. **Progress and friends** read a run with breaks in distance and time, never as a pace: it is no
   point on Progress's pace line and shares no pace, so it is never a best pace.
10. **The log says when laps do not add up.** Under the laps: "Laps total 6:00 of the run's
    10:00", when every lap is timed and they differ from the run by more than a watch's rounding.

## Consequences

- Everything is worked out when read, so every run already logged is read by these rules at once.
  A friend's shared row is rewritten when its run is next saved, or by `npm run
db:backfill:shared-stats`.
- A session logged without laps gives no best effort and no reps; saying its kind and its laps is
  how it counts.
- PR #128 (21 October) had already left an interval session's overall pace out of trends,
  records and the coach, by a narrower rule: intervals, or laps holding reps and recoveries.
  `paceHasRests` now asks `hasBreaks`, so the form's rep pace and "Overall, with rests", History,
  Progress, sharing and the coach all read one rule; laps holding reps and recoveries still
  suggest Intervals as the kind. The reps' pace takes the work laps, or every unmarked lap where
  none is marked work, as best efforts do.
- `src/domain/run-segments.ts` holds the rules; `src/domain/running-context.ts` the efforts, reps,
  predictions and the recent race.
