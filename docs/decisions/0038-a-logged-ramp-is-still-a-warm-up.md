# A warm-up ramp logged as working sets is still a warm-up

A scheduled session preparation failed on the day's main barbell lift. Five of its six slots
held; the squat was refused three times and the job was given up. Nothing was wrong with the
plan. The athlete trains the way the programme asks: the lower-body warm-up ends in the "first
compound ramp", 40% × 8, 55–60% × 5 and 70–75% × 2–3, and they log it on the squat. The logger
starts every row it adds as a working set and asks each one for its reps in reserve, so the
ramp was on record as three working sets in front of the three that were the work.

Everything that read that performance read it by position:

- The coach's evidence took the first working set as the comparison: "8 reps at 40 kg". The
  working-set profile was the ramp, and no session ever completed the rep range, so the lift
  could not earn a progression however well it was trained.
- The session guardrail compared the plan with the logged sets in order. Three sets at the
  100 kg the athlete had actually lifted read as jumps of 150%, 74% and 38%. Writing the ramp
  into the plan as warm-ups did not help, because the logged ramp still sat at the front of the
  baseline, and writing it as working sets broke the prescribed set count and rep range. There
  was no plan the guardrail would accept.
- The app's own rule read the same sets, held the lift for good, and told the athlete to
  "Keep 40 kg".

And the worker could not see most of what it was told. A guardrail refusal lists every fault
as a plain sentence in `issues`; the coach's CLI only understood `{ path, message }` issues, so
each sentence printed as `": "`. The worker read one fault per attempt and spent both
corrections discovering the rest.

## Decisions

1. **The easier sets in front of the work are the ramp, when there are sets too many.** Of a
   performance's working sets in the order they were done, those in front of its hardest load
   and easier than it are read as warm-ups while more sets were logged than the slot prescribes,
   as many as there are sets too many. A set at the hardest load is never taken, and nothing
   after the work has started, so a back-off keeps its place. A pyramid logged at its prescribed
   length, and a session of straight sets, are read exactly as before. On an assisted machine the
   hardest load is the least help. `readRampAsWarmups` and `rampLength` in `warmup-ramp.ts`.
2. **A plan that leads with warm-ups says how much more was ramp.** The count cannot tell a ramp
   followed by fewer working sets than prescribed from a pyramid. The coach can, from the history:
   when its plan for a slot starts with warm-up sets, up to that many more of the easier logged
   sets in front of the work are read as the ramp. The work itself is never reached, so the
   baseline stays the load the athlete lifted.
3. **One reading wherever a decision is made from it.** The coach's evidence, the session
   guardrail and the app's progression rule read a performance the same way. What the athlete is
   shown as last time, and the history in the coach's context, stay exactly as logged; the
   evidence marks each set it reads differently with `loggedAs`, so the coach sees both.
4. **A refusal against a probable ramp says so.** When a harder load is refused against a logged
   set still lighter than the work behind it, the refusal names those sets and says to begin the
   exercise with them as warm-ups.
5. **The worker prints every issue**, whatever shape it arrives in, one per line
   (`describeRefusal`).

## Consequences

- A coach plan that writes the ramp as warm-ups also pre-types those rows as warm-ups in the
  athlete's logger, so the next session is logged the way it was trained.
- A pyramid logged with an extra set at the top (80, 90, 100, 100 against three sets) now reads
  its lightest step as the ramp. A plan holding the heavier three holds; one that repeats the
  whole pyramid, which held before, is now refused for its first set. This is the one shape the
  count reads worse than position did.
- A ramp followed by fewer working sets than prescribed is only partly read as ramp without a
  plan to say so. The app's own rule then takes its last ramp set as the first working set and
  holds for a session, advising that one low set does not lower the baseline, until a session is
  logged in full or with its ramp marked. The coach can say so (decision 2); the rule cannot.
- A plan's warm-ups can read a pyramid's lower steps as ramp, leaving three sets at the top load
  as the hold. That is the reading the guardrail already gave a session logged with only its top
  set.
- Retained references computed from a ramp are re-established from the work. Nothing stored
  changes: correcting a set's type corrects the reading.
- Weekly volume still counts a logged ramp as working sets, and the logger still starts an
  added row as a working set. Both are separate changes.
- The contract version is unchanged. `loggedAs` is a new field on the evidence's latest sets.
