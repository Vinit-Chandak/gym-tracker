# Two reps past the top, a lighter day, and a set tried heavier

**Supersedes decision 5 of [ADR 0039](0039-load-steps-from-what-every-set-had-in-hand.md)** (reps
build past the top until a coarse step lands inside the range).

Five things the athlete was asked to do, or was told, did not survive being looked at.

**21 curls.** The incline curl is 2 × 10–15 at 1–2 RIR, and the next dumbbell after 10 kg is
12.5, a quarter more. ADR 0039 let reps build past the top of the range until Epley's curve put
the step inside it: 21 reps at 1 RIR. The same rule asked for 33 lateral raises on a 12–20 range
and 16 dumbbell presses on 6–10. That rule had no evidence behind it, and some against it:

- Rep and 1RM equations are fitted to sets of about ten or fewer; a 20-rep test predicts worst
  ([Reynolds, Gordon & Robergs 2006](https://www.unm.edu/~rrobergs/478RMStrengthPrediction.pdf)).
  The app already refused to estimate a maximum from sets of more than twelve reps to failure
  (`estimateMaxReps`), and then extrapolated the same curve to 22 to set a target. How many reps a
  given share of the maximum allows depends on the exercise
  ([Nuzzo et al. 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC10933212)).
- Reported reps in reserve are least accurate far from failure and in long sets
  ([Zourdos et al. 2021](https://pubmed.ncbi.nlm.nih.gov/30747900/)); across studies people
  misjudge by about a rep, less so in sets of twelve or fewer
  ([Halperin et al. 2022](https://pubmed.ncbi.nlm.nih.gov/34542869/)).
- Light loads taken close to failure bring more discomfort and a higher rating of exertion, and
  there is "no ideal hypertrophy zone": moderate loads are the efficient way to the same growth
  ([Schoenfeld et al. 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC7927075/); see also
  [Fisher, Ironside & Steele 2017](https://pure.solent.ac.uk/en/publications/heavier-and-lighter-load-resistance-training-to-momentary-failure/)).
  In repetition-progression training, athletes struggled to reach failure for the same reason
  ([Plotkin et al. 2022](https://peerj.com/articles/14142)). On a long curl, grip and forearms
  plausibly give out alongside the biceps, though no study has measured it.
- The library gives each exercise its own range. Building six reps past it trains a different
  range from the one chosen, for a step whose landing the same curve cannot predict that far out.

**Back to 55 kg.** Upper B's incline bench is 3 × 4–6 at 2 RIR. On 28 September the plan was
60 kg; the athlete did 60 × 6 at 2 RIR, exactly on target, then tried 62.5 kg for sets two and
three at 4 × 1 RIR. The trend took the session's load from its first set and its capacity from
its hardest set at any load: "60 kg had five reps in hand", a second miss after a hard
21 September, and back to 55. Even with every set at 60, two sets at the four-rep minimum with
one in reserve instead of two are one rep in hand short — inside the error of the report.

**A lighter day.** A leg extension held at 50 × 12–13, then done once at 40 × 15 in the same slot,
had the next session step from 40 to 45: below the 50 already held. Sessions done off the plan
were already kept apart by slot (the rule reads the slot's own history first, and the coach's
trends are per slot); a lighter session in the slot itself was not.

**Next up.** The box that asks for a stack's next stop asked from today's heaviest set only. On a
lighter day it asked nothing, because the stop above today's load was known while the one above
the athlete's best was not.

**30 × 6 under a working set's tag.** The logger matched each row to the target with the same set
number. A coach's ramp takes set numbers 1–3, so the first warm-up row switched to a working set
kept the warm-up's 30 × 6, the tag explained "30 kg × 6 @ 2", and saving it untouched logged 30 kg
× 6 as work. Warm-up rows had no tag at all.

The full evidence review, with every source checked, is
[PROGRESSION_EVIDENCE_REVIEW.md](../planning/PROGRESSION_EVIDENCE_REVIEW.md).

## Decisions

1. **Reps build two past the top at most.** Where stepping from the top would land below the
   range, `repCeiling` is the top plus `coarseStepReps` (2), or less where fewer land the step
   inside. The incline curl builds to 17.
2. **The step is then taken, and may start below the range.** From the ceiling at the target
   effort, a coarse step goes ahead when it is predicted to leave at least `coarseLandingReps` (5)
   at the target effort (`landingFloor`); each set is asked for what it predicts there. A range
   whose bottom is five or fewer never starts below it. A jump too big to start at five even from
   the ceiling holds there — the ask stays at the ceiling, and the step comes once the reported
   reserve there says it would land — and the trend's `nextStep` names a smaller step or a
   variation as the way out, not more reps.
3. **A load a coarse step went to counts its reps from there.** When the session before the step
   predicted it would start below the range, the trend's `landing` (`{ load, from, floor }`) reads
   the sessions at the new load against `floor`: reps building back into the range, not misses.
   Below the floor, a load never held is out of reach and goes back as before (ADR 0040). A step
   predicted to land inside the range that did not is a miss like any other.
4. **A near miss is not a miss.** A session counts towards a step that missed twice, and towards
   slowing the next attempt, only when its hardest set is more than `missTolerance` (1) rep in
   hand short of the range's bottom at the target effort — two where that bottom is past twelve
   reps in hand, since the report barely worsens up to twelve reps a set and loses about half a rep
   with every rep beyond (Halperin et al. 2022). One rep short holds, as one low session always
   has. A load never held goes back after one session (ADR 0040) only when that session is clearly
   short too.
5. **Each set is read at the session's load.** A lighter set is read up to it along the curve. A
   heavier set of the athlete's own that fell short of the range was an attempt at that load: it
   is read down to the session's load, counts there (`latestWorkLoads`), and the next session
   starts it back there. A heavier set that held the range keeps its load — the athlete stepped up
   mid-session — and so does every step of a pyramid the session's own plan wrote.
6. **A single lighter session is set aside.** A session lighter than the one just before it, where
   that one held the range, is read past by the trend and by the rule alike (`setAside`, and the
   rule's basis), so progression goes on from the load held. Two lighter sessions running are the
   lighter load chosen. A load the session's own plan asked for — including a temporary change the
   coach wrote — is the plan's, and is kept.
7. **The coach's guardrail accepts what the rule does.** Rep targets may sit below the range at a
   coarse step and while a `landing` stands, down to its floor; the same-load ceiling is the capped
   one; a set's baseline load is its `latestWorkLoads` entry.
8. **Next up asks from the best.** The box asks for the stop above the heaviest working load the
   exercise has ever been lifted at on that stack, or today's if heavier (`bestLoads`); on an
   assisted machine, the least help.
9. **Each row takes the suggested set of its kind and place.** The second warm-up row is the second
   warm-up, the first working row the first working set, whatever set numbers they were given. A
   warm-up turned into a working set takes the work's numbers. Once a working set is logged, warm-up
   rows nobody did are passed, and the entry goes on to the next working set. The tag stands on
   warm-ups too, and only where the set has a suggested set of its own; Why shows that set's
   figures and, for the app's own ramp, says it is a ramp to the first working set.
10. **An exercise added on the spot reads a half-rep RIR as the two whole reps either side**
    (1.5 → 1–2), as the screen already said it.

## What it does on the cases that prompted it

| Case                                          | Before             | After                                                        |
| --------------------------------------------- | ------------------ | ------------------------------------------------------------ |
| Incline bench, as logged on 28 September      | Back to 55 kg      | Hold 60: 60 × 6, 60 × 4, 60 × 4 at 2 RIR                     |
| The same with every set at 60 (6@2, 4@1, 4@1) | Back to 55 kg      | Hold 60                                                      |
| Two clear misses at 60                        | Back to 55 kg      | Back to 55 kg                                                |
| Incline curl 10 kg × 15 at 2 RIR              | Build to 21        | Build to 17, then 12.5 kg × 7, building back                 |
| Incline curl 12.5 kg × 7 after the step       | Back to 10 kg      | Hold 12.5, reps build                                        |
| Leg extension 50 × 13, then 40 × 15 once      | Step from 40 to 45 | Hold 50                                                      |
| Lateral raise 5 kg (12–20), next dumbbell 7.5 | Build to 33        | Build to 22 and hold; a smaller step or a variation is named |
| Seated dumbbell press 10 kg (6–10)            | Build to 16        | Build to 12 and hold; a smaller step or a variation is named |

## Consequences

- Coarse steps come sooner and land lower, and the weeks after one are reps climbing back into
  the range. Epley still predicts where they land; it is now asked to predict from about two reps
  past the range instead of six to thirteen.
- Fewer steps go back on a single hard day's reported reserve. A genuinely failed step still goes
  back after two clear misses.
- An athlete who tries the next load for a set or two is not punished for it, and the coach is not
  held to the heavier load for those sets.
- A planned temporary session needs its plan, or the coach's temporary change, to be kept; one
  logged with neither reads as a lighter day, which the next session reads past.
- `TRAINING_POLICY.version` is 2026-10-08.1; the coach policy and the training reference are
  2026-10-08.1. The contract version is unchanged: `landing`, `latestWorkLoads` and `setAside` are
  additions to the trend.
