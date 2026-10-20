import type { GymKind } from "@/domain/types";

/**
 * The name a place is given when setup is told only its kind: the name is optional there, and
 * a home is not typed "Home" and then tapped "Home" (audit, "what is asked twice").
 */
export const SETUP_PLACE_NAMES: Record<GymKind, string> = {
  gym: "My gym",
  home: "Home",
  outdoor: "Outdoors",
};

/** The question the equipment step asks about this place, in its own words. */
export function equipmentQuestion(place: { name: string; kind: GymKind }): string {
  if (place.kind === "home") return "What do you have at home?";
  if (place.kind === "outdoor") return "What do you have outdoors?";
  return place.name === SETUP_PLACE_NAMES.gym
    ? "Anything unusual at your gym?"
    : `Anything unusual at ${place.name}?`;
}
