import { decimalPlaces, toMetres, type DistanceUnit, type PoolUnit } from "@/lib/distance-units";

import type { EnduranceSport } from "./activity";

/**
 * One place that says how large, how precise and how long a measurement may be (plan §4.6).
 *
 * These are error guards, not training prescriptions. A seven-day ceiling does not mean a
 * seven-day ride is encouraged; it means a number past it is a typo or a unit mistake, and
 * the form says so rather than storing it. The forms, the server schemas and the database
 * checks all read these constants, so the three can never disagree about what is acceptable.
 *
 * Values already in the database that fall outside them are preserved exactly as they are:
 * a legacy record is evidence, and a new bound is not a reason to rewrite one (§10.2).
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type Bound = { min: number; max: number };

/** Every duration, in milliseconds. Whole seconds in basic entry; swimming allows tenths. */
export const DURATION_MS: Bound = { min: 1, max: 7 * DAY };

/** Canonical metres. The sports differ because a long ride is not a long swim. */
export const DISTANCE_METRES: Record<EnduranceSport, Bound> = {
  running: { min: 0, max: 1_000_000 },
  cycling: { min: 0, max: 10_000_000 },
  swimming: { min: 0, max: 1_000_000 },
};

/** Past these, the form asks "is that right?" and accepts the answer. Never truncates. */
export const CONFIRM_ABOVE: Record<EnduranceSport, { distanceMetres: number; durationMs: number }> =
  {
    running: { distanceMetres: 100_000, durationMs: 10 * HOUR },
    cycling: { distanceMetres: 500_000, durationMs: 24 * HOUR },
    swimming: { distanceMetres: 20_000, durationMs: 12 * HOUR },
  };

/**
 * The athlete's own reported effort, 1 to 5.
 *
 * It was 1–10 until the scale was found to ask for a precision nobody has: the difference
 * between a 6 and a 7 was never reported consistently, so five steps say what ten pretended
 * to. Stored values from the old scale were halved once, by migration 0033, so the column
 * carries one meaning and not two.
 */
export const EFFORT: Bound = { min: 1, max: 5 };

/**
 * What a plan may *ask* for: the same five steps, with zero kept as "not asked".
 *
 * A separate bound from `EFFORT` because the questions differ at the bottom, not at the top.
 * A target legitimately reads zero — the old programme sheet wrote one, and a run with no
 * prescribed effort is stored as a zero rather than a null by `programs.ts` — while an
 * athlete's own report starts at 1. The ceilings match on purpose: a plan that asks out of
 * ten beside a form that answers out of five is two scales wearing one word, and the whole
 * point of asking is that the answer can be read against it.
 */
export const PRESCRIBED_EFFORT: Bound = { min: 0, max: 5 };
export const HEART_RATE: Bound = { min: 20, max: 300 };
export const RUNNING_CADENCE: Bound = { min: 0, max: 400 };
export const CYCLING_CADENCE: Bound = { min: 0, max: 300 };
export const POWER_WATTS: Bound = { min: 0, max: 5_000 };
export const ELEVATION_GAIN_METRES: Bound = { min: 0, max: 100_000 };
export const TREADMILL_INCLINE_PERCENT: Bound = { min: -100, max: 100 };
/** Native pool length, in the unit the pool is measured in. */
export const POOL_LENGTH_NATIVE: Bound = { min: 0, max: 1_000 };
export const LENGTHS: Bound = { min: 1, max: 1_000_000 };
export const STROKE_COUNT: Bound = { min: 0, max: 1_000_000 };

/** How much precision an entered measurement may carry before it is refused, not rounded. */
export const DECIMALS = {
  /** Five whole steps, so a reported effort carries no fraction. */
  effort: 0,
  heartRate: 0,
  power: 1,
  cadence: 1,
  elevation: 3,
  incline: 3,
  distance: 6,
  poolLength: 6,
} as const;

export const TEXT_LIMITS = {
  title: 120,
  notes: 4_000,
  surface: 80,
  resourceLabel: 80,
  sourceReference: 255,
  stepNotes: 300,
  prescriptionNotes: 2_000,
} as const;

/** A future start beyond this is a clock disagreement, not a plan; a plan is not an actual. */
export const FUTURE_START_TOLERANCE_MS = 5 * MINUTE;

/** Draft protection (§5.3) and the edit claim, which is a lease and not a timer. */
export const DRAFT_LIMITS = { bytes: 128 * 1024, perAccount: 20, ageDays: 90 } as const;
export const CLAIM_MINUTES = 30;

/** Prescription payload safeguards (§5.1), not daily training limits. */
export const PRESCRIPTION_LIMITS = {
  authoredNodes: 100,
  repetitionsPerBlock: 100,
  expandedSteps: 1_000,
  payloadBytes: 128 * 1024,
} as const;

/** Blueprint payload safeguards (§6.4). */
export const BLUEPRINT_LIMITS = {
  weeks: { min: 1, max: 52 },
  strengthSlots: 31,
  enduranceOccurrences: 10_000,
  payloadBytes: 4 * 1024 * 1024,
} as const;

export function withinBound(value: number, bound: Bound): boolean {
  return Number.isFinite(value) && value >= bound.min && value <= bound.max;
}

/** Excess precision is refused with a message; silently rounding an entered number is not ours to do. */
export function withinPrecision(value: number, places: number): boolean {
  return Number.isFinite(value) && decimalPlaces(value) <= places;
}

export type LimitProblem = { field: string; message: string };

/** The one check a number has to pass: finite, in range, and no more precise than we store. */
export function checkNumber(
  field: string,
  value: number,
  bound: Bound,
  places: number,
  label: string,
): LimitProblem | null {
  if (!Number.isFinite(value)) return { field, message: `Enter ${label} as a number.` };
  if (!withinPrecision(value, places))
    return {
      field,
      message:
        places === 0
          ? `Enter ${label} as a whole number.`
          : `Enter ${label} to at most ${places} decimal place${places === 1 ? "" : "s"}.`,
    };
  if (!withinBound(value, bound))
    return { field, message: `Enter ${label} between ${bound.min} and ${bound.max}.` };
  return null;
}

/** Whether an entered distance needs the "is that right?" confirmation for its sport. */
export function needsDistanceConfirmation(sport: EnduranceSport, metres: number): boolean {
  return metres > CONFIRM_ABOVE[sport].distanceMetres;
}

export function needsDurationConfirmation(sport: EnduranceSport, durationMs: number): boolean {
  return durationMs > CONFIRM_ABOVE[sport].durationMs;
}

/** An entered quantity in its own unit, checked against the canonical ceiling for its sport. */
export function distanceWithinBounds(
  sport: EnduranceSport,
  value: number,
  unit: DistanceUnit | PoolUnit,
): boolean {
  if (!withinPrecision(value, DECIMALS.distance) || value < 0) return false;
  return withinBound(toMetres(value, unit), DISTANCE_METRES[sport]);
}
