import type { AvailabilityStatus } from "@/domain/equipment-resolution";
import type { BodyRegion } from "@/domain/muscles";
import type { SuggestionKind } from "@/domain/progression";
import type {
  EquipmentCategory,
  ExerciseCategory,
  ExerciseModality,
  GymKind,
  LoadPortability,
  LoadUnit,
  MuscleGroup,
  PrescriptionType,
  RunMode,
  ResistanceMode,
} from "@/domain/types";

export const GYM_KIND_LABELS: Record<GymKind, string> = {
  gym: "Gym",
  outdoor: "Outdoor",
  home: "Home",
};

export const RESISTANCE_MODE_LABELS: Record<ResistanceMode, string> = {
  free_weight: "Free weight",
  plate_loaded: "Plate-loaded",
  selectorized: "Weight stack",
  bodyweight: "Bodyweight",
  cardio: "Cardio",
};

export const LOAD_UNIT_LABELS: Record<LoadUnit, string> = {
  kg: "kg",
  lb: "lb",
  plate_count: "Plates",
  stack_index: "Stack #",
  none: "None",
};

export const EQUIPMENT_CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  free_weight: "Free weights",
  machine: "Machines",
  cable: "Cables",
  bodyweight: "Bodyweight",
  cardio: "Cardio",
  accessory: "Accessories",
};

export const PRESCRIPTION_TYPE_LABELS: Record<PrescriptionType, string> = {
  reps: "Reps",
  duration: "Time",
  distance: "Distance",
};

/** The set grid's third column: what one set of this exercise is actually counted in. */
export const MEASURE_COLUMN_LABELS: Record<PrescriptionType, string> = {
  reps: "Reps",
  duration: "Seconds",
  distance: "Metres",
};

/** The unit that follows a number of this measure, e.g. "25 m". */
export const MEASURE_UNIT_SUFFIX: Record<PrescriptionType, string> = {
  reps: "",
  duration: " s",
  distance: " m",
};

/**
 * What one exercise's RIR target means, in the words of that exercise.
 *
 * Reps in reserve is a rep count everywhere the movement has reps; on timed and
 * distance-measured work there are no reps to leave, so the same number has to be said as time
 * or ground left instead. The exercise's own note, when the library has one, replaces this.
 */
export function rirMeaning(measure: PrescriptionType): string {
  switch (measure) {
    case "duration":
      return "Reps in reserve, read as time: 2 RIR means you could have held it roughly two more repetitions' worth — a few more seconds — not that you held to failure.";
    case "distance":
      return "Reps in reserve, read as ground: 2 RIR means you could have carried it a fair way further at the same quality. Put it down before the grip or the posture goes, not after.";
    default:
      return "Reps in reserve: how many more good reps you could have done. 2 RIR means you stopped two reps short of failure; 0 RIR means the next rep would not have moved.";
  }
}

/** "1 machine", "3 machines", "No equipment yet". */
export function equipmentCountLabel(count: number): string {
  if (count === 0) return "No equipment yet";
  return count === 1 ? "1 machine" : `${count} machines`;
}

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: "Chest",
  front_delts: "Front delts",
  side_delts: "Side delts",
  rear_delts: "Rear delts",
  lats: "Lats",
  upper_back: "Upper back",
  traps: "Traps",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  adductors: "Adductors",
  abductors: "Abductors",
  calves: "Calves",
  abs: "Abs",
  obliques: "Obliques",
  lower_back: "Lower back",
  hip_flexors: "Hip flexors",
};

export const BODY_REGION_LABELS: Record<BodyRegion, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  hips: "Hips",
  calves: "Calves",
  core: "Core",
};

export const EXERCISE_CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  strength: "Strength",
  hypertrophy: "Hypertrophy",
  cardio: "Cardio",
  mobility: "Mobility",
};

export const EXERCISE_MODALITY_LABELS: Record<ExerciseModality, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  bodyweight: "Bodyweight",
  cable: "Cable",
  machine: "Machine",
  smith_machine: "Smith machine",
  cardio: "Cardio",
  mobility: "Mobility",
};

export const LOAD_PORTABILITY_LABELS: Record<LoadPortability, string> = {
  global: "Comparable across gyms",
  equipment_specific: "Compared per machine",
  context_dependent: "Compared per setup",
};

export const LOAD_PORTABILITY_HELP: Record<LoadPortability, string> = {
  global: "The load means the same everywhere, so history from any gym counts.",
  equipment_specific:
    "Stack numbers differ between machines, so history only counts on the exact machine.",
  context_dependent:
    "Depends on the bar or setup used, so history is kept per machine to stay honest.",
};

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  direct: "Available",
  fallback: "Fallback",
  unknown: "Unknown",
  unavailable: "Unavailable",
};

/** "6–10" or "20–45 s"; single values collapse to one number. */
export function rangeLabel(min: number | null, max: number | null, suffix = ""): string {
  if (min === null && max === null) return "—";
  if (min === null || max === null || min === max) return `${min ?? max}${suffix}`;
  return `${min}–${max}${suffix}`;
}

/** "2 min", "90 s", "3–4 min". */
export function restLabel(minSeconds: number | null, maxSeconds: number | null): string {
  if (minSeconds === null && maxSeconds === null) return "—";
  const lo = minSeconds ?? maxSeconds ?? 0;
  const hi = maxSeconds ?? minSeconds ?? 0;
  // Two minutes and over reads in minutes, halves included, so a single exercise's rest
  // target matches how the programme states it: 210 s is "3.5 min", not "210 s".
  const inMinutes = (s: number) => String(Math.round((s / 60) * 10) / 10);
  if (lo >= 120 && hi >= 120) {
    return lo === hi ? `${inMinutes(lo)} min` : `${inMinutes(lo)}–${inMinutes(hi)} min`;
  }
  return lo === hi ? `${lo} s` : `${lo}–${hi} s`;
}

export const SET_TYPE_LABELS: Record<import("@/domain/types").SetType, string> = {
  warmup: "Warm-up",
  working: "Working",
  backoff: "Back-off",
  drop: "Drop",
  amrap: "AMRAP",
  failure: "To failure",
};

export const SLOT_STATUS_LABELS = {
  pending: "Pending",
  completed: "Done",
  skipped: "Skipped",
  not_in_programme: "Not this cycle",
} as const;

export const SUGGESTION_KIND_LABELS: Record<SuggestionKind, string> = {
  increase: "Add load",
  hold: "Hold",
  repeat: "Repeat",
  reduce: "Reduce",
  extend: "Add time",
  lengthen: "Add distance",
  transfer: "Starting guess",
  start: "No history",
  coach: "Coach plan",
};

export const RUN_MODE_LABELS: Record<RunMode, string> = {
  outdoor: "Outdoor",
  treadmill: "Treadmill",
};

/** ISO weekday (1 = Monday) to a short name. */
export const WEEKDAY_SHORT: readonly string[] = [
  "",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];
