import type { BlueprintExercise } from "./program-blueprint";
import type { SetLengthUnit } from "@/lib/distance-units";
import { lengthRangeLabel, rangeLabel, restLabel } from "@/lib/labels";

function span(range: readonly [number, number] | null | undefined, suffix = ""): string {
  if (!range) return "—";
  return rangeLabel(range[0], range[1], suffix);
}

/**
 * What a slot asks for, shared with the browser without loading the blueprint validator.
 *
 * A carry reads in `length`: a screen passes the athlete's, and yards read as every other
 * target does ("3 × 17–33 yd", ADR 0055). In metres it is the range as the programme wrote it,
 * which is also what a programme change's text says (`program-diff` passes metres).
 */
export function exerciseTargets(exercise: BlueprintExercise, length: SetLengthUnit): string {
  const measure = exercise.duration
    ? span(exercise.duration, " s")
    : exercise.distance
      ? length === "m"
        ? span(exercise.distance, " m")
        : lengthRangeLabel(exercise.distance[0], exercise.distance[1], length)
      : `${span(exercise.reps)} reps`;
  const effort =
    exercise.duration || exercise.distance
      ? "report RPE"
      : `RIR ${exercise.rir ? span(exercise.rir) : "unspecified"}`;
  return [
    `${exercise.sets} × ${measure}${exercise.perSide ? " per side" : ""}`,
    effort,
    `rest ${restLabel(exercise.rest[0], exercise.rest[1])}`,
  ].join(" · ");
}
