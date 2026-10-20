/**
 * Heart-rate zones (ADR 0059).
 *
 * Five zones, read from a maximum heart rate the athlete can see and change. The maximum comes
 * from the best evidence there is, in this order: a number the athlete entered, the highest a
 * run of theirs recorded, and only failing both an estimate from their age. An age formula is
 * a population average with a spread of about ten beats either way (Tanaka 2001), so it is the
 * starting point and never the answer once a hard run has said otherwise.
 *
 * The zones themselves are the five most apps and the ACSM use: 50–60, 60–70, 70–80, 80–90 and
 * 90–100 per cent. With a resting heart rate they are taken of the heart-rate reserve instead
 * (Karvonen: rest + share × (max − rest)), which tracks oxygen uptake more closely than a share
 * of the maximum does, and is what the ACSM recommends when the resting rate is known. An
 * athlete with zones from a lab or a threshold test enters them as custom zones, which win.
 *
 * Nothing here is a diagnosis or a safety limit. A zone is a way of saying how hard; the
 * numbers that guard what may be stored are `HEART_RATE` in activity-limits.
 */

import { HEART_RATE } from "./activity-limits";

export const HEART_RATE_ZONE_METHODS = ["max", "reserve", "custom"] as const;
export type HeartRateZoneMethod = (typeof HEART_RATE_ZONE_METHODS)[number];

/** Where a stored maximum came from. An estimate is never stored: it is worked out each time. */
export const MAX_HEART_RATE_SOURCES = ["entered", "observed"] as const;
export type MaxHeartRateSource = (typeof MAX_HEART_RATE_SOURCES)[number];

/** How the maximum in use was arrived at, the estimate included. */
export type MaxHeartRateBasis = MaxHeartRateSource | "estimated";

export const ZONE_NUMBERS = [1, 2, 3, 4, 5] as const;
export type ZoneNumber = (typeof ZONE_NUMBERS)[number];

/** Each zone's floor as a share of the maximum, or of the reserve. Zone 5 runs to the maximum. */
export const ZONE_FLOORS = [0.5, 0.6, 0.7, 0.8, 0.9] as const;

/**
 * What each zone is for, in the words a plan uses, as Garmin names them. By a share of the
 * maximum the zones sit low: in a study of 1,411 runners the top of easy running (the first
 * ventilatory threshold) fell at about 85 per cent of peak heart rate (Esteve-Lanao 2026), so
 * easy running fills zones 2 and 3, and marathon and tempo effort sit in zone 4.
 */
export const ZONE_NAMES: Record<ZoneNumber, string> = {
  1: "Recovery",
  2: "Easy",
  3: "Aerobic",
  4: "Threshold",
  5: "Maximum",
};

export const ZONE_FEEL: Record<ZoneNumber, string> = {
  1: "Very easy: warm-ups, cool-downs and recovery jogs",
  2: "Easy and conversational: relaxed running",
  3: "Steady but still conversational: the top of easy, most long runs",
  4: "Comfortably hard: marathon to tempo effort",
  5: "Hard: intervals and races up to 10K, too hard to hold for long",
};

/** The age formula: Tanaka, Monahan and Seals 2001, from 351 studies and a lab check of 514. */
export function estimatedMaxHeartRate(age: number): number {
  return Math.round(208 - 0.7 * age);
}

/**
 * The highest heart rate a reading may be before it is taken for a sensor glitch rather than a
 * new maximum. A wrist sensor that locks onto cadence reads 180 beats for 180 steps; true
 * maxima above this are vanishingly rare, so a run that reports one is shown, never adopted.
 */
export const PLAUSIBLE_MAX_HEART_RATE = 230;

/** A maximum the profile may hold, entered or recorded: the database checks the same bounds. */
export const MAX_HEART_RATE_BOUND = { min: 100, max: PLAUSIBLE_MAX_HEART_RATE } as const;

/** A resting heart rate the reserve method will use. Below forty is an athlete's; above, a typo. */
export const RESTING_HEART_RATE = { min: 25, max: 120 } as const;

