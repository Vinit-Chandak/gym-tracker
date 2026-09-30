import type { BlueprintExercise } from "./program-blueprint";
import { rangeLabel, restLabel } from "@/lib/labels";

function span(range: readonly [number, number] | null | undefined, suffix = ""): string {
  if (!range) return "—";
  return rangeLabel(range[0], range[1], suffix);
}

/** What a slot asks for, shared with the browser without loading the blueprint validator. */
export function exerciseTargets(exercise: BlueprintExercise): string {
  const measure = exercise.duration
    ? span(exercise.duration, " s")
    : exercise.distance
      ? span(exercise.distance, " m")
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
