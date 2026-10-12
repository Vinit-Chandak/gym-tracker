import type { FormState, PrintPart, StrengthColumn } from "@/components/art/geometry";
import { exerciseColumn, planColumn, warmupFan, warmupState } from "@/components/art/session-print";
import type { ActivitySport, EnduranceSport } from "@/domain/activity";
import { pairBySlot, type PrintedSession } from "@/domain/session-print";
import { exerciseOnMachine } from "@/lib/labels";
import type { PlannedDayResolution } from "@/server/repositories/availability";
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

/** A part of a programme day, as its rows and its print name it. */
export type DayPart = "warm-up" | "run" | "lifting";

/**
 * The order a programme day's parts come in, the same for its rows, its print and what the print
 * says: the order they are done in. The warm-up comes before what it warms up for: on a day that
 * only runs it is the run's ("Run warm-up"), so it leads, where it once followed the run and read
 * as a cool-down (year audit, October 2026). On a day that lifts and runs it is the lifting's,
 * and the run stands where the day is written to have it (`runLeads`): before the warm-up and
 * the lifting ("Easy Run + Arms"), or after them ("Lower + easy run").
 */
export function dayOrder(
  day: Pick<ScheduleDay, "name" | "focus" | "includesLifting">,
): readonly DayPart[] {
  if (!day.includesLifting) return ["warm-up", "run", "lifting"];
  return runLeads(day) ? ["run", "warm-up", "lifting"] : ["warm-up", "lifting", "run"];
}

/**
 * A programme day as a print (boards Training, Programme day), its parts in the order of its
 * rows (`dayOrder`): a rest day's routine, a run's warm-up, or on the day's own page the
 * lifting's, as a fan of its drills; the run; and a column of sets for each exercise, a
 * superset's two standing closer. A rest day with nothing in it is the rest form.
 *
 * A day with a workout, open or finished, is drawn from it, as the workout's own print draws
 * it: each row's column is the column of the exercise done for it (`exerciseColumn`), and the
 * fan stands as its warm-up does (`warmupState`). Open, the sets logged ink the plan and what is
 * owed stays thinned; finished, the working sets done, what was not done dashed. A plan's print,
 * it draws no warm-up sets, so Training's tiles keep the module their plans need. That holds
 * whatever the day's state: a day done once and done again ("Do again") is drawn from the
 * workout under way. A day with no workout is drawn by its state, every set inked once done.
 */
export function programmeDayParts(
  plan: Pick<ProgramDayPlan, "day" | "exercises" | "status">,
  {
    drills = 0,
    warmup = false,
    session = null,
  }: {
    drills?: number;
    warmup?: boolean;
    /** The day's workout: the one open for it, else the one that did it this cycle. */
    session?: PrintedSession | null;
  } = {},
): PrintPart[] {
  const state = dayState(plan.status);
  const columns: StrengthColumn[] = [];
  const done = session
    ? pairBySlot(
        plan.exercises.map((exercise) => ({
          slotId: exercise.programExerciseId,
          exerciseId: exercise.exerciseId,
        })),
        session.exercises,
      )
    : [];
  plan.exercises.forEach((exercise, index) => {
    if (exercise.sets <= 0) return;
    const next = plan.exercises[index + 1];
    const pair = exercise.supersetGroup !== null && next?.supersetGroup === exercise.supersetGroup;
    const column = session
      ? exerciseColumn(exercise.sets, done[index] ?? null, session.completed, {
          pair,
          warmups: false,
        })
      : planColumn(exercise.sets, state === "done" ? exercise.sets : 0, {
          skipped: state === "skipped",
          pair,
        });
    if (column) columns.push(column);
  });
  const drawn: Record<DayPart, PrintPart | null> = {
    "warm-up":
      drills > 0 && (warmup || !plan.day.includesLifting)
        ? warmupFan(drills, session ? warmupState(session) : state)
        : null,
    run: plan.day.includesRun ? { kind: "run", state } : null,
    lifting: columns.length > 0 ? { kind: "strength", columns } : null,
  };
  const parts = dayOrder(plan.day)
    .map((part) => drawn[part])
    .filter((part): part is PrintPart => part !== null);
  // A rest day with no routine is rest, drawn as rest: a tile among the days' prints is never
  // blank paper.
  if (parts.length === 0 && !plan.day.includesLifting && !plan.day.includesRun)
    parts.push({ kind: "rest", state });
  return parts;
}

