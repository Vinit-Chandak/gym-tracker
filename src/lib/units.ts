import type { BodyLoadUnit } from "@/domain/types";

/**
 * Body measurements are stored once, in kilograms and centimetres, and read in whichever
 * units the account prefers. Nothing else in the app converts them: a logged set keeps the
 * unit it was logged in, because that is a fact about the machine, not a preference.
 */

export const LB_PER_KG = 2.2046226218;
export const CM_PER_INCH = 2.54;
export const INCHES_PER_FOOT = 12;

/** Height has no preference of its own: pounds means feet and inches, kilograms means centimetres. */
export type HeightUnit = "cm" | "ftin";

export function heightUnitFor(unit: BodyLoadUnit): HeightUnit {
  return unit === "lb" ? "ftin" : "cm";
}

const round = (value: number, places: number): number => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/** A weight the user typed, in kilograms. Two decimals is what the column stores. */
export function toKilograms(value: number, unit: BodyLoadUnit): number {
  return unit === "lb" ? round(value / LB_PER_KG, 2) : round(value, 2);
}

/** A stored weight in the unit it should be shown and edited in. */
export function fromKilograms(kilograms: number, unit: BodyLoadUnit): number {
  return round(unit === "lb" ? kilograms * LB_PER_KG : kilograms, 1);
}

/** Feet and inches as centimetres, to the tenth the column stores. */
export function toCentimetres(feet: number, inches: number): number {
  return round((feet * INCHES_PER_FOOT + inches) * CM_PER_INCH, 1);
}

/**
 * A stored height as whole feet and inches. Rounded to the nearest inch, which is as fine as
 * anyone states their height; re-saving the result moves it by at most half an inch.
 */
export function toFeetAndInches(centimetres: number): { feet: number; inches: number } {
  const totalInches = Math.round(centimetres / CM_PER_INCH);
  return {
    feet: Math.floor(totalInches / INCHES_PER_FOOT),
    inches: totalInches % INCHES_PER_FOOT,
  };
}

/** "74.5 kg" / "164.2 lb". */
export function formatBodyWeight(kilograms: number, unit: BodyLoadUnit): string {
  return `${fromKilograms(kilograms, unit)} ${unit}`;
}

/** "178 cm" / "5′ 10″". */
export function formatHeight(centimetres: number, unit: BodyLoadUnit): string {
  if (heightUnitFor(unit) === "cm") return `${round(centimetres, 1)} cm`;
  const { feet, inches } = toFeetAndInches(centimetres);
  return `${feet}′ ${inches}″`;
}

/**
 * Whole years old on `onDate`, both as ISO `YYYY-MM-DD`. Null when the birth date is in the
 * future, which is the only way this can be asked an unanswerable question.
 */
export function ageOn(dateOfBirth: string, onDate: string): number | null {
  const [birthYear, birthMonth, birthDay] = dateOfBirth.split("-").map(Number);
  const [year, month, day] = onDate.split("-").map(Number);
  if (!birthYear || !birthMonth || !birthDay || !year || !month || !day) return null;
  const hadBirthday = month > birthMonth || (month === birthMonth && day >= birthDay);
  const age = year - birthYear - (hadBirthday ? 0 : 1);
  return age < 0 ? null : age;
}
