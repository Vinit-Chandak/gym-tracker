import type { EquipmentCategory, LoadUnit, ResistanceMode } from "../../../domain/types";

export type EquipmentTypeSeed = {
  slug: string;
  name: string;
  category: EquipmentCategory;
  defaultResistanceMode: ResistanceMode;
  defaultUnit: LoadUnit;
  sortOrder: number;
};

const type = (
  slug: string,
  name: string,
  category: EquipmentCategory,
  defaultResistanceMode: ResistanceMode,
  sortOrder: number,
  defaultUnit: LoadUnit = "kg",
): EquipmentTypeSeed => ({ slug, name, category, defaultResistanceMode, defaultUnit, sortOrder });

/** Shared equipment categories. Specific machines at a gym are `equipment_instances`. */
export const EQUIPMENT_TYPES: readonly EquipmentTypeSeed[] = [
  type("barbell", "Barbell", "free_weight", "free_weight", 10),
  type("ez_bar", "EZ curl bar", "free_weight", "free_weight", 11),
  type("dumbbells", "Dumbbells", "free_weight", "free_weight", 12),
  type("pull_up_bar", "Pull-up bar", "bodyweight", "bodyweight", 20),
  type("bodyweight", "Bodyweight / floor", "bodyweight", "bodyweight", 21, "none"),
  type("smith_machine", "Smith machine", "machine", "plate_loaded", 30),
  type("cable_station", "Cable station", "cable", "selectorized", 40),
  type("seated_row_cable", "Seated cable row station", "cable", "selectorized", 41),
  type("lat_pulldown", "Lat pulldown", "machine", "selectorized", 42),
  type("chest_supported_row_machine", "Chest-supported row machine", "machine", "plate_loaded", 43),
  type("assisted_pullup", "Assisted pull-up machine", "machine", "selectorized", 44),
  type("pec_deck", "Pec deck (fly / reverse fly)", "machine", "selectorized", 50),
  type("preacher_bench", "Preacher curl bench", "accessory", "free_weight", 51),
  type("preacher_curl_machine", "Preacher curl machine", "machine", "selectorized", 52),
  type("leg_press_45", "45° leg press", "machine", "plate_loaded", 60),
  type("leg_press_horizontal", "Horizontal leg press", "machine", "selectorized", 61),
  type("leg_extension", "Leg extension", "machine", "selectorized", 62),
  type("leg_curl_seated", "Seated leg curl", "machine", "selectorized", 63),
  type("leg_curl_lying", "Lying leg curl", "machine", "selectorized", 64),
  type("hip_abduction", "Hip abduction machine", "machine", "selectorized", 65),
  type("hip_adduction", "Hip adduction machine", "machine", "selectorized", 66),
  type("calf_raise_machine", "Calf raise machine", "machine", "selectorized", 67),
  type("hip_thrust_machine", "Hip thrust / glute drive machine", "machine", "plate_loaded", 68),
  type("back_extension_bench", "Back extension bench", "accessory", "bodyweight", 70),
  type("hack_squat", "Hack squat", "machine", "plate_loaded", 69),
  type("t_bar_row", "T-bar row", "machine", "plate_loaded", 45),
  type("dip_station", "Dip station", "bodyweight", "bodyweight", 22),
  type("kettlebells", "Kettlebells", "free_weight", "free_weight", 13),
  type("treadmill", "Treadmill", "cardio", "cardio", 80, "none"),
  type("bike", "Stationary bike", "cardio", "cardio", 81, "none"),
  type("rowing_machine", "Rowing machine", "cardio", "cardio", 82, "none"),
  type("elliptical", "Elliptical", "cardio", "cardio", 83, "none"),
];
