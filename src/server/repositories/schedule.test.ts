import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { profiles, programDays, programSlotEvents, programs } from "@/db/schema";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";
import { seedReferenceData } from "@/db/seed/reference";
import { FIXTURE_START_DATE, logTestRun, seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { plannedOrigin } from "@/domain/activity";
import { addDays, todayInTimeZone } from "@/domain/program-calendar";
import { partStatus, type SlotRef } from "@/domain/schedule";
import { resetReferenceCache } from "@/server/queries/reference";

import { occurrencesForSlot } from "./occurrences";
import { materialiseOccurrences, occurrencesFromBlueprint } from "./program-occurrences";
import {
  completeRestSlotsBefore,
  getSchedule,
  getTodayPlan,
  recordSlotEvent,
  returnRestDaysPassedBy,
} from "./schedule";
import { discardSession, finishSession, startPlannedSession } from "./sessions";

/**
 * The sequence as the app writes it, through the repository: what a start, a discard and a
 * finish leave behind, and what a day that runs is finished by.
 */

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
  resetReferenceCache();
  await seedReferenceData(t.db);
  resetReferenceCache();
});
afterAll(async () => {
  await t.close();
});

const ZONE = "UTC";

async function account(email: string) {
  const user = await t.createAuthUser(email);
  const fixture = await withUser(t.db, user.id, (tx) => seedTestUserData(tx, user));
  await t.db.update(profiles).set({ timeZone: ZONE }).where(eq(profiles.id, user.id));
  const [program] = await t.db
    .select({ familyId: programs.familyId })
    .from(programs)
    .where(eq(programs.id, fixture.programId));
  const as = <T>(run: Parameters<typeof withUser<T>>[2]) => withUser(t.db, user.id, run);
  return {
    userId: user.id,
    programId: fixture.programId,
    familyId: program!.familyId,
    gymId: fixture.gymIdBySlug.get("anytime-fitness")!,
    as,
    schedule: async () => (await as((tx) => getSchedule(tx, user.id)))!,
    event: (ref: SlotRef, part: "session" | "run" = "session") =>
      t.db
        .select({
          status: programSlotEvents.status,
          note: programSlotEvents.note,
          workoutSessionId: programSlotEvents.workoutSessionId,
        })
        .from(programSlotEvents)
        .where(
          and(
            eq(programSlotEvents.programId, fixture.programId),
            eq(programSlotEvents.cycleIndex, ref.cycleIndex),
            eq(programSlotEvents.dayIndex, ref.dayIndex),
            eq(programSlotEvents.part, part),
          ),
        )
        .then((rows) => rows[0] ?? null),
  };
}

type Account = Awaited<ReturnType<typeof account>>;

/** Every part of cycle 1 up to `day` answered as done, on the programme's first day. */
async function trainedThrough(a: Account, day: number) {
  const { days } = await a.schedule();
  await a.as(async (tx) => {
    for (const d of days.filter((d) => d.dayIndex <= day))
      for (const part of d.includesRun ? (["session", "run"] as const) : (["session"] as const))
        await recordSlotEvent(
          tx,
          a.userId,
          a.programId,
          { cycleIndex: 1, dayIndex: d.dayIndex },
          part,
          "completed",
          {
            occurredOn: FIXTURE_START_DATE,
          },
        );
  });
}

describe("a completion and a skip", () => {
  it("lets a finished workout replace a skip, and nothing replace a completion", async () => {
    const a = await account("answers@example.test");
    const ref = { cycleIndex: 1, dayIndex: 2 };
    const write = (status: "completed" | "skipped", note: string | null, session?: string) =>
      a.as((tx) =>
        recordSlotEvent(tx, a.userId, a.programId, ref, "session", status, {
          occurredOn: "2026-09-09",
          note,
          workoutSessionId: session ?? null,
        }),
      );
    expect(await write("skipped", "Gym closed.")).toBe(true);
    // A second skip changes nothing, reason and all.
    expect(await write("skipped", "Travelling")).toBe(false);
    expect(await a.event(ref)).toMatchObject({ status: "skipped", note: "Gym closed." });
    // The day trained after all is done, and the skip's reason goes with the skip.
    const session = crypto.randomUUID();
    expect(await write("completed", null, session)).toBe(true);
    expect(await a.event(ref)).toEqual({
      status: "completed",
      note: null,
      workoutSessionId: session,
    });
    expect(await write("completed", null)).toBe(false);
    expect(await write("skipped", "Too late")).toBe(false);
    expect(await a.event(ref)).toMatchObject({ status: "completed", workoutSessionId: session });
  });
});

