import { beforeEach, expect, it, vi } from "vitest";

const { gyms, sports } = vi.hoisted(() => ({ gyms: vi.fn(), sports: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/db/with-user", () => ({
  withUser: (_db: unknown, _id: string, run: (tx: unknown) => unknown) => run({}),
}));
vi.mock("@/server/repositories/gyms", () => ({ listGyms: gyms }));
vi.mock("@/server/repositories/sport-preferences", () => ({ enabledSportsFor: sports }));

import { onboardingEntry } from "./onboarding-entry";

beforeEach(() => {
  gyms.mockReset();
  sports.mockReset();
  // Lifting is on unless a test says otherwise, which is the path through all four steps.
  sports.mockResolvedValue(["strength", "running"]);
});

const gym = (over: Partial<{ id: string; isDefault: boolean; equipmentCount: number }> = {}) => ({
  id: "gym-1",
  isDefault: true,
  equipmentCount: 0,
  ...over,
});

/**
 * Setup is four steps and they are sequential, so what has been saved says how far it got.
 * Returning everyone to step one made them repeat themselves, and the gym step took the same
 * name a second time.
 */
it("starts at the beginning when nothing has been saved", async () => {
  gyms.mockResolvedValue([]);
  expect(await onboardingEntry("user-1")).toBe("/welcome");
});

it("picks up at the machines once a gym is there", async () => {
  gyms.mockResolvedValue([gym({ id: "gym-7" })]);
  expect(await onboardingEntry("user-1")).toBe("/welcome/equipment?gym=gym-7");
});

it("picks up at the programme once that gym has machines", async () => {
  gyms.mockResolvedValue([gym({ equipmentCount: 3 })]);
  expect(await onboardingEntry("user-1")).toBe("/welcome/programme");
});

/** SCOPE-02: a swimmer never reaches the gym steps, so their absence says nothing. */
it("skips the gym steps for an account that does not lift", async () => {
  sports.mockResolvedValue(["swimming"]);
  gyms.mockResolvedValue([]);
  expect(await onboardingEntry("user-1")).toBe("/welcome/programme");
});

it("goes by the gym they train at, not the first one added", async () => {
  gyms.mockResolvedValue([
    gym({ id: "other", isDefault: false, equipmentCount: 0 }),
    gym({ id: "usual", isDefault: true, equipmentCount: 5 }),
  ]);
  expect(await onboardingEntry("user-1")).toBe("/welcome/programme");
});
