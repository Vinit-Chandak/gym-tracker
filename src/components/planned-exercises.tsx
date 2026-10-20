import { Figures } from "@/components/ui/figures";
import { setTargetIn, type SetLengthUnit } from "@/lib/distance-units";
import { FACT_SEPARATOR, holdFigures, joinFacts } from "@/lib/facts";
import { lengthRangeLabel, measureUnitSuffix, rangeLabel } from "@/lib/labels";
import { supersetHues, supersetStyle, type SupersetHue } from "@/lib/superset-colors";
import { cn } from "@/lib/utils";
import type { PlannedExercisePreview } from "@/server/repositories/schedule";

/**
 * The range in the exercise's own measure: "8–12", "20–45 s", "20–30 m", a carry in the
 * athlete's length ("22–33 yd" beside miles).
 */
export function volumeRange(exercise: PlannedExercisePreview, length: SetLengthUnit): string {
  switch (exercise.prescriptionType) {
    case "duration":
      return rangeLabel(
        exercise.durationMinSeconds,
        exercise.durationMaxSeconds,
        measureUnitSuffix("duration", length),
      );
    case "distance":
      return lengthRangeLabel(exercise.distanceMinMeters, exercise.distanceMaxMeters, length);
    default:
      return rangeLabel(exercise.repMin, exercise.repMax);
  }
}

/** "3 × 8–12 @ 1 RIR", "2 × 20–45 s per side @ 1–2 RIR", "3 × 20 m @ 2 RIR". */
export function prescription(exercise: PlannedExercisePreview, length: SetLengthUnit): string {
  const volume = `${exercise.sets} × ${volumeRange(exercise, length)}`;
  return `${volume}${exercise.perSide ? " per side" : ""} @ ${rangeLabel(exercise.rirMin, exercise.rirMax)} RIR`;
}

/** Working sets in a day, which is what its length actually depends on. */
export function totalSets(exercises: readonly PlannedExercisePreview[]): number {
  return exercises.reduce((sets, exercise) => sets + exercise.sets, 0);
}

/**
 * "6 exercises · 15 sets", the one line that says what a day costs: each count held to its noun
 * and the dot to the count after it, so a narrow line breaks only before the dot.
 */
export function planSummary(exercises: readonly PlannedExercisePreview[]): string {
  const count = exercises.length;
  const sets = totalSets(exercises);
  return joinFacts([
    `${count}\u00a0${count === 1 ? "exercise" : "exercises"}`,
    `${sets}\u00a0${sets === 1 ? "set" : "sets"}`,
  ]);
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
 * bracket in ink around its group rather than a marker on each of its rows.
 */
export function PlannedExerciseList({
  exercises,
  length,
}: {
  exercises: readonly PlannedExercisePreview[];
  /** What a carry's range reads in: the athlete's metres or yards. */
  length: SetLengthUnit;
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
              <p className="text-sm [overflow-wrap:break-word]">{exercise.name}</p>
              {/* Its figures in Jost, each range held at its dash: "@ 1–" never ends a line. */}
              <p className="mt-0.5 text-xs text-ink-muted tabular-nums">
                <Figures>{holdFigures(prescription(exercise, length))}</Figures>
              </p>
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}

type TargetLike = {
  setType: string;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  rpe?: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

/**
 * Targets a coach wrote, as a row says them: the load leads, then the sets, and "@" is RIR
 * alone ("60 kg · 3 × 5 @ 2, 2, 1 RIR"); a set rated by effort says RPE ("32 kg · 3 × 30 m ·
 * RPE 7"), its distance in the athlete's length, as the least figure that reaches it
 * (`setTargetIn`). Warm-ups are left out unless they are all there is. Null when nothing is set.
 */
export function targetsLine(
  sets: readonly TargetLike[],
  unit: string,
  length: SetLengthUnit,
  perSide = false,
): string | null {
  const working = sets.filter((set) => set.setType !== "warmup");
  const shown = working.length > 0 ? working : sets;
  const first = shown[0];
  if (!first) return null;
  const all = <T,>(pick: (set: TargetLike) => T) => shown.every((set) => pick(set) === pick(first));
  const list = <T,>(pick: (set: TargetLike) => T, joiner: string) =>
    all(pick) ? `${pick(first) ?? "—"}` : shown.map((set) => pick(set) ?? "—").join(joiner);
  const load =
    first.weight === null ? "" : `${list((set) => set.weight, "/")} ${unit}${FACT_SEPARATOR}`;
  const volume =
    first.reps === null && first.distanceMeters !== null
      ? `${list((set) => (set.distanceMeters === null ? null : setTargetIn(set.distanceMeters, length)), "/")} ${length}`
      : first.reps === null && first.durationSeconds !== null
        ? `${list((set) => set.durationSeconds, "/")} s`
        : list((set) => set.reps, "/");
  const effort =
    first.reps === null
      ? first.rpe != null
        ? `${FACT_SEPARATOR}RPE ${list((set) => set.rpe ?? null, ", ")}`
        : ""
      : first.rir === null
        ? ""
        : ` @ ${list((set) => set.rir, ", ")} RIR`;
  return `${load}${shown.length} × ${volume}${perSide ? " per side" : ""}${effort}`;
}
