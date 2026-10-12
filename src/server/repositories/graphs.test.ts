import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  equipmentInstances,
  equipmentTypes,
  exercises,
  foodEntries,
  setLogs,
  workoutExercises,
  workoutSessions,
} from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { exerciseSessions } from "@/domain/progress-graphs";
import type { LoadUnit } from "@/domain/types";
import { dateWindow } from "@/server/validation/date-range";

import { readExerciseLife } from "./exercise-life";
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
let carol: { id: string; email: string };
let bench: string, gymId: string;

/** A workout at a local time in Kolkata, with its sets: [type, weight, reps, unit (kg)]. */
async function workout(
  userId: string,
  localStart: string,
  sets: [string, number | null, number | null, LoadUnit?][],
  {
    finished = true,
    exerciseId = bench,
    machineId = null,
  }: { finished?: boolean; exerciseId?: string; machineId?: string | null } = {},
) {
  return withUser(t.db, userId, async (tx) => {
    const startedAt = new Date(`${localStart}+05:30`);
    const [session] = await tx
      .insert(workoutSessions)
      .values({ userId, gymId, startedAt, completedAt: finished ? startedAt : null })
      .returning({ id: workoutSessions.id });
    const [slot] = await tx
      .insert(workoutExercises)
      .values({
        userId,
        workoutSessionId: session!.id,
        exerciseId,
        orderIndex: 0,
        equipmentInstanceId: machineId,
      })
      .returning({ id: workoutExercises.id });
    await tx.insert(setLogs).values(
      sets.map(([setType, weight, reps, unit = "kg"], setIndex) => ({
        userId,
        workoutExerciseId: slot!.id,
        setIndex,
        setType: setType as "working",
        weight,
        reps,
        unit,
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
  carol = await t.createAuthUser("pounds-graphs@example.com");
  await withUser(t.db, carol.id, async (tx) => {
    await seedTestUserData(tx, carol);
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
    // Volume is load × reps of the working sets: 100 × 5 + 100 × 6, the warm-up left out.
    expect(rows).toEqual([
      expect.objectContaining({
        sessionId: first,
        date: "2026-09-14",
        workingSets: 2,
        volumeKg: 1100,
      }),
      expect.objectContaining({
        sessionId: second,
        date: "2026-09-21",
        workingSets: 1,
        volumeKg: 315,
      }),
    ]);
    expect(rows[0]!.primaryMuscles).toContain("chest");
  });

  it("weighs pounds in kilograms, and a stack step or a bodyweight set as nothing", async () => {
    await workout(
      carol.id,
      "2026-09-10T18:00:00",
      [
        ["working", 225, 5, "lb"],
        ["working", 12, 10, "stack_index"],
        ["working", null, 12, "none"],
      ],
      { exerciseId: bench },
    );
    const [row] = await withUser(t.db, carol.id, (tx) =>
      readStrengthRows(tx, carol.id, zone, september),
    );
    // 225 lb is 102.06 kg, five times: every set is work, only the pounds a load.
    expect(row).toMatchObject({ workingSets: 3, volumeKg: 510.3 });
  });

  it("reads an assisted machine's number as help: no volume, and the least of it the best", async () => {
    const dave = await t.createAuthUser("assisted-graphs@example.com");
    const { machine, pullUp } = await withUser(t.db, dave.id, async (tx) => {
      await seedTestUserData(tx, dave);
      const [row] = await tx
        .select({ id: equipmentInstances.id })
        .from(equipmentInstances)
        .where(
          and(
            eq(equipmentInstances.userId, dave.id),
            eq(equipmentInstances.name, "Assisted pull-up machine"),
          ),
        );
      const [exercise] = await tx
        .select({ id: exercises.id })
        .from(exercises)
        .where(eq(exercises.slug, "assisted-pull-up"));
      return { machine: row!.id, pullUp: exercise!.id };
    });
    const help = (kg: number): [string, number, number][] => [
      ["working", kg, 8],
      ["working", kg, 8],
      ["working", kg, 8],
    ];
    await workout(dave.id, "2026-08-04T18:00:00", help(50), {
      exerciseId: pullUp,
      machineId: machine,
    });
    await workout(dave.id, "2026-09-01T18:00:00", help(40), {
      exerciseId: pullUp,
      machineId: machine,
    });
    await workout(dave.id, "2026-09-29T18:00:00", help(25), {
      exerciseId: pullUp,
      machineId: machine,
    });
    // A lift whose load means the same everywhere is a load, whatever machine it was done on.
    await workout(dave.id, "2026-09-15T18:00:00", [["working", 60, 5]], { machineId: machine });

    const rows = await withUser(t.db, dave.id, (tx) =>
      readStrengthRows(tx, dave.id, zone, september),
    );
    // Three sets of work each time, and no load: 40 kg of help times 24 reps is not volume.
    expect(rows.map((row) => [row.date, row.workingSets, row.volumeKg])).toEqual([
      ["2026-09-01", 3, 0],
      ["2026-09-15", 1, 300],
      ["2026-09-29", 3, 0],
    ]);

    const options = await withUser(t.db, dave.id, (tx) =>
      readExerciseSeriesOptions(tx, dave.id, september),
    );
    const series = options.find((option) => option.exerciseId === pullUp)!;
    expect(series).toMatchObject({ id: `${pullUp}:${machine}:kg`, assisted: true });
    expect(options.find((option) => option.exerciseId === bench)!.assisted).toBe(false);

    const sets = await withUser(t.db, dave.id, (tx) =>
      readExerciseSetRows(tx, dave.id, zone, september, series.id),
    );
    // Stronger is up: the least help each workout, 40 then 25, and nothing to call volume.
    expect(
      exerciseSessions(sets, series.modality, series.unit, { assisted: true }).map((session) => [
        session.maxWeight,
        session.maxVolume,
      ]),
    ).toEqual([
      [40, null],
      [25, null],
    ]);

    // The exercise's page agrees: each month's best is its least help.
    const life = await withUser(t.db, dave.id, (tx) =>
      readExerciseLife(tx, dave.id, pullUp, zone, machine),
    );
    expect(life).toEqual({
      months: [
        { month: "2026-08", topKg: 50 },
        { month: "2026-09", topKg: 25 },
      ],
      sessions: 3,
      assisted: true,
    });
  });

  it("says which series is on an accessory, whose machine is drawn as one", async () => {
    const erin = await t.createAuthUser("accessory-graphs@example.com");
    const { benchId, backExtension, legPress, legPressId } = await withUser(
      t.db,
      erin.id,
      async (tx) => {
        await seedTestUserData(tx, erin);
        const [type] = await tx
          .select({ id: equipmentTypes.id })
          .from(equipmentTypes)
          .where(eq(equipmentTypes.slug, "back_extension_bench"));
        const [instance] = await tx
          .insert(equipmentInstances)
          .values({
            userId: erin.id,
            gymId,
            equipmentTypeId: type!.id,
            name: "Back extension bench",
            resistanceMode: "bodyweight",
            unit: "kg",
          })
          .returning({ id: equipmentInstances.id });
        const [press] = await tx
          .select({ id: equipmentInstances.id })
          .from(equipmentInstances)
          .where(
            and(
              eq(equipmentInstances.userId, erin.id),
              eq(equipmentInstances.name, "45° leg press"),
            ),
          );
        const ids = await tx
          .select({ id: exercises.id, slug: exercises.slug })
          .from(exercises)
          .where(inArray(exercises.slug, ["back-extension", "leg-press-45"]));
        const id = (slug: string) => ids.find((row) => row.slug === slug)!.id;
        return {
          benchId: instance!.id,
          backExtension: id("back-extension"),
          legPress: id("leg-press-45"),
          legPressId: press!.id,
        };
      },
    );
    await workout(erin.id, "2026-09-08T18:00:00", [["working", 0, 15]], {
      exerciseId: backExtension,
      machineId: benchId,
    });
    await workout(erin.id, "2026-09-09T18:00:00", [["working", 120, 10]], {
      exerciseId: legPress,
      machineId: legPressId,
    });
    const options = await withUser(t.db, erin.id, (tx) =>
      readExerciseSeriesOptions(tx, erin.id, september),
    );
    const on = (exerciseId: string) => options.find((o) => o.exerciseId === exerciseId)!;
    expect(on(backExtension)).toMatchObject({
      id: `${backExtension}:${benchId}:kg`,
      accessory: true,
    });
    expect(on(legPress)).toMatchObject({ id: `${legPress}:${legPressId}:kg`, accessory: false });
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
        group: "chest",
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
      group: null,
      assisted: false,
      accessory: false,
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
