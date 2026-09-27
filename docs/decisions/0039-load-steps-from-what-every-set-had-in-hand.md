# Load steps from what every set had in hand

The app stepped a load up only after two comparable sessions in which every working set reached
the top of its range at the prescribed effort, and asked for the bottom of the range at the new
load. The coach's guardrail held plans to the same two sessions. That rule was a convention, not
a finding: the "two-for-two" habit in the older strength guidance was never tested against
anything, and the current guidance allows progressing on effort. It also ignored the number the
app asks for on every set. A bench at 70 kg × 5 with 3 reps in reserve has 8 reps in hand against
the 7 that 5 at 2 RIR needs; the two-session rule made that athlete repeat it anyway.

Reported reps in reserve are not exact. Across studies they under-estimate by about a rep on
average, less so close to failure, and people differ. So a rule that trusts them has to leave a
margin, and has to notice when one athlete's reports keep running out.

A simulation of one main lift trained once a week, by an athlete whose capacity grows 1% a week,
showed the gap. The two-session rule ended the year at 100 kg where the range called for about
115, and 29 of its 52 sessions left two or more reps more in reserve than intended. Stepping on a session with a rep to spare reached 110 kg with no
step that failed. On a noisy plateau the single-session rule adds a few sessions below the range
after a step; the weekly review, which still reads two sessions, is what handles a true plateau.

## Decisions

1. **Readiness comes from the hardest set.** Each set's capacity is its reps plus its reps in
   reserve; the hardest working set limits a prescription of straight sets. Against the top of
   the range at the target effort, a session is `spare` (a rep beyond it), `on_target`,
   `building` (inside the range), `below`, or `unknown` when any set lacks its effort or not
   every set was logged. `summarizeExerciseEvidence` in `training-evidence.ts`.
2. **A rep to spare steps the load now; exactly on target steps it once seen twice** at the same
   loads. The step is one real step of that machine, as before (ADR 0028).
3. **Each set is asked for what it had in hand.** At the new load, the reps the last session
   predicts there along Epley's curve, at the target effort, inside the range. At the same load,
   what the set had in hand at the target effort, never fewer than it did. Two sessions exactly at
   the target still add a rep, as the older rule did.
4. **A step that missed the range twice in its first three sessions goes back** to the loads
   before it, asked for what the hardest set had there. After going back, the step needs two
   sessions on target, because one good day is how it was reached. A single low session still
   holds, and a lasting cut still needs the repeated-decline test.
5. **A step too coarse to land in the range waits.** Where stepping from the top would land below
   the bottom of the range — 30 to 35 kg on a stack is a sixth of the load — reps build past the
   top until one step lands inside it (`repCeiling`).
6. **Reported reserve is checked after every step.** The first session at each new load is
   compared with what the session before it predicted. When two steps in the window each found a
   rep or more less in hand than reported, a single session needs two reps to spare, not one.
7. **An estimated maximum follows the trend across loads**, from sets of twelve reps to failure
   or fewer, and never on an assisted machine. It is shown to the coach as a trend, never as a
   target or a tested maximum.
8. **Sessions without every set's effort keep the older rule**, and so do sessions below the
   range: one low session holds, a confirmed decline goes to review. Endurance work is unchanged.
9. **The 14-day limit allows +10% or two real steps**, whichever is larger, so two sessions that
   each earned a step on a coarse machine are not held. One session still takes one real step.
   A free weight with no machine behind it steps by its typed increment in these limits too, as
   the rule already stepped it: a 10 to 12 kg dumbbell is the only step there is.
10. **The coach's guardrail accepts what the engine does.** A load step stands on the session or
    sessions in `stepEvidenceIds`, cited and unused by any earlier change. A rep target may rise
    to what the latest session had in hand. Going back to `revert.load` is supported by the
    misses and allowed whatever its percentage. Set-count and programme changes still need two
    new comparable training dates, and the weekly review keeps its two sessions.
11. **A change's loads are the baseline only until the athlete trains past them**: the next
    session after a lasting change, the one lighter session after a temporary one. Afterwards the
    rule and the guardrail go on from what was logged, so a step the rule took since, up or back,
    is never read as a jump from loads nobody has lifted for weeks.

## Consequences

- Lifts that are progressing step sooner and in the same small increments; the rep targets after
  a step are higher than the bottom of the range.
- More rests on honest RIR. The calibration in decision 6 is the check on it, and the athlete's
  reported reserve is still the athlete's word: nothing here rewrites a logged number.
- A coach refusal for a step names the sessions the step stands on.
- `TRAINING_POLICY.version` is 2026-09-27; the coach policy is 2026-09-27.1 and the training
  reference 2026-09-27.1. The contract version is unchanged: the new trend fields are additions.
