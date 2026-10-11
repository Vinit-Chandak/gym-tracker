# ADR 0006: Phase 5 progression engine and recovery advice

Date: 2026-09-08
Status: accepted

## Context

Phase 5 adds the deterministic progression rules from the planning docs and the LIFTING sheet
(double progression on accessories, conservative jumps on the strength compounds, time first
on holds) and the recovery-aware warnings. The user decided: the suggested targets are
prefilled faintly and count as logged unless overridden; a bad check-in produces advice only;
and a machine with no history of its own may borrow the exercise's history from elsewhere.

## Decisions

1. **A pure engine, no programme mutation.** `src/domain/progression.ts` takes today's
   prescription (the programme slot, or the exercise's own default rep range and RIR for ad hoc
   work) and the basis performance, and returns a kind, a plain-words reason, optional advice
   and a target per set. Kinds: `increase`, `hold`, `repeat`, `reduce`, `extend`, `transfer`,
   `start`. The programme itself is never changed.

2. **Increase only when everything was met.** Every working set (`working`, `amrap`,
   `failure`; warm-up, back-off and drop sets are ignored) must have reached the top of the rep
   range, or the strength rule's required reps, with a logged RIR at or above the plan's
   minimum, and at least the planned number of sets must have been logged. Missing RIR on a
   top set holds with a reason. The jump is the rule's increment, else the slot's, else the
   machine's, else the exercise default, else 2.5 kg. Bodyweight sets add load from zero.

3. **Reduce, repeat, hold.** A first working set below the minimum reps reduces by one
   increment (with "or repeat" as advice). A set two or more RIR below the minimum, or at
   failure when the plan asks for at least one in reserve, repeats the load (with "or drop"
   as advice). Anything else holds. Strength compounds never get an RIR 0 prefill.

4. **Timed holds add time first.** Five seconds per set up to the top of the range; once every
   set is at the top the engine holds and advises adding load when wanted.

5. **Basis selection.** The same programme slot's most recent performance is preferred, so a
   rep range is judged against its own history; otherwise the latest comparable performance.
   Machine work is only compared on the same machine. When the machine has no history, the
   latest performance of the exercise on any other machine is shown as a starting guess
   (`transfer`): its sets are copied, no rule is applied, and the card says which machine and
   gym it came from. It never counts as comparable history.

6. **Prefill semantics.** The targets replace the Phase 4 ghost values; an untouched row logs
   the targets. After a load change the reps prefill at the bottom of the range and the RIR
   at the plan's minimum. A session-level "Hold loads today" toggle swaps the changing kinds
   (increase, reduce, extend) for last session's sets.

7. **Advice only.** `src/domain/recovery.ts` turns the check-in into warnings: sleep under 6 h;
   worst level on sleep quality, energy, fatigue or soreness; lower back or either shin two or
   more points above the previous check-in, or at five or more. Warnings never change a
   suggestion. Two comparable sessions in a row below the one before (best-set estimated 1RM,
   else total reps, else total seconds) show a regression note on the card.

8. **History visible.** The exercise page lists recent performances on every machine, with
   the note that only same-machine sets drive progression.

## Deferred

- Run-volume spike warnings and the shin escalation rule need run logs: Phase 6.
- Technique rating exists in the schema but is not collected; the "technique acceptable"
  condition is therefore not part of the increase rule.
- Programme changes through versioned proposals are unchanged from Phase 1.

## Amendment, 11 October 2026: across gyms, after a break, and on an assisted machine

Decided by the owner with the year audit. Decisions 1 to 8 stand; these say what they meant.

1. **Free weights and bodyweight compare across gyms, whatever bar is registered.** Decision 5
   applies to the exercise's load portability, not to the equipment row: a barbell or dumbbell
   lift reads its history from every gym, on a registered bar, another gym's bar or none, and a
   coach's change to it holds wherever it is done. Only machine work stays on its machine, and a
   machine's own old session is never read as another machine's starting guess. A load logged in
   the other unit lands on a load that exists: 100 kg read in pounds is 220 lb, not 220.46. A
   pound lifter's registered bar or dumbbells without an increment step by the plate jump.
2. **Back after a break.** When nothing comparable falls in the weeks the rule reads
   (`TRAINING_POLICY.trendDays`) but there is older history, the kind is `resume` ("Back after a
   break"): the last session's sets with each working load stepped down to the first load at
   least 10% easier (`breakLoadReduction`; at least one step, more help on an assisted machine),
   and the rule goes on from what is logged then. Last time stays visible however old it is.
3. **A bodyweight set saved without a load is the body alone.** On a bodyweight movement measured
   in reps, an empty load reads as 0 added, so its reps build as they do on a logged 0. Anywhere
   else an empty load stays unknown.
4. **Time and distance never go down under "Add time".** A set already past the top of the range
   keeps what it did; when every set is there, it is the hold decision 4 describes.
5. **The least help an assisted machine gives** holds with advice to move to the movement without
   the machine, and the Next up box stops asking for a step below it. The exercise page reads an
   assisted machine's best as its least help.
