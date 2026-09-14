import type { PlanWarning, PlanWarningCode } from "./coach-review";

export type TrainingSport = "workout" | "run";

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
