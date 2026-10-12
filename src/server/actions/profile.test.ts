import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { bodyWeightLogs, profiles } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { recordBodyWeight } from "@/server/repositories/body-weight";
import { readSportUnits } from "@/server/repositories/sport-preferences";
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

/**
 * The edit form as it is sent: everything filled in, the weight as the field holds it, and the
 * distances as the weight unit gives them unless the test says otherwise.
 */
async function save(fields: {
  preferredUnit: "kg" | "lb";
  bodyWeight: string;
  distanceUnit?: "km" | "mi";
  poolUnit?: "m" | "yd";
}) {
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
    distanceUnit: fields.preferredUnit === "lb" ? "mi" : "km",
    poolUnit: fields.preferredUnit === "lb" ? "yd" : "m",
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

/** ADR 0056: distances start from the weight unit, and only a unit set apart is stored. */
it("keeps distances following the weight unit, and stores only one set apart from it", async () => {
  const stored = async () => {
    const [row] = await t.db
      .select({ distanceUnit: profiles.distanceUnit, poolUnit: profiles.poolUnit })
      .from(profiles)
      .where(eq(profiles.id, user.id));
    return row;
  };
  const read = () =>
    withUser(t.db, user.id, (tx) => readSportUnits(tx, user.id), { readOnly: true });

  // Pounds with miles and yards is what pounds give: nothing is stored, so it goes on following.
  expect(await save({ preferredUnit: "lb", bodyWeight: "150" })).toEqual({});
  expect(await stored()).toEqual({ distanceUnit: null, poolUnit: null });
  expect(await read()).toEqual({ distanceUnit: "mi", poolUnit: "yd" });

  // Kilometres beside pounds is a choice, and is kept; the pool still follows.
  await save({ preferredUnit: "lb", bodyWeight: "150", distanceUnit: "km" });
  expect(await stored()).toEqual({ distanceUnit: "km", poolUnit: null });
  expect(await read()).toEqual({ distanceUnit: "km", poolUnit: "yd" });

  // Back to kilograms, where kilometres are what the weight unit gives: no choice left stored.
  await save({ preferredUnit: "kg", bodyWeight: "68" });
  expect(await stored()).toEqual({ distanceUnit: null, poolUnit: null });
  expect(await read()).toEqual({ distanceUnit: "km", poolUnit: "m" });
});

it("refuses a distance unit that is not a road's", async () => {
  const state = await save({
    preferredUnit: "kg",
    bodyWeight: "68",
    distanceUnit: "yd" as unknown as "km",
  });
  expect(state.fieldErrors?.distanceUnit).toBe("Choose kilometres or miles.");
});
