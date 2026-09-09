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

/**
 * The shared catalogue of equipment every gym is built from. These are kinds of machine, not
 * machines: the specific pec deck at your gym is an `equipment_instances` row that points here,
 * because two pec decks never share a stack number. Slugs are permanent — the seed upserts on
 * them, so renaming one would orphan every machine registered against it.
 *
 * Nothing here belongs to a user or a gym. Users register the machines their own gyms have.
 */
export const EQUIPMENT_TYPES: readonly EquipmentTypeSeed[] = [
  // --- Free weights ------------------------------------------------------------------------
  type("barbell", "Barbell", "free_weight", "free_weight", 10),
  type("ez_bar", "EZ curl bar", "free_weight", "free_weight", 11),
  type("dumbbells", "Dumbbells", "free_weight", "free_weight", 12),
  type("kettlebells", "Kettlebells", "free_weight", "free_weight", 13),
  type("trap_bar", "Trap / hex bar", "free_weight", "free_weight", 14),
  type("weight_plates", "Weight plates", "free_weight", "free_weight", 15),
  type("medicine_ball", "Medicine ball", "free_weight", "free_weight", 16),
  type("resistance_bands", "Resistance bands", "free_weight", "free_weight", 17, "none"),
  type("landmine", "Landmine", "free_weight", "free_weight", 18),

  // --- Bodyweight --------------------------------------------------------------------------
  type("pull_up_bar", "Pull-up bar", "bodyweight", "bodyweight", 20),
  type("bodyweight", "Bodyweight / floor", "bodyweight", "bodyweight", 21, "none"),
  type("dip_station", "Dip station", "bodyweight", "bodyweight", 22),
  type("gymnastic_rings", "Gymnastic rings", "bodyweight", "bodyweight", 23, "none"),
  type("suspension_trainer", "Suspension trainer", "bodyweight", "bodyweight", 24, "none"),
  type("captains_chair", "Captain's chair / roman chair", "bodyweight", "bodyweight", 25),
  type("plyo_box", "Plyo box", "bodyweight", "bodyweight", 26, "none"),

  // --- Machines: pressing and pulling -------------------------------------------------------
  type("smith_machine", "Smith machine", "machine", "plate_loaded", 30),
  type("chest_press_machine", "Chest press machine", "machine", "selectorized", 31),
  type("incline_press_machine", "Incline press machine", "machine", "plate_loaded", 32),
  type("shoulder_press_machine", "Shoulder press machine", "machine", "selectorized", 33),
  type("dip_machine", "Assisted dip machine", "machine", "selectorized", 34),

  // --- Cables --------------------------------------------------------------------------------
  type("cable_station", "Cable station", "cable", "selectorized", 40),
  type("cable_crossover", "Cable crossover", "cable", "selectorized", 41),
  type("functional_trainer", "Functional trainer", "cable", "selectorized", 42),
  type("seated_row_cable", "Seated cable row station", "cable", "selectorized", 43),
  type("lat_pulldown", "Lat pulldown", "machine", "selectorized", 44),
  type("chest_supported_row_machine", "Chest-supported row machine", "machine", "plate_loaded", 45),
  type("assisted_pullup", "Assisted pull-up machine", "machine", "selectorized", 46),
  type("t_bar_row", "T-bar row", "machine", "plate_loaded", 47),
  type("pullover_machine", "Pullover machine", "machine", "selectorized", 48),

  // --- Machines: shoulders, chest and arms ---------------------------------------------------
  type("pec_deck", "Pec deck (fly / reverse fly)", "machine", "selectorized", 50),
  type("rear_delt_machine", "Rear delt machine", "machine", "selectorized", 51),
  type("lateral_raise_machine", "Lateral raise machine", "machine", "selectorized", 52),
  type("preacher_bench", "Preacher curl bench", "accessory", "free_weight", 53),
  type("preacher_curl_machine", "Preacher curl machine", "machine", "selectorized", 54),
  type("biceps_curl_machine", "Biceps curl machine", "machine", "selectorized", 55),
  type("triceps_extension_machine", "Triceps extension machine", "machine", "selectorized", 56),

  // --- Machines: legs -------------------------------------------------------------------------
  type("leg_press_45", "45° leg press", "machine", "plate_loaded", 60),
  type("leg_press_horizontal", "Horizontal leg press", "machine", "selectorized", 61),
  type("leg_extension", "Leg extension", "machine", "selectorized", 62),
  type("leg_curl_seated", "Seated leg curl", "machine", "selectorized", 63),
  type("leg_curl_lying", "Lying leg curl", "machine", "selectorized", 64),
  type("leg_curl_standing", "Standing leg curl", "machine", "selectorized", 65),
  type("hip_abduction", "Hip abduction machine", "machine", "selectorized", 66),
  type("hip_adduction", "Hip adduction machine", "machine", "selectorized", 67),
  type("calf_raise_machine", "Standing calf raise machine", "machine", "selectorized", 68),
  type("seated_calf_raise", "Seated calf raise machine", "machine", "plate_loaded", 69),
  type("hip_thrust_machine", "Hip thrust / glute drive machine", "machine", "plate_loaded", 70),
  type("glute_kickback_machine", "Glute kickback machine", "machine", "selectorized", 71),
  type("hack_squat", "Hack squat", "machine", "plate_loaded", 72),
  type("belt_squat", "Belt squat machine", "machine", "plate_loaded", 73),
  type("glute_ham_raise", "Glute-ham developer", "accessory", "bodyweight", 74),

  // --- Machines: core and back ----------------------------------------------------------------
  type("ab_crunch_machine", "Ab crunch machine", "machine", "selectorized", 75),
  type("back_extension_machine", "Back extension machine", "machine", "selectorized", 76),
  type("back_extension_bench", "Back extension bench", "accessory", "bodyweight", 77),
  type("torso_rotation_machine", "Torso rotation machine", "machine", "selectorized", 78),

  // --- Benches, racks and accessories ---------------------------------------------------------
  type("flat_bench", "Flat bench", "accessory", "bodyweight", 90),
  type("adjustable_bench", "Adjustable bench", "accessory", "bodyweight", 91),
  type("decline_bench", "Decline bench", "accessory", "bodyweight", 92),
  type("power_rack", "Power rack / squat rack", "accessory", "bodyweight", 93),
  type("ab_wheel", "Ab wheel", "accessory", "bodyweight", 94, "none"),
  type("dip_belt", "Dip belt", "accessory", "free_weight", 95),
  type("foam_roller", "Foam roller", "accessory", "bodyweight", 96, "none"),
  type("jump_rope", "Jump rope", "accessory", "bodyweight", 97, "none"),

  // --- Cardio ----------------------------------------------------------------------------------
  type("treadmill", "Treadmill", "cardio", "cardio", 110, "none"),
  type("bike", "Stationary bike", "cardio", "cardio", 111, "none"),
  type("spin_bike", "Spin bike", "cardio", "cardio", 112, "none"),
  type("air_bike", "Air / assault bike", "cardio", "cardio", 113, "none"),
  type("rowing_machine", "Rowing machine", "cardio", "cardio", 114, "none"),
  type("elliptical", "Elliptical", "cardio", "cardio", 115, "none"),
  type("stair_climber", "Stair climber", "cardio", "cardio", 116, "none"),
  type("ski_erg", "Ski erg", "cardio", "cardio", 117, "none"),
];
