import { expect, it } from "vitest";
import { isNavItemActive, NAV_ITEMS, navItems, originPath, parseOrigin, sectionLabel } from "./nav";

it.each([
  ["/today", "/today"],
  ["/workouts/session/check-in", "/today"],
  ["/runs/run/edit", "/runs"],
  // Gyms left the tab bar; its screens keep Profile selected, the way it is reached.
  ["/gyms", "/profile"],
  ["/gyms/gym/equipment/new", "/profile"],
  ["/exercises", "/profile"],
  ["/exercises/bench", "/profile"],
  ["/profile/programme", "/profile"],
  ["/u/phani03", "/profile"],
])("keeps one primary destination selected for %s", (pathname, expected) => {
  expect(
    NAV_ITEMS.filter(({ href }) => isNavItemActive(pathname, href)).map(({ href }) => href),
  ).toEqual([expected]);
});

it("does not match unrelated path prefixes", () => {
  expect(isNavItemActive("/runs-other", "/runs")).toBe(false);
});

it("names the section a detail screen was opened from", () => {
  expect(sectionLabel("/gyms/abc/equipment/new")).toBe("Gyms");
  expect(sectionLabel("/workouts/abc")).toBe("Workout");
  expect(sectionLabel("/profile")).toBe("Profile");
  expect(sectionLabel("/u/phani03")).toBe("People");
});

it("has no section name for a path outside the primary sections", () => {
  expect(sectionLabel("/nowhere")).toBeUndefined();
});

it("puts Training where Runs was, once the shared surfaces are on", () => {
  expect(navItems(true).map((item) => item.href)).toEqual([
    "/today",
    "/training",
    "/history",
    "/progress",
    "/profile",
  ]);
  // Still five tabs, and no separate Runs product among them (AT-NAV-01).
  expect(navItems(true).map((item) => item.label)).not.toContain("Runs");
  expect(navItems(false).map((item) => item.href)).toContain("/runs");
});

it.each([
  ["/training", "/training"],
  ["/training/activities/abc", "/training"],
  ["/training/programme", "/training"],
  // The strength logger is opened from Today's card and keeps Today selected.
  ["/workouts/abc/check-in", "/today"],
])("keeps one shared tab selected for %s", (pathname, expected) => {
  expect(
    navItems(true)
      .filter(({ href }) => isNavItemActive(pathname, href))
      .map(({ href }) => href),
  ).toEqual([expected]);
});

it("accepts only the origins it knows, and never an arbitrary destination", () => {
  expect(parseOrigin("today")).toBe("today");
  expect(parseOrigin("programme")).toBe("programme");
  expect(parseOrigin("https://example.test/steal")).toBeNull();
  expect(parseOrigin(["today", "history"])).toBeNull();
  expect(parseOrigin(undefined)).toBeNull();
  // A completed record with no stated origin belongs to History (NAV-03).
  expect(originPath(null)).toBe("/history");
  expect(originPath(null, "training")).toBe("/training");
  expect(originPath("programme")).toBe("/training/programme");
});
