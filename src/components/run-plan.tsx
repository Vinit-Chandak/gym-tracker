import { DetailList } from "@/components/ui/detail-list";
import { Disclosure } from "@/components/ui/disclosure";
import { Glyph } from "@/components/ui/glyphs";
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
 * The minutes a time note says, when minutes are all it says: "40–50 min", "40-50 mins" and
 * "40 – 50 minutes" are 40 to 50, "45 min" is 45 to 45; "About 45 min" or "70 min + walk" say
 * more than a run's minutes, so they are not read as them.
 */
function noteMinutes(note: string | null): [number, number] | null {
  const match = note
    ?.replace(/\u2060/g, "")
    .match(/^\s*(\d+)(?:\s*[-–—]\s*(\d+))?\s*min(?:s|utes?)?\.?\s*$/i);
  if (!match) return null;
  const min = Number(match[1]);
  return [min, match[2] === undefined ? min : Number(match[2])];
}

/**
 * "5 km · 25–30 min · Effort 2 of 5": how far, how long, and how hard. The programme writes the
 * distance in kilometres; it is read in the athlete's own road unit, as Today reads the same
 * run ("3.11 mi"). Effort is out of five since 0034, the scale the athlete answers on; a stored
 * zero means none was asked for, so it says nothing rather than "Effort 0".
 *
 * Shown under the time of a day that only runs (`dayTime`, the time note it says above), the
 * minutes are left out where that time already says them: such a day said "40–50 min" in its
 * header and again in its Run row (year audit, October 2026). The note is written free, so it
 * is read for its minutes ("40-50 mins", "40–50 minutes"), not matched to the letter. A day that
 * also lifts gives the time of the whole day, so its run's minutes are always said.
 */
export function runSummary(
  run: RunTargets,
  units: SportUnits,
  { dayTime = null }: { dayTime?: string | null } = {},
): string {
  const rpeMax = run.rpeMax ?? run.rpeMin;
  const minutes = rangeLabel(run.durationMinMinutes, run.durationMaxMinutes, " min");
  const said = noteMinutes(dayTime);
  const saidAbove =
    said !== null && said[0] === run.durationMinMinutes && said[1] === run.durationMaxMinutes;
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
    saidAbove ? null : minutes,
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

/**
 * "Stop if the shin complains.", led by the warning glyph: a safety rule, said where it is seen
 * rather than folded away. A rule that does not say what it is for says "Stop if" first.
 */
export function StopRule({ rule, className }: { rule: string; className?: string }) {
  const said = /^\s*stop\b/i.test(rule);
  return (
    <p className={className ?? "flex items-start gap-1.5 type-meta-small text-ink"}>
      <Glyph name="warn" className="mt-0.5 glyph-16 shrink-0" />
      <span className="min-w-0 [overflow-wrap:break-word]">{said ? rule : `Stop if: ${rule}`}</span>
    </p>
  );
}

/**
 * How to run it, once the duration and effort have already been said: when to stop, in view,
 * and the pace and progression under How to do it, closed (DESIGN.md, The Need-to-Know Rule).
 * `folded={false}` where the day is itself a fold already opened.
 */
export function RunPlanDetails({ run, folded = true }: { run: RunTarget; folded?: boolean }) {
  const details = (
    <DetailList
      entries={[
        ["Pace", run.paceNote],
        ["Progression", run.progressionNote],
      ]}
    />
  );
  return (
    <div className="space-y-2.5">
      {run.stopRule && <StopRule rule={run.stopRule} />}
      {(run.paceNote || run.progressionNote) &&
        (folded ? (
          <Disclosure summary="How to do it" variant="inline">
            {details}
          </Disclosure>
        ) : (
          details
        ))}
    </div>
  );
}
