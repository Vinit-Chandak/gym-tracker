import { WORKING_SET_TYPES } from "./progression";
import type { SetType } from "./types";

/**
 * How a logged performance is read: the warm-up in front of the work, the work, and any
 * back-off after it (ADR 0038).
 *
 * The upper- and lower-body warm-ups end in the "first compound ramp" — 40% × 8, 55–60% × 5,
 * 70–75% × 2–3 of the day's first lift — and the logger starts every row it adds as a working
 * set, asking each one for its reps in reserve. An athlete who logs that ramp on the lift
 * without switching each row to warm-up leaves light "working" sets in front of the ones that
 * are the work. Read by position, the lightest of them was the first working set: the lift's
 * trend was computed from the warm-up, it could never show a completed session, and a plan
 * that held the athlete's actual load read as a jump of 40% or more and was refused.
 *
 * A programme slot prescribes straight sets, so the work is done at the session's hardest load.
 * Anything lighter than that, before the first set at it, was the warm-up: however many sets
 * the ramp had, and however many working sets followed it. The exception is a load the session's
 * own plan prescribed as working — a coach's pyramid keeps every step. After the work starts, a
 * set more than a tenth lighter is a back-off; a smaller drop is the work getting harder, and
 * stays the work. Sets the athlete marked themselves are read as marked, and an unknown load is
 * never read as anything but what it was logged as.
 */

/** Loads closer than this are the same load, as they are to the guardrails' hold. */
const SAME_LOAD = 0.05;
/** After the work starts, a set this much lighter than it is a back-off. */
export const BACK_OFF_DROP = 0.1;

export type ReadOptions<S> = {
  /** The set's load in the unit the performance is compared in; null where unknown. */
  load?: (set: S) => number | null;
  /** An assisted machine, where a bigger number is more help and so the easier set. */
  assisted?: boolean;
  /** Working loads the session's own plan prescribed for this exercise, in the same unit. */
  planned?: readonly number[];
};

export type ReadSet<S> = S & {
  /** Set when a set is read as something other than it was logged as. */
  loggedAs?: SetType;
};

/**
 * The same sets, with the warm-up in front of the work read as warm-ups and back-offs after it
 * read as back-offs. Each set read differently keeps what it was logged as in `loggedAs`: this is
 * how the coach and the rule read the performance, never a change to what the athlete wrote down.
 */
export function readPerformance<
  S extends { setIndex: number; setType: SetType; weight: number | null },
>(sets: readonly S[], options: ReadOptions<S> = {}): ReadSet<S>[] {
  const load = options.load ?? ((set: S) => set.weight);
  const assisted = options.assisted ?? false;
  const working = sets
    .filter((set) => WORKING_SET_TYPES.has(set.setType))
    .sort((a, b) => a.setIndex - b.setIndex);
  const known = working
    .map(load)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  if (known.length === 0) return [...sets];
  const hardest = assisted ? Math.min(...known) : Math.max(...known);
  /**
   * How much easier than the hardest load, as a fraction of it: positive is easier, and the
   * same load is zero. Against a hardest load of nothing — bodyweight on an assisted machine —
   * any help at all is easier.
   */
  const easier = (value: number) => {
    const difference = assisted ? value - hardest : hardest - value;
    if (difference <= SAME_LOAD) return 0;
    return hardest > 0 ? difference / hardest : Infinity;
  };
  const planned = (value: number) =>
    (options.planned ?? []).some((target) => Math.abs(target - value) <= SAME_LOAD);

  const reread = new Map<S, SetType>();
  let started = false;
  for (const set of working) {
    const value = load(set);
    if (value === null || !Number.isFinite(value)) {
      // Nothing is read into a set nobody weighed; it does not start the work either.
      continue;
    }
    const atWork = Math.abs(value - hardest) <= SAME_LOAD || planned(value);
    if (!started) {
      if (atWork) started = true;
      else if (easier(value) > 0) reread.set(set, "warmup");
      else started = true;
      continue;
    }
    if (!planned(value) && easier(value) > BACK_OFF_DROP + 1e-9) reread.set(set, "backoff");
  }
  if (reread.size === 0) return [...sets];
  return sets.map((set) => {
    const as = reread.get(set);
    return as ? ({ ...set, setType: as, loggedAs: set.setType } as ReadSet<S>) : set;
  });
}

