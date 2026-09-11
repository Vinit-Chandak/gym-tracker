import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  exercises,
  gyms,
  profiles,
  programDays,
  programExercises,
  programRuns,
  runs,
  sessionPlans,
  setLogs,
  workoutExercises,
  workoutSessions,
} from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { parseProgramBlueprint } from "@/domain/program-blueprint";
import { handleCoachServiceRequest } from "@/server/coach-service";
import {
  comparableHistory,
  latestPerformanceAnywhere,
  sessionHistories,
} from "@/server/queries/comparable";
import { parseDateRange } from "@/server/validation/date-range";

import { planningContext } from "./coach-plans";
import { readMuscleVolume } from "./muscle-volume";
import { createProgramFromBlueprint } from "./programs";
import { readWorkouts } from "./training-data";
import { readWeeklyTrainingVolume } from "./training-volume";

const TZ = "Asia/Kolkata";
const NOW = new Date("2026-09-11T08:00:00Z");
const TOKEN = "synthetic-coach-foundation-token";
const blueprint = parseProgramBlueprint({
  blueprintVersion: 1,
  slug: "coach-foundation",
  name: "Synthetic coaching fixtures",
  weeks: 2,
  days: [
    { dayIndex: 1, dayOfWeek: 1, name: "Lift", includesLifting: true, includesRun: false },
    { dayIndex: 2, dayOfWeek: 3, name: "Run", includesLifting: false, includesRun: true },
    { dayIndex: 3, dayOfWeek: 5, name: "Mixed", includesLifting: true, includesRun: true },
  ].map((day) => ({
    ...day,
    warmupSlug: day.includesLifting ? "lower" : "run",
    exercises: day.includesLifting
      ? [{ exerciseSlug: "high-bar-squat", sets: 3, reps: [5, 8], rir: [1, 2], rest: [120, 180] }]
      : [],
  })),
  runs: [1, 2].flatMap((weekIndex) =>
    [3, 5].map((dayOfWeek) => ({ weekIndex, dayOfWeek, duration: [20, 25], rpe: [3, 4] })),
  ),
});

