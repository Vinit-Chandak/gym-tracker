# 0021 — Two tasks a day, three ways to count a set

Status: accepted, 2026-09-11.

## Context

Four things were wrong at once, and three of them came from the same habit: treating one thing
as if it were another.

**A day was one task.** `program_slot_events` recorded one row per (cycle, day), so finishing
the workout of "Easy Run + Arms" was taken to mean the whole day was over. The sequence moved
to the next day and the run went with it — the run that had not been done. Today made the same
mistake from the other end: the run card lived inside the `else` of "is a session open?", so
starting a workout also hid it. The only way left to log that run was the Runs tab, which
knows nothing about the day it belonged to.

**Every exercise was counted in reps.** `prescription_type` had two values, `reps` and
`duration`, and the exercise library had no measure of its own at all — so a farmer's carry
asked for reps, which is a question a carry has no answer to. The same went for sled work.

**RIR was explained once, generically, if at all.** Two reps in reserve on a squat, on a plank
and on a carry are three different instructions, and the app said the same nothing about all
three.

**The workout screen never refetched itself.** It moves between its exercise list and one
exercise with `history.pushState` rather than a navigation, and the actions that log a set or
complete an exercise revalidated nothing. So the writes landed and the screen did not change:
"Start" against an exercise that was finished, an empty grid on reopening it, and everything
correct again only after leaving the route and coming back.

And the navigation island, added in 0017, sat _on top of_ the iPhone's home-indicator inset
rather than absorbing it, so it floated some 46px clear of the bottom of the screen; the
selected tab was a filled box around the icon with its own label left outside it.

## Decisions

1. **A slot has parts.** `program_slot_events` gains `part` (`session` or `run`) and the unique
   index becomes (programme, cycle, day, part). A day asks for the parts it has: lifting and
   running each get one, and a day that does neither still asks for `session`, which is what
   "mark rest day done" writes. `nextPendingSlot` is the earliest slot with a part still
   unanswered, so the day stays current until both are; `slotStatus` aggregates — completed
   when every part is, skipped when any answered part was a skip. Progress still counts days,
   not tasks: 56 sessions is still 56 sessions.

2. **Each part is answered by the thing that does it.** Finishing a session writes
   `session`; logging a run against a planned run writes `run`, carrying the run's id, so
   deleting or re-pointing that run gives the day back. Each has its own skip. The migration
   backfills a `run` event for every day already recorded under the whole-day model, or the
   sequence would walk backwards into runs it used to consider settled.

3. **Today draws one card per task, always.** The workout card says nothing about the run and
   the run card says nothing about the workout. Both render whether or not a session is open;
   an open session belonging to the offered day turns its own card into Resume, and any other
   open session gets a card above them, because it is not part of this day.

4. **`distance` joins `reps` and `duration`.** Exercises declare `default_prescription_type`
   and the range for it, programme slots carry `distance_min_meters` / `distance_max_meters`,
   and `set_logs.distance_meters` — which already existed — is finally written. The set grid,
   the options sheet, the set table, every plan line, the blueprint contract, the coach's plan
   contract and the progression rule all read the measure rather than assuming reps. Metres,
   always: a set is a carry, not a run, and the Runs tab owns kilometres.

5. **RIR explains itself where it is asked for.** The set grid's RIR column carries a tip in
   the words of the movement being logged, and an exercise may override it with its own
   `rir_note` — a deadlift's "never to failure here", a carry's "put it down before the grip
   goes". The library page shows the same note beside the same number.

6. **A server action that changes the screen refreshes it.** `refresh()` from `next/cache` in
   `logSetAction`, `deleteSetAction`, `setExerciseCompletedAction`, `skipExerciseAction`,
   `setWarmupCompletedAction` and `applyFallbackAction`. Not `revalidatePath`: this data is
   read per request behind Row Level Security, so there is no cache entry to invalidate, only
   a stale render to replace.

7. **The island absorbs the home indicator instead of standing on it.** The safe-area inset
   becomes padding _below the tabs, inside the island_, so its glass reaches within
   `--nav-inset` (0.5rem) of the bottom edge on every device while thumbs stay clear of the
   home gesture. It is 50% opaque over a wider blur, and the selected tab is one filled pill
   around the icon **and** its label.

8. **The library is a gym's, not one athlete's.** 122 exercises became 268 and the equipment
   catalogue 92 types: the full triceps and forearm ranges the old library simply lacked, the
   plate-loaded and iso-lateral units, carries, the sled, and the mobility a rest day asks for.
   Every muscle group is now the primary target of something, and a test holds that.

9. **A preview group, kept.** `src/app/(preview)` renders the real shell, the real Today view
   and the real set grid against made-up data, with no account and no database. It is
   development-only and enforced (`notFound()` in production, and the proxy lets it through
   only outside production). Until now the only way to look at a change to the navigation or
   to Today was to deploy it and then train.

## Consequences

- A day with a run is not finished by finishing its workout, which is the point, but it also
  means an athlete who never logs runs must skip them for the programme to advance. The skip
  is one tap on the card itself.
- Adding a value to the `prescription_type` enum is a one-way migration; the seed's measures
  and ranges are upserted with everything else, so re-running it is safe.
- The coach sees `measure` and every range in its library, and may prescribe `distanceMeters`.
  Older plans that omit it are unaffected: the field defaults to null.
