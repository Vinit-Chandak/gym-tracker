import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { activities, profiles, sharedSessionStats } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { toDateTimeLocal } from "@/lib/time";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), requireUser: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/server/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { saveActivityAction } from "./activities";

let t: TestDatabase;
let user: { id: string; email: string };

beforeEach(async () => {
  t = await createTestDatabase();
  user = await t.createAuthUser("activity-time@example.test");
  mocks.getDb.mockReturnValue(t.db);
  mocks.requireUser.mockResolvedValue(user);
  await t.db.update(profiles).set({ timeZone: "Asia/Kolkata" }).where(eq(profiles.id, user.id));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await t.close();
});

function form(values: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    sport: "running",
    submissionKey: crypto.randomUUID(),
    startedAt: "2026-09-18T00:15",
    environment: "outdoor",
    distanceValue: "5",
    distanceUnit: "km",
    minutes: "30",
    effort: "3",
    ...values,
  }))
    data.set(key, value);
  return data;
}

it("keeps the recorded zone, local date and exact instant when correcting notes after travel", async () => {
  const created = await saveActivityAction(null, {}, form());
  expect(created.savedActivityId).toBeDefined();
  const id = created.savedActivityId!;
  const instant = new Date("2026-09-17T18:45:37.123Z");
  await t.db
    .update(activities)
    .set({ startedAt: instant, timeZoneSource: "legacy_profile_snapshot" })
    .where(eq(activities.id, id));
  await t.db
    .update(profiles)
    .set({ timeZone: "America/Los_Angeles" })
    .where(eq(profiles.id, user.id));

  const correction = form({ expectedRevision: "1", notes: "Shoes felt better today." });
  const result = await saveActivityAction(id, {}, correction);
  expect(result.savedActivityId).toBe(id);
  const [saved] = await t.db.select().from(activities).where(eq(activities.id, id));
  expect(saved).toMatchObject({
    startedAt: instant,
    occurredOn: "2026-09-18",
    recordedTimeZone: "Asia/Kolkata",
    timeZoneSource: "legacy_profile_snapshot",
    notes: "Shoes felt better today.",
    revision: 2,
  });
  const [shared] = await t.db
    .select()
    .from(sharedSessionStats)
    .where(eq(sharedSessionStats.sourceId, id));
  expect(shared?.occurredOn).toBe("2026-09-18");
  // A disconnected response can be retried even though the current record has moved on.
  expect((await saveActivityAction(id, {}, correction)).savedActivityId).toBe(id);
  const [replayed] = await t.db.select().from(activities).where(eq(activities.id, id));
  expect(replayed?.revision).toBe(2);
});

it("applies an intentional date correction in the activity's saved zone", async () => {
  const created = await saveActivityAction(null, {}, form());
  await t.db
    .update(profiles)
    .set({ timeZone: "America/Los_Angeles" })
    .where(eq(profiles.id, user.id));
  const result = await saveActivityAction(
    created.savedActivityId!,
    {},
    form({
      expectedRevision: "1",
      startedAt: "2026-09-19T00:30",
    }),
  );
  expect(result.savedActivityId).toBe(created.savedActivityId);
  const [saved] = await t.db
    .select()
    .from(activities)
    .where(eq(activities.id, created.savedActivityId!));
  expect(saved).toMatchObject({
    startedAt: new Date("2026-09-18T19:00:00Z"),
    occurredOn: "2026-09-19",
    recordedTimeZone: "Asia/Kolkata",
  });
});

it("rejects impossible dates, overflowed time fields and daylight-saving gaps without saving", async () => {
  await t.db.update(profiles).set({ timeZone: "America/New_York" }).where(eq(profiles.id, user.id));
  for (const startedAt of ["2026-02-30T10:00", "2026-09-18T24:15", "2026-03-08T02:30"]) {
    const result = await saveActivityAction(null, {}, form({ startedAt }));
    expect(result.fieldErrors?.startedAt).toMatch(/valid date and time/);
    expect(result.values?.startedAt).toBe(startedAt);
  }
  expect(await t.db.select().from(activities)).toHaveLength(0);
});

it("rejects future actuals beyond the clock tolerance but accepts a small clock difference", async () => {
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now);
  const future = toDateTimeLocal(new Date(now + 10 * 60_000), "Asia/Kolkata");
  const refused = await saveActivityAction(null, {}, form({ startedAt: future }));
  expect(refused.fieldErrors?.startedAt).toMatch(/future/);
  const near = toDateTimeLocal(new Date(now + 4 * 60_000), "Asia/Kolkata");
  expect(
    (await saveActivityAction(null, {}, form({ startedAt: near }))).savedActivityId,
  ).toBeDefined();
  expect(await t.db.select().from(activities)).toHaveLength(1);
});

it("requires a valid offset for repeated times and stores the first or second occurrence chosen", async () => {
  await t.db.update(profiles).set({ timeZone: "America/New_York" }).where(eq(profiles.id, user.id));
  for (const offset of ["", "0", "-360"]) {
    const refused = await saveActivityAction(
      null,
      {},
      form({ startedAt: "2025-11-02T01:30", startedAtOffsetMinutes: offset }),
    );
    expect(refused.fieldErrors?.startedAtOffsetMinutes).toMatch(/Choose which time/);
  }
  expect(await t.db.select().from(activities)).toHaveLength(0);
  for (const [offset, expected] of [
    ["-240", "2025-11-02T05:30:00.000Z"],
    ["-300", "2025-11-02T06:30:00.000Z"],
  ]) {
    const created = await saveActivityAction(
      null,
      {},
      form({ startedAt: "2025-11-02T01:30", startedAtOffsetMinutes: offset! }),
    );
    expect(created.savedActivityId).toBeDefined();
    const [saved] = await t.db
      .select()
      .from(activities)
      .where(eq(activities.id, created.savedActivityId!));
    expect(saved?.startedAt.toISOString()).toBe(expected);
    // An existing record keeps its actual occurrence even for an old client without a selector.
    const corrected = await saveActivityAction(
      created.savedActivityId!,
      {},
      form({ startedAt: "2025-11-02T01:30", expectedRevision: "1", notes: "Corrected note" }),
    );
    expect(corrected.savedActivityId).toBe(created.savedActivityId);
    const [after] = await t.db
      .select()
      .from(activities)
      .where(eq(activities.id, created.savedActivityId!));
    expect(after?.startedAt.toISOString()).toBe(expected);
  }
});

it("keeps a new activity in the form's displayed time zone if the profile changes in another tab", async () => {
  const entered = form({
    startedAt: "2025-11-02T01:30",
    recordedTimeZone: "America/New_York",
    startedAtOffsetMinutes: "-300",
  });
  const created = await saveActivityAction(null, {}, entered);
  expect(created.savedActivityId).toBeDefined();
  const [saved] = await t.db
    .select()
    .from(activities)
    .where(eq(activities.id, created.savedActivityId!));
  expect(saved).toMatchObject({
    recordedTimeZone: "America/New_York",
    occurredOn: "2025-11-02",
    startedAt: new Date("2025-11-02T06:30:00.000Z"),
  });
});
