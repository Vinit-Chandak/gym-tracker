import type { FormState, PrintPart, StrengthColumn } from "@/components/art/geometry";
import type { ProgramDayPlan } from "@/server/repositories/schedule";

/** A day's state as its ink: done full, skipped dashed, anything else still to do. */
export function dayState(status: ProgramDayPlan["status"]): FormState {
  return status === "completed" ? "done" : status === "skipped" ? "skipped" : "todo";
}

/** What a day of the cycle is, said after its name: "next", "done", "to do". */
export function dayStateWord(plan: Pick<ProgramDayPlan, "isNext" | "status">): string {
  if (plan.isNext) return "next";
  switch (plan.status) {
    case "completed":
      return "done";
    case "skipped":
      return "skipped";
    case "not_in_programme":
      return "not this cycle";
    default:
      return "to do";
  }
}

/**
 * A programme day as a print (boards Training, Programme day), its parts in the order of its
 * rows: the run first, as the day is written; a rest day's routine, or on the day's own page
 * the warm-up, as a fan of its drills; then a column of sets for each exercise, a superset's
 * two standing closer.
 */
export function programmeDayParts(
  plan: Pick<ProgramDayPlan, "day" | "exercises" | "run" | "status">,
  { drills = 0, warmup = false }: { drills?: number; warmup?: boolean } = {},
): PrintPart[] {
  const state = dayState(plan.status);
  const parts: PrintPart[] = [];
  if (plan.day.includesRun)
    parts.push({ kind: "run", minutes: plan.run?.durationMaxMinutes, state });
  if (drills > 0 && (warmup || !plan.day.includesLifting))
    parts.push({
      kind: "mobility",
      segments: drills,
      segmentsDone: state === "done" ? drills : 0,
      state,
      modules: 3,
    });
  const columns: StrengthColumn[] = [];
  plan.exercises.forEach((exercise, index) => {
    if (exercise.sets <= 0) return;
    const next = plan.exercises[index + 1];
    columns.push({
      sets: exercise.sets,
      done: state === "done" ? exercise.sets : 0,
      skipped: state === "skipped",
      pair: exercise.supersetGroup !== null && next?.supersetGroup === exercise.supersetGroup,
    });
  });
  if (columns.length > 0) parts.push({ kind: "strength", columns });
  return parts;
}
