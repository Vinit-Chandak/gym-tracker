import type {
  EquipmentCategory,
  GymKind,
  LoadUnit,
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