/**
 * The largest module the day's own page draws a rest day's crescent at. Left to fill its band it
 * stood as tall as the band, the largest thing on a page that asks for nothing; at this it is
 * about a third of a working day's print there, and still more than Training's tile gives it.
 */
export const REST_PAGE_MODULE = 16;

/** The module the day's own page caps its print at: a print of rest alone stays quiet. */
export function dayPageMaxModule(parts: readonly PrintPart[]): number | undefined {
  return parts.length > 0 && parts.every((part) => part.kind === "rest")
    ? REST_PAGE_MODULE
    : undefined;
}

/**
 * What the day's own print says for a screen reader, its parts in the print's order: "Easy
 * Run + Arms: the run, 4 exercises", "Easy run: the warm-up, the run", "Rest: the routine",
 * "Rest: nothing to train, done"; done, what its workout left dashed ("Pull A: the warm-up, 4
 * exercises, done, the warm-up not done, dashed"); and while its workout is open, how far it has
 * got, the warm-up and the sets each said for itself ("Lower: the warm-up, 4 exercises, the
 * warm-up done, the sets done inked"). A day done once and being done again is said as its open
 * workout, not as done.
 */
export function dayPrintLabel(
  plan: Pick<ProgramDayPlan, "day" | "exercises" | "run" | "status">,
  parts: readonly PrintPart[],
  drills: number,
  open = false,
): string {
  const { day } = plan;
  const exercises = plan.exercises.length;
  const named: Record<DayPart, string | null> = {
    // A rest day's drills are its routine; a day that trains warms up for it.
    "warm-up":
      drills > 0 ? (day.includesLifting || day.includesRun ? "the warm-up" : "the routine") : null,
    run: plan.run ? "the run" : null,
    lifting: exercises > 0 ? `${exercises} ${exercises === 1 ? "exercise" : "exercises"}` : null,
  };
  const said = [
    ...dayOrder(day).map((part) => named[part]),
    parts.some((part) => part.kind === "rest") ? "nothing to train" : null,
  ];
  const notDone = parts.reduce(
    (count, part) =>
      count +
      (part.kind === "strength" ? part.columns.filter((column) => column.skipped).length : 0),
    0,
  );
  const progress =
    plan.status === "completed" && !open
      ? [
          "done",
          // Drawn from its workout, what it did not do is dashed, and said so.
          day.includesLifting &&
          parts.some((part) => part.kind === "mobility" && part.state === "skipped")
            ? "the warm-up not done, dashed"
            : null,
          notDone > 0
            ? `${notDone} ${notDone === 1 ? "exercise" : "exercises"} not done, dashed`
            : null,
        ]
      : [
          day.includesLifting &&
          parts.some((part) => part.kind === "mobility" && part.state === "done")
            ? "the warm-up done"
            : null,
          parts.some(
            (part) => part.kind === "strength" && part.columns.some((column) => column.done > 0),
          )
            ? "the sets done inked"
            : null,
        ];
  return `${day.name}: ${[...said, ...progress].filter(Boolean).join(", ")}`;
}

/**
 * What a day's exercises become at the athlete's default gym, where that is news: the fallback
 * starting the day there will put in its place ("At Planet Fitness: Smith machine bench press"),
 * or that nothing there will do. Read from the resolution the start itself uses
 * (`resolvePlannedDay`), keyed by the programme's slot. A day page listed Barbell bench to a
 * lifter whose gym has no barbell, with no word of the Smith machine it would be (year audit).
 */
export function atGymLines(
  resolved: readonly Pick<PlannedDayResolution, "programExerciseId" | "decision">[],
  gymName: string,
): Map<string, string> {
  const lines = new Map<string, string>();
  for (const { programExerciseId, decision } of resolved) {
    const r = decision.resolution;
    if (r.status === "fallback")
      lines.set(
        programExerciseId,
        `At ${gymName}: ${exerciseOnMachine(decision.resolvedExerciseName, r.equipmentInstance?.name)}`,
      );
    else if (r.status === "unavailable")
      lines.set(programExerciseId, `At ${gymName}: not available, and no fallback fits`);
  }
  return lines;
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
