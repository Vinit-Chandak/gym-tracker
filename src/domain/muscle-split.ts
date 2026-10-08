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

const isMuscle = (value: string): value is MuscleGroup =>
  (MUSCLE_GROUPS as readonly string[]).includes(value);

/**
 * The one axis an exercise is filed under (ADR 0043, 0044): its first primary muscle's, as the
 * exercise library files it. A squat is legs and a row is back, whatever else they work, so a
 * set is counted once and never once for each muscle it names. Null for an exercise naming no
 * muscle the app knows.
 */
export function splitGroupOf(primaryMuscles: readonly string[]): SplitGroup | null {
  const first = primaryMuscles.find(isMuscle);
  return first ? MUSCLE_SPLIT_GROUP[first] : null;
}

/** Working sets per axis, each set once, under its exercise's axis. */
export type GroupSets = Partial<Record<SplitGroup, number>>;

/**
 * Each axis's share of all the sets, summing to one; all zeros when nothing was trained. An
 * axis the app no longer knows is ignored rather than crashing a friend's page.
 */
export function muscleSplit(groupSets: GroupSets): MuscleSplit {
  const totals = Object.fromEntries(SPLIT_GROUPS.map((group) => [group, 0])) as MuscleSplit;
  let all = 0;
  for (const [group, sets] of Object.entries(groupSets)) {
    if (!(SPLIT_GROUPS as readonly string[]).includes(group)) continue;
    if (typeof sets !== "number" || !(sets > 0)) continue;
    totals[group as SplitGroup] += sets;
    all += sets;
  }
  if (all === 0) return totals;
  return Object.fromEntries(
    SPLIT_GROUPS.map((group) => [group, round(totals[group] / all)]),
  ) as MuscleSplit;
}
