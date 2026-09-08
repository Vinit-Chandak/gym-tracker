import { readFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { getTodayPlan } from "@/server/repositories/schedule";
import { plannedRunsForCurrentCycle } from "@/server/repositories/runs";
import {
  gyms,
  programDays,
  programExercises,
  programExerciseFallbacks,
  programRuns,
  programs,
  workoutSessions,
} from "./schema";
import { seedReferenceData } from "./seed/reference";
import { seedUserStarterData } from "./seed/starter";
import { createTestDatabase, type TestDatabase } from "./test/pglite";
import { withUser } from "./with-user";

const migration = readFileSync("src/db/migrations/0005_tuesday_cycle.sql", "utf8");
let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
});
afterAll(async () => {
  await t.close();
});

async function legacyProgram(email: string) {
  const user = await t.createAuthUser(email);
  const { programId } = await withUser(t.db, user.id, (tx) => seedUserStarterData(tx, user));
  await t.db.update(programs).set({ startDayIndex: 2 }).where(eq(programs.id, programId));
  await t.db
    .update(programDays)
    .set({ dayOfWeek: sql`${programDays.dayIndex}` })
    .where(eq(programDays.programId, programId));
  await t.db
    .update(programRuns)
    .set({ dayOfWeek: sql`${programRuns.dayOfWeek} - 1` })
    .where(eq(programRuns.programId, programId));
  return { user, programId };
}

it("versions the unused starter plan, preserves prescriptions and activates Lower A", async () => {
  const { user, programId } = await legacyProgram("cycle@example.com");
  const beforeDays = await t.db
    .select()
    .from(programDays)
    .where(eq(programDays.programId, programId));
  const beforeExercises = await t.db
    .select()
    .from(programExercises)
    .where(eq(programExercises.programDayId, beforeDays.find((d) => d.dayIndex === 1)!.id));
  const source = beforeExercises[0]!;
  await t.db
    .update(programExercises)
    .set({ targetLoadNote: "Keep my custom note" })
    .where(eq(programExercises.id, source.id));
  const beforeFallbacks = await withUser(t.db, user.id, (tx) =>
    tx.select().from(programExerciseFallbacks),
  );

  await t.client.exec(migration);
  const versions = await t.db
    .select()
    .from(programs)
    .where(eq(programs.userId, user.id))
    .orderBy(programs.version);
  expect(versions.map((p) => [p.version, p.status, p.startDayIndex])).toEqual([
    [1, "archived", 2],
    [2, "active", 1],
  ]);
  expect(versions[1]!.familyId).toBe(versions[0]!.familyId);
  expect(versions[1]!.endDate).toBe("2026-11-02");
  const oldDays = await t.db.select().from(programDays).where(eq(programDays.programId, programId));
  expect(oldDays).toEqual(beforeDays);
  const plan = await withUser(t.db, user.id, (tx) => getTodayPlan(tx, user.id, "Asia/Kolkata"));
  expect(plan?.suggestedDay?.name).toBe("Lower A");
  expect(plan?.progress.total).toBe(56);
  expect(plan?.cycleDays.map((d) => d.day.dayOfWeek)).toEqual([2, 3, 4, 5, 6, 7, 1]);
  const copied = await t.db
    .select()
    .from(programExercises)
    .where(
      and(
        eq(programExercises.programDayId, plan!.suggestedDay!.id),
        eq(programExercises.orderIndex, source.orderIndex),
      ),
    );
  expect(copied[0]).toMatchObject({
    exerciseId: source.exerciseId,
    sets: source.sets,
    progressionRule: source.progressionRule,
    targetLoadNote: "Keep my custom note",
  });
  expect(copied[0]!.id).not.toBe(source.id);
  const allFallbacks = await withUser(t.db, user.id, (tx) =>
    tx.select().from(programExerciseFallbacks),
  );
  expect(allFallbacks).toHaveLength(beforeFallbacks.length * 2);
  const runs = await withUser(t.db, user.id, (tx) => plannedRunsForCurrentCycle(tx, user.id, []));
  expect(runs?.planned.map((r) => [r.dayOfWeek, r.durationMinMinutes])).toEqual([
    [4, 20],
    [7, 25],
  ]);

  await t.client.exec(migration);
  expect(await t.db.select().from(programs).where(eq(programs.userId, user.id))).toHaveLength(2);
  const reseeded = await withUser(t.db, user.id, (tx) => seedUserStarterData(tx, user));
  expect(reseeded).toMatchObject({ programCreated: false, programId: versions[1]!.id });
});

it("does not replace a programme that already has a workout", async () => {
  const { user, programId } = await legacyProgram("started-cycle@example.com");
  const [gym] = await t.db.select().from(gyms).where(eq(gyms.userId, user.id));
  await t.db.insert(workoutSessions).values({ userId: user.id, gymId: gym!.id, programId });
  await t.client.exec(migration);
  const rows = await t.db.select().from(programs).where(eq(programs.userId, user.id));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ status: "active", startDayIndex: 2 });
});
