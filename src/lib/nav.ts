import type { Route } from "next";
import {
  CalendarDays,
  Dumbbell,
  Footprints,
  type LucideIcon,
  Settings,
  TrendingUp,
} from "lucide-react";

export type NavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
};

/**
 * Bottom navigation tabs, in display order.
 *
 * Five, not six: Gyms is a place you set up once and then rarely touch, so it lives behind
 * Settings › Gyms and machines rather than taking a permanent share of the thumb's reach.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/today", label: "Today", icon: Dumbbell },
  { href: "/runs", label: "Runs", icon: Footprints },
  { href: "/history", label: "History", icon: CalendarDays },
  { href: "/progress", label: "Progress", icon: TrendingUp },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Sections reached from Settings, which keep Settings selected while you are in them. */
const UNDER_SETTINGS = ["/exercises", "/gyms"];

const withinSection = (pathname: string, section: string) =>
  pathname === section || pathname.startsWith(`${section}/`);

/** Detail screens belong to the same primary section as their entry point. */
export function isNavItemActive(pathname: string, href: string): boolean {
  const sectionPath = pathname.startsWith("/workouts/")
    ? "/today"
    : UNDER_SETTINGS.some((section) => withinSection(pathname, section))
      ? "/settings"
      : pathname;
  return withinSection(sectionPath, href);
}

/**
 * The name of the section a path belongs to, for the eyebrow above a page's title: a
 * screen opened from Gyms says "GYMS" over its own name, so the header carries the trail
 * the back chevron only hints at.
 */
const SECTION_LABELS: Record<string, string> = {
  today: "Today",
  runs: "Runs",
  history: "History",
  progress: "Progress",
  settings: "Settings",
  gyms: "Gyms",
  exercises: "Exercises",
  workouts: "Workout",
};

export function sectionLabel(path: string): string | undefined {
  return SECTION_LABELS[path.split(/[?#]/)[0]!.split("/")[1] ?? ""];
}
