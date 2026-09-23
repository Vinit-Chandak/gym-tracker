import type { Route } from "next";
import {
  BarChart,
  CalendarDays,
  Dumbbell,
  Footprints,
  User,
  type AppIcon,
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
 *
 * The second tab was Runs, a product of its own for one sport. It is Training: where any
 * sport is logged, scheduled and planned, with the programme behind it (plan §2.3). Still
 * five tabs, and each still has one job.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/today", label: "Today", icon: Dumbbell },
  { href: "/training", label: "Training", icon: Footprints },
  { href: "/history", label: "History", icon: CalendarDays },
  { href: "/progress", label: "Progress", icon: BarChart },
  { href: "/profile", label: "Profile", icon: User },
];

/** Sections reached from Profile, which keep Profile selected while you are in them. */
const UNDER_PROFILE = ["/exercises", "/gyms", "/u"];

/**
 * Records more than one tab opens: a workout, and a logged run, ride or swim. Each can say in
 * its link which tab it was opened from, and that tab stays selected (NAV-03).
 */
const OPENED_FROM_ELSEWHERE = ["/workouts", "/training/activities"];

const withinSection = (pathname: string, section: string) =>
  pathname === section || pathname.startsWith(`${section}/`);

/**
 * Detail screens belong to the same primary section as their entry point.
 *
 * A record several tabs can open keeps the tab its link names: a finished workout opened from
 * History is still in History, however far into it you go. The origin is read only on those
 * records, so a tab's own screens ignore it — and History's date-range `from` never collides
 * with it. Without one, the strength logger is Today's, since that is where its card is, and
 * a shared activity route says where it belongs in its own path, which is why Training does
 * not have to be listed here.
 */
export function isNavItemActive(
  pathname: string,
  href: string,
  origin: NavOrigin | null = null,
): boolean {
  const sectionPath =
    origin && OPENED_FROM_ELSEWHERE.some((section) => withinSection(pathname, section))
      ? originPath(origin)
      : pathname.startsWith("/workouts/")
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
  training: "Training",
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

/**
 * Where a screen was opened from (NAV-03).
 *
 * A bounded list, not a return URL: an arbitrary destination in a query parameter is an open
 * redirect wearing a helpful name. Anything unrecognised falls back to the section the record
 * belongs to, which is History for something already done.
 */
export const NAV_ORIGINS = ["today", "training", "history", "programme", "shared"] as const;
export type NavOrigin = (typeof NAV_ORIGINS)[number];

const ORIGIN_PATHS: Record<NavOrigin, string> = {
  today: "/today",
  training: "/training",
  history: "/history",
  programme: "/training/programme",
  shared: "/profile/friends",
};

/** The search parameter a record's link names its origin in. */
export const ORIGIN_PARAM = "from";

export function parseOrigin(value: string | string[] | undefined): NavOrigin | null {
  if (typeof value !== "string") return null;
  return (NAV_ORIGINS as readonly string[]).includes(value) ? (value as NavOrigin) : null;
}

/** What a link to a record appends to say where it is opened from; nothing without an origin. */
export function originQuery(origin: NavOrigin | null): "" | `?${typeof ORIGIN_PARAM}=${NavOrigin}` {
  return origin ? `?${ORIGIN_PARAM}=${origin}` : "";
}

/** The path a validated origin goes back to, or the default for a record of this kind. */
export function originPath(
  origin: NavOrigin | null,
  fallback: "history" | "training" = "history",
): string {
  return origin ? ORIGIN_PATHS[origin] : ORIGIN_PATHS[fallback];
}
