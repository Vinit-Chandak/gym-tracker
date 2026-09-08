import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { equipmentTypes, exercises } from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { seedUserStarterData } from "@/db/seed/starter";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { nextPendingSlot, suggestion } from "@/domain/schedule";

import { createEquipment } from "./equipment";
import { listGyms } from "./gyms";
import {
  completeRestSlotsBefore,
  getSchedule,
  getTodayPlan,
  pendingCycleForDay,
  recordSlotEvent,
} from "./schedule";
import {
  addExerciseToSession,
  deleteSet,
  discardSession,
  ExerciseHasSetsError,
  finishSession,
  getInProgressSession,
  getSessionDetail,
  listSessions,
  logSet,
  saveCheckIn,
  SessionHasSetsError,
  setExerciseCompleted,
  skipExercise,
  startAdHocSession,
  startPlannedSession,
  substituteExercise,
  type SessionDetail,
} from "./sessions";

let t: TestDatabase;
let user: { id: string; email: string };
let anytimeId: string;
let samsungId: string;

const TZ = "Asia/Kolkata";

function exerciseRow(detail: SessionDetail, slug: string) {
  const row = detail.exercises.find((e) => e.exercise.slug === slug);
  if (!row) throw new Error(`no exercise ${slug} in session`);
  return row;
}

async function schedule() {
  const s = await withUser(t.db, user.id, (tx) => getSchedule(tx, user.id));
  if (!s) throw new Error("no schedule");
  return s;
}

async function dayId(name: string): Promise<string> {
  const s = await schedule();
  const day = s.days.find((d) => d.name === name);
  if (!day) throw new Error(`no day ${name}`);
  return day.id;
}

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  user = await t.createAuthUser("sessions@example.com");
  await withUser(t.db, user.id, (tx) => seedUserStarterData(tx, user));
  const gyms = await withUser(t.db, user.id, (tx) => listGyms(tx, user.id));
  anytimeId = gyms.find((g) => g.slug === "anytime-fitness")?.id ?? "";
  samsungId = gyms.find((g) => g.slug === "samsung-gym")?.id ?? "";
});

afterAll(async () => {
  await t.close();
});

describe("today plan", () => {
  it("starts the complete Tuesday cycle at Lower A", async () => {
    const plan = await withUser(t.db, user.id, (tx) => getTodayPlan(tx, user.id, TZ));
    if (!plan) throw new Error("no plan");
    expect(plan.program.startDayIndex).toBe(1);
    expect(plan.suggestion?.slot).toEqual({ cycleIndex: 1, dayIndex: 1 });
    expect(plan.suggestedDay?.name).toBe("Lower A");
    expect(plan.suggestedDay?.dayOfWeek).toBe(2);
    expect(plan.suggestedExercises.map((e) => e.name)[0]).toBe("High-bar barbell squat");
    expect(plan.progress.total).toBe(56);
    expect(plan.cycleDays.map((d) => d.day.dayOfWeek)).toEqual([2, 3, 4, 5, 6, 7, 1]);
    expect(plan.cycleDays.find((d) => d.day.name === "Lower A")?.status).toBe("pending");
  });

  it("suggests Upper A only after Lower A is completed", async () => {
    const s = await schedule();
    await withUser(t.db, user.id, (tx) =>
      recordSlotEvent(tx, user.id, s.program.id, { cycleIndex: 1, dayIndex: 1 }, "completed", {
        occurredOn: "2026-09-08",
      }),
    );
    const plan = await withUser(t.db, user.id, (tx) => getTodayPlan(tx, user.id, TZ));
    expect(plan?.suggestedDay?.name).toBe("Upper A");
    expect(plan?.suggestedDay?.dayOfWeek).toBe(3);
  });
});

