import { expect, it } from "vitest";
import {
  isNavItemActive,
  NAV_ITEMS,
  originPath,
  originQuery,
  parseOrigin,
  sectionLabel,
  type NavOrigin,
} from "./nav";

it.each([
  ["/today", "/today"],
  ["/workouts/session/check-in", "/today"],
  ["/training/activities/abc", "/training"],
  // Gyms left the tab bar; its screens keep Profile selected, the way it is reached.
  ["/gyms", "/profile"],
  ["/gyms/gym/equipment/new", "/profile"],
  ["/exercises", "/profile"],
  ["/exercises/bench", "/profile"],
  ["/profile/programme", "/profile"],
  ["/u/phani03", "/profile"],
  // A meal's page is the Food tab's; History is a section of Progress (ADR 0034).
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
  expect(sectionLabel("/u/phani03")).toBe("People");
  // A meal's page goes back to the Food tab.
  expect(sectionLabel("/food")).toBe("Food");
  // My foods is a screen of Food's with a name of its own (ADR 0035); Targets is Food's.
  expect(sectionLabel("/food/my-foods")).toBe("My foods");
  expect(sectionLabel("/food/targets")).toBe("Food");
  // History is a section of Progress with a page, and a name, of its own.
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
  ["/training/activities/abc", "/training"],
  ["/training/programme", "/training"],
  // The strength logger is opened from Today's card and keeps Today selected.
  ["/workouts/abc/check-in", "/today"],
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

it.each<[string, NavOrigin, string]>([
  // A finished workout opened from History keeps History's tab, Progress, and so does its
  // exercise.
  ["/workouts/abc", "history", "/progress"],
  ["/training/activities/abc", "history", "/progress"],
  // Correcting a run opened from History does not move you to Training.
  ["/training/activities/abc/edit", "history", "/progress"],
  ["/training/activities/abc", "programme", "/training"],
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
