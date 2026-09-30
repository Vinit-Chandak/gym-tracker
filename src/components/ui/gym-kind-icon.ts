import { Home, MapPin, Outdoors, type AppIcon } from "@/components/ui/icons";
import type { GymKind } from "@/domain/types";

/** What a place is, at a glance: a pin for a gym, a house for home, a tree for outdoors. */
export const GYM_KIND_ICON: Record<GymKind, AppIcon> = {
  gym: MapPin,
  home: Home,
  outdoor: Outdoors,
};
