import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sharedSessionStats } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { AD_HOC_ORIGIN, UNKNOWN_EFFORT } from "@/domain/activity";
import { nativeDistance, type EnduranceActual } from "@/domain/activity-metrics";
import { ensureProfile } from "@/server/queries/profile";
import { createActivity, deleteActivity } from "@/server/repositories/activities";
import { setPrivacyAction } from "./privacy";
import { setSportSharingAction } from "./sport-preferences";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), requireUser: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/server/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/server/queries/request-profile", () => ({ profileChanged: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
let t: TestDatabase;
let userId: string;
beforeEach(async () => {
  t = await createTestDatabase();
  const user = await t.createAuthUser("privacy@example.test");
  userId = user.id;
  await ensureProfile(t.db, user);
  mocks.getDb.mockReturnValue(t.db);
  mocks.requireUser.mockResolvedValue(user);
});
afterEach(async () => t.close());

const cycle: EnduranceActual = {
  sport: "cycling",
  environment: "indoor",
  durationMs: 1800000,
  distance: null,
  assistance: "unknown",
  resourceId: null,
  averagePowerWatts: null,
  averageCadenceRpm: null,
  averageHeartRate: null,
  maxHeartRate: null,
  elevationGainMetres: null,
};
const swim: EnduranceActual = {
  sport: "swimming",
  environment: "pool",
  elapsedMs: 1200000,
  activeMs: null,
  distanceMethod: "lengths",
  distance: null,
  poolLength: nativeDistance(25, "yd"),
  lengths: 16,
  stroke: "mixed",
  strokeCount: null,
  resourceId: null,
  averageHeartRate: null,
  maxHeartRate: null,
};
const record = (actual: EnduranceActual) =>
  withUser(t.db, userId, (tx) =>
    createActivity(tx, userId, {
      submissionKey: crypto.randomUUID(),
      origin: AD_HOC_ORIGIN,
      actual,
      startedAt: new Date("2026-09-22T06:00:00Z"),
      recordedTimeZone: "UTC",
      timeZoneSource: "profile_at_entry",
      occurredOn: "2026-09-22",
      effort: UNKNOWN_EFFORT,
      outcome: "logged",
      title: null,
      notes: "Private note",
    }),
  );
const shared = () =>
  t.db.select().from(sharedSessionStats).where(eq(sharedSessionStats.userId, userId));

it("rebuilds only opted-in sports after global sharing resumes, preserving unknowns and excluding deletions", async () => {
  const first = await record(cycle);
  await record(swim);
  expect(await shared()).toHaveLength(0);
  await setSportSharingAction("cycling", true);
  await setSportSharingAction("swimming", true);
  expect(await shared()).toHaveLength(2);
  // The shared projection stores metres to one decimal; the actual retains native yards.
  expect((await shared()).find((row) => row.sport === "swim")!.distanceMeters).toBe(365.8);
  expect((await shared()).find((row) => row.sport === "cycle")!.distanceMeters).toBeNull();

  await setPrivacyAction("shareTraining", false);
  expect(await shared()).toHaveLength(0);
  await record(cycle);
  await withUser(t.db, userId, (tx) => deleteActivity(tx, userId, first.id));
  await setSportSharingAction("swimming", false);
  await setPrivacyAction("shareTraining", true);
  const rows = await shared();
  expect(rows).toHaveLength(1);
  expect(rows[0]!.sport).toBe("cycle");
  expect(rows[0]!.sourceId).not.toBe(first.id);
  await setSportSharingAction("swimming", true);
  expect(await shared()).toHaveLength(2);
});
