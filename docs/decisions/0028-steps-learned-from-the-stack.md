# Steps learned from the stack

A machine described its loads with one number, "smallest load jump", and an optional list of
the weights it offers. Pin and cable stacks do not fit one number: the plates near the pin are
lighter than the ones at the bottom, and two leg curls in one gym step differently. Nobody
kept the list up. So the step above a lift was often unknown or wrong, and two rules made it
worse:

- Today's suggestion capped a load increase at 5%. Above 59 kg the next plate on the owner's
  seated leg curl is 64 kg, an 8.5% jump, so the suggestion held there for good.
- Every machine started with its load convention "Not confirmed", and the coach was refused
  any automatic load change on a "Not confirmed", "stack label" or "assistance" machine at
  any gym. Almost nothing could progress by load.

Storing every stack's plates was considered and rejected: it is data entry nobody does, a
table to query, and a list to put in the coach's context for no benefit.

## Decisions

Put to the owner and answered before anything was built.

1. **A stack's steps come from what has been lifted on it.** Every weight logged on a
   selectorised machine, in its own unit, is a real stop on its stack. The next load up is
   the next stop anybody has used; above the heaviest it is the gap between the two heaviest,
   carried once more (59 after 54 suggests 64). Weights listed on the machine count as stops
   too. With only one weight ever logged there is no gap, and nothing is guessed.
2. **Plates and free weights keep their typed jump.** Two plates on a leg press log as one
   jump twice the real one, so their logs would teach the wrong step.
3. **Two good sessions earn one real step on the same machine.** The engine and the coach
   guardrail allow the percentage or one real step of that machine, whichever is larger, for
   a step harder; a step easier keeps the plain percentage. The confirmation rule is
   unchanged: two fresh comparable sessions at the prescribed effort.
4. **Assisted machines count the other way.** On the assisted pull-up and assisted dip
   machines (known by their type) a lower number is harder, so the progression is a step
   down the same ladder and a step up is the cut.
5. **The load convention no longer gates anything**, and "What one logged load means" is off
   the machine form. The column stays, unused, so nothing is lost; its value still keys the
   coach's retained references so none of those are invalidated.
6. **Next up, under the exercise.** Once an exercise's working sets are in, a stack whose
   next stop above today's heaviest is not known shows one quiet line: "Next up from 59 kg
   [64] kg", filled with the guess where there is one and empty where there is not. Saving
   adds the weight to the machine's listed loads; leaving it alone changes nothing. Assisted
   machines ask for the next step down.

## How it is read

`loadLadders` reads a set of machines' rows and the distinct weights logged on the stacks
among them in two queries, beside whatever else a screen reads. Nothing new is stored, so
correcting a mistyped set corrects the ladder. The domain functions in `load-steps.ts` do the
rest: `stepHarder`, `stepEasier`, `harderAllowance`, and `stepsFrom`.

The coach does not get the ladder. Each slot in a session's context names its machine and,
for every load last used on it, the next load harder and easier with where each came from:
`known`, `learned` (a guess until lifted), `increment`, or null. The full list of a machine's
known loads is one lookup away ([ADR 0029](0029-the-coach-looks-things-up.md)).

## Consequences

- At home only a known load is prescribed, as before; a listed or logged weight counts.
- The 14-day brake is unchanged in spirit: +10% or one real step, whichever is larger. On a
  coarse stack trained twice a week, a second step inside fourteen days of the first still
  waits for the coach to review it.
- "Smallest load jump" is no longer asked of a stack; a value already saved is kept.
- The coach policy version moved to `2026-09-23.1`.
