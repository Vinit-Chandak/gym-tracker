import type { EnduranceActual } from "@/domain/activity-metrics";
import { climbIn, climbUnit, type SportUnits } from "@/lib/distance-units";

/** One figure an activity's page reads two by two: its name, the figure, and its unit. */
export type ActivityStat = { label: string; figure: string; unit?: string };

/**
 * What else an activity recorded, where it was given, after its distance, time, pace and effort:
 * the climb, in feet beside miles and in metres beside kilometres as the form takes it, and the
 * heart rate. They were typed into the form and never shown, which read as though they had not
 * been kept (year audit, October 2026: a run's 89 m of climb).
 */
export function recordedExtras(actual: EnduranceActual, units: SportUnits): ActivityStat[] {
  const stats: ActivityStat[] = [];
  if (actual.sport !== "swimming" && actual.elevationGainMetres !== null) {
    const unit = climbUnit(units.distanceUnit);
    stats.push({
      label: "Elevation gain",
      figure: climbIn(actual.elevationGainMetres, unit).toLocaleString("en-GB"),
      unit,
    });
  }
  if (actual.averageHeartRate !== null)
    stats.push({
      label: "Average heart rate",
      figure: String(actual.averageHeartRate),
      unit: "bpm",
    });
  if (actual.maxHeartRate !== null)
    stats.push({ label: "Maximum heart rate", figure: String(actual.maxHeartRate), unit: "bpm" });
  return stats;
}
