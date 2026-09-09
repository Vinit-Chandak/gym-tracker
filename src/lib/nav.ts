import type { Route } from "next";
import {
  CalendarDays,
  Dumbbell,
  Footprints,
  type LucideIcon,
  MapPin,
  Settings,
  TrendingUp,
} from "lucide-react";

export type NavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
};

/** Bottom navigation tabs, in display order. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/today", label: "Today", icon: Dumbbell },
  { href: "/runs", label: "Runs", icon: Footprints },
  { href: "/history", label: "History", icon: CalendarDays },
  { href: "/progress", label: "Progress", icon: TrendingUp },
  { href: "/gyms", label: "Gyms", icon: MapPin },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Detail screens belong to the same primary section as their entry point. */
export function isNavItemActive(pathname: string, href: string): boolean {
  const sectionPath = pathname.startsWith("/workouts/")
    ? "/today"
    : pathname === "/exercises" || pathname.startsWith("/exercises/")
      ? "/settings"
      : pathname;
  return sectionPath === href || sectionPath.startsWith(`${href}/`);
}
