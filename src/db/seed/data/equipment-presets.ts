import type { GymKind } from "../../../domain/types";

/**
 * What the machines step suggests (owner decision, onboarding), per kind of location and answer
 * to "Which sounds like you?". At a gym the basics come first as one line, "Usually here (N)", from
 * the assumed equipment; these are the extras shown after it. People who already train see every
 * type instead, so they need no preset. Items name a type, a family (its variant is asked) or a
 * combination, in the order shown.
 *
 * The gym extras are the plan's draft list, at the 8–12 display limit, to be trimmed after the
 * pilot with beginners. Bump `version` whenever a list changes.
 */
export type EquipmentPresetSeed = {
  slug: string;
  gymKind: GymKind;
  experience: "new" | "experienced" | "any";
  version: number;
  items: readonly ({ type: string } | { family: string } | { combination: string })[];
};

export const EQUIPMENT_PRESETS: readonly EquipmentPresetSeed[] = [
  {
    slug: "gym-new-extras",
    gymKind: "gym",
    experience: "new",
    version: 1,
    items: [
      { family: "chest_press" },
      { type: "shoulder_press_machine" },
      { type: "smith_machine" },
      { combination: "assisted_dip_chin" },
      { type: "hip_abduction" },
      { type: "hip_adduction" },
      { family: "calf_raise" },
      { type: "hack_squat" },
      { type: "preacher_bench" },
      { type: "chest_supported_row_machine" },
      { type: "ab_crunch_machine" },
      { type: "hip_thrust_machine" },
    ],
  },
  {
    slug: "home-new",
    gymKind: "home",
    experience: "new",
    version: 1,
    items: [
      { type: "dumbbells" },
      { type: "kettlebells" },
      { type: "resistance_bands" },
      { type: "adjustable_bench" },
      { type: "flat_bench" },
      { type: "pull_up_bar" },
      { type: "barbell" },
      { type: "weight_plates" },
      { type: "power_rack" },
      { type: "ab_wheel" },
      { type: "jump_rope" },
      { type: "foam_roller" },
    ],
  },
  {
    slug: "outdoor-any",
    gymKind: "outdoor",
    experience: "any",
    version: 1,
    items: [
      { type: "pull_up_bar" },
      { type: "dip_station" },
      { type: "flat_bench" },
      { type: "plyo_box" },
    ],
  },
];
