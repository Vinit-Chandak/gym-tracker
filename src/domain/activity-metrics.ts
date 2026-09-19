import {
  fromMetres,
  roundTo,
  toMetres,
  type DistanceUnit,
  type PoolUnit,
} from "@/lib/distance-units";

import type {
  CyclingAssistance,
  CyclingEnvironment,
  EnduranceSport,
  RunningEnvironment,
  SwimDistanceMethod,
  SwimmingEnvironment,
  SwimStroke,
} from "./activity";
import {
  checkNumber,
  CYCLING_CADENCE,
  DECIMALS,
  DISTANCE_METRES,
  DURATION_MS,
  ELEVATION_GAIN_METRES,
  HEART_RATE,
  LENGTHS,
  POOL_LENGTH_NATIVE,
  POWER_WATTS,
  RUNNING_CADENCE,
  TEXT_LIMITS,
  TREADMILL_INCLINE_PERCENT,
  withinBound,
  withinPrecision,
  type LimitProblem,
} from "./activity-limits";

/**
 * What each endurance sport actually records, and what may honestly be derived from it
 * (plan §§4.3–4.6, 9.1).
 *
 * Every quantity here is entered by hand. Nothing is inferred from a sensor, a map or a
 * prescription: an unknown distance stays unknown rather than becoming the planned one, and a
 * pace is only calculated when both of the numbers it divides were actually recorded. The
 * gap between a swim's elapsed time and its swimming time is unclassified non-swimming time,
 * not measured rest.
 */

/** An entered quantity kept in its own unit, beside the metres everything compares. */
export type NativeDistance = { value: number; unit: DistanceUnit | PoolUnit; metres: number };

export function nativeDistance(value: number, unit: DistanceUnit | PoolUnit): NativeDistance {
  return { value, unit, metres: toMetres(value, unit) };
}

export type RunningActualV1 = {
  sport: "running";
  environment: RunningEnvironment;
  /** Required: a run is distance and duration, as it has always been here (RUN-01). */
  distance: NativeDistance;
  durationMs: number;
  surface: string | null;
  elevationGainMetres: number | null;
  treadmillInclinePercent: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  cadenceStepsPerMinute: number | null;
};

export type CyclingActualV1 = {
  sport: "cycling";
  environment: CyclingEnvironment;
  /** Total recorded ride time, stops included. */
  durationMs: number;
  /** Null is unknown; an explicit zero is a reported zero (CYCLE-01). */
  distance: NativeDistance | null;
  assistance: CyclingAssistance;
  resourceId: string | null;
  averagePowerWatts: number | null;
  averageCadenceRpm: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  elevationGainMetres: number | null;
};

export type SwimmingActualV1 = {
  sport: "swimming";
  environment: SwimmingEnvironment;
  /** Elapsed session time, rests included. */
  elapsedMs: number;
  /** Swimming time excluding rests, when the athlete knows it. */
  activeMs: number | null;
  distanceMethod: SwimDistanceMethod;
  /** Set for the manual method; derived and read-only for the lengths method. */
  distance: NativeDistance | null;
  poolLength: NativeDistance | null;
  lengths: number | null;
  stroke: SwimStroke;
  strokeCount: number | null;
  resourceId: string | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
};

export type EnduranceActual = RunningActualV1 | CyclingActualV1 | SwimmingActualV1;

/** One trip from one end of the pool to the other, times the pool's own length. */
export function distanceFromLengths(lengths: number, poolLength: NativeDistance): number {
  return roundTo(lengths * poolLength.metres, DECIMALS.distance);
}

/** The distance this record asserts, in metres, or null when it asserts none. */
export function actualDistanceMetres(actual: EnduranceActual): number | null {
  if (actual.sport === "running") return actual.distance.metres;
  if (actual.sport === "cycling") return actual.distance?.metres ?? null;
  if (actual.distanceMethod === "lengths")
    return actual.lengths !== null && actual.poolLength !== null
      ? distanceFromLengths(actual.lengths, actual.poolLength)
      : null;
  if (actual.distanceMethod === "manual") return actual.distance?.metres ?? null;
  return null;
}

/** The duration the parent activity stores: a swim's is its elapsed time. */
export function actualDurationMs(actual: EnduranceActual): number {
  return actual.sport === "swimming" ? actual.elapsedMs : actual.durationMs;
}

/** Seconds per kilometre, from the one recorded duration and the recorded distance. */
export function paceSecondsPerKm(metres: number, durationMs: number): number | null {
  if (!(metres > 0) || !(durationMs > 0)) return null;
  return (durationMs / 1000) * (1000 / metres);
}

/** Overall average speed in metres per second. Labelled overall, never "moving". */
export function speedMetresPerSecond(metres: number | null, durationMs: number): number | null {
  if (metres === null || !(durationMs > 0)) return null;
  return metres / (durationMs / 1000);
}

/**
 * Seconds per 100 m or 100 yd, from the swimming time only. An elapsed-only record has no
 * active pace: dividing by elapsed time would silently count the rests as swimming.
 */
