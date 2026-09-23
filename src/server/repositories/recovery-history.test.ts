import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { dailyRecovery, workoutSessions } from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { parseDateRange } from "@/server/validation/date-range";
import { readRecoveryHistory } from "./recovery-history";
import { finishSession, saveCheckIn, startAdHocSession } from "./sessions";

const zone = "Asia/Kolkata";
const day = parseDateRange({ from: "2026-09-22", to: "2026-09-22" }, zone);
const full = { sleepHours: 7.25, sleepQuality: 4, fatigue: 2, soreness: 1 };
const partial = { sleepHours: 0, sleepQuality: null, fatigue: 3, soreness: null };
let t: TestDatabase, alice: { id: string; email: string }, bob: { id: string; email: string };
let gymId: string, sessionId: string;

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  alice = await t.createAuthUser("recovery@example.com");
  bob = await t.createAuthUser("other-recovery@example.com");
  await withUser(t.db, alice.id, async (tx) => {
    const fixture = await seedTestUserData(tx, alice);
    gymId = fixture.gymIdBySlug.get("anytime-fitness")!;
    sessionId = (await startAdHocSession(tx, alice.id, { gymId })).sessionId;
    await tx
      .update(workoutSessions)
      .set({ startedAt: day.start })
      .where(eq(workoutSessions.id, sessionId));
  });
});
afterAll(async () => {
  await t.close();
});

it("reads every saved answer before finishing, edits the same reading, and retains it after finishing", async () => {
  const read = () => withUser(t.db, alice.id, (tx) => readRecoveryHistory(tx, alice.id, day, zone));
  expect(await read()).toEqual([]);
  await withUser(t.db, alice.id, (tx) => saveCheckIn(tx, alice.id, sessionId, full));
  expect(await read()).toEqual([
    expect.objectContaining({ ...full, sessionId, source: "workout", date: day.from }),
  ]);
  await withUser(t.db, alice.id, (tx) => saveCheckIn(tx, alice.id, sessionId, partial));
  expect(await read()).toEqual([expect.objectContaining(partial)]);
  await withUser(t.db, alice.id, (tx) =>
    finishSession(tx, alice.id, sessionId, { notes: null, bodyWeightKg: null }),
  );
  expect(await read()).toEqual([expect.objectContaining(partial)]);
});

it("uses inclusive account-local dates, keeps same-day sources separate, and ignores blank responses", async () => {
  await withUser(t.db, alice.id, async (tx) => {
    await tx.insert(workoutSessions).values([
      {
        userId: alice.id,
        gymId,
        startedAt: new Date(day.start.getTime() - 1),
        energy: 1,
        completedAt: day.start,
      },
      {
        userId: alice.id,
        gymId,
        startedAt: new Date(day.end.getTime() - 1),
        energy: 4,
        completedAt: day.end,
      },
      { userId: alice.id, gymId, startedAt: day.end, energy: 2, completedAt: day.end },
      { userId: alice.id, gymId, startedAt: day.start, completedAt: day.end },
    ]);
    await tx.insert(dailyRecovery).values([
      { userId: alice.id, date: day.from, sleepHours: 8, sleepQuality: 5 },
      { userId: alice.id, date: "2026-09-21", energy: 1 },
      { userId: alice.id, date: "2026-09-23" },
    ]);
  });
  const result = await withUser(t.db, alice.id, (tx) =>
    readRecoveryHistory(tx, alice.id, day, zone),
  );
  expect(result).toHaveLength(3);
  expect(result.every((reading) => reading.date === day.from)).toBe(true);
  // An energy saved before the check-in stopped asking it is read as it always was.
  expect(
    result
      .filter((reading) => reading.source === "workout")
      .map((reading) => [reading.energy, reading.fatigue]),
  ).toEqual([
    [null, 3],
    [4, null],
  ]);
  expect(result.find((reading) => reading.source === "daily")).toMatchObject({
    sleepHours: 8,
    sleepQuality: 5,
    energy: null,
    sessionId: null,
  });
  const blank = parseDateRange({ from: "2026-09-23", to: "2026-09-23" }, zone);
  expect(
    (await withUser(t.db, alice.id, (tx) => readRecoveryHistory(tx, alice.id, blank, zone))).map(
      (r) => r.source,
    ),
  ).toEqual(["workout"]);
});

it("does not lose an older check-in behind 500 newer workouts without answers", async () => {
  const range = parseDateRange({ from: "2026-08-01", to: "2026-08-31" }, zone);
  await withUser(t.db, alice.id, async (tx) => {
    await tx.insert(workoutSessions).values([
      { userId: alice.id, gymId, startedAt: range.start, completedAt: range.end, energy: 5 },
      ...Array.from({ length: 501 }, (_, i) => ({
        userId: alice.id,
        gymId,
        startedAt: new Date(range.start.getTime() + (i + 1) * 60_000),
        completedAt: range.end,
      })),
    ]);
  });
  expect(
    await withUser(t.db, alice.id, (tx) => readRecoveryHistory(tx, alice.id, range, zone)),
  ).toEqual([expect.objectContaining({ date: "2026-08-01", energy: 5 })]);
});

it("enforces ownership both in its query and through row-level security", async () => {
  await withUser(t.db, bob.id, (tx) =>
    tx.insert(dailyRecovery).values({ userId: bob.id, date: day.from, energy: 2 }),
  );
  expect(
    await withUser(t.db, bob.id, (tx) => readRecoveryHistory(tx, alice.id, day, zone)),
  ).toEqual([]);
  expect(await readRecoveryHistory(t.db, bob.id, day, zone)).toEqual([
    expect.objectContaining({ source: "daily", energy: 2 }),
  ]);
});