/** One step of a warm-up ramp: a share of the working load, for a number of reps. */
export type RampStep = { share: number; reps: number };

const RAMP_STEP =
  /^\s*(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?\s*%\s*[×x]\s*(\d+)(?:\s*[–-]\s*(\d+))?\s*$/;

/**
 * The ramp a warm-up drill's dose writes, as "40% × 8; 55–60% × 5; 70–75% × 2–3": each step's
 * share of the working load, the middle of a range of them, and the most reps it names. Null for
 * a dose that is not a ramp, like "3–5 min" or "8/side".
 */
export function parseRamp(dose: string): RampStep[] | null {
  const steps = dose.split(";").map((part) => {
    const match = RAMP_STEP.exec(part);
    if (!match) return null;
    const low = Number(match[1]);
    const high = Number(match[2] ?? match[1]);
    return { share: (low + high) / 200, reps: Number(match[4] ?? match[3]) };
  });
  return steps.length > 0 && steps.every((step) => step !== null) ? (steps as RampStep[]) : null;
}

type Target = {
  setIndex: number;
  setType: SetType;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

/**
 * The ramp written in front of the day's first lift, as warm-up targets (ADR 0038).
 *
 * The logger adds a row per target and each row starts as the type its target has, so a ramp
 * written here is offered as warm-up rows: nobody has to remember to switch each one, and the
 * working rows below it are the work. Each step is its share of the first working load, rounded
 * to a load that exists — one of `known` where any are, else a multiple of `step` — never under
 * `floor` (an empty bar), and kept only while it is lighter than the work and heavier than the
 * step before it. Targets that already start with a warm-up are left as they are: the athlete's
 * own last ramp, or the coach's.
 */
export function withRamp<T extends Target>(
  targets: readonly T[],
  ramp: readonly RampStep[],
  options: { step: number; floor?: number; known?: readonly number[] },
): (T | Target)[] {
  const sorted = [...targets].sort((a, b) => a.setIndex - b.setIndex);
  const work = sorted.find(
    (set) => WORKING_SET_TYPES.has(set.setType) && set.weight !== null && set.weight > 0,
  );
  if (!work || sorted[0]?.setType === "warmup") return [...targets];
  const load = work.weight!;
  const known = (options.known ?? []).filter((value) => value < load - 1e-9);
  const sets: { weight: number; reps: number }[] = [];
  for (const { share, reps } of ramp) {
    const exact = share * load;
    const rounded = known.length
      ? known.reduce((best, value) =>
          Math.abs(value - exact) < Math.abs(best - exact) ? value : best,
        )
      : options.step > 0
        ? Math.round(exact / options.step) * options.step
        : exact;
    const weight = Math.round(Math.max(options.floor ?? 0, rounded) * 100) / 100;
    if (weight <= 0 || weight >= load - 1e-9) continue;
    if (sets.length > 0 && weight <= sets.at(-1)!.weight + 1e-9) continue;
    sets.push({ weight, reps });
  }
  if (sets.length === 0) return [...targets];
  return [
    ...sets.map((set, index): Target => ({
      setIndex: index + 1,
      setType: "warmup",
      weight: set.weight,
      reps: set.reps,
      rir: null,
      durationSeconds: null,
      distanceMeters: null,
    })),
    ...sorted.map((set) => ({
      ...set,
      setIndex: set.setIndex - sorted[0]!.setIndex + 1 + sets.length,
    })),
  ];
}
