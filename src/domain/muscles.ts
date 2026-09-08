import type { MuscleGroup } from "./types";

/** Coarser headings used to group the exercise library. */
export const BODY_REGIONS = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "quads",
  "hamstrings",
  "glutes",
  "hips",
  "calves",
  "core",
] as const;
export type BodyRegion = (typeof BODY_REGIONS)[number];

export const MUSCLE_REGION: Record<MuscleGroup, BodyRegion> = {
  chest: "chest",
  lats: "back",
  upper_back: "back",
  traps: "back",
  lower_back: "back",
  front_delts: "shoulders",
  side_delts: "shoulders",
  rear_delts: "shoulders",
  biceps: "biceps",
  triceps: "triceps",
  forearms: "forearms",
  quads: "quads",
  hamstrings: "hamstrings",
  glutes: "glutes",
  adductors: "hips",
  abductors: "hips",
  hip_flexors: "hips",
  calves: "calves",
  abs: "core",
  obliques: "core",
};

/** The region an exercise is filed under: that of its first primary muscle. */
export function regionOf(primaryMuscles: readonly MuscleGroup[]): BodyRegion {
  const first = primaryMuscles[0];
  return first ? MUSCLE_REGION[first] : "core";
}

export function groupByRegion<T extends { primaryMuscles: readonly MuscleGroup[] }>(
  items: readonly T[],
): { region: BodyRegion; items: T[] }[] {
  const buckets = new Map<BodyRegion, T[]>();
  for (const item of items) {
    const region = regionOf(item.primaryMuscles);
    const bucket = buckets.get(region);
    if (bucket) bucket.push(item);
    else buckets.set(region, [item]);
  }
  return BODY_REGIONS.filter((region) => buckets.has(region)).map((region) => ({
    region,
    items: buckets.get(region) ?? [],
  }));
}
