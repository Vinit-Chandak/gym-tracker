import type { EnduranceActual } from "@/domain/activity-metrics";
import { percentOfMax, zoneOf, ZONE_NAMES, type ResolvedHeartRate } from "@/domain/heart-rate";
import { climbIn, climbUnit, type SportUnits } from "@/lib/distance-units";

/**
 * One figure an activity's page reads two by two: its name, the figure, and its unit, with a
 * word under it where the figure needs one ("Zone 3 · Aerobic").
 */
export type ActivityStat = { label: string; figure: string; unit?: string; note?: string };

/** Where a reading sits against the athlete's zones: "Zone 3 · Aerobic", "Below zone 1". */
function zoneNote(bpm: number, heartRate: ResolvedHeartRate | null): string | undefined {
  if (!heartRate) return undefined;
  const zone = zoneOf(bpm, heartRate.zones);
  return zone === 0 ? "Below zone 1" : `Zone ${zone} · ${ZONE_NAMES[zone]}`;
}

/**
 * What else an activity recorded, where it was given, after its distance, time, pace and effort:
 * the climb, in feet beside miles and in metres beside kilometres as the form takes it, and the
 * heart rate. They were typed into the form and never shown, which read as though they had not
 * been kept (year audit, October 2026: a run's 89 m of climb).
 */
export function recordedExtras(
  actual: EnduranceActual,
  units: SportUnits,
  heartRate: ResolvedHeartRate | null = null,
): ActivityStat[] {
  const stats: ActivityStat[] = [];
  if (actual.sport !== "swimming" && actual.elevationGainMetres !== null) {
    const unit = climbUnit(units.distanceUnit);
    stats.push({
      label: "Elevation gain",
      figure: climbIn(actual.elevationGainMetres, unit).toLocaleString("en-GB"),
      unit,
    });
  }
  // Each against the athlete's own zones and maximum, where those are known (ADR 0059).
  if (actual.averageHeartRate !== null)
    stats.push({
      label: "Average heart rate",
      figure: String(actual.averageHeartRate),
      unit: "bpm",
      note: zoneNote(actual.averageHeartRate, heartRate),
    });
  if (actual.maxHeartRate !== null)
    stats.push({
      label: "Maximum heart rate",
      figure: String(actual.maxHeartRate),
      unit: "bpm",
      note: heartRate ? `${percentOfMax(actual.maxHeartRate, heartRate.max)}% of max` : undefined,
    });
  // A run's own details, kept since running had its own form and never shown until now.
  if (actual.sport === "running") {
    if (actual.cadenceStepsPerMinute !== null)
      stats.push({
        label: "Cadence",
        figure: String(Math.round(actual.cadenceStepsPerMinute)),
        unit: "spm",
      });
    if (actual.treadmillInclinePercent !== null)
      stats.push({
        label: "Incline",
        figure: actual.treadmillInclinePercent.toLocaleString("en-GB"),
        unit: "%",
      });
    if (actual.surface !== null) stats.push({ label: "Surface", figure: actual.surface });
  }
  return stats;
}
