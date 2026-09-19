/**
 * Distances, in the units they were entered and in the one they are stored in.
 *
 * A distance has two halves that both matter: what the athlete typed, in their unit, and the
 * canonical metres everything else compares. Conversion is exact by definition — a mile is
 * 1,609.344 metres and a yard is 0.9144 — so it is done in scaled integers rather than
 * floating point. Changing a display unit, or editing a note, converts nothing and drifts
 * nothing: the entered quantity is what is kept, and the metres beside it were derived once.
 */

export const LENGTH_UNITS = ["m", "km", "mi", "yd"] as const;
export type LengthUnit = (typeof LENGTH_UNITS)[number];

/** What a road distance is entered in. */
export const DISTANCE_UNITS = ["km", "mi"] as const;
export type DistanceUnit = (typeof DISTANCE_UNITS)[number];

/** What a pool and a swim are measured in. A pool is never described in kilometres. */
export const POOL_UNITS = ["m", "yd"] as const;
export type PoolUnit = (typeof POOL_UNITS)[number];

export const METRES_PER_KM = 1000;
export const METRES_PER_MILE = 1609.344;
export const METRES_PER_YARD = 0.9144;

/** `numeric(14, 6)`: the precision the canonical column stores, so the scale to work in. */
export const DISTANCE_DECIMALS = 6;
const SCALE = 10n ** BigInt(DISTANCE_DECIMALS);

/** Metres per unit, scaled by 10^6, which makes every factor below an exact integer. */
const SCALED_METRES: Record<LengthUnit, bigint> = {
  m: SCALE,
  km: SCALE * 1000n,
  mi: 1_609_344_000n,
  yd: 914_400n,
};

export const UNIT_LABELS: Record<LengthUnit, string> = {
  m: "m",
  km: "km",
  mi: "mi",
  yd: "yd",
};

/** Decimal places a number is written with; `1.50` is two, `1.5` is one, `2` is none. */
export function decimalPlaces(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const text = Math.abs(value).toString();
  if (text.includes("e") || text.includes("E")) {
    const [mantissa, exponent] = text.toLowerCase().split("e");
    const places = (mantissa!.split(".")[1] ?? "").length - Number(exponent);
    return Math.max(0, places);
  }
  return (text.split(".")[1] ?? "").length;
}

/** Half-up rounding at a fixed scale, done on the decimal text so 1.005 is not 1.00. */
export function roundTo(value: number, places: number): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** places;
  const scaled = value * factor;
  // A value like 8046.7200000000005 is one unit-in-the-last-place from the exact answer;
  // nudging by an epsilon proportional to the magnitude keeps it on the intended side.
  const epsilon = Math.abs(scaled) * Number.EPSILON * 4;
  return Math.sign(scaled) * (Math.round(Math.abs(scaled) + epsilon) / factor);
}

/** Half-up division for the scaled integers below: truncation would bias every conversion. */
function divRound(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const value = negative ? -numerator : numerator;
  const rounded = (value * 2n + denominator) / (denominator * 2n);
  return negative ? -rounded : rounded;
}

function toScaled(value: number): bigint {
  if (!Number.isFinite(value)) throw new RangeError("A distance must be a finite number.");
  return BigInt(Math.round(roundTo(value, DISTANCE_DECIMALS) * Number(SCALE)));
}

/**
 * An entered quantity as canonical metres, exactly. `5 mi` is 8,046.72 m and not a float's
 * idea of it; a value already in metres comes back unchanged.
 */
export function toMetres(value: number, unit: LengthUnit): number {
  const scaled = divRound(toScaled(value) * SCALED_METRES[unit], SCALE);
  return Number(scaled) / Number(SCALE);
}

/** Canonical metres read back in a unit. Rounded only at the stored precision. */
export function fromMetres(metres: number, unit: LengthUnit): number {
  const scaled = divRound(toScaled(metres) * SCALE, SCALED_METRES[unit]);
  return Number(scaled) / Number(SCALE);
}

/** Round trips exactly: what was entered comes back, whatever the canonical value looks like. */
export function sameDistance(a: number, b: number): boolean {
  return toScaled(a) === toScaled(b);
}

const DISPLAY_DECIMALS: Record<LengthUnit, number> = { m: 0, km: 2, mi: 2, yd: 0 };

/** "8.05 km" / "5 mi" / "400 m". Display rounding only; comparisons use the stored value. */
export function formatDistance(metres: number, unit: LengthUnit, places?: number): string {
  const value = roundTo(fromMetres(metres, unit), places ?? DISPLAY_DECIMALS[unit]);
  return `${value} ${UNIT_LABELS[unit]}`;
}
