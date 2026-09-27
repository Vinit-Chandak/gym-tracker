# A warm-up ramp logged as working sets is still a warm-up

A scheduled session preparation failed on the day's main barbell lift. Five of its six slots
held; the squat was refused three times and the job was given up. Nothing was wrong with the
plan. The athlete trains the way the programme asks: the lower-body warm-up ends in the "first
compound ramp", 40% × 8, 55–60% × 5 and 70–75% × 2–3, and they log it on the squat. The logger
started every row it added as a working set and asked each one for its reps in reserve, so the
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

A first fix read the ramp by counting: the easier sets in front of the work were the ramp while
more sets were logged than the slot prescribes. Counting cannot tell a ramp from a pyramid, nor
a ramp followed by one working set too few from a pyramid of the right length, and it misread
one warm-up more or less than usual. The weight of each set can.

## Decisions

1. **Anything lighter than the work, before the work, is the warm-up.** A programme slot
   prescribes straight sets, so the work is done at the session's hardest load. Of a
   performance's working sets in the order they were done, each one lighter than that, before
   the first set at it, is read as a warm-up: however many sets the ramp had, and however many
   working sets followed. There is no percentage band: a heavy last warm-up at 85–90% is still a
   warm-up, and a band would have read it as a working set that missed the range. Loads within
   0.05 of each other are the same load, as they are to the guardrails. `readPerformance` in
   `warmup-ramp.ts`.
2. **A load the session's own plan prescribed is work.** A coach's pyramid keeps every step:
   the working loads of the plan a session was trained from are read as work wherever they fall.
   Without a plan, 80, 90 and 100 kg is a ramp to one top set, as it would be written.
3. **After the work starts, a set more than a tenth lighter is a back-off.** A smaller drop is
   the work getting harder, and stays the work. So two sets at 100 kg and a third dropped to
   80 kg are two sets of work, and a plan holding three at 100 kg holds.
4. **The athlete's own marks stand, and nothing is read into an unweighed set.** A set logged as
   a warm-up, back-off or drop is read as logged. A set without a load neither starts the work
   nor is read as anything else. On an assisted machine the hardest load is the least help.
5. **One reading wherever a decision is made from it.** The coach's evidence, the session
   guardrail and the app's progression rule read a performance the same way. What the athlete is
   shown as last time, and the history in the coach's context, stay exactly as logged; the
   evidence marks each set it reads differently with `loggedAs`, so the coach sees both.
6. **The logger offers the ramp as warm-up rows.** The session view writes the day's ramp in
   front of the rule's targets for its first lift, from the warm-up protocol's own dose, rounded
   to loads that exist and never under an empty bar; targets that already start with a warm-up
   keep theirs. Every target gets a row, started as the type its target has, so the ramp is
   logged as the warm-up it is without anyone switching a row. The ramp's rows stay through a
   reload while what is logged fits them; a lift whose work was logged where they would go keeps
   its own. A coach plan's targets are exact, so the coach writes the ramp into the first lift's
   sets as warm-ups itself.
7. **A light set saved with no RIR before the work is saved as a warm-up**, under 90% of the
   row's working target, and said so under the row with an Undo. With an RIR it stays a working
   set: that may be a lighter day on purpose, and the athlete's word is not rewritten. Logging
   warm-ups stays optional; nothing is required of them.
8. **The worker prints every issue**, whatever shape it arrives in, one per line
   (`describeRefusal`).

## Consequences

- Every warm-up case reads the same: one warm-up more or fewer, a heavy last one, and four
  working sets prescribed but three done all leave the work as the work.
- A pyramid the athlete logs without a plan is read as a ramp to its top set. A coach that wants
  a pyramid prescribes it, and then it is read as prescribed.
- A set dropped more than 10% partway through the work is read as a back-off, so it does not
  count as a working set that missed.
- Retained references computed from a ramp are re-established from the work. Nothing stored
  changes: correcting a set's type corrects the reading.
- Weekly volume still counts sets as they were logged; with the ramp offered as warm-up rows,
  fewer of those are ramps.
- The contract version is unchanged. `loggedAs` is a new field on the evidence's latest sets.