describe("planned session lifecycle", () => {
  let sessionId: string;

  it("creates one slot per planned exercise, pre-resolved for the gym", async () => {
    const upperA = await dayId("Upper A");
    const started = await withUser(t.db, user.id, (tx) =>
      startPlannedSession(tx, user.id, { gymId: anytimeId, programDayId: upperA, cycleIndex: 1 }),
    );
    sessionId = started.sessionId;
    const detail = await withUser(t.db, user.id, (tx) => getSessionDetail(tx, user.id, sessionId));
    if (!detail) throw new Error("no detail");
    expect(detail.day?.name).toBe("Upper A");
    expect(detail.exercises).toHaveLength(7);
    expect(exerciseRow(detail, "barbell-bench-press").equipment).toBeNull();
    expect(exerciseRow(detail, "barbell-bench-press").decision).toBeNull();
    expect(exerciseRow(detail, "seated-cable-row").equipment?.name).toBe("Cable station");
    expect(exerciseRow(detail, "reverse-pec-deck").equipment?.name).toBe("Pec deck");
    expect(exerciseRow(detail, "barbell-bench-press").planned?.sets).toBe(4);
    expect(exerciseRow(detail, "barbell-bench-press").weightStep).toBe(2.5);
    expect(detail.warmup?.name).toBe("Upper-body warm-up");
    const inProgress = await withUser(t.db, user.id, (tx) => getInProgressSession(tx, user.id));
    expect(inProgress?.id).toBe(sessionId);
  });

  it("logs, replaces and deletes sets", async () => {
    const detail = await withUser(t.db, user.id, (tx) => getSessionDetail(tx, user.id, sessionId));
    const bench = exerciseRow(detail as SessionDetail, "barbell-bench-press");
    const first = await withUser(t.db, user.id, (tx) =>
      logSet(tx, user.id, {
        workoutExerciseId: bench.id,
        setIndex: 1,
        setType: "working",
        weight: 60,
        reps: 5,
        rir: 2,
        durationSeconds: null,
      }),
    );
    expect(first).toMatchObject({ setIndex: 1, weight: 60, reps: 5, rir: 2, unit: "kg" });
    const replaced = await withUser(t.db, user.id, (tx) =>
      logSet(tx, user.id, {
        workoutExerciseId: bench.id,
        setIndex: 1,
        setType: "working",
        weight: 62.5,
        reps: 5,
        rir: 2,
        durationSeconds: null,
      }),
    );
    expect(replaced.id).toBe(first.id);
    expect(replaced.weight).toBe(62.5);
    await withUser(t.db, user.id, (tx) =>
      logSet(tx, user.id, {
        workoutExerciseId: bench.id,
        setIndex: 2,
        setType: "working",
        weight: 62.5,
        reps: 4,
        rir: 1,
        durationSeconds: null,
      }),
    );
    await withUser(t.db, user.id, (tx) => deleteSet(tx, user.id, bench.id, 2));
    const after = await withUser(t.db, user.id, (tx) => getSessionDetail(tx, user.id, sessionId));
    expect(
      exerciseRow(after as SessionDetail, "barbell-bench-press").sets.map((s) => s.weight),
    ).toEqual([62.5]);
    await expect(
      withUser(t.db, user.id, (tx) => discardSession(tx, user.id, sessionId)),
    ).rejects.toBeInstanceOf(SessionHasSetsError);
  });

  it("finishing the session completes the slot and moves the suggestion on", async () => {
    const finished = await withUser(t.db, user.id, (tx) =>
      finishSession(tx, user.id, sessionId, { notes: "Solid", bodyWeightKg: 59.5 }),
    );
    expect(finished).toMatchObject({ dayIndex: 2, cycleIndex: 1 });
    const s = await schedule();
    const recorded = await withUser(t.db, user.id, (tx) =>
      recordSlotEvent(tx, user.id, s.program.id, { cycleIndex: 1, dayIndex: 2 }, "completed", {
        occurredOn: "2026-09-08",
        workoutSessionId: sessionId,
      }),
    );
    expect(recorded).toBe(true);
    const again = await withUser(t.db, user.id, (tx) =>
      recordSlotEvent(tx, user.id, s.program.id, { cycleIndex: 1, dayIndex: 2 }, "completed", {
        occurredOn: "2026-09-08",
      }),
    );
    expect(again).toBe(false);
    expect(nextPendingSlot((await schedule()).state)).toEqual({ cycleIndex: 1, dayIndex: 3 });
    expect(await withUser(t.db, user.id, (tx) => getInProgressSession(tx, user.id))).toBeNull();
    const history = await withUser(t.db, user.id, (tx) => listSessions(tx, user.id));
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      dayName: "Upper A",
      gymName: "Anytime Fitness",
      setCount: 1,
    });
  });

  it("shows the previous comparable sets when the same day is started again", async () => {
    const upperA = await dayId("Upper A");
    const cycle = pendingCycleForDay((await schedule()).state, 2);
    expect(cycle).toBe(2);
    const started = await withUser(t.db, user.id, (tx) =>
      startPlannedSession(tx, user.id, {
        gymId: anytimeId,
        programDayId: upperA,
        cycleIndex: cycle ?? 2,
      }),
    );
    const detail = await withUser(t.db, user.id, (tx) =>
      getSessionDetail(tx, user.id, started.sessionId),
    );
    const bench = exerciseRow(detail as SessionDetail, "barbell-bench-press");
    expect(bench.previous?.sets.map((s) => s.weight)).toEqual([62.5]);
    expect(bench.previous?.gymName).toBe("Anytime Fitness");
    await withUser(t.db, user.id, (tx) => discardSession(tx, user.id, started.sessionId));
    expect(await withUser(t.db, user.id, (tx) => getInProgressSession(tx, user.id))).toBeNull();
  });

  it("skipping a slot moves on, and rest slots complete when the next training slot starts", async () => {
    const s = await schedule();
    await withUser(t.db, user.id, (tx) =>
      recordSlotEvent(tx, user.id, s.program.id, { cycleIndex: 1, dayIndex: 3 }, "skipped", {
        occurredOn: "2026-09-09",
        note: "Travelling",
      }),
    );
    for (const dayIndex of [4, 5, 6]) {
      await withUser(t.db, user.id, (tx) =>
        recordSlotEvent(tx, user.id, s.program.id, { cycleIndex: 1, dayIndex }, "completed", {
          occurredOn: "2026-09-10",
        }),
      );
    }
    const restPending = await schedule();
    const next = suggestion(restPending.state);
    expect(next?.slot).toEqual({ cycleIndex: 1, dayIndex: 7 });
    expect(next?.nextTrainingSlot).toEqual({ cycleIndex: 2, dayIndex: 1 });
    const plan = await withUser(t.db, user.id, (tx) => getTodayPlan(tx, user.id, TZ));
    expect(plan?.nextTrainingDay?.name).toBe("Lower A");
    const completed = await withUser(t.db, user.id, (tx) =>
      completeRestSlotsBefore(
        tx,
        user.id,
        restPending,
        { cycleIndex: 2, dayIndex: 1 },
        "2026-09-14",
      ),
    );
    expect(completed).toBe(1);
    expect(nextPendingSlot((await schedule()).state)).toEqual({ cycleIndex: 2, dayIndex: 1 });
  });
});