describe("a workout discarded before a set", () => {
  /** What Start does: the session, then the rest days before it, named by it. */
  const start = (a: Account, programDayId: string, ref: SlotRef) =>
    a.as(async (tx) => {
      const schedule = await getSchedule(tx, a.userId);
      const { sessionId } = await startPlannedSession(tx, a.userId, {
        gymId: a.gymId,
        programDayId,
        cycleIndex: ref.cycleIndex,
      });
      await completeRestSlotsBefore(tx, a.userId, schedule!, ref, "2026-09-15", sessionId);
      return sessionId;
    });
  /** What Discard does. */
  const discard = (a: Account, sessionId: string) =>
    a.as(async (tx) => {
      await discardSession(tx, a.userId, sessionId);
      await returnRestDaysPassedBy(tx, a.userId, sessionId);
    });

  it("gives back the rest days its start passed, and only those", async () => {
    const a = await account("rest@example.test");
    // Cycle 1 trained to its rest day, which a workout started earlier passed.
    await trainedThrough(a, 6);
    const { days } = await a.schedule();
    const lowerA = days.find((d) => d.dayIndex === 1)!;
    const upperA = days.find((d) => d.dayIndex === 2)!;
    const earlier = await start(a, lowerA.id, { cycleIndex: 2, dayIndex: 1 });
    await a.as((tx) => finishSession(tx, a.userId, earlier, { notes: null, bodyWeightKg: null }));
    expect(await a.event({ cycleIndex: 1, dayIndex: 7 })).toMatchObject({ status: "completed" });

    // Cycle 2 to its rest day, and then the next cycle's Upper A started by mistake and discarded.
    await a.as(async (tx) => {
      for (const dayIndex of [1, 2, 3, 4, 5, 6])
        for (const part of dayIndex === 3 || dayIndex === 6
          ? (["session", "run"] as const)
          : (["session"] as const))
          await recordSlotEvent(
            tx,
            a.userId,
            a.programId,
            { cycleIndex: 2, dayIndex },
            part,
            "completed",
            {
              occurredOn: "2026-09-16",
            },
          );
    });
    const mistake = await start(a, upperA.id, { cycleIndex: 3, dayIndex: 2 });
    expect(await a.event({ cycleIndex: 2, dayIndex: 7 })).toMatchObject({ status: "completed" });
    await discard(a, mistake);

    // The rest day the mistake passed is owed again; the one the finished workout passed is not.
    const after = await a.schedule();
    expect(partStatus(after.state, { cycleIndex: 2, dayIndex: 7 }, "session")).toBe("pending");
    expect(partStatus(after.state, { cycleIndex: 1, dayIndex: 7 }, "session")).toBe("completed");
  });

  it("leaves a skipped day skipped, with its reason, when its workout is discarded", async () => {
    const a = await account("skipped@example.test");
    await trainedThrough(a, 1);
    const ref = { cycleIndex: 1, dayIndex: 2 };
    await a.as((tx) =>
      recordSlotEvent(tx, a.userId, a.programId, ref, "session", "skipped", {
        occurredOn: "2026-09-09",
        note: "Gym closed.",
      }),
    );
    const upperA = (await a.schedule()).days.find((d) => d.dayIndex === 2)!;

    // Start skipped workout, then the gym is still closed.
    await discard(a, await start(a, upperA.id, ref));
    expect(await a.event(ref)).toMatchObject({ status: "skipped", note: "Gym closed." });
    const plan = await a.as((tx) => getTodayPlan(tx, a.userId, ZONE));
    expect(plan?.suggestion?.slot).toEqual({ cycleIndex: 1, dayIndex: 3 });

    // Trained after all: finishing it is what makes the day done.
    const sessionId = await start(a, upperA.id, ref);
    const finished = await a.as((tx) =>
      finishSession(tx, a.userId, sessionId, { notes: null, bodyWeightKg: null }),
    );
    expect(finished).toMatchObject({ cycleIndex: 1, dayIndex: 2 });
    await a.as((tx) =>
      recordSlotEvent(tx, a.userId, a.programId, ref, "session", "completed", {
        occurredOn: "2026-09-12",
        workoutSessionId: sessionId,
      }),
    );
    expect(await a.event(ref)).toEqual({
      status: "completed",
      note: null,
      workoutSessionId: sessionId,
    });
  });
});

