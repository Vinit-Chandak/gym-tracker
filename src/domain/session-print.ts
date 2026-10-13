import type { StoredPlanExercise } from "./session-plan";

/**
 * One workout as its prints draw it (DESIGN.md, Prints), wherever one is drawn: the workout
 * itself, under way or finished, the day it is on, and the plans an open one is inking (Today,
 * Training's cycle, the programme day). Read once, on the server with the session
 * (`sessionPrintColumns`) or in the workout from the session it holds, so that no screen counts
 * a workout's sets or its warm-up its own way (year audit: an open Squat day was drawn four ways,
 * and a finished Legs A two).
 */
export type PrintedExercise = {
  /** The programme's slot it was started for; null for one the coach or the athlete added. */
  slotId: string | null;
  exerciseId: string;
  /** The working sets its plan asks for (`plannedWorkingSets`); null when nothing says. */
  planned: number | null;
  /** Its working sets logged, warm-ups aside. */
  work: number;
  /** Its warm-up sets logged. */
  warm: number;
  skipped: boolean;
  supersetGroup: string | null;
};

export type PrintedSession = {
  /** The warm-up's drills, the fan's blades: the coach's lines, else the protocol's; 0 for none. */
  drills: number;
  warmupCompleted: boolean;
  /** Finished, it prints as the record of what was done; open, as the plan it is inking. */
  completed: boolean;
  exercises: readonly PrintedExercise[];
};

/** Something laid out from a day's plan: the slot it stands for, and the exercise it does. */
type Slotted = { slotId: string | null; exerciseId: string };

/**
 * Pairs each of `rows` with the one of `items` that stands for the same part of the plan, the
 * way a session started from a plan lays out its exercises: a row of a programme slot is that
 * slot's; one added without a slot is the next unclaimed item of the same exercise, in order.
 * Null where there is none. The workout pairs its exercises with the coach's entries this way,
 * and Today pairs the plan's rows with the open workout's exercises.
 */
export function pairBySlot<R extends Slotted, T extends Slotted>(
  rows: readonly R[],
  items: readonly T[],
): (T | null)[] {
  const bySlot = new Map<string, T>();
  for (const item of items) if (item.slotId) bySlot.set(item.slotId, item);
  const added = items.filter((item) => item.slotId === null);
  return rows.map((row) => {
    if (row.slotId) return bySlot.get(row.slotId) ?? null;
    const at = added.findIndex((item) => item.exerciseId === row.exerciseId);
    return at >= 0 ? added.splice(at, 1)[0]! : null;
  });
}

/**
 * The coach's entry an exercise follows: its own, while the exercise is the one the entry was
 * written for. A swap made in the workout takes the new exercise's own numbers, rest and notes.
 */
export function ownEntry<E extends { exerciseId: string }>(
  entry: E | null,
  exerciseId: string,
): E | null {
  return entry && entry.exerciseId === exerciseId ? entry : null;
}

/**
 * How many working sets an exercise's plan asks for: the coach's own count when the coach wrote
 * its sets, else the programme's (or the saved routine's). Null when nothing says (one added on
 * the spot).
 */
export function plannedWorkingSets(
  own: { action: StoredPlanExercise["action"]; sets: readonly { setType: string }[] } | null,
  planned: number | null,
): number | null {
  const coach =
    own && own.action !== "drop" ? own.sets.filter((set) => set.setType !== "warmup").length : 0;
  return coach > 0 ? coach : planned;
}
