import type { Route } from "next";
import type { Destination } from "@/components/ui/glyphs";

export type NavItem = {
  href: Route;
  label: string;
  /** The destination's glyph, drawn from the first forms; filled where you are. */
  glyph: Destination;
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
 *
 * The third was History. It is Food (ADR 0034): meals are logged several times a day, and a
 * card at the foot of Today put them a scroll away, while History is a look back, which is
 * what Progress is for. History is Progress's now (Overview's list, and a page behind it), and the
 * island stays at five.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/today", label: "Today", glyph: "today" },
  { href: "/training", label: "Training", glyph: "training" },
  { href: "/food", label: "Food", glyph: "food" },
  { href: "/progress", label: "Progress", glyph: "progress" },
  { href: "/profile", label: "Profile", glyph: "profile" },
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
 * A record's own page: a run, ride or swim (its correction too), or a workout itself rather than
 * one of the session's pages under it or the check-in before it.
 */
const isRecordPage = (pathname: string) =>
  withinSection(pathname, "/training/activities") ||
  (/^\/workouts\/[^/]+$/.test(pathname) && pathname !== "/workouts/start");

/**
 * Detail screens belong to the same primary section as their entry point.
 *
 * A record several tabs can open keeps the tab its link names: a finished workout opened from
 * History keeps Progress selected, however far into it you go. The origin is read only on those
 * records, so a tab's own screens ignore it — and History's date-range `from` never collides
 * with it. Without one, a record is History's, as its Back is (NAV-03): the tab lit is the one
 * Back leads into. The open workout has a finished one's path, but it is the session's layer
 * over the tabs, which hides them, as its loading screen does (`WorkoutLoadingFrame`); the
 * session's own pages under it are Today's, where a workout is started and finished.
 */
export function isNavItemActive(
  pathname: string,
  href: string,
  origin: NavOrigin | null = null,
): boolean {
  const openedFrom =
    origin && OPENED_FROM_ELSEWHERE.some((section) => withinSection(pathname, section))
      ? originPath(origin)
      : isRecordPage(pathname)
        ? originPath(null)
        : pathname.startsWith("/workouts/")
          ? "/today"
          : pathname;
  // Profile's sections keep Profile, whether you are in one or a record was opened from one.
  const sectionPath = UNDER_PROFILE.some((section) => withinSection(openedFrom, section))
    ? "/profile"
    : openedFrom;
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
  food: "Food",
  progress: "Progress",
  profile: "Profile",
  gyms: "Gyms",
  exercises: "Exercises",
  workouts: "Workout",
  // No name for `/u`: it is no page, and a person's pages are named by who they are, which only
  // the page linking to them knows (its `backLabel`). "People" said the list you follow them from
  // and led to their page instead (year audit, October 2026).
};

/** A screen with a name of its own inside a section, which a back control names instead. */
const PAGE_LABELS: Record<string, string> = {
  // History is a page of Progress's (ADR 0045), so what it opens goes back to it by its own
  // name.
  "/progress/history": "History",
  // The calendar is Progress's too: a day opened from it goes back to it by name.
  "/progress/calendar": "Calendar",
  // My foods is a screen of Food's (ADR 0035): a meal kept in it goes back to it by name.
  "/food/my-foods": "My foods",
};

/** Comparing yourself with someone, one exercise of it included: a page named Compare. */
const COMPARE_PAGE = /^\/u\/[^/]+\/compare(?:\/|$)/;

export function sectionLabel(path: string): string | undefined {
  const pathname = path.split(/[?#]/)[0]!;
  return (
    PAGE_LABELS[pathname] ??
    (COMPARE_PAGE.test(pathname) ? "Compare" : SECTION_LABELS[pathname.split("/")[1] ?? ""])
  );
}

/**
 * Where a screen was opened from (NAV-03).
 *
 * A bounded list, not a return URL: an arbitrary destination in a query parameter is an open
 * redirect wearing a helpful name. Anything unrecognised falls back to the section the record
 * belongs to, which is History for something already done.
 */
export const NAV_ORIGINS = [
  "today",
  "training",
  "history",
  "programme",
  "shared",
  "exercises",
] as const;
export type NavOrigin = (typeof NAV_ORIGINS)[number];

const ORIGIN_PATHS: Record<NavOrigin, string> = {
  today: "/today",
  training: "/training",
  history: "/progress/history",
  programme: "/training/programme",
  shared: "/profile/friends",
  // An exercise's page, which is Profile's: a workout opened from its graph or its latest
  // sessions keeps Profile, as Back to it does (year audit, October 2026).
  exercises: "/exercises",
};

/** The search parameter a record's link names its origin in. */
export const ORIGIN_PARAM = "from";

/**
 * The search parameter that opens a finished workout in its edit (ADR 0049), so Add exercise,
 * a reload and Back from an exercise all come back to editing rather than to the record.
 */
export const EDIT_PARAM = "edit";

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

/**
 * Where a workout's Back goes without a page before it. The open workout is Today's, where it is
 * started and finished. A finished one goes where its link said it was opened from, and
 * otherwise to History, where finished workouts live (NAV-03): opened from the calendar's day,
 * a year-old session or a link of its own, it said "Today" (year audit, October 2026). The tab
 * bar lights the same tab (`isNavItemActive`).
 */
export function workoutBackPath(origin: NavOrigin | null, finished: boolean): string {
  return finished ? originPath(origin) : "/today";
}

/**
 * The origin a workout's own pages carry on (its edit's Add exercise): its link's, or History's
 * for a finished one whose link named none, so they keep the tab the workout lit. The open
 * workout's pages are Today's, and carry nothing.
 */
export function workoutOrigin(origin: NavOrigin | null, finished: boolean): NavOrigin | null {
  return origin ?? (finished ? "history" : null);
}
