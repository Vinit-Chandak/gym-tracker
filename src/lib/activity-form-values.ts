import type { EnduranceActual } from "@/domain/activity-metrics";

const text = (value: number | string | null | undefined) => (value == null ? "" : String(value));

/** Restore recorded values in their entered units, including unknowns and tenths of seconds. */
export function activityFormValues(actual: EnduranceActual): Record<string, string> {
  const duration = actual.sport === "swimming" ? actual.elapsedMs : actual.durationMs;
  const values = {
    environment: actual.environment,
    hours: String(Math.floor(duration / 3_600_000)),
    minutes: String(Math.floor((duration % 3_600_000) / 60_000)),
    seconds: String((duration % 60_000) / 1000),
    distanceValue: text(actual.distance?.value),
    distanceUnit: actual.distance?.unit ?? (actual.sport === "swimming" ? "m" : "km"),
    averageHeartRate: text(actual.averageHeartRate),
    maxHeartRate: text(actual.maxHeartRate),
  };
  if (actual.sport === "running")
    return {
      ...values,
      surface: text(actual.surface),
      elevationGainMetres: text(actual.elevationGainMetres),
      treadmillInclinePercent: text(actual.treadmillInclinePercent),
      cadenceStepsPerMinute: text(actual.cadenceStepsPerMinute),
    };
  if (actual.sport === "cycling")
    return {
      ...values,
      assistance: actual.assistance,
      resourceId: text(actual.resourceId),
      elevationGainMetres: text(actual.elevationGainMetres),
      averagePowerWatts: text(actual.averagePowerWatts),
      averageCadenceRpm: text(actual.averageCadenceRpm),
    };
  return {
    ...values,
    activeMinutes: actual.activeMs === null ? "" : String(Math.floor(actual.activeMs / 60_000)),
    activeSeconds: actual.activeMs === null ? "" : String((actual.activeMs % 60_000) / 1000),
    distanceMethod: actual.distanceMethod,
    poolLengthValue: text(actual.poolLength?.value),
    poolLengthUnit: actual.poolLength?.unit ?? "m",
    lengths: text(actual.lengths),
    stroke: actual.stroke,
    strokeCount: text(actual.strokeCount),
    resourceId: text(actual.resourceId),
  };
}
