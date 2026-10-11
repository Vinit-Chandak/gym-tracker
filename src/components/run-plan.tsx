import { DetailList } from "@/components/ui/detail-list";
import { PRESCRIBED_EFFORT } from "@/domain/activity-limits";
import { formatSportDistance, toMetres, type SportUnits } from "@/lib/distance-units";
import { holdFigures, joinFacts } from "@/lib/facts";
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

/**
 * "5 km · 25–30 min · Effort 2 of 5": how far, how long, and how hard. The programme writes the
 * distance in kilometres; it is read in the athlete's own road unit, as Today reads the same
 * run ("3.11 mi"). Effort is out of five since 0034, the scale the athlete answers on; a stored
 * zero means none was asked for, so it says nothing rather than "Effort 0".
 */
export function runSummary(run: RunTargets, units: SportUnits): string {
  const rpeMax = run.rpeMax ?? run.rpeMin;
  // Each held whole where the line wraps: a range at its dash, a figure to its unit, and the
  // scale to its top ("of 5").
  const parts = [
    run.distanceMinKm === null
      ? null
      : formatSportDistance(
          [
            toMetres(run.distanceMinKm, "km"),
            toMetres(run.distanceMaxKm ?? run.distanceMinKm, "km"),
          ],
          "running",
          units,
        ),
    rangeLabel(run.durationMinMinutes, run.durationMaxMinutes, " min"),
    run.rpeMin === null || run.rpeMin === undefined || !rpeMax
      ? null
      : `Effort ${rangeLabel(run.rpeMin, rpeMax)} of\u00a0${PRESCRIBED_EFFORT.max}`,
  ];
  return joinFacts(parts.map((part) => part && holdFigures(part)));
}

/** Whether the run says anything beyond how long and how hard. */
export function hasRunGuidance(run: RunTarget): boolean {
  return Boolean(run.paceNote || run.progressionNote || run.stopRule);
}

/** How to run it, once the duration and effort have already been said. */
export function RunPlanDetails({ run }: { run: RunTarget }) {
  return (
    <DetailList
      entries={[
        ["Pace", run.paceNote],
        ["Progression", run.progressionNote],
        ["Stop if", run.stopRule],
      ]}
    />
  );
}
