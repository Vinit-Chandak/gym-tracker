import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { activities, cyclingActivityDetails, profiles, sharedSessionStats } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { AD_HOC_ORIGIN, UNKNOWN_EFFORT } from "@/domain/activity";
import { nativeDistance, type EnduranceActual } from "@/domain/activity-metrics";
import { todayInTimeZone } from "@/domain/program-calendar";
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

it("rebuilds more than 500 activities across 56 months in batches without changing their local dates", async () => {
  const history = Array.from({ length: 501 }, (_, index) => {
    const startedAt = new Date(Date.UTC(2022, 1 + Math.floor(index / 9), 1, 20, index % 9));
    return {
      id: crypto.randomUUID(),
      userId,
      sport: "cycling" as const,
      status: "completed" as const,
      startedAt,
      recordedTimeZone: "Asia/Kolkata",
      timeZoneSource: "profile_at_entry" as const,
      occurredOn: todayInTimeZone("Asia/Kolkata", startedAt),
      durationMs: 1_800_000,
    };
  });
  await withUser(t.db, userId, async (tx) => {
    await tx.insert(activities).values(history);
    await tx.insert(cyclingActivityDetails).values(
      history.map((activity) => ({
        userId,
        activityId: activity.id,
        sport: "cycling" as const,
        environment: "indoor" as const,
      })),
    );
    await tx.update(profiles).set({ timeZone: "UTC" }).where(eq(profiles.id, userId));
  });

  let statements = 0;
  const instrumentedDb = drizzle(t.client, {
    logger: {
      logQuery: () => {
        statements += 1;
      },
    },
  });
  mocks.getDb.mockReturnValue(instrumentedDb);
  try {
    await setSportSharingAction("cycling", true);
  } finally {
    mocks.getDb.mockReturnValue(t.db);
  }
  // A full history must not require several network round trips for every activity.
  expect(statements).toBeGreaterThan(0);
  expect(statements).toBeLessThan(25);
  const projected = await shared();
  expect(projected).toHaveLength(501);
  const dates = new Map(history.map((activity) => [activity.id, activity.occurredOn]));
  expect(projected.every((row) => row.occurredOn === dates.get(row.sourceId))).toBe(true);
  expect(projected.every((row) => row.distanceMeters === null)).toBe(true);
});

it("does not accept legacy sports at the additional-sport sharing endpoint", async () => {
  mocks.getDb.mockClear();
  for (const sport of ["strength", "running"] as const)
    await expect(setSportSharingAction(sport, false)).rejects.toThrow("Not a sport preference");
  expect(mocks.getDb).not.toHaveBeenCalled();
});
