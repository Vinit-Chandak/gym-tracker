import { expect, it } from "vitest";
import {
  isNavItemActive,
  NAV_ITEMS,
  NAV_ORIGINS,
  originPath,
  originQuery,
  parseOrigin,
  sectionLabel,
  workoutBackPath,
  type NavOrigin,
} from "./nav";

it.each([
  ["/today", "/today"],
  ["/workouts/session/check-in", "/today"],
  // The check-in before a workout, which has no session yet, is Today's too.
  ["/workouts/start", "/today"],
  // A record opened with no origin is History's, inside Progress, as its Back is (NAV-03).
  ["/workouts/abc", "/progress"],
  ["/training/activities/abc", "/progress"],
  // Gyms left the tab bar; its screens keep Profile selected, the way it is reached.
  ["/gyms", "/profile"],
  ["/gyms/gym/equipment/new", "/profile"],
  ["/exercises", "/profile"],
  ["/exercises/bench", "/profile"],
  ["/profile/programme", "/profile"],
  ["/u/phani03", "/profile"],
  // A meal's page is the Food tab's; History is Progress's (ADRs 0034, 0045).
  ["/food", "/food"],
  ["/food/breakfast", "/food"],
  // So are My foods, a meal kept in it, and the targets (ADR 0035).
  ["/food/my-foods", "/food"],
  ["/food/my-foods/meals/new", "/food"],
  ["/food/targets", "/food"],
  ["/progress/history", "/progress"],
])("keeps one primary destination selected for %s", (pathname, expected) => {
  expect(
    NAV_ITEMS.filter(({ href }) => isNavItemActive(pathname, href)).map(({ href }) => href),
  ).toEqual([expected]);
});

it("does not match unrelated path prefixes", () => {
  expect(isNavItemActive("/training-other", "/training")).toBe(false);
});

it("names the section a detail screen was opened from", () => {
  expect(sectionLabel("/gyms/abc/equipment/new")).toBe("Gyms");
  expect(sectionLabel("/workouts/abc")).toBe("Workout");
  expect(sectionLabel("/profile")).toBe("Profile");
  // A person's page has no section name: "People" is another page, the list you follow them from.
  // What links to their page names them; Comparing with them is a page with a name of its own.
  expect(sectionLabel("/u/phani03")).toBeUndefined();
  expect(sectionLabel("/u/phani03/activities/abc")).toBeUndefined();
  expect(sectionLabel("/u/phani03/compare?sport=running")).toBe("Compare");
  expect(sectionLabel("/u/phani03/compare/bench")).toBe("Compare");
  expect(sectionLabel("/u/compare")).toBeUndefined();
  // A meal's page goes back to the Food tab.
  expect(sectionLabel("/food")).toBe("Food");
  // My foods is a screen of Food's with a name of its own (ADR 0035); Targets is Food's.
  expect(sectionLabel("/food/my-foods")).toBe("My foods");
  expect(sectionLabel("/food/targets")).toBe("Food");
  // History is a page of Progress's with a name of its own.
  expect(sectionLabel("/progress/history")).toBe("History");
  expect(sectionLabel("/progress/history?from=2026-09-01")).toBe("History");
  expect(sectionLabel("/progress?view=strength")).toBe("Progress");
});

it("has no section name for a path outside the primary sections", () => {
  expect(sectionLabel("/nowhere")).toBeUndefined();
});

it("puts Training where Runs was, and Food where History was", () => {
  expect(NAV_ITEMS.map((item) => item.href)).toEqual([
    "/today",
    "/training",
    "/food",
    "/progress",
    "/profile",
  ]);
  // Still five tabs, and no separate Runs product among them (AT-NAV-01).
  expect(NAV_ITEMS.map((item) => item.label)).not.toContain("Runs");
  // History is reached from Progress now (ADR 0034).
  expect(NAV_ITEMS.map((item) => item.label)).not.toContain("History");
});

