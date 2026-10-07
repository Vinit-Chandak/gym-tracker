import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { exercises, foodEntries, setLogs, workoutExercises, workoutSessions } from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { exerciseSessions } from "@/domain/progress-graphs";
import { dateWindow } from "@/server/validation/date-range";

import {
  parseSeriesId,
  pickSeries,
  readExerciseSeriesOptions,
  readExerciseSetRows,
  readFoodDayTotals,
  readStrengthRows,
  type ExerciseSeriesOption,
} from "./graphs";

const zone = "Asia/Kolkata";
const september = dateWindow("2026-09-01", "2026-09-30", zone);
const everything = dateWindow("2000-01-01", "2026-10-07", zone);
let t: TestDatabase, alice: { id: string; email: string }, bob: { id: string; email: string };
let bench: string, gymId: string;

/** A workout at a local time in Kolkata, with its sets: [type, weight, reps]. */
async function workout(
  userId: string,
  localStart: string,
  sets: [string, number | null, number | null][],
  { finished = true, exerciseId = bench }: { finished?: boolean; exerciseId?: string } = {},
) {
  return withUser(t.db, userId, async (tx) => {
    const startedAt = new Date(`${localStart}+05:30`);
    const [session] = await tx
      .insert(workoutSessions)
      .values({ userId, gymId, startedAt, completedAt: finished ? startedAt : null })
      .returning({ id: workoutSessions.id });
    const [slot] = await tx
      .insert(workoutExercises)
      .values({ userId, workoutSessionId: session!.id, exerciseId, orderIndex: 0 })
      .returning({ id: workoutExercises.id });
    await tx.insert(setLogs).values(
      sets.map(([setType, weight, reps], setIndex) => ({
        userId,
        workoutExerciseId: slot!.id,
        setIndex,
        setType: setType as "working",
        weight,
        reps,
      })),
    );
    return session!.id;
  });
}

let first: string, second: string;

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  alice = await t.createAuthUser("graphs@example.com");
  bob = await t.createAuthUser("other-graphs@example.com");
  await withUser(t.db, alice.id, async (tx) => {
    gymId = (await seedTestUserData(tx, alice)).gymIdBySlug.get("anytime-fitness")!;
    const [row] = await tx
      .select({ id: exercises.id })
      .from(exercises)
      .where(eq(exercises.slug, "barbell-bench-press"));
    bench = row!.id;
  });
  // Just after midnight in Kolkata: still the 14th there, the 13th in UTC.
  first = await workout(alice.id, "2026-09-14T00:30:00", [
    ["warmup", 60, 8],
    ["working", 100, 5],
    ["working", 100, 6],
  ]);
  second = await workout(alice.id, "2026-09-21T18:00:00", [["working", 105, 3]]);
  // An open workout and last month's: neither is in September's finished work.
  await workout(alice.id, "2026-09-25T18:00:00", [["working", 200, 1]], { finished: false });
  await workout(alice.id, "2026-08-10T18:00:00", [["working", 90, 5]]);
  await withUser(t.db, bob.id, async (tx) => {
    await seedTestUserData(tx, bob);
  });
});
afterAll(async () => {
  await t.close();
});

describe("strength", () => {
  it("counts each finished workout's working sets per exercise, on its local day", async () => {
    const rows = await withUser(t.db, alice.id, (tx) =>
      readStrengthRows(tx, alice.id, zone, september),
    );
    expect(rows).toEqual([
      expect.objectContaining({ sessionId: first, date: "2026-09-14", workingSets: 2 }),
      expect.objectContaining({ sessionId: second, date: "2026-09-21", workingSets: 1 }),
    ]);
    expect(rows[0]!.primaryMuscles).toContain("chest");
  });

  it("offers every series ever logged, counting the workouts in the window apart", async () => {
    const options = await withUser(t.db, alice.id, (tx) =>
      readExerciseSeriesOptions(tx, alice.id, september),
    );
    expect(options).toEqual([
      expect.objectContaining({
        id: `${bench}:global:kg`,
        name: "Barbell bench press",
        machine: "Across gyms",
        modality: "barbell",
        measure: "reps",
        sessionsInRange: 2,
        sessions: 3,
      }),
    ]);
    // Nobody else's training is offered.
    expect(
      await withUser(t.db, bob.id, (tx) => readExerciseSeriesOptions(tx, bob.id, everything)),
    ).toEqual([]);
  });

  it("reads a series' working sets in order, and the bests each workout made of them", async () => {
    const rows = await withUser(t.db, alice.id, (tx) =>
      readExerciseSetRows(tx, alice.id, zone, september, `${bench}:global:kg`),
    );
    expect(rows.map((row) => [row.sessionId, row.weight, row.reps])).toEqual([
      [first, 100, 5],
      [first, 100, 6],
      [second, 105, 3],
    ]);
    expect(exerciseSessions(rows, "barbell", "kg").map((session) => session.e1rm)).toEqual([
      120, 115.5,
    ]);
    // A series id that is not one reads nothing rather than failing.
    expect(
      await withUser(t.db, alice.id, (tx) =>
        readExerciseSetRows(tx, alice.id, zone, september, "nonsense"),
      ),
    ).toEqual([]);
  });
});

