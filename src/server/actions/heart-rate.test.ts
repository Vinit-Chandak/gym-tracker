import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { profiles } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), requireUser: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/server/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/server/queries/request-profile", () => ({ profileChanged: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { saveHeartRateAction } from "./heart-rate";

let t: TestDatabase;
let user: { id: string; email: string };
beforeAll(async () => {
  t = await createTestDatabase();
  user = await t.createAuthUser("heart-rate-audit@example.test");
  mocks.getDb.mockReturnValue(t.db);
  mocks.requireUser.mockResolvedValue(user);
});
afterAll(async () => {
  await t.close();
});

const save = (overrides: Record<string, string> = {}) => {
  const fields = {
    maxHeartRate: "190",
    restingHeartRate: "55",
    zoneMethod: "custom",
    maxHeartRateAuto: "on",
    zone1: "95",
    zone2: "114",
    zone3: "133",
    zone4: "152",
    zone5: "171",
    ...overrides,
  };
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return saveHeartRateAction(INITIAL_FORM_STATE, data);
};

it("names each missing zone rather than pointing at a filled first zone", async () => {
  const state = await save({ zone3: "", zone5: "" });
  expect(state.fieldErrors).toEqual({
    zone3: "Enter where zone 3 starts.",
    zone5: "Enter where zone 5 starts.",
  });
  expect(state.values?.zone2).toBe("114");
  const [stored] = await t.db.select().from(profiles).where(eq(profiles.id, user.id));
  expect(stored!.maxHeartRate).toBeNull();
});

it("saves corrected zones and their source atomically", async () => {
  expect(await save()).toEqual({});
  const [stored] = await t.db.select().from(profiles).where(eq(profiles.id, user.id));
  expect(stored).toMatchObject({
    maxHeartRate: 190,
    maxHeartRateSource: "entered",
    restingHeartRate: 55,
    heartRateZoneMethod: "custom",
    heartRateZoneFloors: [95, 114, 133, 152, 171],
  });
  expect((await save({ zone4: "100" })).fieldErrors?.zone4).toMatch(/above/);
  const [unchanged] = await t.db.select().from(profiles).where(eq(profiles.id, user.id));
  expect(unchanged!.heartRateZoneFloors).toEqual([95, 114, 133, 152, 171]);
});