describe("decisions, substitutions and ad hoc sessions", () => {
  it("leaves machine exercises open at an empty gym and lets the user substitute or skip", async () => {
    const lowerA = await dayId("Lower A");
    const started = await withUser(t.db, user.id, (tx) =>
      startPlannedSession(tx, user.id, { gymId: samsungId, programDayId: lowerA, cycleIndex: 2 }),
    );
    const detail = await withUser(t.db, user.id, (tx) =>
      getSessionDetail(tx, user.id, started.sessionId),
    );
    const legPress = exerciseRow(detail as SessionDetail, "leg-press-45");
    expect(legPress.equipment).toBeNull();
    expect(legPress.decision?.resolution.status).toBe("unknown");
    const calf = exerciseRow(detail as SessionDetail, "smith-machine-calf-raise");
    expect(calf.decision?.fallbackOptions.map((f) => f.exerciseName)).toEqual([
      "Leg-press calf press",
      "Leg-press calf press",
    ]);
    expect(calf.decision?.fallbackOptions.every((f) => !f.available)).toBe(true);

    const [splitSquat] = await t.db
      .select({ id: exercises.id })
      .from(exercises)
      .where(eq(exercises.slug, "split-squat"));
    await withUser(t.db, user.id, (tx) =>
      substituteExercise(tx, user.id, {
        workoutExerciseId: legPress.id,
        exerciseId: splitSquat?.id ?? "",
        equipmentInstanceId: null,
        reason: "No leg press at Samsung Gym",
      }),
    );
    await withUser(t.db, user.id, (tx) =>
      skipExercise(tx, user.id, calf.id, "No calf option today"),
    );
    const after = await withUser(t.db, user.id, (tx) =>
      getSessionDetail(tx, user.id, started.sessionId),
    );
    const swapped = (after as SessionDetail).exercises.find((e) => e.id === legPress.id);
    expect(swapped?.exercise.slug).toBe("split-squat");
    expect(swapped?.decision).toBeNull();
    expect(swapped?.planned?.plannedExerciseName).toBe("45° leg press");
    const skipped = (after as SessionDetail).exercises.find((e) => e.id === calf.id);
    expect(skipped?.skippedAt).not.toBeNull();
    expect(skipped?.decision).toBeNull();

    await withUser(t.db, user.id, (tx) =>
      logSet(tx, user.id, {
        workoutExerciseId: legPress.id,
        setIndex: 1,
        setType: "working",
        weight: 0,
        reps: 10,
        rir: 2,
        durationSeconds: null,
      }),
    );
    await expect(
      withUser(t.db, user.id, (tx) =>
        substituteExercise(tx, user.id, {
          workoutExerciseId: legPress.id,
          exerciseId: splitSquat?.id ?? "",
          equipmentInstanceId: null,
          reason: null,
        }),
      ),
    ).rejects.toBeInstanceOf(ExerciseHasSetsError);
    await withUser(t.db, user.id, (tx) => setExerciseCompleted(tx, user.id, legPress.id, true));
    await withUser(t.db, user.id, (tx) =>
      finishSession(tx, user.id, started.sessionId, { notes: null, bodyWeightKg: null }),
    );
  });

  it("supports ad hoc sessions with exercises added on the fly", async () => {
    const started = await withUser(t.db, user.id, (tx) =>
      startAdHocSession(tx, user.id, { gymId: anytimeId }),
    );
    const [hammer] = await t.db
      .select({ id: exercises.id })
      .from(exercises)
      .where(eq(exercises.slug, "hammer-curl"));
    const added = await withUser(t.db, user.id, (tx) =>
      addExerciseToSession(tx, user.id, started.sessionId, {
        exerciseId: hammer?.id ?? "",
        equipmentInstanceId: null,
      }),
    );
    const detail = await withUser(t.db, user.id, (tx) =>
      getSessionDetail(tx, user.id, started.sessionId),
    );
    expect(detail?.day).toBeNull();
    expect(detail?.exercises.map((e) => e.exercise.slug)).toEqual(["hammer-curl"]);
    expect(detail?.exercises[0]?.planned).toBeNull();
    await withUser(t.db, user.id, (tx) =>
      logSet(tx, user.id, {
        workoutExerciseId: added.workoutExerciseId,
        setIndex: 1,
        setType: "working",
        weight: 15,
        reps: 12,
        rir: 1,
        durationSeconds: null,
      }),
    );
    const finished = await withUser(t.db, user.id, (tx) =>
      finishSession(tx, user.id, started.sessionId, { notes: null, bodyWeightKg: null }),
    );
    expect(finished.programDayId).toBeNull();
    await expect(
      withUser(t.db, user.id, (tx) =>
        logSet(tx, user.id, {
          workoutExerciseId: added.workoutExerciseId,
          setIndex: 2,
          setType: "working",
          weight: 15,
          reps: 10,
          rir: 1,
          durationSeconds: null,
        }),
      ),
    ).rejects.toThrow(/already finished/);
  });
});