let t: TestDatabase;
let athleteId: string, otherId: string, gymId: string, programId: string, benchId: string;
let slots: (typeof programExercises.$inferSelect & { dayIndex: number })[];
let plannedRuns: (typeof programRuns.$inferSelect)[];
let openSessionId: string;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("COACH_SERVICE_TOKEN", TOKEN);
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  athleteId = (await t.createAuthUser("foundation@example.test")).id;
  otherId = (await t.createAuthUser("isolated@example.test")).id;
  const [bench] = await t.db
    .select()
    .from(exercises)
    .where(eq(exercises.slug, "barbell-bench-press"));
  benchId = bench!.id;
  await withUser(t.db, athleteId, async (tx) => {
    await tx
      .update(profiles)
      .set({ aiCoachEnabled: true, timeZone: TZ })
      .where(eq(profiles.id, athleteId));
    const [gym] = await tx
      .insert(gyms)
      .values({
        userId: athleteId,
        name: "Test gym",
        slug: "test-gym",
        kind: "gym",
        isDefault: true,
      })
      .returning();
    gymId = gym!.id;
    programId = (
      await createProgramFromBlueprint(tx, athleteId, blueprint, { startDate: "2026-09-07" })
    ).id;
    slots = (
      await tx
        .select({ prescription: programExercises, dayIndex: programDays.dayIndex })
        .from(programExercises)
        .innerJoin(programDays, eq(programDays.id, programExercises.programDayId))
        .where(eq(programDays.programId, programId))
    ).map(({ prescription, dayIndex }) => ({ ...prescription, dayIndex }));
    plannedRuns = await tx.select().from(programRuns).where(eq(programRuns.programId, programId));

    // More than the old forty-record sample, plus work three and seven weeks ago.
    const dates = [
      ...Array.from({ length: 45 }, (_, i) => new Date(NOW.getTime() - (i + 1) * 60_000)),
      new Date("2026-08-21T08:00:00Z"),
      new Date("2026-07-24T08:00:00Z"),
    ];
    const completed = await tx
      .insert(workoutSessions)
      .values(
        dates.map((startedAt) => ({
          userId: athleteId,
          gymId,
          startedAt,
          completedAt: new Date(startedAt.getTime() + 30_000),
        })),
      )
      .returning();
    const [open] = await tx
      .insert(workoutSessions)
      .values({ userId: athleteId, gymId, startedAt: new Date(NOW.getTime() - 500) })
      .returning();
    openSessionId = open!.id;
    const performed = await tx
      .insert(workoutExercises)
      .values(
        [...completed, open!].map((session) => ({
          userId: athleteId,
          workoutSessionId: session.id,
          exerciseId: benchId,
          // Actual bench work must not become squat volume through this planned reference.
          plannedProgramExerciseId: slots[0]!.id,
          orderIndex: 1,
        })),
      )
      .returning();
    await tx.insert(setLogs).values(
      performed.flatMap((exercise) => [
        {
          userId: athleteId,
          workoutExerciseId: exercise.id,
          setIndex: 1,
          setType: "working" as const,
          weight: 60,
          reps: 5,
        },
        {
          userId: athleteId,
          workoutExerciseId: exercise.id,
          setIndex: 2,
          setType: "warmup" as const,
          weight: 20,
          reps: 10,
        },
      ]),
    );
    await tx.insert(runs).values(
      dates.map((startedAt) => ({
        userId: athleteId,
        startedAt,
        mode: "outdoor" as const,
        durationSeconds: 1200,
        distanceMeters: 3000,
      })),
    );
  });
  await withUser(t.db, otherId, async (tx) => {
    const [gym] = await tx
      .insert(gyms)
      .values({ userId: otherId, name: "Other gym", slug: "other-gym", kind: "gym" })
      .returning();
    // Sunday in UTC, Monday in the athlete's zone. Also exercises programless aggregation.
    const [session] = await tx
      .insert(workoutSessions)
      .values({
        userId: otherId,
        gymId: gym!.id,
        startedAt: new Date("2026-09-06T19:00:00Z"),
        completedAt: new Date("2026-09-06T20:00:00Z"),
      })
      .returning();
    const [exercise] = await tx
      .insert(workoutExercises)
      .values({
        userId: otherId,
        workoutSessionId: session!.id,
        exerciseId: benchId,
        orderIndex: 1,
      })
      .returning();
    await tx.insert(setLogs).values({
      userId: otherId,
      workoutExerciseId: exercise!.id,
      setIndex: 1,
      weight: 50,
      reps: 6,
    });
    await tx.insert(runs).values({
      userId: otherId,
      startedAt: session!.startedAt,
      mode: "outdoor",
      durationSeconds: 900,
      distanceMeters: 2000,
    });
  });
});

