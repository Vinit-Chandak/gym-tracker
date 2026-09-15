import { MUSCLE_REGION } from "./muscles";
import { MUSCLE_GROUPS, type MuscleGroup } from "./types";

/**
 * The six axes of the muscle-split radar (plan §3.10): coarse enough that a week of training
 * fills the shape, and the same six for everyone so two people's shapes can lie on one chart.
 */
export const SPLIT_GROUPS = ["Back", "Chest", "Core", "Shoulders", "Arms", "Legs"] as const;
export type SplitGroup = (typeof SPLIT_GROUPS)[number];

/** Which axis each of the twenty muscles counts toward, by way of its body region. */
export const MUSCLE_SPLIT_GROUP: Record<MuscleGroup, SplitGroup> = Object.fromEntries(
  MUSCLE_GROUPS.map((muscle) => {
    const region = MUSCLE_REGION[muscle];
    const group: SplitGroup =
      region === "chest"
        ? "Chest"
        : region === "back"
          ? "Back"
          : region === "shoulders"
            ? "Shoulders"
            : region === "core"
              ? "Core"
              : region === "biceps" || region === "triceps" || region === "forearms"
                ? "Arms"
                : "Legs";
    return [muscle, group];
  }),
) as Record<MuscleGroup, SplitGroup>;

export type MuscleSplit = Record<SplitGroup, number>;

/** Sets per muscle as a shared row stores them: only the muscles that were worked. */
export type MuscleSets = Partial<Record<MuscleGroup, number>>;

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Each axis's share of all the sets, summing to one; all zeros when nothing was trained. A
 * muscle name the app no longer knows is ignored rather than crashing a friend's page.
 */
export function muscleSplit(muscleSets: MuscleSets): MuscleSplit {
  const totals = Object.fromEntries(SPLIT_GROUPS.map((group) => [group, 0])) as MuscleSplit;
  let all = 0;
  for (const [muscle, sets] of Object.entries(muscleSets)) {
    const group = MUSCLE_SPLIT_GROUP[muscle as MuscleGroup];
    if (!group || typeof sets !== "number" || !(sets > 0)) continue;
    totals[group] += sets;
    all += sets;
  }
  if (all === 0) return totals;
  return Object.fromEntries(
    SPLIT_GROUPS.map((group) => [group, round(totals[group] / all)]),
  ) as MuscleSplit;
}

/** Adds one row's sets per muscle into a running total, for a period's split. */
export function addMuscleSets(into: MuscleSets, sets: MuscleSets): MuscleSets {
  for (const [muscle, n] of Object.entries(sets)) {
    if (typeof n !== "number" || !(n > 0)) continue;
    into[muscle as MuscleGroup] = (into[muscle as MuscleGroup] ?? 0) + n;
  }
  return into;
}
