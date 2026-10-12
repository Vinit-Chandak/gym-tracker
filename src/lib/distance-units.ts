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

/** A range of road distances reads to a tenth; see `sportDistanceParts`. */
const RANGE_DECIMALS = 1;

/**
 * A distance as it was entered, read in another unit for a form to open on: to the places a
 * distance reads in there (1,500 m is 1,640 yd; 7.2 km is 4.47 mi), and whether that figure is
 * the same distance exactly. What was entered is not rewritten by it: a form posts the entry
 * itself until the figure is changed.
 */
export function entryIn(
  value: number,
  from: LengthUnit,
  to: LengthUnit,
): { value: number; exact: boolean } {
  if (from === to) return { value, exact: true };
  const metres = toMetres(value, from);
  const shown = roundTo(fromMetres(metres, to), DISPLAY_DECIMALS[to]);
  return { value: shown, exact: sameDistance(toMetres(shown, to), metres) };
}

/** "8.05 km" / "5 mi" / "400 m". Display rounding only; comparisons use the stored value. */
export function formatDistance(metres: number, unit: LengthUnit, places?: number): string {
  const value = roundTo(fromMetres(metres, unit), places ?? DISPLAY_DECIMALS[unit]);
  return `${value}\u00a0${UNIT_LABELS[unit]}`;
}

/** How one athlete reads one sport's distances: a road in km or mi, a pool in m or yd. */
export type SportUnits = { distanceUnit: DistanceUnit; poolUnit: PoolUnit };

/** What an athlete in kilograms reads until they choose otherwise: kilometres, metre pools. */
export const DEFAULT_SPORT_UNITS: SportUnits = { distanceUnit: "km", poolUnit: "m" };

const IMPERIAL_SPORT_UNITS: SportUnits = { distanceUnit: "mi", poolUnit: "yd" };

export function isDistanceUnit(unit: string | null | undefined): unit is DistanceUnit {
  return (DISTANCE_UNITS as readonly (string | null | undefined)[]).includes(unit);
}

export function isPoolUnit(unit: string | null | undefined): unit is PoolUnit {
  return (POOL_UNITS as readonly (string | null | undefined)[]).includes(unit);
}

/**
 * The distances a weight unit starts an athlete on (ADR 0056): pounds read miles and yard
 * pools, kilograms kilometres and metre pools.
 */
export function unitsForWeight(weight: string): SportUnits {
  return weight === "lb" ? IMPERIAL_SPORT_UNITS : DEFAULT_SPORT_UNITS;
}

/** What an account has set apart from its weight unit; null follows it. */
export type ChosenSportUnits = { distanceUnit: DistanceUnit | null; poolUnit: PoolUnit | null };

/**
 * How an account reads distances: what it chose, and where it chose nothing, what its weight
 * unit implies, so pounds read miles until miles are changed. A stored value that is not a road
 * or a pool unit is no choice.
 */
export function resolveSportUnits(
  weight: string,
  chosen: { distanceUnit: string | null; poolUnit: string | null },
): SportUnits {
  const implied = unitsForWeight(weight);
  return {
    distanceUnit: isDistanceUnit(chosen.distanceUnit) ? chosen.distanceUnit : implied.distanceUnit,
    poolUnit: isPoolUnit(chosen.poolUnit) ? chosen.poolUnit : implied.poolUnit,
  };
}

/** Which of an account's distances go with its weight unit, and which were set apart. */
export type Following = { distanceUnit: boolean; poolUnit: boolean };

/** The distances that are what `weight` gives, and so follow it: the ones never set apart. */
export function followsWeight(weight: string, units: SportUnits): Following {
  const implied = unitsForWeight(weight);
  return {
    distanceUnit: units.distanceUnit === implied.distanceUnit,
    poolUnit: units.poolUnit === implied.poolUnit,
  };
}

/**
 * What to store for distances read in `units` beside `weight`: only what the weight unit would
 * not give. A unit the weight unit implies is stored as no choice, so it goes on following the
 * weight unit, and a stored choice is always one that differs from it.
 */
export function chosenSportUnits(weight: string, units: SportUnits): ChosenSportUnits {
  const follows = followsWeight(weight, units);
  return {
    distanceUnit: follows.distanceUnit ? null : units.distanceUnit,
    poolUnit: follows.poolUnit ? null : units.poolUnit,
  };
}

/**
 * Distances as a form holds them when its weight unit changes to `to`: the ones that `follow`
 * it become what the new weight unit gives, and one set apart stays where it was.
 */
export function followWeight(units: SportUnits, to: string, follow: Following): SportUnits {
  const implied = unitsForWeight(to);
  return {
    distanceUnit: follow.distanceUnit ? implied.distanceUnit : units.distanceUnit,
    poolUnit: follow.poolUnit ? implied.poolUnit : units.poolUnit,
  };
}

/**
 * What a set's distance (a carry, a sled push) is read in: yards beside miles, metres beside
 * kilometres. Never feet: a carry is ground covered, and turf is marked in yards; feet are for
 * a climb and a height. It is stored in metres either way (ADR 0021).
 */
export type SetLengthUnit = "m" | "yd";

export function setLengthUnit(distanceUnit: DistanceUnit): SetLengthUnit {
  return distanceUnit === "mi" ? "yd" : "m";
}

/** What an account reads a set's distance in, from its profile: yards beside miles. */
export function setLengthFor(profile: {
  preferredUnit: string;
  distanceUnit: string | null;
  poolUnit: string | null;
}): SetLengthUnit {
  return setLengthUnit(resolveSportUnits(profile.preferredUnit, profile).distanceUnit);
}