afterAll(async () => {
  await t?.close();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function context() {
  const result = await withUser(t.db, athleteId, (tx) => planningContext(tx, athleteId), {
    readOnly: true,
  });
  if (result.reason) throw new Error(result.reason);
  return result;
}

describe("coaching service transport", () => {
  async function submit(dayIndex: number, runOverride?: string) {
    const day = blueprint.days.find((entry) => entry.dayIndex === dayIndex)!;
    const slot = slots.find((entry) => entry.dayIndex === dayIndex);
    const run = day.includesRun
      ? {
          mode: "outdoor",
          durationMinutes: 23,
          distanceKm: 3.5,
          rpe: 4,
          paceNote: "Conversational pace.",
          stopRule: "Stop if discomfort increases.",
          note: "Keep the opening minutes easy.",
          programRunId:
            runOverride ??
            plannedRuns.find((entry) => entry.weekIndex === 1 && entry.dayOfWeek === day.dayOfWeek)!
              .id,
        }
      : null;
    const plan = {
      slot: { cycleIndex: 1, dayIndex },
      gymId,
      summary: "A synthetic session.",
      warmup: ["Start gently."],
      exercises: day.includesLifting
        ? [
            {
              slotId: slot!.id,
              exerciseSlug: "high-bar-squat",
              sets: [{ weight: 40, reps: 5, rir: 3 }],
            },
          ]
        : [],
      run,
    };
    const response = await handleCoachServiceRequest(
      t.db,
      new Request(`https://app.test/api/coach/service/users/${athleteId}/plans`, {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify(plan),
      }),
      ["users", athleteId, "plans"],
    );
    return { response, plan };
  }

  it.each([1, 2, 3])(
    "retains every prescription field through HTTP and persistence for day %i",
    async (dayIndex) => {
      const { response, plan } = await submit(dayIndex);
      const body = await response.json();
      expect(response.status, JSON.stringify(body)).toBe(201);
      const [stored] = await withUser(t.db, athleteId, (tx) =>
        tx.select().from(sessionPlans).where(eq(sessionPlans.id, body.plan.id)),
      );
      expect(stored?.run).toEqual(plan.run);
      expect(stored?.warmup).toEqual(plan.warmup);
      expect(stored?.exercises).toHaveLength(plan.exercises.length);
      if (plan.exercises.length) expect(stored?.exercises[0]).toMatchObject(plan.exercises[0]!);
    },
  );

  it("rejects a run from another cycle or day of the same program without replacing the current plan", async () => {
    for (const wrong of plannedRuns.filter((run) => run.weekIndex !== 1 || run.dayOfWeek !== 3)) {
      const { response } = await submit(2, wrong.id);
      const body = await response.json();
      expect(response.status).toBe(422);
      expect(body.issues).toContainEqual({ path: "run.programRunId", message: expect.any(String) });
    }
    const active = await withUser(t.db, athleteId, (tx) =>
      tx
        .select()
        .from(sessionPlans)
        .where(and(eq(sessionPlans.dayIndex, 2), eq(sessionPlans.status, "active"))),
    );
    expect(active).toHaveLength(1);
    expect(active[0]?.run?.programRunId).toBe(
      plannedRuns.find((run) => run.weekIndex === 1 && run.dayOfWeek === 3)!.id,
    );
  });
});

describe("complete coaching evidence", () => {
  it("matches completed-workout volume beyond forty records and includes work 21 days ago", async () => {
    const ctx = await context();
    const thisWeek = await withUser(t.db, athleteId, (tx) =>
      readMuscleVolume(tx, athleteId, parseDateRange({ from: "2026-09-07", to: "2026-09-11" }, TZ)),
    );
    expect(thisWeek.totalSets).toBe(45);
    expect(ctx.volume.find((week) => week.weekStart === "2026-09-07")).toMatchObject({
      totalSets: 45,
      byMuscle: { chest: thisWeek.volume.chest },
    });
    expect(ctx.volume.find((week) => week.weekStart === "2026-08-17")).toMatchObject({
      totalSets: 1,
      byMuscle: { chest: 1 },
    });
    expect(ctx.volume.every((week) => !week.byMuscle.quads)).toBe(true);
  });

  it("aggregates all running in the requested weeks independently of the recent narrative sample", async () => {
    const ctx = await context();
    expect(ctx.running.weeks.find((week) => week.weekStart === "2026-09-07")).toMatchObject({
      runs: 45,
      minutes: 900,
      km: 135,
    });
    expect(ctx.running.weeks.find((week) => week.weekStart === "2026-08-17")).toMatchObject({
      runs: 1,
      minutes: 20,
      km: 3,
    });
  });

  it("uses only completed workouts for comparable history, including batched and starting-history reads", async () => {
    const query = {
      userId: athleteId,
      exerciseId: benchId,
      loadPortability: "global" as const,
      equipmentInstanceId: null,
      limit: 100,
    };
    const history = await withUser(t.db, athleteId, (tx) => comparableHistory(tx, query));
    expect(history).toHaveLength(47);
    expect(history.some((entry) => entry.workoutSessionId === openSessionId)).toBe(false);
    const [batch] = await withUser(t.db, athleteId, (tx) => sessionHistories(tx, [query]));
    expect(batch?.history).toEqual(history);
    const latest = await withUser(t.db, athleteId, (tx) =>
      latestPerformanceAnywhere(tx, { userId: athleteId, exerciseId: benchId }),
    );
    expect(latest?.workoutSessionId).toBe(history[0]?.workoutSessionId);
    expect(await withUser(t.db, otherId, (tx) => comparableHistory(tx, query))).toEqual([]);
  });

  it("labels the bounded narrative and incomplete work while raw history keeps unfinished workouts", async () => {
    const ctx = await context();
    expect(ctx.recent).toMatchObject({
      from: "2026-08-28",
      to: "2026-09-11",
      workoutsHasMore: true,
      runsHasMore: true,
    });
    expect(ctx.recent.workouts).toHaveLength(40);
    expect(ctx.recent.workouts.every((workout) => workout.completedAt !== null)).toBe(true);
    expect(ctx.volumeCoverage[0]).toMatchObject({
      start: "2026-09-06T18:30:00.000Z",
      end: NOW.toISOString(),
      partial: true,
      completedWorkouts: 45,
      incompleteWorkouts: 1,
    });
    const raw = await withUser(t.db, athleteId, (tx) =>
      readWorkouts(tx, athleteId, parseDateRange({ from: "2026-09-07", to: "2026-09-11" }, TZ)),
    );
    expect(raw.workouts).toHaveLength(46);
    expect(raw.workouts.find((workout) => workout.id === openSessionId)?.completedAt).toBeNull();
  });

  it("covers eight calendar weeks without fetching or truncating raw workout records", async () => {
    const weeks = await withUser(
      t.db,
      athleteId,
      (tx) => readWeeklyTrainingVolume(tx, athleteId, TZ, NOW, 8),
      { readOnly: true },
    );
    expect(weeks).toHaveLength(8);
    expect(weeks[7]).toMatchObject({
      weekStart: "2026-07-20",
      lifting: { totalSets: 1, byMuscle: { chest: 1 } },
      running: { runs: 1, minutes: 20, km: 3 },
      coverage: {
        partial: false,
        start: "2026-07-19T18:30:00.000Z",
        end: "2026-07-26T18:30:00.000Z",
      },
    });
    expect(weeks.reduce((total, week) => total + week.lifting.totalSets, 0)).toBe(47);
    expect(weeks.reduce((total, week) => total + week.running.runs, 0)).toBe(47);
    const isolated = await withUser(t.db, otherId, (tx) =>
      readWeeklyTrainingVolume(tx, athleteId, TZ, NOW, 8),
    );
    expect(isolated.every((week) => week.lifting.totalSets === 0 && week.running.runs === 0)).toBe(
      true,
    );
  });

  it("assigns programless training to the athlete's calendar week independently of the server zone", async () => {
    const local = await withUser(t.db, otherId, (tx) =>
      readWeeklyTrainingVolume(tx, otherId, TZ, NOW, 4),
    );
    const utc = await withUser(t.db, otherId, (tx) =>
      readWeeklyTrainingVolume(tx, otherId, "UTC", NOW, 4),
    );
    expect(local[0]).toMatchObject({
      weekStart: "2026-09-07",
      lifting: { totalSets: 1 },
      running: { runs: 1 },
    });
    expect(utc[0]).toMatchObject({
      weekStart: "2026-09-07",
      lifting: { totalSets: 0 },
      running: { runs: 0 },
    });
    expect(utc[1]).toMatchObject({
      weekStart: "2026-08-31",
      lifting: { totalSets: 1 },
      running: { runs: 1 },
    });
  });

  it("labels an unfinished plan outcome without presenting it as completed evidence", async () => {
    await withUser(t.db, athleteId, (tx) =>
      tx
        .update(sessionPlans)
        .set({
          workoutSessionId: openSessionId,
          status: "consumed",
          consumedAt: NOW,
        })
        .where(and(eq(sessionPlans.programId, programId), eq(sessionPlans.dayIndex, 1))),
    );
    const ctx = await context();
    const outcome = ctx.lastPlans.find((plan) => plan.slot.dayIndex === 1);
    expect(outcome?.performed).toMatchObject({
      completedAt: null,
      exercises: [{ name: "Barbell bench press", skipped: false }],
    });
    expect(ctx.volume[0]?.totalSets).toBe(45);
  });
});
