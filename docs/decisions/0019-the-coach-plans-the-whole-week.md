# 0019 — The coach plans the whole training day, and proposes programme changes

Status: accepted, 2026-09-10.

## Context

Decision 0018 put a coach in the app, but it only ever planned lifting. It skipped every
running day, so the half of the programme that builds the aerobic base was left to fixed
prescriptions written eight weeks earlier — the exact thing the coach exists to fix, and the
one place where a niggle actually needs watching. It could not change the programme when the
programme was the problem, so a movement that had stalled for a month kept being prescribed.
It could not see its own last plans, so every night was the first night. And a night it failed
looked exactly like a night it was never asked: Today simply showed nothing.

Two things about the programme made the last of those hard. A programme version is immutable
once active, on purpose, so that history always says what was actually prescribed — which
means a change has to be a new version, not an edit. And comparable history was matched to a
slot by `program_exercises.id`, which a new version does not preserve: the moment a programme
was revised, every slot's history stopped being its own.

## Decisions

1. **Plan the next slot that trains, whatever it asks for.** `nextTrainingSlot` takes the
   earliest pending slot where `includes_lifting or includes_run`; only a rest day is skipped.
   One plan a night, for one slot, as before. A day that only runs is planned at whatever
   location is active — an athlete whose only place is Outdoor still gets their run — while a
   day that lifts still needs a real gym with machines.

2. **The run is part of the plan.** `session_plans.run` holds the mode, duration, distance,
   RPE, how it should feel, and a stop rule. It names the programme's own planned run through
   `programRunId`, so a run logged against it still counts towards the block, and the server
   refuses a `programRunId` that is not in the athlete's programme, a run on a day that does
   not run, and exercises on a day that does not lift. Nothing is fixed until the run is
   logged: the run screen opens prefilled and the athlete may change any of it.

3. **Slot lineage, not row id.** `program_exercises.lineage_id` is the slot's identity across
   versions of one programme. A revision carries it over; comparable history and the
   progression rule match on it. This is what makes a programme change survivable: the squat
   slot of Lower A is still the squat slot of Lower A afterwards, with everything it has ever
   done.

4. **Programme changes are proposals the athlete approves.** The coach cannot rewrite the
   programme. It writes a patch — substitute, adjust, remove, add, or change a planned run —
   against slot lineage, and `program_change_proposals` holds it until the athlete answers.
   The patch is dry-run against the current blueprint when it is proposed, so a change that
   does not fit is refused while the coach is still there to fix it. At most one proposal per
   athlete per run.

5. **Approving writes the next version.** `applyProposal` reads the programme back as a
   blueprint, applies the patch, and writes a new version in the same family: the same start
   date, the same starting slot, every kept slot's lineage, and every `program_slot_event`
   copied across, so the athlete stays exactly where they were in the sequence. The old version
   is archived, never edited, and every session ever logged still points at the prescription it
   was given. Plans written against the old version are voided. A change cannot be applied
   while a session is open, because that session was started against the version about to be
   archived.

6. **The app reads the plan back, and says what it noticed.** `reviewPlan` compares each plan
   against what was last managed and returns warnings: a load jumping more than 15% _and_ more
   than three of its own increments, a day more than 40% off the programme's set count, a
   strength compound at or past failure, more than two of the day's slots dropped, a run more
   than 30% longer than the last one. They are stored with the plan and shown beside it.
   Deliberately non-blocking: decision 0018 put judgement in the coach, and this does not take
   it back — it only refuses to let a surprising plan arrive silently.

7. **Every attempt is recorded.** `coach_requests` gains a `trigger`, so a nightly run leaves a
   row whether it planned or failed, not only an athlete's re-plan. Today shows the last
   failure in place of silence, and Settings lists what the coach has been trying.

8. **The coach sees its own last plans.** The planning context carries the last three plans
   with what was actually performed against each, four weeks of running load with any shin
   trend in it, and four weeks of working sets by muscle. Without the first of those the coach
   cannot tell whether its last call worked; that is the difference between a coach and a
   generator.

## Interface

Under the rules of decisions 0015 to 0017, and reusing what the run and programme screens
already do. The planned run is the subtitle of the day's existing run card — `25 min · 4 km ·
RPE 3` — with a Coach badge beside the standing and the coach's reasoning behind the card's
own "How to run it" footer disclosure, next to what the programme asked for. On a day that only
runs, that card carries the coach's sentence and its status line, because there is no session
card to carry them. **Log run** opens with those numbers filled in and one Section above the
form saying what the coach asked for.

Suggested changes are a Section on the programme screen, each proposal a card: the summary, a
line per operation, the reasoning, and the two-button action row the app uses elsewhere — "No
thanks" secondary, "Apply" primary. Recent runs are a list on the AI coach screen, one line
each: when, why it ran, and the failure when there was one.

## Consequences

- Migration `0009_coach_runs_and_lineage` adds `program_exercises.lineage_id` (defaulted for
  existing rows and indexed), `coach_requests.trigger`, `session_plans.run` and
  `session_plans.warnings`.
- Existing programmes get fresh lineage per slot, so history logged before this change matches
  by lineage from here on and is otherwise unaffected.
- The coach skill grew a section apiece for judging its last plan, deciding a run, and changing
  the programme, plus `scripts/coach/attempt.ts` and `scripts/coach/propose.ts`.
- A proposal makes the athlete the approver of their own programme. Nothing changes without a
  tap, and the record of what was proposed, applied and rejected stays on the programme screen.
- Still deferred: the pre-session check-in does not reach the plan, by the owner's choice,
  until sleep and recovery data are integrated.
