# ADR 0049: A week to mend a finished workout

Date: 2026-10-09
Status: accepted

## Context

A finished workout was read only. The owner asked, on 9 October 2026, to be able to change the
workouts of the past seven days: to put in a load left out on the gym floor, a set that was
never logged, or an exercise nobody recorded, from History or wherever is most natural.

Everything a workout feeds reads its sets when it is asked: Progress, History, the day, the
calendar, the progression rule and the coach's evidence. Two things were written once, at
Finish, from the sets as they then stood: what a follower can see (`shared_session_stats` and
`shared_exercise_stats`, ADR 0026), and the records the workout set, which its own records card
reads back from the first of those rows.

## Decisions

1. **A week after its day.** A finished workout can be changed until the end of the seventh day
   after the day it was trained, in the athlete's own time zone (`canEditWorkout`,
   `lastEditDay`, `EDIT_WINDOW_DAYS`). Its day is the day it started, however late it finished,
   as the rest of its record is dated. Days, not hours: a Thursday workout is open until the end
   of the next Thursday, whatever time it ended. After that it is history: the server refuses
   with `SessionLockedError`, and the screen offers no Edit.
2. **Sets and exercises only.** Logging, replacing and deleting a set, and adding exercises, take
   a finished workout within its week (`requireEditableSession`). Everything else stays an open
   workout's: completing or skipping an exercise, swapping it, a machine's questions, supersets,
   the warm-up, the check-in, notes and body weight. None of them changes what was lifted.
3. **What friends see follows.** A set saved or deleted in a finished workout writes its shared
   stats and records again, in the same transaction, with the same write Finish makes
   (`rewriteFinishedStats`), so a follower, the records card and Progress always read the same
   numbers. Records are judged as they were at Finish: against the sessions before this one.
4. **A set saved unskips its exercise.** An exercise skipped on the day but logged afterwards was
   done after all; the skip would otherwise keep its sets out of the progression rule's history.
5. **A finished set renders the screens that count it.** A set does not render the workout
   again (ADR 0030), and the screens that take part in set changes are the open workout's. A set
   changed in a finished workout instead refreshes the page as any other change to a workout
   does, which also drops the browser's copies of History and the day, so neither shows the
   workout as it was.
6. **Edit, then Done.** The past workout's header carries Edit while its week lasts. Editing
   says once, above the sets, that each change saves as it is made and until when; every
   exercise is a row that opens its log, the ones not done included; Add exercise stands under
   them and comes back to the edit. Its log shows what was done, each set a line that opens to
   change or delete it (said once over Add set), and Add set for one more, which starts from the
   set before it rather than the day's suggestion; nothing about training it (Complete, Skip,
   the suggestion's tag, the machine's question, the coach's note, Next up, rest) is offered.
   Done closes the edit in place; it is a search parameter (`edit=1`) moved with
   `replaceState`, so a reload and Add exercise come back to it and Back is not one step longer. The summary straight after Finish
   offers "Edit workout", which opens the same edit as the past workout.

## Consequences

- A forgotten load or set no longer stays wrong in History, Progress, records, the progression
  rule and what friends see.
- A record announced at Finish can change, or go, after an edit. Later sessions' records are
  not judged again.
- A set's `completed_at` is when it was saved, so a set added afterwards is stamped later than
  the workout's end. Nothing dates a set by it.
- Saving a set into a finished workout costs a render of the workout and a rewrite of its shared
  stats: acceptable for a correction, which is rare, and not paid by a set logged live.