/** The words a set's distance is said in, aloud and on a column: "metres", "yards". */
export const SET_LENGTH_WORDS: Record<SetLengthUnit, string> = { m: "metres", yd: "yards" };

/** A set's metres are kept to a tenth (`set_logs.distance_meters`, numeric(8, 1)). */
const SET_METRE_PLACES = 1;

/**
 * A set's metres read in `unit`: metres as kept, to their tenth; yards whole. A whole number of
 * yards kept to a tenth of a metre is never more than 0.06 yd from itself, so it reads back as
 * typed: 50 yd is kept as 45.7 m and read as 50 yd.
 */
export function setLengthIn(metres: number, unit: SetLengthUnit): number {
  return unit === "yd" ? Math.round(fromMetres(metres, "yd")) : roundTo(metres, SET_METRE_PLACES);
}

/** A set's distance as typed in `unit`, as the metres it is kept in: 50 yd is 45.7 m. */
export function setLengthToMetres(value: number, unit: SetLengthUnit): number {
  return roundTo(toMetres(value, unit), SET_METRE_PLACES);
}

/**
 * A distance to reach, read in `unit`: the least figure that, typed, is kept at `metres` or
 * more. A target is something to log, and the progression engine judges a set by its metres,
 * so the figure shown must reach them: 15 m is 16.4 yd, but 16 yd is kept as 14.6 m and falls
 * short, so 15 m reads 17 yd (`setLengthIn` would say 16). A figure that was typed comes back
 * as typed: 45.7 m, kept from 50 yd, reads 50 yd either way. Metres are their tenth.
 */
export function setTargetIn(metres: number, unit: SetLengthUnit): number {
  const nearest = setLengthIn(metres, unit);
  if (setLengthToMetres(nearest, unit) >= metres) return nearest;
  // The nearest whole yard (or tenth) is under half a step short, so the next one up reaches.
  return unit === "yd" ? nearest + 1 : roundTo(nearest + 0.1, SET_METRE_PLACES);
}

/** "40 m", "44 yd": a set's distance, held to its unit. */
export function formatSetLength(metres: number, unit: SetLengthUnit): string {
  return `${setLengthIn(metres, unit)} ${unit}`;
}

/** A foot, by definition. */
export const METRES_PER_FOOT = 0.3048;

/** What a climb is read in: feet beside miles, metres beside kilometres. It is kept in metres. */
export type ClimbUnit = "m" | "ft";

export function climbUnit(distanceUnit: DistanceUnit): ClimbUnit {
  return distanceUnit === "mi" ? "ft" : "m";
}

/** A climb in metres read in `unit`, whole: 89 m is 292 ft. */
export function climbIn(metres: number, unit: ClimbUnit): number {
  return Math.round(unit === "ft" ? metres / METRES_PER_FOOT : metres);
}

/** The unit a sport's distances are read in. A swim is never described in kilometres. */
export function readingUnit(sport: string, units: SportUnits): DistanceUnit | PoolUnit {
  return sport === "swimming" ? units.poolUnit : units.distanceUnit;
}

/**
 * A distance, or a range of them, as a figure and its unit in the reader's own unit for that
 * sport: "1,500" m, "1,000" yd, "8.05" km, "5" mi, "5–6" km, thousands separated as the
 * swim's own form and a friend's distances write them.
 *
 * Whatever it was written in, it is read the one way: a swim set written in yards reads in
 * metres for an athlete who swims in metres, and a five-mile run reads 8.05 km. A road distance
 * short of a kilometre reads in metres, which is how a 400 m repeat is said; miles stay miles.
 * Display rounding only — the metres underneath are never rewritten from it.
 *
 * A road range is a target, not a measurement: it reads to a tenth, and both ends alike —
 * "4.3–5.6 mi" and "4.5–6.0 km", never "4.35–5.59 mi" beside "8.57–9.2 mi" — or whole when
 * both ends are ("5–6 km"). A single distance keeps its hundredths ("8.05 km").
 */
export function sportDistanceParts(
  metres: number | readonly [number, number],
  sport: string,
  units: SportUnits,
): { figure: string; unit: string } {
  const [low, high] = typeof metres === "number" ? [metres, metres] : metres;
  const reading = readingUnit(sport, units);
  const unit: LengthUnit = reading === "km" && high < METRES_PER_KM ? "m" : reading;
  const range = low !== high;
  const places = range ? Math.min(DISPLAY_DECIMALS[unit], RANGE_DECIMALS) : DISPLAY_DECIMALS[unit];
  const [from, to] = [low, high].map((value) => roundTo(fromMetres(value, unit), places));
  // One end that needs its tenth gives the other one too: "4.5–6.0 km", not "4.5–6 km".
  const fixed = range && [from!, to!].some((value) => !Number.isInteger(value)) ? places : 0;
  const figure = (value: number) =>
    value.toLocaleString("en-GB", { minimumFractionDigits: fixed, maximumFractionDigits: places });
  const [first, last] = [figure(from!), figure(to!)];
  return { figure: first === last ? last : `${first}–${last}`, unit: UNIT_LABELS[unit] };
}

/** The same, as one phrase: "8 × 50 m" is built from it, and so is "5–6 km". */
export function formatSportDistance(
  metres: number | readonly [number, number],
  sport: string,
  units: SportUnits,
): string {
  const { figure, unit } = sportDistanceParts(metres, sport, units);
  return `${figure}\u00a0${unit}`;
}
