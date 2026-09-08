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
};

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
  const wholeMinutes = (s: number) => s >= 120 && s % 60 === 0;
  if (wholeMinutes(lo) && wholeMinutes(hi)) {
    return lo === hi ? `${lo / 60} min` : `${lo / 60}–${hi / 60} min`;
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
  transfer: "Starting guess",
  start: "No history",
};
