# ADR 0056: Distances start from the weight unit

Date: 2026-10-12
Status: accepted; amends decision 4 of
[ADR 0021](0021-two-tasks-a-day-and-three-ways-to-count-a-set.md) ("Metres, always") and the
units of [ADR 0053](0053-a-setup-that-asks-once.md), decision 2

## Context

Each sport's row in `user_sport_preferences` carried its own road unit (`distance_unit`,
kilometres by default) and pool unit (`pool_unit`, metres by default). No screen set them. Setup's
units sheet wrote them from 11 October, but only where the athlete runs, rides or swims, and only
as the sheet left them: choosing pounds there left the road in kilometres. Every account before
that read the defaults. Jordan, who logs in pounds, read his runs in kilometres.

A set's distance (a farmer's carry, a sled push) was metres everywhere (ADR 0021, decision 4),
whatever the athlete read anything else in.

The owner decided (12 October 2026): **a setting, defaulting from weight.** Road distance
(kilometres or miles) and pool length (metres or yards) start from the weight unit, so an account
in pounds starts on miles and yards, and either can be changed. Carries and sleds follow it:
yards beside miles.

## Decisions

1. **One pair of units an account, on the profile.** `profiles.distance_unit` (`km` or `mi`) and
   `profiles.pool_unit` (`m` or `yd`), each nullable. Null means "as the weight unit says":
   miles and yard pools for pounds, kilometres and metre pools for kilograms. Every sport reads
   the same pair. `resolveSportUnits` is the one place that reads them, and `readSportUnits`,
   `unitsBySport` and `readDistanceUnits` all go through it.
2. **Only a unit set apart is stored.** Every write stores a unit only where it differs from
   what the weight unit gives (`chosenSportUnits`). So a stored unit always means "chosen apart
   from the weight unit", null always means "following it", and there is no third state. An
   account that never set its distances apart goes on following its weight unit when it changes.
3. **The setting is in Edit profile, beside the weight.** The units control is now three, one
   under the other, each a segmented control with its label and what it decides said under it:
   - **Weight**: kg or lb, as before, "Loads and body weight in pounds, height in feet and
     inches.";
   - **Distance**: km or mi, "Runs and rides in miles, carries and sleds in yards.";
   - **Pools**: m or yd, "Swims and pool lengths in yards.", asked only of an account that
     swims, as setup asks.

   Each line is the control's description to a screen reader.

   Switching the weight carries a distance along while it follows the weight unit. One chosen
   by hand stays where it was, whatever the weight does next in the same form. A pool that is
   not asked is still sent, and still follows the weight unit.

4. **Setup's weight seeds the distances.** The sheet's design is unchanged. Choosing a weight
   there now moves a distance that was the old weight's to the new one, and the save stores
   only what was set apart (decision 2). Its Distance row's hint says "Runs, rides and carries".
5. **Carries and sleds read in yards beside miles.** Storage stays metres
   (`set_logs.distance_meters`, `numeric(8, 1)`, and every programme range). Affected:
   - **What follows the setting.** Everything that shows a set's distance, or a target for one:
     - the logger's entry, its log and the History tab;
     - the workout's rows, a finished workout and the Finish page;
     - the exercise page: Latest, its records, its graph, its defaults and its programme lines;
     - Progress's exercise graph and Today's rows;
     - the programme's days, Train another day and the routines list;
     - a first programme read before it starts: setup's Your programme is ready and Review
       programme, its targets and its opening session;
     - a friend's shared session, records, boards and head to head.
   - **Yards are whole.** A whole number of yards kept to a tenth of a metre is never more than
     0.06 yd from itself, so 50 yd is kept as 45.7 m and reads back as 50 yd. The entry is typed
     on the number pad with no point. A point that reaches it anyway, from a keyboard or a
     paste, stays in the field and Save refuses it ("Enter the distance in whole yards."):
     it is never rounded away, nor dropped to run the figures together. Metres keep their
     tenth, as before.
   - **A logged set reads to the nearest yard; a target to the yard that reaches it.** The
     progression engine judges a set by its metres against the programme's, so a target in
     yards is the least whole yard that, logged, is kept at the bound or more (`setTargetIn`):
     "20–40 m" is "22–44 yd", and "15–45 m" is "17–50 yd", because 16 yd is kept as 14.6 m and
     49 yd as 44.8 m. The same goes for a coach's set, the entry's prefill and Why. A set
     logged at the figure shown always meets the bound it was shown for; one typed in yards
     reads back as typed either way.
   - **An edit moves no metres it was not asked to.** A set kept in metres before yards reads
     to the nearest yard (30 m is 33 yd). Saved again with that figure left alone, after an
     edit to its RPE or its type, it keeps its own metres, not the 30.2 m 33 yd would keep.
   - **A record is one the athlete can read.** A carry is a record only when it is longer in
     the figure its athlete reads (`detectRecords` takes the owner's length when the workout
     is finished): a best of 50 m reads 55 yd, and 55 yd logged (50.3 m) is no record, never
     "55 yd · was 55 yd". In metres, any longer carry is one, as before.
   - **No feet.** A carry is ground covered, and turf is marked in yards. Feet stay for a climb
     beside miles (`climbUnit`) and for a height.
   - **Drafts.** A set draft records the length its distance was typed in, as it records a
     load's unit. A draft typed in yards is matched against the set's metres, and is read in the
     other length if the setting changed under it.
6. **The coach's words keep their metres.** Lines that feed change signatures or the coach stay
   in metres: the coach's plan line (`planLine`), a set as the coach reads it (`formatSet`'s
   default), and a programme change's diff text (`program-diff`, `program-patch`, which pass
   metres to `exerciseTargets`). Setup's split builder and the programme builder still author a
   carry's range in metres, as they author a run in kilometres.
7. **Migration 0053** adds the two columns and fills them:
   - kilometres and metres were defaults nobody chose, and miles or yards beside pounds are
     what pounds now give, so all of those become null and follow the weight unit;
   - a unit neither explains is kept as a choice: miles for a run or a ride, or yard pools,
     on an account in kilograms.

   The per-sport columns stay, unread: the build that runs the migration does so while the
   previous deployment still reads and writes them. A later migration can drop them.

## Consequences

- Jordan reads miles, yard pools and yards with no change of his own. Anyone who wants
  kilometres beside pounds says so once, in Edit profile.
- A unit chosen to match the weight unit is not remembered as a choice. Someone in kilograms
  who picks miles, then switches to pounds and saves, follows the weight unit from then on, and
  would read kilometres again on going back to kilograms. Saving a distance equal to what the
  weight gives is, by decision 2, the same as not choosing one.
- `formatSharedMetric`, the measure labels (`measureColumnLabel`, `measureUnitSuffix`,
  `lengthRangeLabel`), `exerciseTargets`, `detectRecords` and every component that shows a
  carry take the length as a required argument, so a new display has to say which length it
  reads in before it compiles. A display of a target reads it with `setTargetIn`, and of a set
  done with `setLengthIn`.
- A carry kept in metres before yards can read one yard more as a prefill than in the log: a
  15 m set reads 16 yd in History and asks for 17 yd when it is the one to repeat.
  `formatSet` and `formatSets` default to metres, for the coach's lines; every display passes
  the athlete's length.
- An open workout reads the length its page was drawn with. Changing the setting mid-workout
  reaches it on the next render, and a draft typed before is converted then (decision 5).
