import { expect, it } from "vitest";
import { isNavItemActive, NAV_ITEMS, sectionLabel } from "./nav";

it.each([
  ["/today", "/today"],
  ["/workouts/session/check-in", "/today"],
  ["/runs/run/edit", "/runs"],
  // Gyms left the tab bar; its screens keep Settings selected, the way it is reached.
  ["/gyms", "/settings"],
  ["/gyms/gym/equipment/new", "/settings"],
  ["/exercises", "/settings"],
  ["/exercises/bench", "/settings"],
  ["/settings/programme", "/settings"],
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
  expect(sectionLabel("/settings")).toBe("Settings");
});

it("has no section name for a path outside the primary sections", () => {
  expect(sectionLabel("/nowhere")).toBeUndefined();
});
