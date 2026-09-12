import { DetailList } from "@/components/ui/detail-list";
import { rangeLabel } from "@/lib/labels";
import type { RunTarget } from "@/server/repositories/schedule";

/**
 * What a planned run asks for, wherever it is shown. A run written as a distance is read as
 * one: with only the minutes on screen, an athlete cannot see the 5k they agreed to.
 */
export type RunTargets = {
  distanceMinKm: number | null;
  distanceMaxKm: number | null;
  durationMinMinutes: number;
  durationMaxMinutes: number;
  rpeMin?: number | null;
  rpeMax?: number | null;
};

/** "5 km · 25–30 min · RPE 3–4": how far, how long, and how hard. */
export function runSummary(run: RunTargets): string {
  const parts = [
    run.distanceMinKm === null
      ? null
      : rangeLabel(run.distanceMinKm, run.distanceMaxKm ?? run.distanceMinKm, " km"),
    rangeLabel(run.durationMinMinutes, run.durationMaxMinutes, " min"),
    run.rpeMin === null || run.rpeMin === undefined
      ? null
      : `RPE ${rangeLabel(run.rpeMin, run.rpeMax ?? run.rpeMin)}`,
  ];
  return parts.filter(Boolean).join(" · ");
}

/** Whether the run says anything beyond how long and how hard. */
export function hasRunGuidance(run: RunTarget): boolean {
  return Boolean(run.paceNote || run.progressionNote || run.shinRule);
}

/** How to run it, once the duration and effort have already been said. */
export function RunPlanDetails({ run }: { run: RunTarget }) {
  return (
    <DetailList
      entries={[
        ["Pace", run.paceNote],
        ["Progression", run.progressionNote],
        ["Shins", run.shinRule],
      ]}
    />
  );
}
