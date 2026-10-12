import type { PrintedSession } from "@/domain/session-print";

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

/**
 * A workout as a print (DESIGN.md, Prints), the same wherever it is drawn: the warm-up's fan,
 * then a column for each exercise, a superset's two standing closer.
 *
 * Under way it is a plan's print (the workout, and an open one on its day): each exercise's
 * planned sets, its working sets inked as they are done, the warm-up thinned until it is marked
 * done. Finished it is the record (the summary, a past workout, a day): what was done, warm-up
 * sets grey at the foot of their columns, and an exercise or a warm-up never done dashed, an
 * exercise at its planned size.
 */
export function sessionParts(session: PrintedSession): PrintPart[] {
  const parts: PrintPart[] = [];
  if (session.drills > 0)
    parts.push(
      warmupFan(
        session.drills,
        session.warmupCompleted ? "done" : session.completed ? "skipped" : "todo",
      ),
    );
  const columns: StrengthColumn[] = [];
  session.exercises.forEach((exercise, index) => {
    const next = session.exercises[index + 1];
    const pair = exercise.supersetGroup !== null && next?.supersetGroup === exercise.supersetGroup;
    const planned = exercise.planned ?? 0;
    if (!session.completed) {
      const column = planColumn(planned, exercise.work, { skipped: exercise.skipped, pair });
      if (column.sets > 0) columns.push(column);
      return;
    }
    const logged = exercise.work + exercise.warm;
    if (logged > 0) columns.push({ sets: logged, done: logged, warm: exercise.warm, pair });
    else if (planned > 0) columns.push({ sets: planned, done: 0, skipped: true, pair });
  });
  if (columns.length > 0) parts.push({ kind: "strength", columns });
  return parts;
}
