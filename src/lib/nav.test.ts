import { expect, it } from "vitest";
import { isNavItemActive, NAV_ITEMS } from "./nav";

it.each([
  ["/today", "/today"],
  ["/workouts/session/check-in", "/today"],
  ["/runs/run/edit", "/runs"],
  ["/gyms/gym/equipment/new", "/gyms"],
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