describe("series ids", () => {
  const exercise = "0e63df1b-c2ab-4b7a-830c-c16f1110000d";
  const slot = "1a3845a5-a559-42fd-a7d4-a7bb63d2d285";

  it("take an exercise, its machine and its unit apart, an unrecorded machine included", () => {
    expect(parseSeriesId(`${exercise}:global:kg`)).toEqual({
      exerciseId: exercise,
      machineKey: "global",
      unit: "kg",
    });
    expect(parseSeriesId(`${exercise}:unknown:${slot}:stack_index`)).toEqual({
      exerciseId: exercise,
      machineKey: `unknown:${slot}`,
      unit: "stack_index",
    });
    for (const id of [
      "",
      `${exercise}:global`,
      `x:global:kg`,
      `${exercise}:machine:kg`,
      `${exercise}:global:stone`,
    ])
      expect(parseSeriesId(id)).toBeNull();
  });

  it("open on the free-weight lift done most often in the span, not on a carry", () => {
    const option = (id: string, extra: Partial<ExerciseSeriesOption>): ExerciseSeriesOption => ({
      id,
      exerciseId: id,
      name: id,
      machine: "Across gyms",
      unit: "kg",
      modality: "barbell",
      measure: "reps",
      sessionsInRange: 0,
      sessions: 10,
      lastAt: "2026-09-01T00:00:00.000Z",
      ...extra,
    });
    const carry = option("carry", {
      modality: "dumbbell",
      measure: "distance",
      sessionsInRange: 9,
    });
    const plank = option("plank", {
      modality: "bodyweight",
      measure: "duration",
      sessionsInRange: 9,
    });
    const row = option("row", { sessionsInRange: 6 });
    const old = option("old", { lastAt: "2026-10-01T00:00:00.000Z" });
    expect(pickSeries([carry, plank, row, old], undefined)).toBe(row);
    expect(pickSeries([carry, plank, row, old], "plank")).toBe(plank);
    // Nothing in the span: whatever was done last.
    expect(pickSeries([option("a", {}), old], undefined)).toBe(old);
    expect(pickSeries([], undefined)).toBeNull();
  });
});

describe("food", () => {
  it("adds each logged day up as the Food tab does, a protein nobody recorded counted as none", async () => {
    await withUser(t.db, alice.id, (tx) =>
      tx.insert(foodEntries).values([
        // 150 g of oats at 389 kcal and 13.2 g protein per 100 g.
        {
          userId: alice.id,
          eatenOn: "2026-09-14",
          meal: "breakfast",
          name: "Oats",
          portionAmount: 100,
          unit: "g",
          kcal: 389,
          proteinG: 13.2,
          amount: 150,
        },
        // A drink whose protein is not known.
        {
          userId: alice.id,
          eatenOn: "2026-09-14",
          meal: "lunch",
          name: "Juice",
          portionAmount: 250,
          unit: "ml",
          kcal: 110,
          proteinG: null,
          amount: 500,
        },
        {
          userId: alice.id,
          eatenOn: "2026-09-16",
          meal: "dinner",
          name: "Rice",
          portionAmount: 100,
          unit: "g",
          kcal: 130,
          proteinG: 2.7,
          amount: 200,
        },
        // Outside the window.
        {
          userId: alice.id,
          eatenOn: "2026-10-01",
          meal: "dinner",
          name: "Rice",
          portionAmount: 100,
          unit: "g",
          kcal: 130,
          proteinG: 2.7,
          amount: 100,
        },
      ]),
    );
    expect(
      await withUser(t.db, alice.id, (tx) => readFoodDayTotals(tx, alice.id, september)),
    ).toEqual([
      { date: "2026-09-14", kcal: 803.5, protein: 19.8 },
      { date: "2026-09-16", kcal: 260, protein: 5.4 },
    ]);
  });
});
