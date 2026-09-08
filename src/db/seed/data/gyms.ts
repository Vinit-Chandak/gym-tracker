import type { GymKind, LoadUnit, ResistanceMode } from "../../../domain/types";

export type GymSeed = {
  slug: string;
  name: string;
  kind: GymKind;
  isDefault?: boolean;
  notes?: string;
};

export type EquipmentInstanceSeed = {
  name: string;
  equipmentTypeSlug: string;
  resistanceMode: ResistanceMode;
  unit?: LoadUnit;
  loadIncrement?: number;
  notes?: string;
};

/** The user's locations. Outdoor and Home are virtual locations for runs and mobility. */
export const STARTER_GYMS: readonly GymSeed[] = [
  {
    slug: "anytime-fitness",
    name: "Anytime Fitness",
    kind: "gym",
    isDefault: true,
    notes: "Company gym. Machine list from the planning notes.",
  },
  { slug: "samsung-gym", name: "Samsung Gym", kind: "gym" },
  { slug: "society-gym", name: "Society Gym", kind: "gym" },
  { slug: "outdoor", name: "Outdoor", kind: "outdoor", notes: "Outdoor runs and mobility." },
  { slug: "home", name: "Home", kind: "home", notes: "Home mobility work." },
];

/** Equipment confirmed at Anytime Fitness in the planning notes. Other gyms start empty. */
export const ANYTIME_FITNESS_EQUIPMENT: readonly EquipmentInstanceSeed[] = [
  {
    name: "Smith machine",
    equipmentTypeSlug: "smith_machine",
    resistanceMode: "plate_loaded",
    loadIncrement: 2.5,
  },
  { name: "Cable station", equipmentTypeSlug: "cable_station", resistanceMode: "selectorized" },
  {
    name: "Assisted pull-up machine",
    equipmentTypeSlug: "assisted_pullup",
    resistanceMode: "selectorized",
  },
  { name: "Seated leg curl", equipmentTypeSlug: "leg_curl_seated", resistanceMode: "selectorized" },
  {
    name: "Pec deck",
    equipmentTypeSlug: "pec_deck",
    resistanceMode: "selectorized",
    notes: "Can be configured as a reverse pec deck.",
  },
  {
    name: "45° leg press",
    equipmentTypeSlug: "leg_press_45",
    resistanceMode: "plate_loaded",
    notes: "Slant sled.",
  },
  {
    name: "Horizontal leg press",
    equipmentTypeSlug: "leg_press_horizontal",
    resistanceMode: "selectorized",
    notes: "Seeded as a weight-stack machine; change if it is plate-loaded.",
  },
];
