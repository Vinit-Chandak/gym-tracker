import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { bodyWeightLogs, profiles } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { recordBodyWeight } from "@/server/repositories/body-weight";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), requireUser: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/server/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/server/queries/request-profile", () => ({ profileChanged: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { saveProfileAction } from "./profile";

let t: TestDatabase;
let user: { id: string; email: string };

/** A weigh-in from before the form was opened, which the profile then shows. */
async function weighedIn(weightKg: number, preferredUnit: "kg" | "lb") {
  await t.db.update(profiles).set({ preferredUnit }).where(eq(profiles.id, user.id));
  await withUser(t.db, user.id, (tx) =>
    recordBodyWeight(tx, user.id, { measuredOn: "2026-09-01", weightKg }),
  );
}

/** The edit form as it is sent: everything filled in, the weight as the field holds it. */
async function save(fields: { preferredUnit: "kg" | "lb"; bodyWeight: string }) {
  const [row] = await t.db.select().from(profiles).where(eq(profiles.id, user.id));
  const form = new FormData();
  for (const [key, value] of Object.entries({
    displayName: "Meera",
    username: row!.username,
    timeZone: "Europe/London",
    dateOfBirth: "1994-05-02",
    sex: "female",
    trainingGoal: "get_stronger",
    heightCm: "165",
    heightFeet: "5",
    heightInches: "5",
    ...fields,
  }))
    form.set(key, value);
  return saveProfileAction(INITIAL_FORM_STATE, form);
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
    .select({ bodyWeightKg: profiles.bodyWeightKg, preferredUnit: profiles.preferredUnit })
    .from(profiles)
    .where(eq(profiles.id, user.id));
  return row;
}

beforeEach(async () => {
  t = await createTestDatabase();
  user = await t.createAuthUser("profile-weight@example.test");
  mocks.getDb.mockReturnValue(t.db);
  mocks.requireUser.mockResolvedValue(user);
});
afterEach(async () => {
  vi.clearAllMocks();
  await t.close();
});

/**
 * ADR 0020: a round trip returns the number that was typed. The form shows a weight to a tenth;
 * saving it for any other reason must not record that tenth as a weigh-in nobody took.
 */
it("records nothing when the weight sent back is the one the form showed", async () => {
  await weighedIn(82.25, "kg");
  // Shown as 82.3; the athlete only came to change something else.
  expect(await save({ preferredUnit: "kg", bodyWeight: "82.3" })).toEqual({});
  expect(await readings()).toEqual([{ measuredOn: "2026-09-01", weightKg: 82.25 }]);
  expect((await profileWeight())?.bodyWeightKg).toBe(82.25);
});

it("records nothing for a weight shown in pounds and sent back as it was shown", async () => {
  await weighedIn(80, "lb");
  // 80 kg shows as 176.4 lb, which is 80.01 kg.
  await save({ preferredUnit: "lb", bodyWeight: "176.4" });
  expect(await readings()).toEqual([{ measuredOn: "2026-09-01", weightKg: 80 }]);
});

it("records nothing when only the units change", async () => {
  await weighedIn(82.25, "kg");
  // The form restates the 82.3 it showed as 181.4 lb, which is neither tenth in pounds of 82.25.
  await save({ preferredUnit: "lb", bodyWeight: "181.4" });
  expect(await readings()).toEqual([{ measuredOn: "2026-09-01", weightKg: 82.25 }]);
  expect(await profileWeight()).toEqual({ bodyWeightKg: 82.25, preferredUnit: "lb" });
});

it("records a weight that was changed as today's reading", async () => {
  await weighedIn(82.25, "kg");
  await save({ preferredUnit: "kg", bodyWeight: "81.9" });
  const after = await readings();
  expect(after).toHaveLength(2);
  expect(after[1]?.weightKg).toBe(81.9);
  expect((await profileWeight())?.bodyWeightKg).toBe(81.9);
});

it("records the first weight a profile is given", async () => {
  await save({ preferredUnit: "kg", bodyWeight: "70" });
  expect((await readings()).map((reading) => reading.weightKg)).toEqual([70]);
});
