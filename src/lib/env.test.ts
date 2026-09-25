import { afterEach, expect, it, vi } from "vitest";

import { foodTrackingEnabled } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
});

it("keeps food tracking hidden unless it is switched on", () => {
  vi.stubEnv("FOOD_TRACKING_ENABLED", undefined);
  expect(foodTrackingEnabled("owner@example.test")).toBe(false);
  for (const off of ["", "false", "0", "yes", "no"]) {
    vi.stubEnv("FOOD_TRACKING_ENABLED", off);
    expect(foodTrackingEnabled("owner@example.test")).toBe(false);
  }
});

it("switches it on for everyone with true", () => {
  vi.stubEnv("FOOD_TRACKING_ENABLED", "true");
  expect(foodTrackingEnabled("anyone@example.test")).toBe(true);
  expect(foodTrackingEnabled(null)).toBe(true);
  vi.stubEnv("FOOD_TRACKING_ENABLED", " TRUE ");
  expect(foodTrackingEnabled("anyone@example.test")).toBe(true);
});

it("switches it on for the listed accounts alone", () => {
  vi.stubEnv("FOOD_TRACKING_ENABLED", "Owner@Example.test, friend@example.test");
  expect(foodTrackingEnabled("owner@example.test")).toBe(true);
  expect(foodTrackingEnabled("FRIEND@example.test")).toBe(true);
  expect(foodTrackingEnabled("stranger@example.test")).toBe(false);
  // An account without an email address is never on a list of them.
  expect(foodTrackingEnabled(null)).toBe(false);
  // A listed address is matched whole, never as part of another.
  expect(foodTrackingEnabled("wner@example.test")).toBe(false);
});
