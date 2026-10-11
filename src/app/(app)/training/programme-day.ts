import type { FormState, PrintPart, StrengthColumn } from "@/components/art/geometry";
import type { ActivitySport, EnduranceSport } from "@/domain/activity";
import type { ProgramDayPlan, ScheduleDay } from "@/server/repositories/schedule";

/** A day's state as its ink: done full, skipped dashed, anything else still to do. */
export function dayState(status: ProgramDayPlan["status"]): FormState {
  return status === "completed" ? "done" : status === "skipped" ? "skipped" : "todo";
}

/**
 * What a day of the cycle is, said after its name: "in progress" while its workout is open,
 * then "next", "done", "to do".
 */
export function dayStateWord(
  plan: Pick<ProgramDayPlan, "isNext" | "status">,
  open = false,
): string {
  if (open) return "in progress";
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

/** A word that names a run, in a day's name or focus. */
const RUN_WORD = /\b(?:run|runs|running|jog|jogging)\b/i;

/**
 * Whether a day that lifts and runs runs first, as the day is written: "Easy Run + Arms" runs
 * first, "Lower + easy run" lifts first. Nothing stores the order, so it is read from where the
 * run is named — the day's name, else its focus — split at "+", "&", commas, "and" and "then".
 * A day that names it nowhere runs first, as the programme's template writes its run days.
 */
export function runLeads(day: Pick<ScheduleDay, "name" | "focus">): boolean {
  for (const words of [day.name, day.focus]) {
    if (!words) continue;
    const parts = words.split(/\s*(?:[+&,]|\bthen\b|\band\b)\s*/i).filter(Boolean);
    const at = parts.findIndex((part) => RUN_WORD.test(part));
    if (at >= 0) return at === 0;
  }
  return true;
}

/**
 * A programme day as a print (boards Training, Programme day), its parts in the order of its
 * rows: the run where the day is written to have it (`runLeads`), first or after the lifting; a
 * rest day's routine, or on the day's own page the warm-up, as a fan of its drills; then a
 * column of sets for each exercise, a superset's two standing closer.
 */
export function programmeDayParts(
  plan: Pick<ProgramDayPlan, "day" | "exercises" | "status">,
  { drills = 0, warmup = false }: { drills?: number; warmup?: boolean } = {},
): PrintPart[] {
  const state = dayState(plan.status);
  const parts: PrintPart[] = [];
  const runFirst = !plan.day.includesLifting || runLeads(plan.day);
  if (plan.day.includesRun && runFirst) parts.push({ kind: "run", state });
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
  if (plan.day.includesRun && !runFirst) parts.push({ kind: "run", state });
  return parts;
}

/**
 * The sports Training offers to log: the ones this account has switched on, which is the
 * shortcut tidying the Sports screen promises, and running while the programme has a day that
 * runs, since a programme keeps what it asks for whatever the switches say (SPORT-01).
 */
export function logSports(
  sports: readonly EnduranceSport[],
  enabled: readonly ActivitySport[],
  days: readonly Pick<ProgramDayPlan, "day">[],
): EnduranceSport[] {
  const runs = days.some(({ day }) => day.includesRun);
  return sports.filter((sport) => enabled.includes(sport) || (sport === "running" && runs));
}
