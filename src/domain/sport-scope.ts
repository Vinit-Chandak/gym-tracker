import type { PlanWarning, PlanWarningCode } from "./coach-review";

/**
 * The sports a shared session row can be (ADR 0026); the `training_sport` enum in Postgres.
 *
 * `workout` and `run` keep the names they have always had, in the enum, in the shared tables
 * and in the v1 API, because renaming them would break every reader at once for no gain.
 * `cycle` and `swim` are added beside them, mapped to the canonical sport names in one place
 * (`domain/activity.ts`) and nowhere else (plan §9.2).
 */
export const TRAINING_SPORTS = ["workout", "run", "cycle", "swim"] as const;
export type TrainingSport = (typeof TRAINING_SPORTS)[number];

/** The two the v1 API and its golden payloads know about. A v1 reader sees only these. */
export const LEGACY_TRAINING_SPORTS = ["workout", "run"] as const;
export type LegacyTrainingSport = (typeof LEGACY_TRAINING_SPORTS)[number];

export function isLegacyTrainingSport(sport: TrainingSport): sport is LegacyTrainingSport {
  return sport === "workout" || sport === "run";
}

/** What the sport switch on the social screens calls each sport (plan §2). */
export const SPORT_LABELS: Record<TrainingSport, string> = {
  workout: "Lifting",
  run: "Running",
  cycle: "Cycling",
  swim: "Swimming",
};

/** Exhaustive routing also works for warnings saved before sport-specific displays existed. */
const WARNING_SPORT: Record<PlanWarningCode, TrainingSport> = {
  big_jump: "workout",
  volume_drift: "workout",
  low_rir: "workout",
  many_drops: "workout",
  run_jump: "run",
};

export function warningsForSport(warnings: readonly PlanWarning[], sport: TrainingSport) {
  return warnings.filter((warning) => WARNING_SPORT[warning.code] === sport);
}

/** Never guess the sport of legacy free text. Its original stays in the programme record. */
const DEFAULT_SUMMARY: Record<TrainingSport, string> = {
  workout: "Follow the exercise targets below.",
  run: "Follow the run targets below.",
  cycle: "Follow the ride targets below.",
  swim: "Follow the swim targets below.",
};

export function summaryForSport(
  plan: { sportSummaries?: Partial<Record<TrainingSport, string>> },
  sport: TrainingSport,
) {
  return plan.sportSummaries?.[sport] ?? DEFAULT_SUMMARY[sport];
}
