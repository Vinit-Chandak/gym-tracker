import type { PrintedExercise, PrintedSession } from "@/domain/session-print";

import type { FormState, PrintPart, StrengthColumn } from "./geometry";

/**
 * The warm-up as a fan of its drills: thinned to do, full once done, and dashed in the record of
 * a workout that finished without it, as an exercise never done is.
 */
export function warmupFan(drills: number, state: FormState): PrintPart {
  return {
    kind: "mobility",
    segments: drills,
    segmentsDone: state === "done" ? drills : 0,
    state,
    modules: 3,
  };
}

/**
 * An exercise of a plan as its column: the sets it asks for, inked from the foot as they are
 * done. Sets done past the plan stand on it, as the workout's log adds them.
 */
export function planColumn(
  planned: number,
  done: number,
  { skipped = false, pair = false }: { skipped?: boolean; pair?: boolean } = {},
): StrengthColumn {
  return { sets: Math.max(planned, done), done, skipped, pair };
}

/** Where a workout's warm-up stands: done once marked, owed while open, missed once finished. */
export function warmupState(
  session: Pick<PrintedSession, "warmupCompleted" | "completed">,
): FormState {
  return session.warmupCompleted ? "done" : session.completed ? "skipped" : "todo";
}

/**
 * One exercise of a workout as its column, the same wherever it is drawn: in the workout's own
 * print, and on the row of a plan it was done for (`pairBySlot`), which passes the sets that row
 * asks for. Under way it is the plan's column (`planColumn`): the sets asked for, its working
 * sets inked as they are done. Finished it is what was done; with nothing done, dashed at the
 * size asked for. A record draws its warm-up sets too, grey at the foot; a plan's print leaves
 * them out (`warmups: false`), as it does while the workout is open, since no plan asks for
 * them, and a page of plans' prints (Training's cycle) keeps the module its plans need. Null
 * when nothing was asked for and nothing done.
 */
export function exerciseColumn(
  planned: number,
  exercise: Pick<PrintedExercise, "work" | "warm" | "skipped"> | null,
  completed: boolean,
  { pair = false, warmups = true }: { pair?: boolean; warmups?: boolean } = {},
): StrengthColumn | null {
  const work = exercise?.work ?? 0;
  const warm = warmups ? (exercise?.warm ?? 0) : 0;
  if (!completed) {
    const column = planColumn(planned, work, { skipped: exercise?.skipped ?? false, pair });
    return column.sets > 0 ? column : null;
  }
  if (work + warm > 0)
    return warmups
      ? { sets: work + warm, done: work + warm, warm, pair }
      : { sets: work, done: work, pair };
  return planned > 0 ? { sets: planned, done: 0, skipped: true, pair } : null;
}

/**
 * A workout as a print (DESIGN.md, Prints), the same wherever it is drawn: the warm-up's fan,
 * then a column for each exercise (`exerciseColumn`), a superset's two standing closer.
 *
 * Under way it is a plan's print (the workout, and an open one on its day): each exercise's
 * planned sets, its working sets inked as they are done, the warm-up thinned until it is marked
 * done. Finished it is the record (the summary, a past workout, a day): what was done, warm-up
 * sets grey at the foot of their columns, and an exercise or a warm-up never done dashed, an
 * exercise at its planned size.
 */
export function sessionParts(session: PrintedSession): PrintPart[] {
  const parts: PrintPart[] = [];
  if (session.drills > 0) parts.push(warmupFan(session.drills, warmupState(session)));
  const columns: StrengthColumn[] = [];
  session.exercises.forEach((exercise, index) => {
    const next = session.exercises[index + 1];
    const pair = exercise.supersetGroup !== null && next?.supersetGroup === exercise.supersetGroup;
    const column = exerciseColumn(exercise.planned ?? 0, exercise, session.completed, { pair });
    if (column) columns.push(column);
  });
  if (columns.length > 0) parts.push({ kind: "strength", columns });
  return parts;
}
