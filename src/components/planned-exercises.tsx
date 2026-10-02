import type { ReactNode } from "react";

import { MEASURE_UNIT_SUFFIX, rangeLabel } from "@/lib/labels";
import { supersetHues, supersetStyle, type SupersetHue } from "@/lib/superset-colors";
import { cn } from "@/lib/utils";
import type { PlannedExercisePreview } from "@/server/repositories/schedule";

/** The range in the exercise's own measure: "8–12", "20–45 s", "20–30 m". */
export function volumeRange(exercise: PlannedExercisePreview): string {
  const suffix = MEASURE_UNIT_SUFFIX[exercise.prescriptionType];
  switch (exercise.prescriptionType) {
    case "duration":
      return rangeLabel(exercise.durationMinSeconds, exercise.durationMaxSeconds, suffix);
    case "distance":
      return rangeLabel(exercise.distanceMinMeters, exercise.distanceMaxMeters, suffix);
    default:
      return rangeLabel(exercise.repMin, exercise.repMax);
  }
}

/** "3 × 8–12 @ 1 RIR", "2 × 20–45 s per side @ 1–2 RIR", "3 × 20 m @ 2 RIR". */
export function prescription(exercise: PlannedExercisePreview): string {
  const volume = `${exercise.sets} × ${volumeRange(exercise)}`;
  return `${volume}${exercise.perSide ? " per side" : ""} @ ${rangeLabel(exercise.rirMin, exercise.rirMax)} RIR`;
}

/** Working sets in a day, which is what its length actually depends on. */
export function totalSets(exercises: readonly PlannedExercisePreview[]): number {
  return exercises.reduce((sets, exercise) => sets + exercise.sets, 0);
}

/** "6 exercises · 15 sets", the one line that says what a day costs. */
export function planSummary(exercises: readonly PlannedExercisePreview[]): string {
  const count = exercises.length;
  const sets = totalSets(exercises);
  return `${count} ${count === 1 ? "exercise" : "exercises"} · ${sets} ${sets === 1 ? "set" : "sets"}`;
}

/**
 * One row of the plan as the sheet writes it: the number in the margin, the name, and the
 * prescription in the data voice beneath. Every row is the same shape whatever the name's
 * length, so the eye finds the prescriptions in one column. A superset's rows share a rule
 * in their group's pen down the left, which is how rows say they belong together.
 */
export function PlanRow({
  number,
  name,
  detail,
  note,
  hue,
  struck = false,
}: {
  number: number;
  name: ReactNode;
  detail: string;
  /** The coach's line about this exercise, in the coach's hand. */
  note?: string | null;
  hue?: SupersetHue;
  struck?: boolean;
}) {
  return (
    <li
      className={cn("flex min-w-0 items-baseline gap-3 py-2.5", hue && "-ml-2 pl-2 superset-row")}
      style={hue ? supersetStyle(hue) : undefined}
    >
      <span className="w-5 shrink-0 font-data text-sm font-medium text-ink-subtle tabular-nums">
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "font-medium [overflow-wrap:anywhere]",
            struck && "text-ink-subtle line-through",
          )}
        >
          {name}
        </p>
        <p className="mt-0.5 font-data text-sm text-ink-muted tabular-nums">{detail}</p>
        {note && <p className="mt-1 text-sm [overflow-wrap:anywhere] text-pen">{note}</p>}
      </div>
    </li>
  );
}

/** A day's exercises, numbered, in programme order. */
export function PlannedExerciseList({
  exercises,
}: {
  exercises: readonly PlannedExercisePreview[];
}) {
  const hues = supersetHues(exercises);
  return (
    <ol className="min-w-0 ruled-list">
      {exercises.map((exercise, index) => (
        <PlanRow
          key={exercise.programExerciseId}
          number={index + 1}
          name={exercise.name}
          detail={prescription(exercise)}
          hue={exercise.supersetGroup ? hues.get(exercise.supersetGroup) : undefined}
        />
      ))}
    </ol>
  );
}
