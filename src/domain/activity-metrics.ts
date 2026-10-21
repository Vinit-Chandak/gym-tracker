import {
  fromMetres,
  METRES_PER_KM,
  METRES_PER_MILE,
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
import type { StepPhase } from "./activity-prescription";
import {
  checkNumber,
  CYCLING_CADENCE,
  DECIMALS,
  DISTANCE_METRES,
  DURATION_MS,
  ELEVATION_GAIN_METRES,
  HEART_RATE,
  LAP_LIMIT,
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
import type { RunType } from "./run-types";

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

/**
 * One lap or split of a run, as a watch lists them (ADR 0059): a rep of an interval session, the
 * jog after it, a mile of a long run. Its distance or its time may be unknown, never both — a
 * timed rep is a time whose distance nobody measured, and it stays unknown rather than becoming
 * the planned one. `phase` says what the lap was for, in the plan's words.
 */
export type RunningLap = {
  phase: StepPhase | null;
  distance: NativeDistance | null;
  durationMs: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
};

export type RunningActualV1 = {
  sport: "running";
  environment: RunningEnvironment;
  /** Required: a run is distance and duration, as it has always been here (RUN-01). */
  distance: NativeDistance;
  durationMs: number;
  /** What kind of run it was; null when the athlete did not say. */
  runType: RunType | null;
  surface: string | null;
  elevationGainMetres: number | null;
  treadmillInclinePercent: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  cadenceStepsPerMinute: number | null;
  /** In the order they were run. Empty when the run was recorded as a whole. */
  laps: RunningLap[];
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

/** A pace per kilometre, read per the athlete's unit: per mile is the same pace, 1.609344 km. */
export function pacePerUnit(secondsPerKm: number | null, unit: DistanceUnit): number | null {
  if (secondsPerKm === null) return null;
  return unit === "mi" ? secondsPerKm * (METRES_PER_MILE / METRES_PER_KM) : secondsPerKm;
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

/** The highest heart rate a run recorded, its laps included: what a new maximum is read from. */
export function runPeakHeartRate(actual: RunningActualV1): number | null {
  const readings = [actual.maxHeartRate, ...actual.laps.map((lap) => lap.maxHeartRate)].filter(
    (value): value is number => value !== null,
  );
  return readings.length > 0 ? Math.max(...readings) : null;
}

/** A lap's pace per kilometre, when both its distance and its time were recorded. */
export function lapPaceSecondsPerKm(lap: RunningLap): number | null {
  if (lap.distance === null || lap.durationMs === null) return null;
  return paceSecondsPerKm(lap.distance.metres, lap.durationMs);
}

/**
 * A lap's figures in one measure, whatever unit it was typed in: what the laps add up to, the
 * reps' pace and whether they make intervals are read from these, on the form as it is typed
 * and on the server as it is saved.
 */
export type LapFigures = {
  phase: StepPhase | null;
  /** Unknown, or for a recovery a standing rest, when null. */
  metres: number | null;
  durationMs: number | null;
};

export function lapFigures(lap: RunningLap): LapFigures {
  return { phase: lap.phase, metres: lap.distance?.metres ?? null, durationMs: lap.durationMs };
}

/**
 * What a run's laps add up to (owner, 21 October 2026, as a watch counts them): their distances
 * and their times. A recovery that is a time alone, a standing rest, adds no distance; a lap
 * without a time adds no time.
 */
export function lapTotals(laps: readonly LapFigures[]): { metres: number; durationMs: number } {
  let metres = 0;
  let durationMs = 0;
  for (const lap of laps) {
    if (lap.metres !== null && lap.metres > 0) metres += lap.metres;
    if (lap.durationMs !== null && lap.durationMs > 0) durationMs += lap.durationMs;
  }
  return { metres: roundTo(metres, DECIMALS.distance), durationMs };
}

/** Reps with recoveries between them make a session intervals (PRODUCT.md, principle 7). */
export function lapsMakeIntervals(laps: readonly Pick<LapFigures, "phase">[]): boolean {
  return laps.some((lap) => lap.phase === "work") && laps.some((lap) => lap.phase === "recovery");
}

/**
 * The reps' pace (DESIGN.md, Laps and intervals): the work laps that have both a distance and a
 * time, their distance over their time, and how many of them that is. A rep timed without a
 * distance is left out of it, not counted as standing still.
 */
export function repPace(
  laps: readonly LapFigures[],
): { secondsPerKm: number; reps: number } | null {
  const measured = laps.filter(
    (lap) =>
      lap.phase === "work" &&
      lap.metres !== null &&
      lap.metres > 0 &&
      lap.durationMs !== null &&
      lap.durationMs > 0,
  );
  const metres = measured.reduce((sum, lap) => sum + lap.metres!, 0);
  const durationMs = measured.reduce((sum, lap) => sum + lap.durationMs!, 0);
  const pace = paceSecondsPerKm(metres, durationMs);
  return pace === null ? null : { secondsPerKm: pace, reps: measured.length };
}

/**
 * Whether a run's own pace has its rests in it: a session the athlete calls intervals, or one
 * whose laps hold reps with recoveries between them, whatever kind it was called. Its distance
 * over its time is then the "Overall, with rests" figure, never the athlete's running pace.
 */
export function paceHasRests(actual: Pick<RunningActualV1, "runType" | "laps">): boolean {
  return actual.runType === "intervals" || lapsMakeIntervals(actual.laps);
}

/** The pace a run counts as: its own, or for a session with rests its reps'. */
export type RunPace =
  { kind: "overall"; secondsPerKm: number } | { kind: "reps"; secondsPerKm: number; reps: number };

/**
 * The pace a run counts as wherever a pace is read as the athlete's running pace — a trend, a
 * record, what the coach plans from (DESIGN.md, Laps and intervals): a continuous run's distance
 * over its time; for a session with rests, the reps' pace, or none where no rep has both a
 * distance and a time. The overall pace with the rests in it never stands for the athlete's.
 */
export function countedRunPace(
  actual: Pick<RunningActualV1, "runType" | "laps" | "distance" | "durationMs">,
): RunPace | null {
  if (paceHasRests(actual)) {
    const reps = repPace(actual.laps.map(lapFigures));
    return reps ? { kind: "reps", ...reps } : null;
  }
  const overall = paceSecondsPerKm(actual.distance.metres, actual.durationMs);
  return overall === null ? null : { kind: "overall", secondsPerKm: overall };
}

/**
 * Laps may say less than the run did — the reps of a session and not its warm-up — but never
 * more: laps longer than the whole are a typo. Each lap's own time rounds to the second on a
 * watch, so a second a lap is allowed for, and a hundredth of the distance for GPS.
 */
export function lapsLongerThan(lapsMs: number, durationMs: number, lapCount: number): boolean {
  return lapsMs > durationMs + lapCount * 1000;
}

export function lapsFurtherThan(lapsMetres: number, metres: number): boolean {
  return metres > 0 && lapsMetres > metres * 1.01 + 10;
}

/** "3.47 km", "2.50 km", "800 m": a run's total as its own unit writes it, in a message. */
export function formatRunTotal(metres: number, unit: DistanceUnit | PoolUnit): string {
  const value = fromMetres(metres, unit);
  return unit === "km" || unit === "mi"
    ? `${value.toFixed(2)} ${unit}`
    : `${Math.round(value)} ${unit}`;
}

/** "14:28", "1:02:10": a run's time in a message, to the second. */
export function formatRunTime(durationMs: number): string {
  const total = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

/**
 * Where a lap's problem is said: at the lap, at the part of it at fault (`laps.2.distance` is
 * the third lap's distance), so the form can mark that field and say it there.
 */
export function lapField(index: number, part?: "distance" | "time" | string): string {
  return part ? `laps.${index}.${part}` : `laps.${index}`;
}

function checkLaps(problems: LimitProblem[], actual: RunningActualV1): void {
  if (actual.laps.length > LAP_LIMIT) {
    problems.push({ field: "laps", message: `Keep a run to ${LAP_LIMIT} laps.` });
    return;
  }
  actual.laps.forEach((lap, index) => {
    const label = `lap ${index + 1}`;
    if (lap.distance === null && lap.durationMs === null) {
      problems.push({
        field: lapField(index),
        message: `Give ${label} a distance, a time or both.`,
      });
      return;
    }
    if (lap.distance !== null) {
      if (!(lap.distance.metres > 0))
        problems.push({
          field: lapField(index, "distance"),
          message: `Enter ${label}'s distance as more than zero.`,
        });
      else
        checkDistanceValue(
          problems,
          lapField(index, "distance"),
          lap.distance,
          "running",
          `${label}'s distance`,
        );
    }
    if (lap.durationMs !== null)
      checkDuration(problems, lapField(index, "time"), lap.durationMs, `${label}'s time`);
    const before = problems.length;
    checkHeartRates(problems, lap.averageHeartRate, lap.maxHeartRate);
    for (const problem of problems.splice(before))
      problems.push({ field: lapField(index, problem.field), message: problem.message });
  });
  // Typed totals that fall short of the laps are said at the total, with what the laps add up
  // to: that figure is the fix the form offers ("Use 3.47 km").
  const sums = lapTotals(actual.laps.map(lapFigures));
  if (lapsLongerThan(sums.durationMs, actual.durationMs, actual.laps.length))
    problems.push({
      field: "duration",
      message: `The laps add up to ${formatRunTime(sums.durationMs)}, longer than ${formatRunTime(actual.durationMs)}.`,
    });
  if (lapsFurtherThan(sums.metres, actual.distance.metres))
    problems.push({
      field: "distance",
      message: `The laps add up to ${formatRunTotal(sums.metres, actual.distance.unit)}, more than ${formatRunTotal(actual.distance.metres, actual.distance.unit)}.`,
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
    checkLaps(problems, actual);
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
