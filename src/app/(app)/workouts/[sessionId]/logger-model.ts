import type { GlyphName } from "@/components/ui/glyphs";
import { emWidth, onRamp } from "@/components/ui/fit";
import type { PrescriptionType, SetType } from "@/domain/types";
import { MEASURE_UNIT_SUFFIX, rangeLabel, restLabel } from "@/lib/labels";

import type { RowState } from "./use-set-rows";
import type { ExerciseVM, SessionVM } from "./view-model";

/**
 * What one exercise is counted in. The programme slot decides; an exercise added on the spot
 * falls back to what the library says the movement is measured in, so a carry asks for metres
 * rather than for reps it does not have.
 */
export function measureOf(exercise: ExerciseVM): PrescriptionType {
  return exercise.planned?.prescriptionType ?? exercise.exercise.defaultPrescriptionType;
}

/** The plan's range in the exercise's own measure: "8–12", "20–45 s", "20–30 m". */
export function volumeRange(exercise: ExerciseVM): string | null {
  const p = exercise.planned;
  if (!p) return null;
  const suffix = MEASURE_UNIT_SUFFIX[p.prescriptionType];
  switch (p.prescriptionType) {
    case "duration":
      return rangeLabel(p.durationMinSeconds, p.durationMaxSeconds, suffix);
    case "distance":
      return rangeLabel(p.distanceMinMeters, p.distanceMaxMeters, suffix);
    default:
      return rangeLabel(p.repMin, p.repMax);
  }
}

/**
 * The range a set aims at, for the Log tab's meta line: "3–5 reps", "20–40 m". How many sets
 * and the RIR target are the entry's, so they are not said twice (DESIGN.md, Layout).
 */
export function perSetLabel(exercise: ExerciseVM): string | null {
  const p = exercise.planned;
  const range = volumeRange(exercise);
  if (!p || range === null) return null;
  return `${range}${p.prescriptionType === "reps" ? " reps" : ""}${p.perSide ? " per side" : ""}`;
}

/** The whole prescription, where there is no entry to say the rest: "4 × 3–5 @ 2 RIR". */
export function prescriptionLabel(exercise: ExerciseVM): string | null {
  const p = exercise.planned;
  if (!p) return null;
  return `${p.sets} × ${volumeRange(exercise)}${p.perSide ? " per side" : ""}${
    p.prescriptionType === "reps" ? ` @ ${rangeLabel(p.rirMin, p.rirMax)} RIR` : ""
  }`;
}

/** "3–4 min", or null when the plan says nothing about rest. */
export function restText(exercise: ExerciseVM): string | null {
  const p = exercise.planned;
  if (!p || (p.restMinSeconds === null && p.restMaxSeconds === null)) return null;
  return restLabel(p.restMinSeconds, p.restMaxSeconds);
}

/**
 * What this gym's machine adds to the meta line: "on Cable station", "with Dumbbells". Nothing
 * where the exercise's name already says it ("High-bar barbell squat" on Barbell, "Smith machine
 * calf raise" on Smith machine), so the line never repeats the title.
 */
export function equipmentFact(exercise: ExerciseVM): string | null {
  const equipment = exercise.equipment?.name;
  if (!equipment) return null;
  const words = (text: string) =>
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}°]+/u)
      .filter(Boolean)
      .map((word) => word.replace(/s$/, ""));
  const named = new Set(words(exercise.exercise.name));
  if (words(equipment).every((word) => named.has(word))) return null;
  const free = ["barbell", "dumbbell"].includes(exercise.exercise.modality);
  return `${free ? "with" : "on"} ${equipment}`;
}

/** The machine, or what stands in for one. The gym itself is session context, not row chrome. */
export function equipmentLine(exercise: ExerciseVM, gymKind: string): string {
  if (exercise.equipment) return exercise.equipment.name;
  if (!exercise.exercise.requiresEquipment) return "No equipment";
  if (
    gymKind === "gym" &&
    ["barbell", "dumbbell", "bodyweight", "mobility"].includes(exercise.exercise.modality)
  ) {
    return exercise.exercise.modality === "bodyweight" ? "Bodyweight" : "Free weights";
  }
  return "Machine not chosen";
}

/**
 * The equipment's glyph (DESIGN.md, Shapes): free weights as a dumbbell, a machine, a cable,
 * a Smith machine, bodyweight. Cardio stands on a machine when it needs one.
 */
export function equipmentGlyph(exercise: ExerciseVM): GlyphName {
  switch (exercise.exercise.modality) {
    case "barbell":
    case "dumbbell":
      return "dumbbell";
    case "cable":
      return "cable";
    case "machine":
      return "machine";
    case "smith_machine":
      return "smith";
    case "cardio":
      return exercise.exercise.requiresEquipment ? "machine" : "bodyweight";
    default:
      return "bodyweight";
  }
}

/** The RIR this exercise's set aims at: the coach's for that set, else the programme's. */
export function rirTarget(exercise: ExerciseVM, setIndex: number): number | null {
  const coach = exercise.suggestion?.kind === "coach";
  const own = coach ? exercise.suggestion?.sets.find((set) => set.setIndex === setIndex) : null;
  if (own && own.rir !== null) return own.rir;
  return exercise.planned?.rirMin ?? exercise.planned?.rirMax ?? null;
}

