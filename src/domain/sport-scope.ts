import type { PlanWarning, PlanWarningCode } from "./coach-review";

/** The sports a shared session row can be (ADR 0026); the `training_sport` enum in Postgres. */
export const TRAINING_SPORTS = ["workout", "run"] as const;
export type TrainingSport = (typeof TRAINING_SPORTS)[number];

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
export function summaryForSport(
  plan: { sportSummaries?: Partial<Record<TrainingSport, string>> },
  sport: TrainingSport,
) {
  return (
    plan.sportSummaries?.[sport] ??
    (sport === "workout" ? "Follow the exercise targets below." : "Follow the run targets below.")
  );
}
