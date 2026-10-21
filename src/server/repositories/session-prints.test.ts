import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { programDays, programExercises, profiles } from "@/db/schema";
import { seedReferenceData } from "@/db/seed/reference";
import { seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";

import { programmeDayParts } from "@/app/(app)/plan/[sport]/programme-day";

import { listGyms } from "./gyms";
import { applyProposal, createProposal } from "./program-revisions";
import { getProgramOverview, getSchedule, getTodayPlan, recordSlotEvent } from "./schedule";
import { readSlotPrints } from "./session-prints";
import { finishSession, getSessionDetail, logSet, startPlannedSession } from "./sessions";

const TZ = "Asia/Kolkata";

let t: TestDatabase;
let user: { id: string; email: string };
let gymId: string;

const as = <T>(fn: (tx: Parameters<Parameters<typeof withUser>[2]>[0]) => Promise<T>) =>
  withUser(t.db, user.id, fn);

beforeAll(async () => {
  t = await createTestDatabase();
  await seedReferenceData(t.db);
  user = await t.createAuthUser("prints@example.com");
  await as((tx) => seedTestUserData(tx, user));
  await t.db.update(profiles).set({ timeZone: TZ }).where(eq(profiles.id, user.id));
  const gyms = await as((tx) => listGyms(tx, user.id));
  gymId = gyms.find((g) => g.slug === "anytime-fitness")!.id;
});

afterAll(async () => {
  await t.close();
});

describe("a day of the cycle its workout has done", () => {
  let sessionId: string;

  it("keeps the completed workout on its programme while Today advances independently of running", async () => {
    const schedule = (await as((tx) => getSchedule(tx, user.id)))!;
    const programId = schedule.program.id;
    // Lower A and Upper A behind it, so Easy Run + Arms, which lifts and runs, is offered.
    await as(async (tx) => {
      for (const dayIndex of [1, 2])
        await recordSlotEvent(
          tx,
          user.id,
          programId,
          { cycleIndex: 1, dayIndex },
          "session",
          "completed",
          { occurredOn: "2026-09-08" },
        );
    });
    const arms = schedule.days.find((day) => day.dayIndex === 3)!;
    expect(arms).toMatchObject({ includesLifting: true, includesRun: false });
    ({ sessionId } = await as((tx) =>
      startPlannedSession(tx, user.id, { gymId, programDayId: arms.id, cycleIndex: 1 }),
    ));
    const detail = (await as((tx) => getSessionDetail(tx, user.id, sessionId)))!;
    const first = detail.exercises[0]!;
    // A warm-up set and two working sets of the first exercise, nothing else, no warm-up drills.
    await as(async (tx) => {
      for (const [setIndex, setType] of [
        [1, "warmup"],
        [2, "working"],
        [3, "working"],
      ] as const)
        await logSet(tx, user.id, {
          workoutExerciseId: first.id,
          setIndex,
          setType,
          weight: 20,
          reps: 10,
          rir: setType === "warmup" ? null : 2,
          durationSeconds: null,
        });
      await finishSession(tx, user.id, sessionId, { notes: null, bodyWeightKg: null });
      await recordSlotEvent(
        tx,
        user.id,
        programId,
        { cycleIndex: 1, dayIndex: 3 },
        "session",
        "completed",
        { occurredOn: "2026-09-10", workoutSessionId: sessionId },
      );
    });

    const today = (await as((tx) => getTodayPlan(tx, user.id, TZ)))!;
    expect(today.suggestedDay?.dayIndex).toBe(4);
    expect(today.sessionStatus).toBe("pending");
    expect(today.sessionPrint).toBeNull();

    // Training asks for the cycle's prints; the day it trained has its own, the rest none.
    const overview = (await as((tx) => getProgramOverview(tx, user.id, TZ, { prints: true })))!;
    expect(overview.days.map((day) => day.print !== null)).toEqual(
      overview.days.map((day) => day.day.dayIndex === 3),
    );
    expect(overview.days[2]?.print).toMatchObject({ completed: true, warmupCompleted: false });
    expect(overview.days[2]?.print?.exercises[0]).toMatchObject({
      slotId: first.planned?.programExerciseId,
      work: 2,
      warm: 1,
    });
    expect(overview.days[2]?.print?.exercises.slice(1).every((e) => e.work + e.warm === 0)).toBe(
      true,
    );
    // Not asked, it is not read.
    const plain = (await as((tx) => getProgramOverview(tx, user.id, TZ)))!;
    expect(plain.days.every((day) => day.print === null)).toBe(true);

    // Drawn from it, the day's tile is what the workout did: the first column its working sets
    // (a plan's print draws no warm-up sets), every other exercise dashed at its planned size.
    const plan = overview.days[2]!;
    const parts = programmeDayParts(plan, { session: plan.print });
    const strength = parts.find((part) => part.kind === "strength");
    expect(strength?.kind === "strength" && strength.columns[0]).toEqual({
      sets: 2,
      done: 2,
      pair: false,
    });
    expect(
      strength?.kind === "strength" &&
        strength.columns.slice(1).every((column) => column.skipped && column.done === 0),
    ).toBe(true);
  });

  it("keeps its rows after a revision, by the slots' lineage", async () => {
    const schedule = (await as((tx) => getSchedule(tx, user.id)))!;
    const [lowerA] = await t.db
      .select({ lineageId: programExercises.lineageId })
      .from(programExercises)
      .innerJoin(programDays, eq(programDays.id, programExercises.programDayId))
      .where(eq(programDays.programId, schedule.program.id))
      .orderBy(asc(programDays.dayIndex), asc(programExercises.orderIndex))
      .limit(1);
    const proposal = await as((tx) =>
      createProposal(tx, user.id, {
        source: "ai",
        summary: "One more squat set.",
        rationale: "Moving well.",
        patch: {
          operations: [
            { op: "adjust", lineageId: lowerA!.lineageId, sets: 5, reason: "Moving well." },
          ],
        },
      }),
    );
    const applied = await as((tx) => applyProposal(tx, user.id, proposal.id));
    expect(applied.programId).not.toBe(schedule.program.id);

    // The new version's slots are new rows: the workout's, started from the old ones, are
    // taken as the slots of the same lineage, so the rows they stand for still find them.
    const overview = (await as((tx) => getProgramOverview(tx, user.id, TZ, { prints: true })))!;
    const arms = overview.days.find((day) => day.day.dayIndex === 3)!;
    expect(arms.print?.exercises.map((exercise) => exercise.slotId)).toEqual(
      arms.exercises.map((exercise) => exercise.programExerciseId),
    );
    const prints = await as((tx) => readSlotPrints(tx, user.id, applied.programId, 1, 3));
    expect(prints.get(3)?.exercises[0]).toMatchObject({ work: 2, warm: 1 });
    // The workout's own record still reads the slots it was started from.
    const detail = (await as((tx) => getSessionDetail(tx, user.id, sessionId)))!;
    expect(detail.exercises[0]?.planned?.programExerciseId).not.toBe(
      arms.exercises[0]?.programExerciseId,
    );
  });
});
