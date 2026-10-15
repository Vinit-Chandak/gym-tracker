import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { profiles } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { knownTimeZone } from "@/server/queries/time-zone";
import { INITIAL_FORM_STATE } from "@/server/validation/form";
import { NOT_A_PLACE, UNKNOWN_TIME_ZONE } from "@/server/validation/profile";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), requireUser: vi.fn(), redirect: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/server/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/server/queries/request-profile", () => ({ profileChanged: vi.fn() }));
vi.mock("@/server/queries/time-zone", async (original) => {
  const real = await original<typeof import("@/server/queries/time-zone")>();
  return { knownTimeZone: vi.fn(real.knownTimeZone) };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { saveYouStepAction } from "./onboarding";

let t: TestDatabase;
let user: { id: string; email: string };

beforeEach(async () => {
  t = await createTestDatabase();
  user = await t.createAuthUser("you-step@example.test");
  mocks.getDb.mockReturnValue(t.db);
  mocks.requireUser.mockResolvedValue(user);
});
afterEach(async () => {
  vi.clearAllMocks();
  await t.close();
});

/** Setup's first step as it is sent, for someone who lifts, in the zone and units given. */
function save(
  timeZone: string,
  units: { preferredUnit: string; distanceUnit: string; poolUnit: string } = {
    preferredUnit: "kg",
    distanceUnit: "km",
    poolUnit: "m",
  },
) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    trainingExperience: "experienced",
    sports: "strength",
    ...units,
    timeZone,
  }))
    form.set(key, value);
  return saveYouStepAction(INITIAL_FORM_STATE, form);
}

async function savedZone() {
  const [row] = await t.db
    .select({ timeZone: profiles.timeZone })
    .from(profiles)
    .where(eq(profiles.id, user.id));
  return row?.timeZone;
}

it("keeps the zone as Postgres spells it, and goes on to where a lifter trains", async () => {
  await save("asia/kolkata");
  expect(await savedZone()).toBe("Asia/Kolkata");
  expect(mocks.redirect).toHaveBeenCalledWith("/welcome/gym");
});

it("asks for a place where the zone was an abbreviation or an offset", async () => {
  const before = await savedZone();
  const state = await save("IST");
  expect(state.fieldErrors?.timeZone).toBe(NOT_A_PLACE);
  expect(await savedZone()).toBe(before);
  expect(mocks.redirect).not.toHaveBeenCalled();
});

it("saves nothing in a zone the browser reads but Postgres, which dates the graphs, does not", async () => {
  const before = await savedZone();
  vi.mocked(knownTimeZone).mockResolvedValueOnce(null);
  const state = await save("Asia/Tokyo");
  expect(state.fieldErrors?.timeZone).toBe(UNKNOWN_TIME_ZONE);
  expect(state.values?.timeZone).toBe("Asia/Tokyo");
  expect(await savedZone()).toBe(before);
  expect(mocks.redirect).not.toHaveBeenCalled();
});

/** ADR 0055: setup's weight seeds the distances, and only a unit set apart is kept. */
it("keeps setup's distances following its weight unit unless they were set apart", async () => {
  const stored = async () => {
    const [row] = await t.db
      .select({ distanceUnit: profiles.distanceUnit, poolUnit: profiles.poolUnit })
      .from(profiles)
      .where(eq(profiles.id, user.id));
    return row;
  };
  await save("America/New_York", { preferredUnit: "lb", distanceUnit: "mi", poolUnit: "yd" });
  expect(await stored()).toEqual({ distanceUnit: null, poolUnit: null });
  // Kilograms with miles: the miles were chosen, and stay chosen whatever the weight does.
  await save("Europe/London", { preferredUnit: "kg", distanceUnit: "mi", poolUnit: "m" });
  expect(await stored()).toEqual({ distanceUnit: "mi", poolUnit: null });
});