export function swimPaceSecondsPer100(
  actual: SwimmingActualV1,
  unit: PoolUnit = "m",
): number | null {
  const metres = actualDistanceMetres(actual);
  if (actual.activeMs === null || metres === null || !(metres > 0)) return null;
  const hundred = fromMetres(metres, unit) / 100;
  if (!(hundred > 0)) return null;
  return actual.activeMs / 1000 / hundred;
}

/** The unexplained remainder of a swim. Real, but not evidence of rest (AT-LOG-09). */
export function nonSwimmingMs(actual: SwimmingActualV1): number | null {
  if (actual.activeMs === null) return null;
  return actual.elapsedMs - actual.activeMs;
}

/** "5:30" per km or per 100. Display rounding only. */
export function formatPaceSeconds(seconds: number | null, decimals = 0): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const rounded = roundTo(seconds, decimals);
  const minutes = Math.floor(rounded / 60);
  const rest = roundTo(rounded - minutes * 60, decimals);
  const whole = Math.floor(rest);
  const fraction =
    decimals > 0
      ? roundTo(rest - whole, decimals)
          .toFixed(decimals)
          .slice(1)
      : "";
  return `${minutes}:${whole.toString().padStart(2, "0")}${fraction}`;
}

/** Kilometres or miles per hour, to one decimal. */
export function formatSpeed(metresPerSecond: number | null, unit: DistanceUnit = "km"): string {
  if (metresPerSecond === null) return "—";
  const perHour = fromMetres(metresPerSecond * 3600, unit);
  return `${roundTo(perHour, 1)} ${unit === "km" ? "km/h" : "mph"}`;
}

function checkOptional(
  problems: LimitProblem[],
  field: string,
  value: number | null,
  bound: { min: number; max: number },
  places: number,
  label: string,
): void {
  if (value === null) return;
  const problem = checkNumber(field, value, bound, places, label);
  if (problem) problems.push(problem);
}

function checkHeartRates(
  problems: LimitProblem[],
  average: number | null,
  max: number | null,
): void {
  checkOptional(
    problems,
    "averageHeartRate",
    average,
    HEART_RATE,
    DECIMALS.heartRate,
    "average heart rate",
  );
  checkOptional(
    problems,
    "maxHeartRate",
    max,
    HEART_RATE,
    DECIMALS.heartRate,
    "maximum heart rate",
  );
  if (average !== null && max !== null && max < average)
    problems.push({
      field: "maxHeartRate",
      message: "Maximum heart rate cannot be below the average.",
    });
}

function checkDuration(
  problems: LimitProblem[],
  field: string,
  value: number,
  label: string,
): void {
  if (!Number.isInteger(value))
    problems.push({ field, message: `Enter ${label} in whole milliseconds.` });
  else if (!withinBound(value, DURATION_MS))
    problems.push({ field, message: `Enter ${label} as more than zero and under seven days.` });
}

function checkDistanceValue(
  problems: LimitProblem[],
  field: string,
  distance: NativeDistance,
  sport: EnduranceSport,
  label: string,
): void {
  if (!withinPrecision(distance.value, DECIMALS.distance))
    problems.push({ field, message: `Enter ${label} to at most six decimal places.` });
  else if (!withinBound(distance.metres, DISTANCE_METRES[sport]))
    problems.push({
      field,
      message: `Enter ${label} up to ${DISTANCE_METRES[sport].max / 1000} km.`,
    });
  else if (Math.abs(distance.metres - toMetres(distance.value, distance.unit)) > 1e-6)
    problems.push({ field, message: "The stored metres do not match the entered distance." });
}

/**
 * Everything intrinsic to one sport's measurements. Ownership, origin and identity are checked
 * where the write happens; this is the part a form, a server schema and a database check all
 * have to agree about.
 */
