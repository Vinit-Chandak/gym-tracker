import type { GymKind } from "../../../domain/types";

/**
 * Equipment a kind of location is taken to have until someone says otherwise (owner decision,
 * 4 October 2026). At a commercial gym these are the basics: the free weights, benches and racks
 * every gym has, the near-universal stations and the machines nearly every gym floor carries.
 * Specialty bars (trap, safety squat, Swiss) are not basics. Nothing is assumed at home or
 * outdoors: equipment nobody has answered for there is unknown, and asked about when needed.
 *
 * An explicit absence at a gym ("Not here") always overrides an assumption. Where a basic is a
 * family ("a leg press", "a leg curl"), the variant listed is the one assumed; the others are
 * offered through "A different one".
 */
export const ASSUMED_EQUIPMENT: Readonly<Record<GymKind, readonly string[]>> = {
  gym: [
    // Free weights, benches and racks: never asked about.
    "barbell",
    "ez_bar",
    "dumbbells",
    "weight_plates",
    "flat_bench",
    "adjustable_bench",
    "decline_bench",
    "power_rack",
    // Near-universal stations.
    "pull_up_bar",
    "dip_station",
    "back_extension_bench",
    // Machines: assumed, and confirmed with one tap the first time an exercise needs one.
    "cable_station",
    "lat_pulldown",
    "seated_row_cable",
    "leg_press_45",
    "leg_extension",
    "leg_curl_seated",
    "pec_deck",
  ],
  home: [],
  outdoor: [],
};
