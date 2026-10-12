import { readFile } from "node:fs/promises";

import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";

import { exercises, sharedExerciseStats, sharedSessionStats } from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import {
  addExerciseToSession,
  finishSession,
  logSet,
  startAdHocSession,
} from "@/server/repositories/sessions";

/**
 * Migration 0053, against shared rows written before it.
 *
 * The workouts are finished through the app, which now writes each row's place; the column is
 * then dropped, which is the table as the previous deployment left it, and the file is run the
 * way the migrator runs it: in one transaction, twice. Each movement comes back where the
 * workout first worked it, a row whose workout is gone or no longer has the movement goes after
 * the rest by name, and the table's policies are what they were.
 */

let t: TestDatabase;
let userId = "";
let gymId = "";
const ids = new Map<string, string>();

async function runMigration(): Promise<void> {
  const file = await readFile(
    "src/db/migrations/0053_shared_exercises_in_the_workouts_order.sql",
    "utf8",
  );
  await t.client.exec("BEGIN");
  try {
    for (const statement of file.split("--> statement-breakpoint")) {
      await t.client.exec(statement.trim());
    }
    await t.client.exec("COMMIT");
  } catch (error) {
    await t.client.exec("ROLLBACK");
    throw error;
  }
}

type Slot = { slug: string; sets: { weight: number; reps: number; warmup?: boolean }[] };

/** A finished ad hoc workout, slot by slot in the order given. */
async function train(slots: Slot[]): Promise<string> {
  return withUser(t.db, userId, async (tx) => {
    const { sessionId } = await startAdHocSession(tx, userId, { gymId });
    for (const slot of slots) {
      const { workoutExerciseId } = await addExerciseToSession(tx, userId, sessionId, {
        exerciseId: ids.get(slot.slug)!,
        equipmentInstanceId: null,
      });
      for (const [i, set] of slot.sets.entries())
        await logSet(tx, userId, {
          workoutExerciseId,
          setIndex: i + 1,
          setType: set.warmup ? "warmup" : "working",
          weight: set.weight,
          unit: "kg",
          reps: set.reps,
          rir: null,
          durationSeconds: null,
        });
    }
    await finishSession(tx, userId, sessionId, { notes: null, bodyWeightKg: null });
    return sessionId;
  });
}

/** A session's shared movements by name, in the order of their places. */
async function inOrder(sessionId: string): Promise<string[]> {
  const rows = await t.db
    .select({ name: exercises.name })
    .from(sharedExerciseStats)
    .innerJoin(exercises, eq(exercises.id, sharedExerciseStats.exerciseId))
    .where(eq(sharedExerciseStats.workoutSessionId, sessionId))
    .orderBy(asc(sharedExerciseStats.orderIndex));
  return rows.map((row) => row.name);
}

async function places(sessionId: string): Promise<number[]> {
  const rows = await t.db
    .select({ place: sharedExerciseStats.orderIndex })
    .from(sharedExerciseStats)
    .where(eq(sharedExerciseStats.workoutSessionId, sessionId))
    .orderBy(asc(sharedExerciseStats.orderIndex));
  return rows.map((row) => row.place);
}

async function policies() {
  const { rows } = await t.client.query(
    `select policyname, cmd, roles, qual, with_check from pg_policies
     where tablename = 'shared_exercise_stats' order by policyname`,
  );
  return rows;
}

let done = "";
let changed = "";
const gone = crypto.randomUUID();
let written: string[] = [];
let policiesBefore: unknown[] = [];

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  const user = await t.createAuthUser("order@example.test");
  userId = user.id;
  const fixture = await withUser(t.db, userId, (tx) => seedTestUserData(tx, user));
  gymId = fixture.gymIdBySlug.get("anytime-fitness")!;
  for (const slug of ["barbell-bench-press", "pull-up", "leg-press-45", "barbell-row"]) {
    const [row] = await t.db
      .select({ id: exercises.id })
      .from(exercises)
      .where(eq(exercises.slug, slug));
    ids.set(slug, row!.id);
  }

  // Bench, then pull-ups warmed up for and left, the leg press, then the pull-ups after all.
  done = await train([
    { slug: "barbell-bench-press", sets: [{ weight: 60, reps: 5 }] },
    { slug: "pull-up", sets: [{ weight: 0, reps: 5, warmup: true }] },
    { slug: "leg-press-45", sets: [{ weight: 140, reps: 10 }] },
    { slug: "pull-up", sets: [{ weight: 0, reps: 8 }] },
  ]);
  written = await inOrder(done);
  // A workout whose rows outlived it, and one with a row for a movement it no longer has.
  changed = await train([
    { slug: "pull-up", sets: [{ weight: 0, reps: 8 }] },
    { slug: "barbell-bench-press", sets: [{ weight: 60, reps: 5 }] },
  ]);
  const [session] = await t.db
    .select()
    .from(sharedSessionStats)
    .where(eq(sharedSessionStats.sourceId, changed));
  const row = (workoutSessionId: string, slug: string) => ({
    userId,
    workoutSessionId,
    exerciseId: ids.get(slug)!,
    occurredOn: session!.occurredOn,
    startedAt: session!.startedAt,
    comparable: true,
    workingSets: 1,
  });
  await t.db
    .insert(sharedExerciseStats)
    .values([
      row(changed, "barbell-row"),
      row(gone, "pull-up"),
      row(gone, "leg-press-45"),
      row(gone, "barbell-bench-press"),
    ]);

  // The table as the previous deployment left it.
  policiesBefore = await policies();
  await t.client.exec(`ALTER TABLE "shared_exercise_stats" DROP COLUMN "order_index"`);
  await runMigration();
});

afterAll(async () => {
  await t.close();
});

it("puts each movement where the workout first worked it, as Finish does", async () => {
  expect(written).toEqual(["Barbell bench press", "45° leg press", "Pull-up"]);
  expect(await inOrder(done)).toEqual(written);
  expect(await places(done)).toEqual([0, 1, 2]);
});

it("puts a row its workout no longer has after the rest, and a gone workout's A–Z", async () => {
  expect(await inOrder(changed)).toEqual(["Pull-up", "Barbell bench press", "Barbell bent-over row"]);
  expect(await inOrder(gone)).toEqual(["45° leg press", "Barbell bench press", "Pull-up"]);
  expect(await places(gone)).toEqual([0, 1, 2]);
});

it("changes nothing when it runs again, and leaves the policies as they were", async () => {
  const snapshot = () =>
    t.db
      .select({ id: sharedExerciseStats.id, place: sharedExerciseStats.orderIndex })
      .from(sharedExerciseStats)
      .where(eq(sharedExerciseStats.userId, userId))
      .orderBy(asc(sharedExerciseStats.id));
  const once = await snapshot();
  await runMigration();
  expect(await snapshot()).toEqual(once);
  expect(await policies()).toEqual(policiesBefore);
  await expect(
    t.client.exec(`UPDATE "shared_exercise_stats" SET "order_index" = -1`),
  ).rejects.toThrow(/shared_exercise_stats_order_chk/);
});
