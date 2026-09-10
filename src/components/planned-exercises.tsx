import { rangeLabel } from "@/lib/labels";
import { supersetHues, supersetStyle, type SupersetHue } from "@/lib/superset-colors";
import { cn } from "@/lib/utils";
import type { PlannedExercisePreview } from "@/server/repositories/schedule";

/** "3 × 8–12 @ 1 RIR", or "2 × 20–45 s per side @ 1–2 RIR" for timed work. */
export function prescription(exercise: PlannedExercisePreview): string {
  const volume =
    exercise.prescriptionType === "duration"
      ? `${exercise.sets} × ${rangeLabel(exercise.durationMinSeconds, exercise.durationMaxSeconds, " s")}`
      : `${exercise.sets} × ${rangeLabel(exercise.repMin, exercise.repMax)}`;
  return `${volume}${exercise.perSide ? " per side" : ""} @ ${rangeLabel(exercise.rirMin, exercise.rirMax)} RIR`;
}

/** Working sets in a day, which is what its length actually depends on. */
export function totalSets(exercises: readonly PlannedExercisePreview[]): number {
  return exercises.reduce((sets, exercise) => sets + exercise.sets, 0);
}

/** "6 exercises · 15 sets", the one line that says what a day costs. */
export function planSummary(exercises: readonly PlannedExercisePreview[]): string {
  const count = exercises.length;
  return `${count} ${count === 1 ? "exercise" : "exercises"} · ${totalSets(exercises)} sets`;
}

type Block = { key: string; hue?: SupersetHue; items: PlannedExercisePreview[] };

/** Consecutive members of one superset, gathered so the group is drawn once, not per row. */
function blocks(exercises: readonly PlannedExercisePreview[]): Block[] {
  const hues = supersetHues(exercises);
  const grouped: Block[] = [];
  for (const exercise of exercises) {
    const hue = exercise.supersetGroup ? hues.get(exercise.supersetGroup) : undefined;
    const last = grouped[grouped.length - 1];
    if (hue && last && last.hue === hue) last.items.push(exercise);
    else grouped.push({ key: exercise.programExerciseId, hue, items: [exercise] });
  }
  return grouped;
}

/**
 * A day's exercises: one two-line entry each, the name over its prescription.
 *
 * Every entry is the same height whatever the name's length, which is the whole point. A
 * name and a prescription sharing one line only wrap on the long names, so a list of them
 * is part one-line rows and part two, with a rule between each — there is no rhythm to read
 * down. Here the eye finds the prescriptions in one column, and a superset takes a single
 * tinted bracket around its group rather than a marker on each of its rows.
 */
export function PlannedExerciseList({
  exercises,
}: {
  exercises: readonly PlannedExercisePreview[];
}) {
  return (
    <ul className="space-y-2.5">
      {blocks(exercises).map((block) => (
        <li
          key={block.key}
          className={cn(
            "min-w-0",
            block.hue && "space-y-2.5 rounded-r-control py-2 pl-2.5 superset-row",
          )}
          style={block.hue ? supersetStyle(block.hue) : undefined}
        >
          {block.items.map((exercise) => (
            <div key={exercise.programExerciseId} className="min-w-0">
              <p className="text-sm [overflow-wrap:anywhere]">{exercise.name}</p>
              <p className="mt-0.5 text-xs text-ink-muted tabular-nums">{prescription(exercise)}</p>
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}