describe("a day that runs, finished today", () => {
  async function withRuns(email: string, runOnly: boolean) {
    const a = await account(email);
    await materialiseOccurrences(t.db, a.userId, {
      programId: a.programId,
      familyId: a.familyId,
      blueprint: occurrencesFromBlueprint(STRENGTH_AESTHETICS_HYBRID_8WK, {
        familyId: a.familyId,
        startDate: FIXTURE_START_DATE,
        schedulingTimeZone: ZONE,
      }),
      schedulingZone: ZONE,
      today: FIXTURE_START_DATE,
      transition: "new_block",
    });
    // Day 3 runs; as a day of its own it asks for nothing else.
    if (runOnly)
      await t.db
        .update(programDays)
        .set({ includesLifting: false })
        .where(and(eq(programDays.programId, a.programId), eq(programDays.dayIndex, 3)));
    await trainedThrough(a, 2);
    return a;
  }

  async function logRun(a: Account, occurredOn: string) {
    const [run] = await a.as((tx) =>
      occurrencesForSlot(tx, a.userId, { familyId: a.familyId, cycleDayIndex: 3, cycleIndex: 1 }),
    );
    await a.as((tx) =>
      logTestRun(tx, a.userId, {
        startedAt: new Date(`${occurredOn}T07:00:00Z`),
        durationSeconds: 1800,
        distanceMeters: 5000,
        origin: plannedOrigin(run!.id, run!.revisionId),
      }),
    );
  }

  /**
   * The reported screen: the run of a day that only runs, logged this morning. Today read the
   * day as finished only through a workout, so it offered the next day as today's and the run
   * that had just been logged was nowhere on it.
   */
  it("is a day that only runs, once its run is logged", async () => {
    const a = await withRuns("runonly@example.test", true);
    const today = todayInTimeZone(ZONE);
    await logRun(a, today);

    const plan = await a.as((tx) => getTodayPlan(tx, a.userId, ZONE));
    expect(plan?.finishedToday).toMatchObject({ dayIndex: 3, cycleIndex: 1 });
    expect(plan?.suggestion?.slot).toEqual({ cycleIndex: 1, dayIndex: 4 });
    // What Today asks for the finished day: the run it logged, so the card stays on the day.
    const finished = await a.as((tx) =>
      occurrencesForSlot(tx, a.userId, {
        familyId: a.familyId,
        cycleDayIndex: plan!.finishedToday!.dayIndex,
        cycleIndex: plan!.finishedToday!.cycleIndex,
      }),
    );
    expect(finished.map((occurrence) => occurrence.resolution.kind)).toEqual(["logged"]);
  });

  it("is a day that lifts and runs, by its run logged today after yesterday's workout", async () => {
    const a = await withRuns("liftrun@example.test", false);
    const today = todayInTimeZone(ZONE);
    await a.as((tx) =>
      recordSlotEvent(
        tx,
        a.userId,
        a.programId,
        { cycleIndex: 1, dayIndex: 3 },
        "session",
        "completed",
        {
          occurredOn: addDays(today, -1),
        },
      ),
    );
    await logRun(a, today);
    const plan = await a.as((tx) => getTodayPlan(tx, a.userId, ZONE));
    expect(plan?.finishedToday).toMatchObject({ dayIndex: 3, cycleIndex: 1 });
  });

  it("is nothing when the run was logged on another day", async () => {
    const a = await withRuns("yesterday@example.test", true);
    await logRun(a, addDays(todayInTimeZone(ZONE), -1));
    const plan = await a.as((tx) => getTodayPlan(tx, a.userId, ZONE));
    expect(plan?.finishedToday).toBeNull();
    expect(plan?.suggestion?.slot).toEqual({ cycleIndex: 1, dayIndex: 4 });
  });
});