/** The target as the entry says it under RIR: "2", "2–3". */
export function rirTargetLabel(exercise: ExerciseVM, setIndex: number): string | null {
  const coach = exercise.suggestion?.kind === "coach";
  const own = coach ? exercise.suggestion?.sets.find((set) => set.setIndex === setIndex) : null;
  if (own && own.rir !== null) return String(own.rir);
  const p = exercise.planned;
  if (!p || (p.rirMin === null && p.rirMax === null)) return null;
  return rangeLabel(p.rirMin, p.rirMax);
}

/** Warm-ups stand on their own line; everything else is a set. */
export const isWarmup = (type: SetType) => type === "warmup";

/**
 * How many working sets the plan asks for: the coach's own count when the coach wrote the day,
 * else the programme's. Null when nothing says (an exercise added on the spot).
 */
export function plannedSets(exercise: ExerciseVM): number | null {
  if (exercise.suggestion?.kind === "coach") {
    const work = exercise.suggestion.sets.filter((set) => !isWarmup(set.setType)).length;
    return work > 0 ? work : (exercise.planned?.sets ?? null);
  }
  return exercise.planned?.sets ?? null;
}

/**
 * A set's number as the log and the entry say it: its place among the sets that are not
 * warm-ups, counting the rows before it whether or not they are done.
 */
export function setNumber(rows: readonly RowState[], row: RowState): number {
  return 1 + rows.filter((r) => r.setIndex < row.setIndex && !isWarmup(r.setType)).length;
}

export type EntryHeading =
  { kind: "warmup"; n: number; of: number } | { kind: "set"; n: number; of: number | null };

/** "Warm-up 2 of 3", "Set 3 of 4", or "Set 5" alone past the plan (DESIGN.md, The log). */
export function entryHeading(
  rows: readonly RowState[],
  row: RowState,
  exercise: ExerciseVM,
): EntryHeading {
  if (isWarmup(row.setType)) {
    const warmups = rows.filter((r) => isWarmup(r.setType));
    return {
      kind: "warmup",
      n: warmups.filter((r) => r.setIndex <= row.setIndex).length,
      of: warmups.length,
    };
  }
  const n = setNumber(rows, row);
  const of = plannedSets(exercise);
  return { kind: "set", n, of: of !== null && n <= of ? of : null };
}

export function headingText(heading: EntryHeading): string {
  const name = heading.kind === "warmup" ? "Warm-up" : "Set";
  return heading.of === null ? `${name} ${heading.n}` : `${name} ${heading.n} of ${heading.of}`;
}

/**
 * The exercise a superset goes to after each set: the next member of its group in the
 * workout's order, round to the first.
 */
export function supersetNext(session: SessionVM, exercise: ExerciseVM): ExerciseVM | null {
  if (!exercise.supersetGroup) return null;
  const group = session.exercises
    .filter((other) => other.supersetGroup === exercise.supersetGroup)
    .sort((a, b) => a.orderIndex - b.orderIndex);
  if (group.length < 2) return null;
  const at = group.findIndex((other) => other.id === exercise.id);
  return group[(at + 1) % group.length] ?? null;
}

// ---------- fitting figures to the entry's columns ----------

/** The gutter: 20 pt, 16 under 360 pt wide (DESIGN.md, Layout). */
export const gutterFor = (width: number) => (width < 360 ? 16 : 20);
/** The set's number column, at the edge of the log and the entry. */
export const NUMBER_COLUMN = 18;
/** The operators' column: as wide as the entry's, narrower under 380 pt. */
export const operatorColumn = (width: number) => (width - 2 * gutterFor(width) < 340 ? 14 : 18);

/** One figure column of the entry and the log, at a screen width. */
export function figureColumn(width: number): number {
  const content = width - 2 * gutterFor(width);
  return (content - NUMBER_COLUMN - 2 * operatorColumn(width)) / 3;
}

/**
 * The entry's figure size: 42 at most, stepping down the ramp until the widest of load, reps
 * and effort fits its column, never under 28. `grow` is how much larger figures are drawn at
 * the reader's text size, so the fit holds at 150% as at 100%.
 */
export function entrySize(texts: readonly string[], width: number, grow = 1): number {
  const widest = Math.max(1e-6, ...texts.map(emWidth));
  const fit = Math.floor((figureColumn(width) - 6) / (widest * grow));
  return onRamp(Math.max(28, Math.min(42, fit)));
}

/**
 * The log's figure size: 32 at most (26 in History), stepping down the ramp until the widest
 * load fits its column (DESIGN.md: 102.5 takes 28 at 360 dp and 26 at 320 pt), never under 20.
 */
export function logSize(loads: readonly string[], width: number, grow = 1, max = 32): number {
  const widest = Math.max(1, ...loads.map(emWidth));
  const fit = Math.floor((figureColumn(width) - 8) / (widest * grow));
  return onRamp(Math.max(20, Math.min(max, fit)));
}

/** A number as the entry writes it: no trailing zeros, a point for decimals. */
export function figureText(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}
