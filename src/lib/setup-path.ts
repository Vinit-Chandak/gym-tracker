import type { ActivitySport } from "@/domain/activity";
import type { BodyLoadUnit, GymKind, TrainingExperience } from "@/domain/types";
import {
  followsWeight,
  followWeight,
  type DistanceUnit,
  type PoolUnit,
} from "@/lib/distance-units";

/**
 * The steps of setup an athlete is actually asked, in order (board set "Overload onboarding
 * redesign", 10 October 2026). What they answer decides the path, and the dots count that
 * path rather than every step the app has: a swimmer is finished after the first, and nobody
 * is shown a step they will never see as done (audit U13).
 *
 * - New to this, at a gym: You, Where you train, Your plan (the coach's questions).
 * - Already trains, at a gym: You, Where you train, Unusual equipment, How you start.
 * - At home or outdoors, nothing is taken as there, so "What you have" takes the third place.
 * - Runs, rides or swims only: You, and that is all.
 */
export type SetupStepKey = "you" | "where" | "kit" | "unusual" | "plan" | "start";

export type SetupStep = { key: SetupStepKey; label: string };

export type SetupPath = {
  experience: TrainingExperience | null;
  /** Whether lifting is among the sports; null before the athlete has said. */
  lifts: boolean | null;
  /** The kind of place they train at; null before they have said. */
  kind: GymKind | null;
};

export function setupSteps({ experience, lifts, kind }: SetupPath): SetupStep[] {
  if (lifts === false) return [{ key: "you", label: "You" }];
  const steps: SetupStep[] = [
    { key: "you", label: "You" },
    { key: "where", label: "Where you train" },
  ];
  if (kind === "home" || kind === "outdoor") steps.push({ key: "kit", label: "What you have" });
  else if (experience === "experienced") steps.push({ key: "unusual", label: "Unusual equipment" });
  steps.push(
    experience === "experienced"
      ? { key: "start", label: "How you start" }
      : { key: "plan", label: "Your plan" },
  );
  return steps;
}

/** Whether the sports chosen include lifting: the gym steps follow only if they do. */
export function liftsAmong(sports: readonly ActivitySport[]): boolean {
  return sports.includes("strength");
}

export type MeasureUnits = { weight: BodyLoadUnit; distance: DistanceUnit; pool: PoolUnit };

/** Where pounds, miles and yards are what people train in. */
const IMPERIAL_REGIONS = new Set(["US", "LR", "MM"]);

/**
 * The units a new athlete most likely trains in, from the language the phone is set to: pounds,
 * miles and yard pools in the United States (and Liberia and Myanmar), kilograms, kilometres and
 * metre pools everywhere else. Pounds no longer leave runs in kilometres (audit B11). Read once,
 * shown on the first step as one line, and changed there or later in the profile.
 */
export function unitsForLocale(locale: string | null | undefined): MeasureUnits {
  let region: string | undefined;
  try {
    region = locale ? new Intl.Locale(locale).maximize().region : undefined;
  } catch {
    region = undefined;
  }
  return region && IMPERIAL_REGIONS.has(region)
    ? { weight: "lb", distance: "mi", pool: "yd" }
    : { weight: "kg", distance: "km", pool: "m" };
}

/**
 * The units with the weight changed to `weight`: a road or a pool unit that was the old weight
 * unit's goes with it, so choosing pounds on a phone that proposed kilograms reads miles too
 * (ADR 0056); one changed apart from the weight stays as it was.
 */
export function withWeight(units: MeasureUnits, weight: BodyLoadUnit): MeasureUnits {
  const distances = { distanceUnit: units.distance, poolUnit: units.pool };
  const { distanceUnit, poolUnit } = followWeight(
    distances,
    weight,
    followsWeight(units.weight, distances),
  );
  return { weight, distance: distanceUnit, pool: poolUnit };
}

/** The first language an `Accept-Language` header asks for, or null. */
export function firstAcceptedLanguage(header: string | null | undefined): string | null {
  const first = header?.split(",")[0]?.split(";")[0]?.trim();
  return first && first !== "*" ? first : null;
}

/** "Europe/London" is "London"; "America/Argentina/Buenos_Aires" is "Buenos Aires". */
export function zoneCity(zone: string): string {
  if (zone === "UTC" || zone === "Etc/UTC") return "UTC";
  const last = zone.split("/").pop() ?? zone;
  return last.replace(/_/g, " ");
}

/** "GMT+1", "GMT−4", "GMT+5:30" or "GMT" for a zone now, or null where the runtime cannot say. */
export function zoneOffset(zone: string, at: Date = new Date()): string | null {
  try {
    const part = new Intl.DateTimeFormat("en-GB", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(at)
      .find((piece) => piece.type === "timeZoneName")?.value;
    return part ? part.replace("-", "−") : null;
  } catch {
    return null;
  }
}

/** "London time", or "UTC" on its own. */
export function zoneLine(zone: string): string {
  const city = zoneCity(zone);
  return city === "UTC" ? "UTC" : `${city} time`;
}
