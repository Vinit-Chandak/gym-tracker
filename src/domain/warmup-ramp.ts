import { WORKING_SET_TYPES } from "./progression";
import type { SetType } from "./types";

/**
 * A warm-up ramp logged as working sets (ADR 0038).
 *
 * The upper- and lower-body warm-ups end in the "first compound ramp" — 40% × 8, 55–60% × 5,
 * 70–75% × 2–3 of the day's first lift — and the logger starts every row it adds as a working
 * set, asking each one for its reps in reserve. An athlete who logs that ramp on the lift
 * without switching each row to warm-up leaves three light "working" sets in front of the ones
 * that are the work. Read by position, the lightest of them was the first working set: the
 * lift's trend was computed from the warm-up, it could never show a completed session, and a
 * plan that held the athlete's actual load read as a jump of 40% or more and was refused.
 *
 * So a performance is read as it was trained. Of its working sets in the order they were done,
 * those in front of the hardest load and easier than it are the ramp while more sets were logged
 * than the slot prescribes: as many of them as there are sets too many. A set at the hardest load
 * is never part of it, and neither is anything after the work has started, so a back-off keeps
 * its place. A pyramid logged at its prescribed length keeps every step, and a session of
 * straight sets is read exactly as it was before.
 */

/** Loads closer than this are the same load, as they are to the guardrails' hold. */
const SAME_LOAD = 0.05;

export type RampOptions = {
  /** An assisted machine, where a bigger number is more help and so the easier set. */
  assisted?: boolean;
  /**
   * How many sets a plan leads with as warm-ups. Up to that many of the easier sets in front of
   * the hardest load are the ramp whatever the count, so the coach can say what the numbers
   * alone cannot: a ramp followed by fewer working sets than the slot prescribes looks, set for
   * set, like a pyramid.
   */
  declared?: number;
};

/**
 * How many of these loads, in the order they were lifted, are a ramp in front of the work.
 * An unknown load ends the ramp: nothing is read into a set nobody weighed.
 */
export function rampLength(
  loads: readonly (number | null)[],
  prescribed: number,
  { assisted = false, declared = 0 }: RampOptions = {},
): number {
  const known = loads.filter((load): load is number => load !== null && Number.isFinite(load));
  if (known.length === 0) return 0;
  const hardest = assisted ? Math.min(...known) : Math.max(...known);
  let ramp = 0;
  for (const load of loads) {
    const easier =
      load !== null &&
      Number.isFinite(load) &&
      (assisted ? load > hardest + SAME_LOAD : load < hardest - SAME_LOAD);
    if (!easier || (ramp >= declared && loads.length - ramp <= prescribed)) break;
    ramp++;
  }
  return ramp;
}

/**
 * How many of these loads are easier than the hardest of them and come before it: what a plan
 * leading with that many warm-ups would read as the ramp, whatever was prescribed.
 */
export function easierInFront(loads: readonly (number | null)[], assisted = false): number {
  return rampLength(loads, 0, { assisted, declared: loads.length });
}

/**
 * The same sets with a logged ramp read as the warm-ups it was, against a slot of `prescribed`
 * working sets. Each set read that way keeps what it was logged as in `loggedAs`: this is how the
 * coach and the rule read the performance, not a change to what the athlete wrote down.
 */
export function readRampAsWarmups<
  S extends { setIndex: number; setType: SetType; weight: number | null },
>(
  sets: readonly S[],
  prescribed: number,
  options: RampOptions & { load?: (set: S) => number | null } = {},
): (S & { loggedAs?: SetType })[] {
  const working = sets
    .filter((set) => WORKING_SET_TYPES.has(set.setType))
    .sort((a, b) => a.setIndex - b.setIndex);
  const load = options.load ?? ((set: S) => set.weight);
  const ramp = new Set(working.slice(0, rampLength(working.map(load), prescribed, options)));
  return sets.map((set) =>
    ramp.has(set)
      ? ({ ...set, setType: "warmup", loggedAs: set.setType } as S & { loggedAs: SetType })
      : set,
  );
}
