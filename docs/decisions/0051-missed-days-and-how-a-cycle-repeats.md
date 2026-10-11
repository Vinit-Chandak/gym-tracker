# ADR 0051: Missed days, and how a cycle repeats

Date: 2026-10-11
Status: accepted

## Context

The audit of 11 October 2026 simulated a year of six athletes, beginner to advanced, each
following a different programme with breaks, revisions and travel in it. The simulation and
the code review found three ways the programme's calendar did not match what the athlete did:

- **Every rest day that passed counted as a day behind.** "Behind" was the slots the calendar
  had passed minus the slots answered. Nobody taps a rest day, so on a four-lift week the
  athlete who trained every session read as two or three days behind by Sunday.
- **A programme that ended on a rest day never finished.** A rest day is soft: the next session
  passes it. With no session left, nothing passed the last one, and the programme stayed open
  on it, holding back the next block until somebody tapped it (Kenji's off-season, in the
  simulation).
- **A cycle that was not seven days long ran for the wrong number of days.** The number of
  cycles was the number of weeks. A four-day cycle over eight weeks was thirty-two days, a
  three-day full-body plan finished in under four weeks, and a nine-day cycle ran for ten.

The owner decided (11 October 2026):

1. Missed days: the sequence keeps waiting, as before. Only training days that pass with
   something still owed count as behind, and a long gap offers to pick up from today.
2. A cycle shorter or longer than a week repeats to fill the programme's weeks.
3. The builder asks how it repeats: **every week**, each day on its weekday with the days
   between as rest, or **every N days**, the days back to back. The default is read from the
   days, and programmes that exist keep behaving as they do.

## Decisions

1. **Behind counts training days only** (`missedSlots`, `sessionsBehind` in
   `domain/schedule.ts`). A day that lifts and runs is behind while either half is owed. A rest
   day the calendar passes is never behind.

2. **"Pick up from today"** appears on Today once two or more training days are behind and no
   workout is open. It lists the days it will skip, then skips each owed part with the note
   "Picked up from today", marks the rest days in between as passed (each dated on its own day,
   so none reads as done today), and voids the coach's plans for the skipped days. The sequence
   then resumes at the day the calendar has for today. Nothing changes unless the athlete taps
   it.

3. **A programme is over when only rest days are left** (`onlyRestLeft`). Those rest days count
   as done in progress, and the next block can start.

4. **`programs.repeats`** (migration 0049) stores the choice: `weekly` or `rolling`, null for
   every programme written before it existed.
   - `weekly`: cycles = weeks. A cycle of fewer than seven days is dated by weekday. Its first
     week starts the first time the starting day's weekday comes round on or after the start
     date, so a Mon / Wed / Fri plan started on a Thursday owes nothing until Monday.
   - `rolling`: cycles = round(weeks × 7 ÷ days), at least one, dated one slot a day.
   - Null: cycles = weeks, one slot a day: exactly as before.
   - Seven-day cycles, every built-in template among them, come out the same whichever way they
     are read.

5. **An unchosen repeat has one meaning per case** (`createProgramFromBlueprint`). A new
   programme takes the repeat its days suggest (`inferCycleRepeat`):
   - weekly for seven days, or for days on distinct weekdays in order with either no rest days
     or a running day;
   - rolling otherwise.

   A later version of a programme keeps the earlier version's repeat, so a programme that
   predates the choice stays null through coach revisions until somebody chooses in the
   builder.

6. **Runs need a week.** Run targets are keyed by week and weekday, so a `rolling` cycle that is
   not seven days long cannot have running days (`cycleRepeatIssues`). A weekly cycle needs each
   day on its own weekday, in order. Both are checked when a programme is written, never when
   one is read.

7. **Changing how a cycle repeats is a change to the schedule.** It counts as a structural
   change only when the calendar actually comes out different (`cycleLayout`): the number of
   cycles, or whether days sit on weekdays. A coach cannot apply it on its own, and "continue
   the block" refuses it. The change screen shows it as Length ("8 weeks · 14 cycles") and
   Repeats ("Every week" / "Every 4 days").

## Consequences

- "Cycle X of N" now reads N from `cycles` everywhere: Today, Choose a day, Training, the
  Programme page and a workout's details. It no longer reads the weeks.
- The projected end of a weekly-dated cycle walks the remaining days onto their weekdays.
- The builder shows the choice only for cycles of one to six days. A seven-day cycle reads the
  same either way, and a longer cycle can only run back to back.

_Note, 11 October 2026 (year audit, second pass):_ a finished programme says so wherever it is
shown, in Today's words ("Programme complete", "Plan the next block"): Training, Choose a day and
the programme's card, which loses Edit future programme and plans the next block under it. The
rest days it ends on read done in every list, not only in progress (`slotStatus`). Because the
sequence waits, its end is the day its last day was answered (`finishedOn`), and the card shows
that, or the projected end while it is under way; the end it was written with stays under "How
it is meant to go" as Planned end.
