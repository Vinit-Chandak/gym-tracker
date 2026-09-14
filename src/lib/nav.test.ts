import { expect, it } from "vitest";
import { isNavItemActive, NAV_ITEMS, sectionLabel } from "./nav";

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
});

it("has no section name for a path outside the primary sections", () => {
  expect(sectionLabel("/nowhere")).toBeUndefined();
});
