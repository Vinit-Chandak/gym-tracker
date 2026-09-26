/**
 * Where a machine's next load comes from (ADR 0028).
 *
 * A pin or cable stack is not evenly spaced: the plates near the top are heavier than the
 * ones near the pin, and two leg curls in the same gym step differently. One "smallest jump"
 * number cannot describe that, and a stack's full plate list is a chore nobody keeps up. So a
 * stack's steps are read off what has actually been lifted on it. Every weight logged on the
 * machine is a real stop on its stack; the next load up is the next stop anybody has used,
 * and above the heaviest one it is the gap between the two heaviest, applied once more.
 * Anything the athlete has typed as a load that exists (Available loads, or the Next up box
 * under an exercise) is a stop too.
 *
 * Plates and free weights keep the typed jump: two plates on a leg press log as one jump that
 * is twice the real one, so their logs would teach the wrong step.
 *
 * Assisted machines count the other way — a bigger number is more help — so "harder" is a
 * step down the same ladder.
 */

/** What is known about one machine's loads, in the machine's own unit. */
export type LoadLadder = {
  /** Loads known to exist, ascending and distinct, every one above zero. */
  known: readonly number[];
  /** A pin or cable stack: its steps come from `known`, never from a typed jump. */
  stack: boolean;
  /** A bigger number makes the movement easier: assisted pull-up and dip machines. */
  assisted: boolean;
  /** The typed jump, used where the ladder is not a stack. */
  increment: number | null;
};

/**
 * Where a step came from. `known` is a load that exists on this machine; `learned` is the gap
 * between the two nearest known loads, carried one step past them, so it is a guess until
 * somebody lifts it; `increment` is the typed jump.
 */
export type LoadStepSource = "known" | "learned" | "increment";
export type LoadStep = { load: number; source: LoadStepSource };

/** Equipment types whose number is help given rather than load lifted. */
export const ASSISTED_EQUIPMENT_TYPES: ReadonlySet<string> = new Set([
  "assisted_pullup",
  "dip_machine",
]);

const EPSILON = 0.005;
const round = (value: number) => Math.round(value * 100) / 100;

/** Distinct positive loads, ascending, rounded to the hundredth the database keeps. */
export function knownLoads(...lists: readonly (readonly number[])[]): number[] {
  const seen = new Set<number>();
  for (const list of lists)
    for (const load of list) if (Number.isFinite(load) && load > 0) seen.add(round(load));
  return [...seen].sort((a, b) => a - b);
}

export function ladderFor(input: {
  resistanceMode: string;
  equipmentTypeSlug: string | null;
  availableLoads: readonly number[];
  loggedLoads: readonly number[];
  loadIncrement: number | null;
}): LoadLadder {
  const stack = input.resistanceMode === "selectorized";
  return {
    // A logged plate-loaded weight is real, but the step between two of them is not the
    // machine's step, so only a stack takes its ladder from the logs.
    known: knownLoads(input.availableLoads, stack ? input.loggedLoads : []),
    stack,
    assisted:
      input.equipmentTypeSlug !== null && ASSISTED_EQUIPMENT_TYPES.has(input.equipmentTypeSlug),
    increment: input.loadIncrement && input.loadIncrement > 0 ? input.loadIncrement : null,
  };
}

/** The next bigger number on this machine, or null when nothing says what it is. */
export function stepUp(ladder: LoadLadder, from: number): LoadStep | null {
  const above = ladder.known.find((load) => load > from + EPSILON);
  if (above !== undefined) return { load: above, source: "known" };
  if (ladder.stack) {
    // The two heaviest known loads at or below where we stand give the step at the top.
    const below = ladder.known.filter((load) => load <= from + EPSILON);
    if (below.length < 2) return null;
    const gap = below.at(-1)! - below.at(-2)!;
    return { load: round(from + gap), source: "learned" };
  }
  return ladder.increment === null
    ? null
    : { load: round(from + ladder.increment), source: "increment" };
}

/** The next smaller number on this machine, or null when nothing says what it is. */
export function stepDown(ladder: LoadLadder, from: number): LoadStep | null {
  const below = ladder.known.filter((load) => load < from - EPSILON).at(-1);
  if (below !== undefined) return { load: below, source: "known" };
  if (ladder.stack) {
    const above = ladder.known.filter((load) => load >= from - EPSILON);
    if (above.length < 2) return null;
    const next = round(from - (above[1]! - above[0]!));
    return next > 0 ? { load: next, source: "learned" } : null;
  }
  if (ladder.increment === null) return null;
  const next = round(from - ladder.increment);
  return next > 0 ? { load: next, source: "increment" } : null;
}

/** One step harder: more load, or less help on an assisted machine. */
export function stepHarder(ladder: LoadLadder, from: number): LoadStep | null {
  return ladder.assisted ? stepDown(ladder, from) : stepUp(ladder, from);
}

/** One step easier: less load, or more help on an assisted machine. */
export function stepEasier(ladder: LoadLadder, from: number): LoadStep | null {
  return ladder.assisted ? stepUp(ladder, from) : stepDown(ladder, from);
}

/**
 * How much harder a load is than another, as a fraction of the one stepped from: positive is
 * harder. On an assisted machine less help is harder, so the sign turns over.
 */
export function difficultyChange(ladder: LoadLadder | null, from: number, to: number): number {
  const change = to / from - 1;
  return ladder?.assisted ? -change : change;
}

/**
 * The largest step harder allowed at once, as a fraction of the load stepped from: the
 * percentage, or one real step of this machine, whichever is larger. A percentage on its own
 * freezes anything whose steps are coarse — the stop above 59 kg on a leg curl stack may be
 * 64 kg, an 8.5% jump — so the one step that physically exists is never the forbidden one.
 * A step easier keeps the plain percentage: where no small enough cut exists, holding is the
 * safe answer and a real decline goes to review.
 */
export function harderAllowance(limit: number, from: number, ladder: LoadLadder | null): number {
  if (!(from > 0) || !ladder) return limit;
  const next = stepHarder(ladder, from);
  if (!next) return limit;
  return Math.max(limit, Math.abs(next.load / from - 1));
}

/**
 * The next load either way from each load the athlete last used, which is all a plan for
 * the next session needs from the ladder: a few numbers, not the machine's whole stack.
 */
export function stepsFrom(
  ladder: LoadLadder,
  loads: readonly (number | null)[],
): { from: number; harder: LoadStep | null; easier: LoadStep | null }[] {
  return knownLoads(loads.filter((load): load is number => load !== null)).map((from) => ({
    from,
    harder: stepHarder(ladder, from),
    easier: stepEasier(ladder, from),
  }));
}