export type HeartRateSettings = {
  maxHeartRate: number | null;
  maxHeartRateSource: MaxHeartRateSource | null;
  /** The local date the stored maximum was entered or recorded on. */
  maxHeartRateOn: string | null;
  restingHeartRate: number | null;
  zoneMethod: HeartRateZoneMethod;
  /** Five ascending floors, zone 1 to zone 5, for the custom method only. */
  customZoneFloors: readonly number[] | null;
  /** Whether a logged run's higher reading raises the stored maximum by itself. */
  maxHeartRateAuto: boolean;
};

export const DEFAULT_HEART_RATE_SETTINGS: HeartRateSettings = {
  maxHeartRate: null,
  maxHeartRateSource: null,
  maxHeartRateOn: null,
  restingHeartRate: null,
  zoneMethod: "max",
  customZoneFloors: null,
  maxHeartRateAuto: true,
};

export type HeartRateZone = { zone: ZoneNumber; name: string; low: number; high: number };

export type ObservedMax = { bpm: number; on: string; activityId: string | null };

export type ResolvedHeartRate = {
  max: number;
  basis: MaxHeartRateBasis;
  /** The date behind an entered or observed maximum; null for an estimate. */
  on: string | null;
  resting: number | null;
  /** The method in use: reserve asked for without a resting rate is read as max, and says so. */
  method: HeartRateZoneMethod;
  zones: HeartRateZone[];
};

function zonesFromFloors(floors: readonly number[], max: number): HeartRateZone[] {
  return ZONE_NUMBERS.map((zone, index) => ({
    zone,
    name: ZONE_NAMES[zone],
    low: floors[index]!,
    high: index === ZONE_NUMBERS.length - 1 ? max : floors[index + 1]! - 1,
  }));
}

/** The five zones as a share of the maximum. */
export function maxZones(max: number): HeartRateZone[] {
  return zonesFromFloors(
    ZONE_FLOORS.map((share) => Math.round(max * share)),
    max,
  );
}

/** The five zones as a share of the reserve between resting and maximum (Karvonen). */
export function reserveZones(max: number, resting: number): HeartRateZone[] {
  return zonesFromFloors(
    ZONE_FLOORS.map((share) => Math.round(resting + share * (max - resting))),
    max,
  );
}

/** Why a set of custom floors cannot be used, or null when it can. */
export function customFloorsProblem(floors: readonly number[], max: number): string | null {
  if (floors.length !== ZONE_NUMBERS.length) return "Give a floor for each of the five zones.";
  if (floors.some((floor) => !Number.isInteger(floor)))
    return "Enter each zone in whole beats a minute.";
  if (floors[0]! < HEART_RATE.min) return `Start zone 1 at ${HEART_RATE.min} or more.`;
  for (let index = 1; index < floors.length; index++)
    if (floors[index]! <= floors[index - 1]!)
      return "Each zone must start above the one before it.";
  if (floors[floors.length - 1]! >= max) return "Start zone 5 below your maximum heart rate.";
  return null;
}

/**
 * The maximum heart rate in use and its zones, or null when there is nothing to read one from:
 * no maximum entered, none recorded and no date of birth.
 *
 * A stored maximum, entered or recorded, is used as it is. Without one, the highest a recent run
 * recorded is used where it beats the estimate for the athlete's age; an easy run's peak below
 * the estimate says nothing about the maximum and does not lower it.
 */
export function resolveHeartRate(
  settings: HeartRateSettings,
  age: number | null,
  highestObserved: ObservedMax | null = null,
): ResolvedHeartRate | null {
  const estimate = age === null ? null : estimatedMaxHeartRate(age);
  const observed =
    highestObserved && highestObserved.bpm <= PLAUSIBLE_MAX_HEART_RATE ? highestObserved : null;
  let max: number;
  let basis: MaxHeartRateBasis;
  let on: string | null = null;
  if (settings.maxHeartRate !== null) {
    max = settings.maxHeartRate;
    basis = settings.maxHeartRateSource ?? "entered";
    on = settings.maxHeartRateOn;
  } else if (observed && (estimate === null || observed.bpm > estimate)) {
    max = observed.bpm;
    basis = "observed";
    on = observed.on;
  } else if (estimate !== null) {
    max = estimate;
    basis = "estimated";
  } else return null;

  const resting =
    settings.restingHeartRate !== null && settings.restingHeartRate < max
      ? settings.restingHeartRate
      : null;
  if (
    settings.zoneMethod === "custom" &&
    settings.customZoneFloors &&
    customFloorsProblem(settings.customZoneFloors, max) === null
  )
    return {
      max,
      basis,
      on,
      resting,
      method: "custom",
      zones: zonesFromFloors(settings.customZoneFloors, max),
    };
  if (settings.zoneMethod === "reserve" && resting !== null)
    return { max, basis, on, resting, method: "reserve", zones: reserveZones(max, resting) };
  return { max, basis, on, resting, method: "max", zones: maxZones(max) };
}

