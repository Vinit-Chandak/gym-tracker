# ADR 0054: A replaced programme closes its sessions

Date: 2026-10-12
Status: accepted; refines how a programme is left (`retireProgramme`, `withdrawFamilyOccurrences`)
and [ADR 0051](0051-missed-days-and-how-a-cycle-repeats.md)'s skipped runs

## Context

Starting a new block, adopting a template or archiving a programme ends the old programme's
family. The runs it still had ahead are cancelled from the day of the switch, so nothing counts
them as missed. What was due before that day is left as it was: logged, skipped or not done.

Those earlier sessions stayed open, though. A run left owed, or skipped, could still be logged,
skipped, put back or moved from its page, opened by its URL. The year simulation of 11 October
showed it: Liam's two old blocks still had a run owed from 27 June and six skipped, each loggable
by URL months after he had moved on. Logging one, or putting one back, rewrote the record of a
block that had ended.

Asked about it, the owner left the decision to us (12 October 2026: "decide according to you").

## Decisions

1. **A session closes with its programme.** A programme's session can no longer be logged, skipped,
   put back or moved once its family is not the athlete's active programme, because another
   programme replaced it or it was archived. What became of it stays as it was: Logged, Skipped
   or Not done. The block's adherence is not rewritten, and nothing is cancelled or recounted.
2. **Derived, not stored** (`programmeClosed` and `canLog` in `domain/occurrences.ts`). Closure is
   read from the athlete's programme now, as lateness is read from today's date. No disposition or
   migration is added: a session is open while its family is the active one. Every reader of an
   occurrence gets `closed` beside `loggable` (`ScheduledOccurrence`).
3. **The server refuses, not only the page.** Each write that would answer or revive a closed
   session refuses it:
   - logging an activity against it (`createActivity`'s target check: "That planned session is not
     in your programme.");
   - skipping it, putting it back, moving it, or claiming it to log (`OccurrenceClosedError`: "That
     session's programme is no longer yours, so it can no longer be changed.").

   Skipping a day from Today and "Pick up from today" only reach the running programme's sessions,
   and a coach's preparation for a programme since replaced was already refused.

4. **Its page reads it as it was.** The badge is the one it had: Not done, Skipped or Logged. The
   plan is kept, no longer labelled "Your programme", and Log it, Skip and Move are gone. In their
   place is one line saying how the programme ended, read from the programme rows
   (`programmeClosure`):
   - replaced: "Strength Maintenance + 2 Runs was replaced by Hybrid Half Marathon on Mon 6 Jul,
     so this session can no longer be logged.";
   - replaced by a new block of the same programme: "This block of Hybrid Half Marathon was
     replaced by a new one on …";
   - archived with nothing in its place: "Hybrid Half Marathon was archived on …".

   A programme counts as replaced when the next one started on the day it was archived, since
   starting a programme archives the one before. If the next one started on a later day, the old
   one was archived on its own. The log page (`/training/new?occurrence=`) refuses the session
   with the same sentence and offers to log the sport on its own.

5. **A finished programme stays open until another replaces it.** While nothing has replaced it,
   it is still the athlete's programme: Today says "Programme complete" and plans the next block
   from it. The sequence waits for every session (ADR 0051), so a finished programme owes nothing,
   and what is left to do is log a run it skipped, which replaces the skip on a block that is still
   theirs. Closing it at its end would mean reading the sequence for every occurrence, and would
   close a block the athlete has not left. Once the next block starts, it closes like any other.
6. **Standalone sessions never close.** They belong to no programme, so a switch or an archive does
   not touch them, even when the athlete has no programme at all.

## Consequences

- A revision of a running programme (the same family, a new version) closes nothing.
- Deleting the activity that answered a closed session leaves it Not done, and it cannot be logged
  again. The activity page's delete still works, and a run is logged on its own instead.
- History and the programme pages show what they showed before: History lists what was done, and
  the programme page lists the running programme.
