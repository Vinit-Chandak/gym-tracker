import type { ExerciseCategory, ExerciseModality, PrescriptionType, TrainingGoal } from "./types";

/**
 * The rep range an exercise starts from, by what kind of exercise it is and what the athlete
 * is training for.
 *
 * The training reference says what the research supports — roughly 5–30 reps build muscle
 * when sets are hard, heavier work favours strength — and deliberately names no range for any
 * one exercise, because the research does not either. That left every range in a new
 * programme to the model's judgement on the night, different from one run to the next. This
 * is the missing middle: a practical default per role, inside what the reference supports,
 * that the coach starts from and departs from only for a reason it states.
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
  category: ExerciseCategory;
  modality: ExerciseModality;
  movementPattern: string;
  defaultPrescriptionType: PrescriptionType;
};

/** What kind of exercise this is, from what the library already records about it. */
export function exerciseRole(exercise: RoleInput): ExerciseRole {
  if (exercise.defaultPrescriptionType !== "reps") return "timed_or_distance";
  if (
    exercise.category === "mobility" ||
    exercise.category === "cardio" ||
    NOT_RESISTANCE.has(exercise.movementPattern)
  )
    return exercise.movementPattern === "anti_rotation" ? "trunk" : "not_resistance";
  if (TRUNK_PATTERNS.has(exercise.movementPattern)) return "trunk";
  if (SMALL_PATTERNS.has(exercise.movementPattern)) return "small_isolation";
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
};

/**
 * The band a slot of this exercise starts from.
 *
 * "Balanced" is how most people who want both train: the main lifts in the strength band,
 * everything else in the muscle band. A programme that puts strength first — as the athlete's
 * own does — gets that without having to say so exercise by exercise.
 */
export function defaultBand(exercise: RoleInput, emphasis: BandEmphasis): DefaultBand {
  const role = exerciseRole(exercise);
  if (role === "timed_or_distance" || role === "not_resistance")
    return { role, reps: null, rir: null };
  const band = REP_BANDS[role];
  const strength = emphasis === "strength" || (emphasis === "balanced" && role === "main_compound");
  return { role, reps: strength ? band.strength : band.muscle, rir: band.rir };
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
      "Default rep ranges by exercise role for this athlete's goal. Start every new slot from its role's band (each exercise lookup names its role and band). Depart from it only for a reason you state in the rationale — the athlete's preference, a restriction, the machine's load step, or their logged history — and keep a rep range at least two reps wide outside the main lifts, so reps can build before a load step. These are practical defaults, not optima; the server's progression limits still apply.",
  };
}