/** The zone a reading falls in: 0 below zone 1, 5 at or above zone 5's floor. */
export function zoneOf(bpm: number, zones: readonly HeartRateZone[]): ZoneNumber | 0 {
  let found: ZoneNumber | 0 = 0;
  for (const zone of zones) if (bpm >= zone.low) found = zone.zone;
  return found;
}

/** A reading as a share of the maximum, to the whole per cent. */
export function percentOfMax(bpm: number, max: number): number {
  return Math.round((bpm / max) * 100);
}

/** "Zone 2", "Zones 3–4": a zone target as a plan says it. */
export function zoneRangeLabel([low, high]: readonly [number, number]): string {
  return low === high ? `Zone ${low}` : `Zones ${low}–${high}`;
}

/** The beats a zone target covers for this athlete: zone 2 for one maximum is 114–132. */
export function zoneRangeBeats(
  [low, high]: readonly [number, number],
  zones: readonly HeartRateZone[],
): [number, number] | null {
  const from = zones.find((zone) => zone.zone === low);
  const to = zones.find((zone) => zone.zone === high);
  return from && to ? [from.low, to.high] : null;
}

/**
 * Whether a run's recorded maximum should raise the stored one, and to what.
 *
 * Only upwards, only when the athlete has left the update on, and only for a reading a heart can
 * actually reach. `current` is the maximum in use before the run was saved — stored, or the
 * best of the estimate and the runs before it — so a run that beats an estimate is a measurement
 * the estimate was standing in for, and one that beats nothing leaves everything as it was. An
 * athlete who knows a reading was a glitch enters their own maximum, and the next run is read
 * against that.
 */
export function raisedMaxHeartRate(
  settings: HeartRateSettings,
  current: number | null,
  recordedMax: number | null,
): number | null {
  if (!settings.maxHeartRateAuto || recordedMax === null) return null;
  if (!Number.isInteger(recordedMax) || recordedMax > PLAUSIBLE_MAX_HEART_RATE) return null;
  if (recordedMax < MAX_HEART_RATE_BOUND.min) return null;
  if (current !== null && recordedMax <= current) return null;
  return recordedMax;
}

export type ZoneTime = { zone: ZoneNumber | 0; ms: number };

/**
 * Time spent in each zone, read from the laps that recorded an average heart rate: each lap's
 * time counts in the zone of its average. A lap is not a second-by-second trace, so this is an
 * approximation and says so wherever it is shown; laps without a heart rate are left out.
 */
export function zoneTimeFromLaps(
  laps: readonly { durationMs: number | null; averageHeartRate: number | null }[],
  zones: readonly HeartRateZone[],
): ZoneTime[] {
  const totals = new Map<ZoneNumber | 0, number>();
  for (const lap of laps) {
    if (lap.durationMs === null || lap.averageHeartRate === null) continue;
    const zone = zoneOf(lap.averageHeartRate, zones);
    totals.set(zone, (totals.get(zone) ?? 0) + lap.durationMs);
  }
  return ([0, ...ZONE_NUMBERS] as const)
    .filter((zone) => totals.has(zone))
    .map((zone) => ({ zone, ms: totals.get(zone)! }));
}

/** Where the maximum in use came from, as its page says it. */
export function maxBasisLabel(basis: MaxHeartRateBasis): string {
  return basis === "entered"
    ? "Entered by you"
    : basis === "observed"
      ? "Highest from your runs"
      : "Estimated from your age";
}