it.each([
  ["/training", "/training"],
  ["/training/new", "/training"],
  ["/training/programme", "/training"],
  // The session's own pages are Today's, where a workout is started and finished.
  ["/workouts/abc/check-in", "/today"],
  ["/workouts/abc/add-exercise", "/today"],
])("keeps one shared tab selected for %s", (pathname, expected) => {
  expect(
    NAV_ITEMS.filter(({ href }) => isNavItemActive(pathname, href)).map(({ href }) => href),
  ).toEqual([expected]);
});

it("accepts only the origins it knows, and never an arbitrary destination", () => {
  expect(parseOrigin("today")).toBe("today");
  expect(parseOrigin("programme")).toBe("programme");
  expect(parseOrigin("https://example.test/steal")).toBeNull();
  expect(parseOrigin(["today", "history"])).toBeNull();
  expect(parseOrigin(undefined)).toBeNull();
  // A completed record with no stated origin belongs to History (NAV-03), inside Progress.
  expect(originPath(null)).toBe("/progress/history");
  expect(originPath(null, "training")).toBe("/training");
  expect(originPath("programme")).toBe("/training/programme");
});

it("sends a finished workout back to History unless its link names where it was opened", () => {
  expect(workoutBackPath(null, true)).toBe("/progress/history");
  expect(sectionLabel(workoutBackPath(null, true))).toBe("History");
  expect(workoutBackPath("today", true)).toBe("/today");
  expect(workoutBackPath("shared", true)).toBe("/profile/friends");
  // The open workout is Today's, wherever it was opened from.
  expect(workoutBackPath(null, false)).toBe("/today");
  expect(workoutBackPath("history", false)).toBe("/today");
});

const selected = (pathname: string, origin: NavOrigin | null = null) =>
  NAV_ITEMS.filter(({ href }) => isNavItemActive(pathname, href, origin)).map(({ href }) => href);

it.each([null, ...NAV_ORIGINS])("lights the tab a record's Back leads into (%s)", (origin) => {
  // A finished workout and a logged run, ride or swim, with their link's origin or none.
  expect(selected("/workouts/abc", origin)).toEqual(selected(workoutBackPath(origin, true)));
  expect(selected("/training/activities/abc", origin)).toEqual(selected(originPath(origin)));
});

it.each<[string, NavOrigin, string]>([
  // A finished workout opened from History keeps History's tab, Progress, and so does its
  // exercise.
  ["/workouts/abc", "history", "/progress"],
  ["/training/activities/abc", "history", "/progress"],
  // Correcting a run opened from History does not move you to Training.
  ["/training/activities/abc/edit", "history", "/progress"],
  ["/training/activities/abc", "programme", "/training"],
  // Opened from Today's card, a finished workout or a logged run keeps Today selected.
  ["/workouts/abc", "today", "/today"],
  ["/training/activities/abc", "today", "/today"],
  ["/workouts/abc", "shared", "/profile"],
])("keeps %s under the tab its link names (%s)", (pathname, origin, expected) => {
  expect(
    NAV_ITEMS.filter(({ href }) => isNavItemActive(pathname, href, origin)).map(({ href }) => href),
  ).toEqual([expected]);
});

it.each([
  ["/today", "/today"],
  ["/progress", "/progress"],
  ["/food", "/food"],
  ["/profile/programme", "/profile"],
  ["/exercises/bench", "/profile"],
])("lets only a record take an origin, never %s", (pathname, expected) => {
  expect(
    NAV_ITEMS.filter(({ href }) => isNavItemActive(pathname, href, "history")).map(
      ({ href }) => href,
    ),
  ).toEqual([expected]);
});

it("names an origin on a record's link that the record reads back", () => {
  expect(originQuery("history")).toBe("?from=history");
  expect(originQuery(null)).toBe("");
  const query = new URLSearchParams(originQuery("history"));
  expect(parseOrigin(query.get("from") ?? undefined)).toBe("history");
  // History's own `from` is a date, which is no origin at all.
  expect(parseOrigin("2026-09-01")).toBeNull();
});
