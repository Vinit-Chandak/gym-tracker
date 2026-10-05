/**
 * Which equipment has a line drawing, and whether the owner has approved it (plan: owner
 * decisions, illustrations). Pure data, so the seed can record the reference and any screen can
 * ask without loading a drawing.
 *
 * A draft drawing is shown only where drafts are switched on (`next dev`, or
 * `OVERLOAD_SHOW_DRAFTS=1`); elsewhere a tile shows its name and purpose without a picture.
 * Approving one is setting its status here, with the reviewer and the date.
 */
export type ArtStatus = "draft" | "approved";

export type ArtEntry = {
  status: ArtStatus;
  /** The pilot set the owner reviews and tries with beginners before the rest are drawn. */
  pilot?: boolean;
  reviewer?: string;
  reviewedOn?: string;
};

/** Keyed by drawing, which is the equipment type's or combination's slug. */
export const EQUIPMENT_ART: Readonly<Record<string, ArtEntry>> = {
  // The pilot (docs/planning/equipment-art-pilot.md): three confusable pairs, a cable station and
  // free weights, drawn first for the owner and two or three beginners to try.
  leg_press_45: { status: "draft", pilot: true },
  hack_squat: { status: "draft", pilot: true },
  leg_curl_seated: { status: "draft", pilot: true },
  leg_curl_lying: { status: "draft", pilot: true },
  chest_press_machine: { status: "draft", pilot: true },
  shoulder_press_machine: { status: "draft", pilot: true },
  cable_station: { status: "draft", pilot: true },
  dumbbells: { status: "draft", pilot: true },

  // Drawn after the pilot in the same grammar, viewpoint and scale; awaiting the owner like it.
  // Machines:
  assisted_dip_chin: { status: "draft" },
  assisted_pullup: { status: "draft" },
  biceps_curl_machine: { status: "draft" },
  chest_supported_row_machine: { status: "draft" },
  dip_machine: { status: "draft" },
  incline_press_machine: { status: "draft" },
  iso_lateral_press: { status: "draft" },
  iso_lateral_row: { status: "draft" },
  lat_pulldown: { status: "draft" },
  lat_pulldown_low_row: { status: "draft" },
  lateral_raise_machine: { status: "draft" },
  leg_extension_curl: { status: "draft" },
  pec_deck: { status: "draft" },
  preacher_curl_machine: { status: "draft" },
  pullover_machine: { status: "draft" },
  rear_delt_machine: { status: "draft" },
  shrug_machine: { status: "draft" },
  smith_machine: { status: "draft" },
  t_bar_row: { status: "draft" },
  triceps_dip_machine: { status: "draft" },
  triceps_extension_machine: { status: "draft" },
  // Free weights, bars, benches, racks and small equipment, at their own close-up scale:
  ab_wheel: { status: "draft" },
  adjustable_bench: { status: "draft" },
  back_extension_bench: { status: "draft" },
  barbell: { status: "draft" },
  battle_ropes: { status: "draft" },
  calf_block: { status: "draft" },
  captains_chair: { status: "draft" },
  decline_ab_bench: { status: "draft" },
  decline_bench: { status: "draft" },
  dip_belt: { status: "draft" },
  dip_station: { status: "draft" },
  ez_bar: { status: "draft" },
  farmers_handles: { status: "draft" },
  flat_bench: { status: "draft" },
  foam_roller: { status: "draft" },
  glute_ham_raise: { status: "draft" },
  grip_trainer: { status: "draft" },
  gymnastic_rings: { status: "draft" },
  jump_rope: { status: "draft" },
  kettlebells: { status: "draft" },
  landmine: { status: "draft" },
  medicine_ball: { status: "draft" },
  parallettes: { status: "draft" },
  plyo_box: { status: "draft" },
  power_rack: { status: "draft" },
  preacher_bench: { status: "draft" },
  pull_up_bar: { status: "draft" },
  resistance_bands: { status: "draft" },
  safety_squat_bar: { status: "draft" },
  sissy_squat_bench: { status: "draft" },
  sled: { status: "draft" },
  stability_ball: { status: "draft" },
  suspension_trainer: { status: "draft" },
  swiss_bar: { status: "draft" },
  trap_bar: { status: "draft" },
  weight_plates: { status: "draft" },
  weight_vest: { status: "draft" },
  wrist_roller: { status: "draft" },
  // Set B: the remaining machines and cables (some drawn from the front, where a side view
  // cannot show what moves), the draft catalogue's machines, and cardio.
  ab_crunch_machine: { status: "draft" },
  back_extension_machine: { status: "draft" },
  belt_squat: { status: "draft" },
  cable_crossover: { status: "draft" },
  calf_raise_machine: { status: "draft" },
  decline_press_machine: { status: "draft" },
  functional_trainer: { status: "draft" },
  glute_kickback_machine: { status: "draft" },
  high_row_machine: { status: "draft" },
  hip_abduction: { status: "draft" },
  hip_adduction: { status: "draft" },
  hip_thrust_machine: { status: "draft" },
  leg_curl_standing: { status: "draft" },
  leg_extension: { status: "draft" },
  leg_press_horizontal: { status: "draft" },
  leg_press_vertical: { status: "draft" },
  pendulum_squat: { status: "draft" },
  reverse_hyper: { status: "draft" },
  seated_calf_raise: { status: "draft" },
  seated_row_cable: { status: "draft" },
  seated_row_machine: { status: "draft" },
  torso_rotation_machine: { status: "draft" },
  wrist_curl_machine: { status: "draft" },
  air_bike: { status: "draft" },
  bike: { status: "draft" },
  elliptical: { status: "draft" },
  rowing_machine: { status: "draft" },
  ski_erg: { status: "draft" },
  spin_bike: { status: "draft" },
  stair_climber: { status: "draft" },
  treadmill: { status: "draft" },
  // The draft catalogue's benches, machines and combinations, awaiting the owner with them.
  ab_crunch_back_extension: { status: "draft" },
  biceps_triceps_machine: { status: "draft" },
  chest_press_lat_pulldown: { status: "draft" },
  flat_bench_press_station: { status: "draft" },
  hip_abduction_adduction: { status: "draft" },
  incline_bench_press_station: { status: "draft" },
  knee_raise_dip_pull_up_tower: { status: "draft" },
  leg_extension_lying_curl: { status: "draft" },
  leg_press_hack_squat: { status: "draft" },
  lever_squat_machine: { status: "draft" },
  military_press_bench: { status: "draft" },
  multi_hip_machine: { status: "draft" },
  multi_press: { status: "draft" },
};