export function validateActual(actual: EnduranceActual): LimitProblem[] {
  const problems: LimitProblem[] = [];
  if (actual.sport === "running") {
    checkDuration(problems, "duration", actual.durationMs, "the duration");
    if (!(actual.distance.metres > 0))
      problems.push({ field: "distance", message: "Enter how far you ran." });
    else checkDistanceValue(problems, "distance", actual.distance, "running", "the distance");
    if (actual.surface !== null && actual.surface.length > TEXT_LIMITS.surface)
      problems.push({ field: "surface", message: "Keep the surface under 80 characters." });
    checkOptional(
      problems,
      "elevationGainMetres",
      actual.elevationGainMetres,
      ELEVATION_GAIN_METRES,
      DECIMALS.elevation,
      "elevation gain",
    );
    checkOptional(
      problems,
      "treadmillInclinePercent",
      actual.treadmillInclinePercent,
      TREADMILL_INCLINE_PERCENT,
      DECIMALS.incline,
      "the incline",
    );
    if (actual.treadmillInclinePercent !== null && actual.environment !== "treadmill")
      problems.push({
        field: "treadmillInclinePercent",
        message: "An incline belongs to a treadmill run.",
      });
    checkOptional(
      problems,
      "cadenceStepsPerMinute",
      actual.cadenceStepsPerMinute,
      RUNNING_CADENCE,
      DECIMALS.cadence,
      "cadence",
    );
    checkHeartRates(problems, actual.averageHeartRate, actual.maxHeartRate);
    return problems;
  }

  if (actual.sport === "cycling") {
    checkDuration(problems, "duration", actual.durationMs, "the duration");
    if (actual.distance !== null)
      checkDistanceValue(problems, "distance", actual.distance, "cycling", "the distance");
    checkOptional(
      problems,
      "averagePowerWatts",
      actual.averagePowerWatts,
      POWER_WATTS,
      DECIMALS.power,
      "average power",
    );
    checkOptional(
      problems,
      "averageCadenceRpm",
      actual.averageCadenceRpm,
      CYCLING_CADENCE,
      DECIMALS.cadence,
      "average cadence",
    );
    checkOptional(
      problems,
      "elevationGainMetres",
      actual.elevationGainMetres,
      ELEVATION_GAIN_METRES,
      DECIMALS.elevation,
      "elevation gain",
    );
    checkHeartRates(problems, actual.averageHeartRate, actual.maxHeartRate);
    return problems;
  }

  checkDuration(problems, "elapsed", actual.elapsedMs, "the elapsed time");
  if (actual.activeMs !== null) {
    checkDuration(problems, "activeMs", actual.activeMs, "the swimming time");
    if (actual.activeMs > actual.elapsedMs)
      problems.push({
        field: "activeMs",
        message: "Swimming time cannot be longer than the elapsed time.",
      });
  }
  if (actual.distanceMethod === "lengths") {
    if (actual.environment === "open_water")
      problems.push({
        field: "distanceMethod",
        message: "Lengths belong to a pool. Enter an open-water distance yourself.",
      });
    if (actual.poolLength === null)
      problems.push({ field: "poolLength", message: "Enter the pool's length." });
    else if (
      !withinPrecision(actual.poolLength.value, DECIMALS.poolLength) ||
      !(actual.poolLength.value > POOL_LENGTH_NATIVE.min) ||
      actual.poolLength.value > POOL_LENGTH_NATIVE.max
    )
      problems.push({ field: "poolLength", message: "Enter a pool length up to 1,000." });
    if (actual.lengths === null)
      problems.push({ field: "lengths", message: "Enter how many lengths you swam." });
    else if (!Number.isInteger(actual.lengths) || !withinBound(actual.lengths, LENGTHS))
      problems.push({ field: "lengths", message: "Enter lengths as a whole number." });
    if (actual.distance !== null)
      problems.push({
        field: "distance",
        message: "With lengths, the distance is worked out from the pool. Clear one of them.",
      });
  }
  if (actual.distanceMethod === "manual") {
    if (actual.distance === null)
      problems.push({ field: "distance", message: "Enter how far you swam." });
    else checkDistanceValue(problems, "distance", actual.distance, "swimming", "the distance");
    if (actual.lengths !== null)
      problems.push({
        field: "lengths",
        message: "A hand-entered distance and a length count cannot both be the total.",
      });
  }
  if (actual.distanceMethod === "unknown" && (actual.distance !== null || actual.lengths !== null))
    problems.push({
      field: "distanceMethod",
      message: "Choose how the distance was measured, or leave it unknown with no total.",
    });
  if (actual.environment === "open_water" && actual.poolLength !== null)
    problems.push({ field: "poolLength", message: "An open-water swim has no pool length." });
  const derived = actualDistanceMetres(actual);
  if (derived !== null && !withinBound(derived, DISTANCE_METRES.swimming))
    problems.push({ field: "distance", message: "That swim distance is beyond 1,000 km." });
  checkOptional(
    problems,
    "strokeCount",
    actual.strokeCount,
    { min: 0, max: 1_000_000 },
    0,
    "the stroke count",
  );
  checkHeartRates(problems, actual.averageHeartRate, actual.maxHeartRate);
  return problems;
}

/** Blank measurements for a sport. Opening a plan never prefills what was prescribed. */
export function emptyActual(sport: "cycling"): CyclingActualV1;
export function emptyActual(sport: "swimming"): SwimmingActualV1;
export function emptyActual(sport: "cycling" | "swimming"): EnduranceActual {
  if (sport === "cycling")
    return {
      sport: "cycling",
      environment: "outdoor",
      durationMs: 0,
      distance: null,
      assistance: "unknown",
      resourceId: null,
      averagePowerWatts: null,
      averageCadenceRpm: null,
      averageHeartRate: null,
      maxHeartRate: null,
      elevationGainMetres: null,
    };
  return {
    sport: "swimming",
    environment: "pool",
    elapsedMs: 0,
    activeMs: null,
    distanceMethod: "unknown",
    distance: null,
    poolLength: null,
    lengths: null,
    stroke: "unspecified",
    strokeCount: null,
    resourceId: null,
    averageHeartRate: null,
    maxHeartRate: null,
  };
}
