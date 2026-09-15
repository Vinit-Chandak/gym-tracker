import type { Route } from "next";
import {
  CalendarDays,
  Dumbbell,
  Footprints,
  type AppIcon,
  TrendingUp,
  User,
} from "@/components/ui/icons";

export type NavItem = {
  href: Route;
  label: string;
  icon: AppIcon;
};

/**
 * Bottom navigation tabs, in display order.
 *
 * Five, not six: Gyms is a place you set up once and then rarely touch, so it lives behind
 * Profile › Gyms and machines rather than taking a permanent share of the thumb's reach.
 *
 * The fifth tab is Profile, not Settings (ADR 0026): it keeps every setting it had and gains
 * who you are and, later, the people you follow. Renaming the tab rather than adding a sixth
 * keeps the island at five.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/today", label: "Today", icon: Dumbbell },
  { href: "/runs", label: "Runs", icon: Footprints },
  { href: "/history", label: "History", icon: CalendarDays },
  { href: "/progress", label: "Progress", icon: TrendingUp },
  { href: "/profile", label: "Profile", icon: User },
];

/** Sections reached from Profile, which keep Profile selected while you are in them. */
const UNDER_PROFILE = ["/exercises", "/gyms", "/u"];

const withinSection = (pathname: string, section: string) =>
  pathname === section || pathname.startsWith(`${section}/`);

/** Detail screens belong to the same primary section as their entry point. */
export function isNavItemActive(pathname: string, href: string): boolean {
  const sectionPath = pathname.startsWith("/workouts/")
    ? "/today"
    : UNDER_PROFILE.some((section) => withinSection(pathname, section))
      ? "/profile"
      : pathname;
  return withinSection(sectionPath, href);
}

/**
 * The name of the section a path belongs to, which is what a page's back control is called:
 * a screen opened from Gyms goes back to "Gyms", so the chevron names its destination
 * rather than leaving you to guess where it lands.
 */
const SECTION_LABELS: Record<string, string> = {
  today: "Today",
  runs: "Runs",
  history: "History",
  progress: "Progress",
  profile: "Profile",
  gyms: "Gyms",
  exercises: "Exercises",
  workouts: "Workout",
  u: "People",
};

export function sectionLabel(path: string): string | undefined {
  return SECTION_LABELS[path.split(/[?#]/)[0]!.split("/")[1] ?? ""];
}
