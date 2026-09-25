import type { ExerciseCategory, ExerciseModality, PrescriptionType, TrainingGoal } from "./types";

/**
 * The rep range an exercise starts from, by what kind of exercise it is and what the athlete
 * is training for.
 *
 * The training reference says what the research supports — roughly 5–30 reps build muscle
 * when sets are hard, heavier work favours strength — and deliberately names no range for any
 * one exercise, because the research does not either. The library does: every shared exercise
 * carries its own default range and reps in reserve, written for that movement — a Nordic curl
 * at 4–8, a power clean at 2–5, a cable fly at 12–20. That is where a slot starts. The one
 * place the athlete's goal moves it is the main barbell lifts, which are trained for strength
 * or for size in genuinely different ranges; for those, and for an exercise the library gives
 * no range, the role table below is the default. The coach departs from either only for a
 * reason it states.
 *
 * These are defaults, not optima, and they are not a progression ladder. The bands are wide
 * enough to progress in — double progression needs room to add reps before a load step — and
 * the effort targets are ranges of whole reps in reserve, because nobody logs 1.5.
 *
 * Sources, condensed: similar hypertrophy across roughly 6–30 reps taken close to failure
 * (Schoenfeld 2017, 2021; Lopez 2021); strength favours heavier loads, ~1–6 reps (Schoenfeld
 * 2017; Lopez 2021); closer to failure helps hypertrophy on a graded scale with no exact optimum
 * (Refalo 2023; Robinson 2024); small-muscle isolation work tolerates and suits higher reps; and
 * the athlete's own REP RULES sheet (primary compounds 3–6, secondary 6–10, machine compounds
 * 6–12, arms 8–15, delts and calves 10–20, RIR 0–3). Change the table and bump the version.
 */
export const REP_BANDS_VERSION = "2026-09-25.1";

export const EXERCISE_ROLES = [
  "main_compound",
  "free_compound",
  "machine_compound",
  "isolation",
  "small_isolation",
  "trunk",
  "timed_or_distance",
  "not_resistance",
] as const;
export type ExerciseRole = (typeof EXERCISE_ROLES)[number];

/** What the athlete is training for, as far as a rep range cares. */
export type BandEmphasis = "strength" | "muscle" | "balanced";

type Band = {
  label: string;
  examples: string;
  strength: [number, number];
  muscle: [number, number];
  /** Target reps in reserve, whole numbers. */
  rir: [number, number];
};

export const REP_BANDS: Record<
  Exclude<ExerciseRole, "timed_or_distance" | "not_resistance">,
  Band
> = {
  main_compound: {
    label: "Main barbell lift",
    examples: "squat, bench press, deadlift, overhead press, barbell row",
    strength: [3, 6],
    muscle: [6, 10],
    rir: [1, 3],
  },
  free_compound: {
    label: "Other free-weight or bodyweight compound",
    examples: "dumbbell press, Romanian deadlift, split squat, pull-up, dip",
    strength: [5, 8],
    muscle: [8, 12],
    rir: [1, 3],
  },
  machine_compound: {
    label: "Machine or cable compound",
    examples: "leg press, chest press, lat pulldown, seated row, hack squat",
    strength: [6, 10],
    muscle: [8, 12],
    rir: [1, 2],
  },
  isolation: {
    label: "Isolation",
    examples: "curls, triceps extensions, leg extension, leg curl, fly, shrug",
    strength: [8, 12],
    muscle: [10, 15],
    rir: [0, 2],
  },
  small_isolation: {
    label: "Small-muscle isolation",
    examples: "lateral and rear-delt raises, calf raises, wrist work, hip abduction",
    strength: [10, 15],
    muscle: [12, 20],
    rir: [0, 2],
  },
  trunk: {
    label: "Loaded trunk work",
    examples: "cable crunch, hanging knee raise, Pallof press",
    strength: [8, 12],
    muscle: [10, 15],
    rir: [1, 2],
  },
};

const COMPOUND_PATTERNS = new Set([
  "squat",
  "hinge",
  "lunge",
  "horizontal_push",
  "incline_push",
  "decline_push",
  "vertical_push",
  "horizontal_pull",
  "vertical_pull",
]);
const SMALL_PATTERNS = new Set([
  "lateral_raise",
  "rear_delt_fly",
  "rear_delt_row",
  "front_raise",
  "calf_raise",
  "plantar_flexion",
  "dorsiflexion",
  "wrist_flexion",
  "wrist_extension",
  "grip",
  "abduction",
  "adduction",
  "hip_abduction",
  "hip_adduction",
]);
const TRUNK_PATTERNS = new Set([
  "trunk_flexion",
  "spinal_flexion",
  "trunk_rotation",
  "rotation",
  "anti_rotation",
  "anti_extension",
  "lateral_flexion",
  "anti_lateral_flexion",
  "hip_flexion",
]);
const NOT_RESISTANCE = new Set(["mobility", "gait", "carry", "conditioning", "cycling", "jump"]);

export type RoleInput = {
  slug?: string;
  category: ExerciseCategory;
  modality: ExerciseModality;
  movementPattern: string;
  defaultPrescriptionType: PrescriptionType;
  /** The library's own range for this exercise, where it has one. */
  defaultRepMin?: number | null;
  defaultRepMax?: number | null;
  defaultRir?: number | null;
};

/** Flies and crossovers share a pressing or pulling pattern with compounds, but are not. */
const FLY = /(^|-)(fly|flye|flyes|flies|crossover|pec-deck)(-|$)/;

