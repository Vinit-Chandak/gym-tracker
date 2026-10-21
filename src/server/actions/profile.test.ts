import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { bodyWeightLogs, profiles } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { knownTimeZone } from "@/server/queries/time-zone";
import { readSportUnits } from "@/server/repositories/sport-preferences";
import { INITIAL_FORM_STATE } from "@/server/validation/form";
import { UNKNOWN_TIME_ZONE } from "@/server/validation/profile";
import { USERNAME_TAKEN_MESSAGE } from "@/server/validation/username";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), requireUser: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/server/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/server/queries/request-profile", () => ({ profileChanged: vi.fn() }));
vi.mock("@/server/queries/time-zone", async (original) => {
  const real = await original<typeof import("@/server/queries/time-zone")>();
  return { knownTimeZone: vi.fn(real.knownTimeZone) };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { saveProfileAction, saveUnitsAction } from "./profile";

let t: TestDatabase;
let user: { id: string; email: string };

function formOf(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

/** Edit profile as it is sent: everything it shows filled in, the height in centimetres. */
async function saveProfile(fields: Record<string, string> = {}) {
  const [row] = await t.db.select().from(profiles).where(eq(profiles.id, user.id));
  return saveProfileAction(
    INITIAL_FORM_STATE,
    formOf({
      displayName: "Meera",
      username: row!.username,
      heightUnit: "cm",
      heightCm: "165",
      dateOfBirth: "1994-05-02",
      sex: "female",
      trainingGoal: "get_stronger",
      ...fields,
    }),
  );
}

/** Units and time zone as it is sent: the distances as the weight unit gives them, unless said. */
function saveUnits(fields: {
  preferredUnit: "kg" | "lb";
  distanceUnit?: string;
  poolUnit?: string;
  timeZone?: string;
}) {
  return saveUnitsAction(
    INITIAL_FORM_STATE,
    formOf({
      timeZone: "Europe/London",
      distanceUnit: fields.preferredUnit === "lb" ? "mi" : "km",
      poolUnit: fields.preferredUnit === "lb" ? "yd" : "m",
      ...fields,
    }),
  );
}

async function stored() {
  const [row] = await t.db.select().from(profiles).where(eq(profiles.id, user.id));
  return row!;
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

it("saves who the person is, and nothing Edit profile no longer shows", async () => {
  const before = await stored();
  expect(
    await saveProfile({
      // Sent by an old page: none of it is Edit profile's any more.
      bodyWeight: "70",
      preferredUnit: "lb",
      timeZone: "Asia/Tokyo",
    }),
  ).toEqual({});
  const after = await stored();
  expect(after).toMatchObject({
    displayName: "Meera",
    heightCm: 165,
    dateOfBirth: "1994-05-02",
    sex: "female",
    trainingGoal: "get_stronger",
    preferredUnit: before.preferredUnit,
    timeZone: before.timeZone,
    bodyWeightKg: null,
  });
  expect(await t.db.select().from(bodyWeightLogs)).toEqual([]);
});

it("reads a height sent in feet and inches as centimetres", async () => {
  await saveProfile({ heightUnit: "ftin", heightCm: "", heightFeet: "5", heightInches: "5" });
  expect((await stored()).heightCm).toBe(165.1);
});

/** ADR 0020: an account that predates a question answers it before anything saves. */
it("saves nothing until the height, the date of birth and the goal are given", async () => {
  const state = await saveProfile({ dateOfBirth: "", trainingGoal: "", displayName: "Changed" });
  expect(state.fieldErrors).toMatchObject({
    dateOfBirth: "Enter your date of birth.",
    trainingGoal: "Choose what you are training for.",
  });
  expect(state.values?.displayName).toBe("Changed");
  expect((await stored()).displayName).not.toBe("Changed");
  expect((await saveProfile({ heightCm: "" })).fieldErrors?.heightCm).toBe("Enter your height.");
});

it("says a username another account holds is taken, against the field", async () => {
  const other = await t.createAuthUser("other@example.test");
  const [theirs] = await t.db.select().from(profiles).where(eq(profiles.id, other.id));
  const state = await saveProfile({ username: theirs!.username });
  expect(state.fieldErrors?.username).toBe(USERNAME_TAKEN_MESSAGE);
});

it("saves the units and the zone, as Postgres spells the zone", async () => {
  expect(await saveUnits({ preferredUnit: "lb", timeZone: "asia/kolkata" })).toEqual({});
  expect(await stored()).toMatchObject({ preferredUnit: "lb", timeZone: "Asia/Kolkata" });
});

it("saves nothing in a zone the browser reads but Postgres, which dates the graphs, does not", async () => {
  const before = await stored();
  vi.mocked(knownTimeZone).mockResolvedValueOnce(null);
  const state = await saveUnits({ preferredUnit: "lb", timeZone: "Asia/Tokyo" });
  expect(state.fieldErrors?.timeZone).toBe(UNKNOWN_TIME_ZONE);
  expect(state.values?.timeZone).toBe("Asia/Tokyo");
  expect(await stored()).toMatchObject({
    preferredUnit: before.preferredUnit,
    timeZone: before.timeZone,
  });
});

/** ADR 0055: distances start from the weight unit, and only a unit set apart is stored. */
it("keeps distances following the weight unit, and stores only one set apart from it", async () => {
  const units = async () => {
    const { distanceUnit, poolUnit } = await stored();
    return { distanceUnit, poolUnit };
  };
  const read = () =>
    withUser(t.db, user.id, (tx) => readSportUnits(tx, user.id), { readOnly: true });

  // Pounds with miles and yards is what pounds give: nothing is stored, so it goes on following.
  expect(await saveUnits({ preferredUnit: "lb" })).toEqual({});
  expect(await units()).toEqual({ distanceUnit: null, poolUnit: null });
  expect(await read()).toEqual({ distanceUnit: "mi", poolUnit: "yd" });

  // Kilometres beside pounds is a choice, and is kept; the pool still follows.
  await saveUnits({ preferredUnit: "lb", distanceUnit: "km" });
  expect(await units()).toEqual({ distanceUnit: "km", poolUnit: null });
  expect(await read()).toEqual({ distanceUnit: "km", poolUnit: "yd" });

  // Back to kilograms, where kilometres are what the weight unit gives: no choice left stored.
  await saveUnits({ preferredUnit: "kg" });
  expect(await units()).toEqual({ distanceUnit: null, poolUnit: null });
  expect(await read()).toEqual({ distanceUnit: "km", poolUnit: "m" });
});

it("refuses a distance unit that is not a road's", async () => {
  const state = await saveUnits({ preferredUnit: "kg", distanceUnit: "yd" });
  expect(state.fieldErrors?.distanceUnit).toBe("Choose kilometres or miles.");
});
