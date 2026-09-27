# A load never held, and the body under the load

Two plans on one Lower B read wrong to the athlete who was given them.

The deadlift is 3 × 3–5 at 2–3 RIR. The session before, the athlete took 125 kg for a single at
0 RIR: a heaviest-ever lift, with one rep in hand. The rule read it as one low session, and one
low session holds its load (ADR 0039, decision 8), so it held 125 and asked for the bottom of the
range at the target effort: three reps at 2 RIR, five in hand where the single had one. By the
same curve the rule steps with, that is about 12% too heavy. The coach could not lower it, because
a lasting cut needs a confirmed decline, and it wrote the plan the rule gave it. And a single
logged as one set of three read as `unknown`, not `below`: nothing downstream could tell a heavy
single from a skipped set.

The split squat is 2 × 8–12 a side, with a 5 kg dumbbell. The rule decides whether a step is too
coarse along Epley's curve (ADR 0039, decision 5), and it read that curve through the dumbbell
alone: 5 to 7.5 kg is half as heavy again, so reps had to reach 28 a side before the step could
land in the range. What the legs lift is the body and the dumbbell together, and 7.5 kg is about
3% more of that. The coach wrote "the next dumbbell is 50% heavier" and held it.

The coach's notes also described the step rule as it was before ADR 0039: "hold 59 until two clean
sessions", on a leg curl where one session with a rep to spare now moves the pin.

## Decisions

1. **A load never held in the range is not a baseline.** When the latest session is below the
   range at a load no session in the window has held the range at, nor at anything heavier, and
   its hardest set could not reach the bottom of the range even taken to failure (reps plus RIR
   under the minimum), the load goes back at once, on that one session: to the last load held in
   the range, or, with none in the window, to the heaviest real load at which that set's capacity
   puts the range. The trend shows it as `revert` with `reason: out_of_reach` and
   `to: last_held | fitted`. The rule says it as "125 kg had 1 rep in hand, short of the 3-rep
   minimum: back to 120 kg." A load held in the range, or under one that was, keeps the older
   rule, and so does a near miss at a new one: a set that reached the minimum at 0 RIR is short of
   the effort, not out of reach, and one such day still holds. One real step below the load that
   went back, a session with a rep to spare no longer steps up to it on its own: as after a step
   that missed twice, it takes two. The steps below that are unchanged, so one heavy single does
   not slow the weeks of work that lead back up to it.
2. **Going back is allowed whatever its percentage, over a session or a fortnight.** The guardrail
   already let a step that missed twice go back past the 10% automatic cut. It now lets either
   kind of `revert` past the 15% fourteen-day limit on cuts too, because the load it goes to is
   the one the evidence supports.
3. **Sets logged short of the range say the session was.** A session with fewer sets logged than
   prescribed read `unknown`. The sets missing can only lower the hardest, so where the logged
   ones fell short of the range the session is `below`. Logged sets in the range still say
   nothing about the ones missing.
4. **The body is part of the load on bodyweight movements and lunges.** A share of body mass per
   movement — 0.95 for pull-ups, 0.85 for squats and lunges, 0.65 for push-ups, and so on — times
   the athlete's recorded weight (a 70 kg stand-in where none is recorded) is added to the logged
   load wherever reps are read against load: what a step leaves in hand, how far reps build before
   a coarse step, how the reported reserve held up after a step, and the estimated maximum, which
   is reported for the added load. It applies to the `bodyweight` modality and to every `lunge`
   whatever is held; barbell and machine lifts are read against the logged load as before. It is
   `bodyLoad` on the prescription and on the coach's trend.
5. **Each trend says what moves the load next.** `nextStep` is one sentence in the athlete's
   terms: the reps and RIR every working set needs in one session, or in two running, or how far
   reps build before a big jump. The coach is told to say that, not a rule of its own.

## Consequences

- A heavy single, or a jump the athlete took on their own, no longer turns into triples at that
  weight. Nothing is cut on a bad day at a weight the athlete had already held.
- A split squat, lunge, pull-up or dip with a small added load steps in its real increments, and
  the coach may no longer build reps far past the top of the range on the dumbbell's numbers
  alone: the guardrail's ceiling reads the body too.
- The shares are rough, and they are meant to be: they put an added load in proportion to the
  body under it. Logged dumbbell weight may be per hand; the body still dwarfs the step either way.
- `TRAINING_POLICY.version` is 2026-09-27.2; the coach policy and the training reference are
  2026-09-27.2. The contract version is unchanged: `revert.reason`, `revert.to`, `hardest`,
  `nextStep` and `bodyLoad` are additions.
