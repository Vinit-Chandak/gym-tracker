import type { GlyphName } from "@/components/ui/glyphs";
import { emWidth, onRamp } from "@/components/ui/fit";
import type { PrescriptionType, SetType } from "@/domain/types";
import { targetsLine } from "@/components/planned-exercises";
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

/**
 * The range a set aims at in the exercise's own measure: "8–12", "20–45 s", "20–30 m". The
 * programme slot's, or for an exercise nothing planned, the library's defaults (plan: today's
 * targets, ad hoc exercises keep their defaults).
 */
export function volumeRange(exercise: ExerciseVM): string | null {
  const p = exercise.planned;
  const d = exercise.exercise.defaults;
  const measure = measureOf(exercise);
  const suffix = MEASURE_UNIT_SUFFIX[measure];
  const range = (min: number | null, max: number | null) =>
    min === null && max === null ? null : rangeLabel(min, max, suffix);
  switch (measure) {
    case "duration":
      return p
        ? rangeLabel(p.durationMinSeconds, p.durationMaxSeconds, suffix)
        : range(d.durationMinSeconds, d.durationMaxSeconds);
    case "distance":
      return p
        ? rangeLabel(p.distanceMinMeters, p.distanceMaxMeters, suffix)
        : range(d.distanceMinMeters, d.distanceMaxMeters);
    default:
      return p ? rangeLabel(p.repMin, p.repMax) : range(d.repMin, d.repMax);
  }
}

type TargetSet = NonNullable<ExerciseVM["suggestion"]>["sets"][number];

/**
 * The sets the coach wrote for today, warm-ups aside, when the session started from the coach's
 * plan (plan: today's targets): every number the workout shows for the exercise is then the
 * coach's. Null when the coach left the exercise's sets to the programme.
 */
function coachWork(exercise: ExerciseVM): TargetSet[] | null {
  if (exercise.suggestion?.kind !== "coach") return null;
  const sets = exercise.suggestion.sets;
  const working = sets.filter((set) => !isWarmup(set.setType));
  const shown = working.length > 0 ? working : sets;
  return shown.length > 0 ? shown : null;
}

/** What a coach's set counts: metres for a carry, seconds for a hold, else reps. */
function coachMeasure(set: TargetSet): PrescriptionType {
  if (set.reps === null && set.distanceMeters !== null) return "distance";
  if (set.reps === null && set.durationSeconds !== null) return "duration";
  return "reps";
}

function coachCount(set: TargetSet, measure: PrescriptionType): number | null {
  return measure === "distance"
    ? set.distanceMeters
    : measure === "duration"
      ? set.durationSeconds
      : set.reps;
}

/** "5", "5/5/3", "30 s", "20 m": what the coach's sets ask for. */
function coachVolume(sets: TargetSet[]): { text: string; measure: PrescriptionType } | null {
  const measure = coachMeasure(sets[0]!);
  const counts = sets.map((set) => coachCount(set, measure));
  if (counts.every((count) => count === null)) return null;
  const suffix = MEASURE_UNIT_SUFFIX[measure];
  const text = counts.every((count) => count === counts[0])
    ? `${counts[0]}${suffix}`
    : `${counts.map((count) => count ?? "—").join("/")}${suffix}`;
  return { text, measure };
}

/**
 * What one set aims at, for the entry's hint: the coach's figure for that set, else the range
 * ("5", "8–12", "30 s").
 */
export function countTargetLabel(exercise: ExerciseVM, setIndex: number | null): string | null {
  const coach = coachWork(exercise);
  if (coach) {
    const own = coach.find((set) => set.setIndex === setIndex) ?? coach[0]!;
    const measure = coachMeasure(own);
    const count = coachCount(own, measure);
    if (count !== null) return `${count}${MEASURE_UNIT_SUFFIX[measure]}`;
  }
  return volumeRange(exercise);
}

/**
 * The range a set aims at, for the Log tab's meta line: "3–5 reps", "20–40 m", or the coach's
 * "5 reps" when the coach wrote today's sets. How many sets and the RIR target are the entry's,
 * so they are not said twice (DESIGN.md, Layout).
 */
export function perSetLabel(exercise: ExerciseVM): string | null {
  const side = exercise.planned?.perSide ? " per side" : "";
  const coach = coachWork(exercise);
  const volume = coach ? coachVolume(coach) : null;
  if (volume) return `${volume.text}${volume.measure === "reps" ? " reps" : ""}${side}`;
  const range = volumeRange(exercise);
  if (range === null) return null;
  return `${range}${measureOf(exercise) === "reps" ? " reps" : ""}${side}`;
}

/**
 * The whole prescription, where there is no entry to say the rest: the coach's when the coach
 * wrote today's sets ("70 kg · 3 × 5 @ 2 RIR"), else the programme's ("4 × 3–5 @ 2 RIR"), else
 * the exercise's own defaults ("8–12 reps @ 2 RIR").
 */
export function prescriptionLabel(exercise: ExerciseVM, unitLabel = ""): string | null {
  const coach = coachWork(exercise);
  if (coach) {
    const line = targetsLine(coach, unitLabel, exercise.planned?.perSide ?? false);
    if (line) return line;
  }
  const p = exercise.planned;
  if (p)
    return `${p.sets} × ${volumeRange(exercise)}${p.perSide ? " per side" : ""}${
      p.prescriptionType === "reps" ? ` @ ${rangeLabel(p.rirMin, p.rirMax)} RIR` : ""
    }`;
  const range = volumeRange(exercise);
  if (range === null) return null;
  const rir = exercise.exercise.defaults.rir;
  const reps = measureOf(exercise) === "reps";
  return `${range}${reps ? " reps" : ""}${reps && rir !== null ? ` @ ${rir} RIR` : ""}`;
}

/**
 * "3–4 min": the rest the coach asked for, else the programme's, else the exercise's own
 * default; null when nothing says. The rest timer counts the same figure.
 */
export function restText(exercise: ExerciseVM): string | null {
  const seconds = restSecondsOf(exercise);
  if (exercise.coachRestSeconds !== null || !exercise.planned) {
    return seconds === null ? null : restLabel(seconds, seconds);
  }
  const p = exercise.planned;
  if (p.restMinSeconds === null && p.restMaxSeconds === null) return null;
  return restLabel(p.restMinSeconds, p.restMaxSeconds);
}

/** The rest the timer starts after a set: the coach's, else the programme's, else the default. */
export function restSecondsOf(exercise: ExerciseVM): number | null {
  return (
    exercise.coachRestSeconds ??
    (exercise.planned
      ? (exercise.planned.restMinSeconds ?? exercise.planned.restMaxSeconds)
      : exercise.exercise.defaults.restSeconds)
  );
}

/**
 * The machine, or what stands in for one. The gym itself is session context, not row chrome.
 * Whether the gym has what the exercise needs is the resolver's to say (ADR 0041), shown as the
 * decision block; this line only says what the exercise is done with.
 */
export function equipmentLine(exercise: ExerciseVM): string {
  if (exercise.equipment) return exercise.equipment.name;
  if (!exercise.exercise.requiresEquipment) return "No equipment";
  if (exercise.decision) return "Machine not chosen";
  if (exercise.exercise.modality === "bodyweight") return "Bodyweight";
  if (["barbell", "dumbbell"].includes(exercise.exercise.modality)) return "Free weights";
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
