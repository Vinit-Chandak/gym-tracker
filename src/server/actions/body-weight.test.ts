import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { bodyWeightLogs, profiles } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), requireUser: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/server/auth", () => ({ requireUser: mocks.requireUser }));
// Tuesday 20 October in London, where the account's days are dated.
vi.mock("@/server/queries/request-profile", () => ({
  getRequestProfile: async () => ({ timeZone: "Europe/London" }),
  profileChanged: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { logBodyWeightAction } from "./body-weight";

let t: TestDatabase;
let user: { id: string; email: string };

/** Today › Log › Body weight as it is sent. */
function log(fields: { measuredOn?: string; bodyWeight: string; unit?: "kg" | "lb" }) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ measuredOn: "2026-10-20", unit: "kg", ...fields }))
    form.set(key, value);
  return logBodyWeightAction(INITIAL_FORM_STATE, form);
}

async function readings() {
  return t.db
    .select({ measuredOn: bodyWeightLogs.measuredOn, weightKg: bodyWeightLogs.weightKg })
    .from(bodyWeightLogs)
    .where(eq(bodyWeightLogs.userId, user.id))
    .orderBy(bodyWeightLogs.measuredOn);
}

async function profileWeight() {
  const [row] = await t.db
    .select({ bodyWeightKg: profiles.bodyWeightKg })
    .from(profiles)
    .where(eq(profiles.id, user.id));
  return row?.bodyWeightKg ?? null;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T08:00:00Z"));
  t = await createTestDatabase();
  user = await t.createAuthUser("weigh-in@example.test");
  mocks.getDb.mockReturnValue(t.db);
  mocks.requireUser.mockResolvedValue(user);
});
afterEach(async () => {
  vi.useRealTimers();
  vi.clearAllMocks();
  await t.close();
});

it("records a reading for the day it was taken, and the profile shows the newest", async () => {
  expect(await log({ bodyWeight: "74.5" })).toEqual({});
  expect(await readings()).toEqual([{ measuredOn: "2026-10-20", weightKg: 74.5 }]);
  expect(await profileWeight()).toBe(74.5);

  // A day gone by is filled in without moving what the athlete weighs now.
  await log({ measuredOn: "2026-10-17", bodyWeight: "75.1" });
  expect((await readings()).map((reading) => reading.measuredOn)).toEqual([
    "2026-10-17",
    "2026-10-20",
  ]);
  expect(await profileWeight()).toBe(74.5);
});

it("corrects the day's reading rather than adding a second", async () => {
  await log({ bodyWeight: "74.5" });
  await log({ bodyWeight: "74.1" });
  expect(await readings()).toEqual([{ measuredOn: "2026-10-20", weightKg: 74.1 }]);
});

it("takes the weight in the account's unit and keeps it in kilograms", async () => {
  await log({ bodyWeight: "164.2", unit: "lb" });
  expect(await readings()).toEqual([{ measuredOn: "2026-10-20", weightKg: 74.48 }]);
});

it("records nothing for a later day, or a weight no scale says", async () => {
  const later = await log({ measuredOn: "2026-10-21", bodyWeight: "74.5" });
  expect(later.fieldErrors?.measuredOn).toBe("Enter today or an earlier date.");
  expect(later.values?.bodyWeight).toBe("74.5");
  const heavy = await log({ bodyWeight: "1200", unit: "lb" });
  expect(heavy.fieldErrors?.bodyWeight).toBe("Enter a body weight between 44.1 and 1102.3 lb.");
  expect(await readings()).toEqual([]);
});