/** What kind of exercise this is, from what the library already records about it. */
export function exerciseRole(exercise: RoleInput): ExerciseRole {
  if (exercise.defaultPrescriptionType !== "reps") return "timed_or_distance";
  if (
    exercise.category === "mobility" ||
    exercise.category === "cardio" ||
    NOT_RESISTANCE.has(exercise.movementPattern)
  )
    // The library files loaded anti-rotation work (a cable Pallof press) beside the bodyweight
    // drills (a bird dog); only the loaded kind is trained for reps.
    return exercise.movementPattern === "anti_rotation" && exercise.modality !== "bodyweight"
      ? "trunk"
      : "not_resistance";
  if (TRUNK_PATTERNS.has(exercise.movementPattern)) return "trunk";
  if (SMALL_PATTERNS.has(exercise.movementPattern)) return "small_isolation";
  if (exercise.slug && FLY.test(exercise.slug))
    return /rear-delt|reverse/.test(exercise.slug) ? "small_isolation" : "isolation";
  if (COMPOUND_PATTERNS.has(exercise.movementPattern)) {
    if (exercise.modality === "barbell" && exercise.category === "strength") return "main_compound";
    if (["machine", "cable", "smith_machine"].includes(exercise.modality))
      return "machine_compound";
    return "free_compound";
  }
  return "isolation";
}

/** A goal read as an emphasis: strength first, muscle first, or strength on the main lifts. */
export function bandEmphasis(goal: TrainingGoal | null | undefined): BandEmphasis {
  if (goal === "get_stronger") return "strength";
  if (goal === "build_muscle") return "muscle";
  return "balanced";
}

export type DefaultBand = {
  role: ExerciseRole;
  /** Null for work counted in seconds or metres, and for what is not resistance training. */
  reps: [number, number] | null;
  rir: [number, number] | null;
  /** Where the range came from: the exercise's own library default, or its role's band. */
  source: "exercise" | "role" | null;
};

/** The library's own range for an exercise, when it gives one. */
function ownRange(exercise: RoleInput): [number, number] | null {
  const { defaultRepMin: min, defaultRepMax: max } = exercise;
  return min != null && max != null && min <= max ? [min, max] : null;
}

/** A single library RIR as a whole-rep range ending at it: 2 → 1–2. */
function ownRir(exercise: RoleInput): [number, number] | null {
  const rir = exercise.defaultRir;
  if (rir == null) return null;
  return [Math.max(0, Math.ceil(rir) - 1), Math.ceil(rir)];
}

const overlaps = (a: readonly [number, number], b: readonly [number, number]) =>
  a[0] <= b[1] && b[0] <= a[1];

/**
 * The range a slot of this exercise starts from.
 *
 * The exercise's own library range, except on a main barbell lift, where the goal decides:
 * "balanced" — how most people who want both train — and "strength" put the main lifts in the
 * strength band, "muscle" in the muscle band. A lift the library keeps well clear of both, such
 * as a power clean at 2–5, is not trained like a squat, and keeps its own range.
 */
export function defaultBand(exercise: RoleInput, emphasis: BandEmphasis): DefaultBand {
  const role = exerciseRole(exercise);
  if (role === "timed_or_distance" || role === "not_resistance")
    return { role, reps: null, rir: null, source: null };
  const band = REP_BANDS[role];
  const own = ownRange(exercise);
  if (role === "main_compound") {
    const reps = emphasis === "muscle" ? band.muscle : band.strength;
    if (!own || overlaps(reps, own)) return { role, reps, rir: band.rir, source: "role" };
  }
  if (own) return { role, reps: own, rir: ownRir(exercise) ?? band.rir, source: "exercise" };
  return {
    role,
    reps: emphasis === "strength" ? band.strength : band.muscle,
    rir: band.rir,
    source: "role",
  };
}

/** How far a rep range sits outside a band, in reps at its nearer end; zero inside. */
export function bandDistance(reps: readonly [number, number], band: readonly [number, number]) {
  const below = Math.max(0, band[0] - reps[0]);
  const above = Math.max(0, reps[1] - band[1]);
  return Math.max(below, above);
}

/**
 * The narrowest rep range that still leaves room to progress by reps before a load step.
 *
 * A fixed target such as 5×5 is normal on a main lift, which progresses by load; anywhere
 * else a zero-width range stalls double progression, because there is no rep to add.
 */
export function tooNarrowToProgress(role: ExerciseRole, reps: readonly [number, number]): boolean {
  if (role === "main_compound" || role === "timed_or_distance" || role === "not_resistance")
    return false;
  return reps[1] - reps[0] < 2;
}

/** The table, as the coach is given it once per job. */
export function repBandTable(emphasis: BandEmphasis) {
  return {
    version: REP_BANDS_VERSION,
    emphasis,
    roles: Object.entries(REP_BANDS).map(([role, band]) => ({
      role,
      label: band.label,
      examples: band.examples,
      reps:
        emphasis === "strength" || (emphasis === "balanced" && role === "main_compound")
          ? band.strength
          : band.muscle,
      rir: band.rir,
    })),
    meaning:
      "Where a new slot's rep range starts. Each exercise lookup names its band: the exercise's own library range, except on the main barbell lifts, where this table's band for the athlete's goal applies (and for an exercise with no library range, its role's band here). Depart from it only for a reason you state in the rationale — the athlete's preference, a restriction, the machine's load step, or their logged history — and keep a rep range at least two reps wide outside the main lifts, so reps can build before a load step. These are practical defaults, not optima; the server's progression limits still apply.",
  };
}
