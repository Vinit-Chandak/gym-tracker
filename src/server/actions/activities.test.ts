import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/server/auth", () => ({
  requireUser: async () => ({ id: "00000000-0000-4000-8000-000000000001" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { saveActivityAction } from "./activities";

/**
 * What the action refuses before it ever reaches the database. Each of these is a rule the
 * plan states as a rule, so it is checked where a forged form would arrive, not only in the
 * component that normally submits it.
 */

const KEY = "11111111-1111-4111-8111-111111111111";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const runningForm = (overrides: Record<string, string> = {}) =>
  form({
    sport: "running",
    submissionKey: KEY,
    startedAt: "2026-09-18T06:00",
    environment: "outdoor",
    distanceValue: "5",
    distanceUnit: "km",
    minutes: "30",
    effort: "5",
    ...overrides,
  });

beforeEach(() => {
  vi.resetAllMocks();
  process.env.MULTISPORT_CANONICAL_WRITES = "true";
  process.env.MULTISPORT_NEW_SPORTS = "true";
});
afterEach(() => {
  delete process.env.MULTISPORT_CANONICAL_WRITES;
  delete process.env.MULTISPORT_NEW_SPORTS;
});

it("refuses to write at all while canonical writes are switched off", async () => {
  delete process.env.MULTISPORT_CANONICAL_WRITES;
  delete process.env.MULTISPORT_NEW_SPORTS;

  const state = await saveActivityAction(null, {}, runningForm());

  expect(state.formError).toMatch(/not switched on/);
  expect(mocks.getDb).not.toHaveBeenCalled();
});

it("refuses a new sport until new sports are switched on", async () => {
  delete process.env.MULTISPORT_NEW_SPORTS;

  const state = await saveActivityAction(
    null,
    {},
    form({
      sport: "cycling",
      submissionKey: KEY,
      startedAt: "2026-09-18T06:00",
      environment: "indoor",
      minutes: "30",
      effort: "4",
    }),
  );

  expect(state.formError).toMatch(/not switched on/);
  expect(mocks.getDb).not.toHaveBeenCalled();
});

/** LOG-03: an answer is required, and "not sure" is one of the two answers. */
it("requires an effort answer and accepts Not sure as one", async () => {
  const missing = await saveActivityAction(null, {}, runningForm({ effort: "" }));
  expect(missing.fieldErrors?.effort).toMatch(/1 to 10|Not sure/);
  expect(mocks.getDb).not.toHaveBeenCalled();

  mocks.getDb.mockImplementation(() => {
    throw new Error("reached the database");
  });
  const unsure = await saveActivityAction(null, {}, runningForm({ effort: "unsure" }));
  expect(unsure.fieldErrors?.effort).toBeUndefined();
  expect(mocks.getDb).toHaveBeenCalled();
});

it("refuses an effort outside the scale", async () => {
  const state = await saveActivityAction(null, {}, runningForm({ effort: "11" }));
  expect(state.fieldErrors?.effort).toBeDefined();
  expect(mocks.getDb).not.toHaveBeenCalled();
});

/** AT-LOG-14: an unusually large entry is questioned, never silently truncated. */
it("asks for confirmation of a very long run, then accepts the answer", async () => {
  const long = runningForm({ distanceValue: "150", minutes: "600" });

  const asked = await saveActivityAction(null, {}, long);
  expect(asked.formError).toMatch(/Confirm the distance/);
  expect(asked.values?.distanceValue).toBe("150");
  expect(mocks.getDb).not.toHaveBeenCalled();

  mocks.getDb.mockImplementation(() => {
    throw new Error("reached the database");
  });
  const confirmed = await saveActivityAction(
    null,
    {},
    runningForm({
      distanceValue: "150",
      minutes: "600",
      confirmLarge: "on",
    }),
  );
  expect(confirmed.formError).not.toMatch(/Confirm the distance/);
  expect(mocks.getDb).toHaveBeenCalled();
});

it("keeps a cycling ride with no distance out of the confirmation path", async () => {
  mocks.getDb.mockImplementation(() => {
    throw new Error("reached the database");
  });
  const state = await saveActivityAction(
    null,
    {},
    form({
      sport: "cycling",
      submissionKey: KEY,
      startedAt: "2026-09-18T06:00",
      environment: "indoor",
      minutes: "32",
      effort: "unsure",
    }),
  );
  expect(state.formError).toBe("Something went wrong. Please try again.");
  expect(mocks.getDb).toHaveBeenCalled();
});

it("refuses a sport it does not know", async () => {
  const state = await saveActivityAction(null, {}, runningForm({ sport: "rowing" }));
  expect(state.fieldErrors ?? state.formError).toBeDefined();
  expect(mocks.getDb).not.toHaveBeenCalled();
});

it("refuses a submission key that is not one", async () => {
  const state = await saveActivityAction(null, {}, runningForm({ submissionKey: "not-a-uuid" }));
  expect(state.fieldErrors?.submissionKey).toMatch(/out of date/);
  expect(mocks.getDb).not.toHaveBeenCalled();
});

/** LINK-01: an occurrence is named in full or not at all; nothing is matched by date. */
it("treats a half-named occurrence as an ad hoc log rather than guessing", async () => {
  mocks.getDb.mockImplementation(() => {
    throw new Error("reached the database");
  });
  const state = await saveActivityAction(
    null,
    {},
    runningForm({ occurrenceId: "22222222-2222-4222-8222-222222222222" }),
  );
  // It gets as far as the database, where it is written as what it is: an unplanned run.
  expect(state.formError).toBe("Something went wrong. Please try again.");
  expect(mocks.getDb).toHaveBeenCalled();
});