describe("progression suggestions", () => {
  let pUser: { id: string; email: string };
  let gymId: string;
  let samsung: string;
  let upperA: string;

  const log = (
    workoutExerciseId: string,
    setIndex: number,
    weight: number,
    reps: number,
    rir: number,
  ) =>
    withUser(t.db, pUser.id, (tx) =>
      logSet(tx, pUser.id, {
        workoutExerciseId,
        setIndex,
        setType: "working",
        weight,
        reps,
        rir,
        durationSeconds: null,
      }),
    );

  async function startUpperA(cycleIndex: number, gym = gymId) {
    const started = await withUser(t.db, pUser.id, (tx) =>
      startPlannedSession(tx, pUser.id, { gymId: gym, programDayId: upperA, cycleIndex }),
    );
    const detail = await withUser(t.db, pUser.id, (tx) =>
      getSessionDetail(tx, pUser.id, started.sessionId),
    );
    if (!detail) throw new Error("no detail");
    return { sessionId: started.sessionId, detail };
  }

  const finish = (sessionId: string) =>
    withUser(t.db, pUser.id, (tx) =>
      finishSession(tx, pUser.id, sessionId, { notes: null, bodyWeightKg: null }),
    );
  const discard = (sessionId: string) =>
    withUser(t.db, pUser.id, (tx) => discardSession(tx, pUser.id, sessionId));

  beforeAll(async () => {
    pUser = await t.createAuthUser("progression@example.com");
    await withUser(t.db, pUser.id, (tx) => seedUserStarterData(tx, pUser));
    const gyms = await withUser(t.db, pUser.id, (tx) => listGyms(tx, pUser.id));
    gymId = gyms.find((g) => g.slug === "anytime-fitness")?.id ?? "";
    samsung = gyms.find((g) => g.slug === "samsung-gym")?.id ?? "";
    const s = await withUser(t.db, pUser.id, (tx) => getSchedule(tx, pUser.id));
    upperA = s?.days.find((d) => d.name === "Upper A")?.id ?? "";
  });

  it("has nothing to prefill without history", async () => {
    const { sessionId, detail } = await startUpperA(1);
    const bench = exerciseRow(detail, "barbell-bench-press");
    expect(bench.suggestion).toMatchObject({ kind: "start", basis: "none", sets: [] });
    expect(bench.regressionStreak).toBe(0);
    expect(detail.warnings).toEqual([]);
    for (let i = 1; i <= 4; i++) await log(bench.id, i, 60, 5, 2);
    const row = exerciseRow(detail, "seated-cable-row");
    for (let i = 1; i <= 3; i++) await log(row.id, i, 40, 10, 1);
    await finish(sessionId);
  });

  it("suggests a load increase only after every set met the plan, prefilled per set", async () => {
    const { sessionId, detail } = await startUpperA(2);
    const bench = exerciseRow(detail, "barbell-bench-press");
    expect(bench.suggestion).toMatchObject({ kind: "increase", basis: "exercise" });
    expect(bench.suggestion?.sets.map((s) => [s.weight, s.reps, s.rir])).toEqual([
      [62.5, 3, 2],
      [62.5, 3, 2],
      [62.5, 3, 2],
      [62.5, 3, 2],
    ]);
    const row = exerciseRow(detail, "seated-cable-row");
    expect(row.suggestion).toMatchObject({ kind: "increase", basis: "same_equipment" });
    expect(row.suggestion?.sets[0]?.weight).toBe(40 + row.weightStep);
    for (let i = 1; i <= 4; i++) await log(bench.id, i, 62.5, i === 1 ? 2 : 3, 1);
    for (let i = 1; i <= 3; i++) await log(row.id, i, 45, 8, 1);
    await finish(sessionId);
  });

  it("reduces after a miss and counts sessions below the last", async () => {
    const { sessionId, detail } = await startUpperA(3);
    const bench = exerciseRow(detail, "barbell-bench-press");
    expect(bench.suggestion?.kind).toBe("reduce");
    expect(bench.suggestion?.sets[0]).toMatchObject({ weight: 60, reps: 3, rir: 2 });
    expect(bench.regressionStreak).toBe(1);
    expect(exerciseRow(detail, "seated-cable-row").suggestion?.kind).toBe("hold");
    for (let i = 1; i <= 4; i++) await log(bench.id, i, 60, 4, 2);
    await finish(sessionId);
    const next = await startUpperA(4);
    expect(exerciseRow(next.detail, "barbell-bench-press").regressionStreak).toBe(2);
    await discard(next.sessionId);
  });

  it("uses another machine's history only as a starting guess", async () => {
    const [cableType] = await t.db
      .select({ id: equipmentTypes.id })
      .from(equipmentTypes)
      .where(eq(equipmentTypes.slug, "cable_station"));
    await withUser(t.db, pUser.id, (tx) =>
      createEquipment(tx, pUser.id, samsung, {
        name: "Cable station",
        equipmentTypeId: cableType?.id ?? "",
        manufacturer: null,
        model: null,
        resistanceMode: "selectorized",
        unit: "kg",
        loadIncrement: null,
        pulleyRatio: null,
        angleDegrees: null,
        notes: null,
      }),
    );
    const { sessionId, detail } = await startUpperA(4, samsung);
    const row = exerciseRow(detail, "seated-cable-row");
    expect(row.equipment?.name).toBe("Cable station");
    expect(row.previous).toBeNull();
    expect(row.suggestion).toMatchObject({ kind: "transfer", basis: "other_equipment" });
    expect(row.basis?.gymName).toBe("Anytime Fitness");
    expect(row.suggestion?.sets.map((s) => s.weight)).toEqual([45, 45, 45]);
    await discard(sessionId);
  });

  it("turns the check-in into advice against the previous check-in", async () => {
    const first = await startUpperA(4);
    await withUser(t.db, pUser.id, (tx) =>
      saveCheckIn(tx, pUser.id, first.sessionId, {
        sleepHours: 7,
        sleepQuality: 4,
        energy: 4,
        fatigue: 2,
        soreness: 2,
        backPainPre: 1,
        shinLeftPre: 1,
        shinRightPre: 1,
      }),
    );
    await finish(first.sessionId);
    const second = await startUpperA(5);
    await withUser(t.db, pUser.id, (tx) =>
      saveCheckIn(tx, pUser.id, second.sessionId, {
        sleepHours: 5,
        sleepQuality: 3,
        energy: 3,
        fatigue: 3,
        soreness: 2,
        backPainPre: 3,
        shinLeftPre: 1,
        shinRightPre: 5,
      }),
    );
    const detail = await withUser(t.db, pUser.id, (tx) =>
      getSessionDetail(tx, pUser.id, second.sessionId),
    );
    expect(detail?.warnings.map((w) => w.code)).toEqual(["short_sleep", "back_pain", "shin_pain"]);
    expect(detail?.warnings[1]?.title).toBe("Lower back 3/10, up from 1");
    expect(detail?.warnings[2]?.title).toBe("Right shin 5/10, up from 1");
    await discard(second.sessionId);
  });
});
