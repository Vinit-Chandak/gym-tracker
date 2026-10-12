import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  occurrenceEvents,
  occurrenceVersions,
  plannedOccurrences,
  profiles,
  programDays,
  programSlotEvents,
  programs,
} from "@/db/schema";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";
import { seedReferenceData } from "@/db/seed/reference";
import { logTestRun, seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { plannedOrigin } from "@/domain/activity";
import { addDays, todayInTimeZone } from "@/domain/program-calendar";
import { sessionStanding } from "@/domain/programme-sessions";
import { partStatus, pickUpFromToday, type SlotRef } from "@/domain/schedule";
import type { SlotPart } from "@/domain/types";

/*
 * A run skipped from Today is skipped everywhere (owner, 12 October 2026): on the programme, on
 * Today and in the coach's adherence, which reads the run's own occurrence. Through the real
 * actions and a real database, as the athlete does it: the run of a day skipped on its own, a
 * whole gap picked up from today, and what logging or putting one back does afterwards.
 */

const state = vi.hoisted(() => ({
  db: null as unknown,
  user: { id: "", email: "" },
}));
vi.mock("@/db/client", () => ({ getDb: () => state.db }));
vi.mock("@/server/auth", () => ({ requireUser: async () => state.user }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

import { readAdherence } from "@/server/repositories/activity-analytics";
import { occurrencesForSlot, programmeOccurrences } from "@/server/repositories/occurrences";
import {
  materialiseOccurrences,
  occurrencesFromBlueprint,
} from "@/server/repositories/program-occurrences";
import { resetReferenceCache } from "@/server/queries/reference";
import { getSchedule, skipSlotPart } from "@/server/repositories/schedule";

import { reopenOccurrenceAction, skipOccurrenceAction } from "./occurrences";
import { pickUpFromTodayAction, skipSlotAction } from "./sessions";

let t: TestDatabase;
const ZONE = "UTC";

beforeAll(async () => {
  t = await createTestDatabase();
  state.db = t.db;
  resetReferenceCache();
  await seedReferenceData(t.db);
  resetReferenceCache();
});
afterAll(async () => {
  await t.close();
});

/**
 * An athlete on the hybrid programme, its runs written as occurrences, and signed in. Days 3
 * and 6 lift and run; `runOnly` makes day 3 a day that only runs. The programme started two
 * weeks and a day ago, so a gap is there to pick up.
 */
async function athlete(email: string, options: { runOnly?: boolean; occurrences?: boolean } = {}) {
  const user = await t.createAuthUser(email);
  state.user = { id: user.id, email };
  const startDate = addDays(todayInTimeZone(ZONE), -15);
  const { programId } = await withUser(t.db, user.id, (tx) =>
    seedTestUserData(tx, user, { startDate }),
  );
  await t.db.update(profiles).set({ timeZone: ZONE }).where(eq(profiles.id, user.id));
  const [program] = await t.db
    .select({ familyId: programs.familyId })
    .from(programs)
    .where(eq(programs.id, programId));
  const familyId = program!.familyId;
  if (options.occurrences !== false)
    await materialiseOccurrences(t.db, user.id, {
      programId,
      familyId,
      blueprint: occurrencesFromBlueprint(STRENGTH_AESTHETICS_HYBRID_8WK, {
        familyId,
        startDate,
        schedulingTimeZone: ZONE,
      }),
      schedulingZone: ZONE,
      today: todayInTimeZone(ZONE),
      transition: "new_block",
    });
  if (options.runOnly)
    await t.db
      .update(programDays)
      .set({ includesLifting: false })
      .where(and(eq(programDays.programId, programId), eq(programDays.dayIndex, 3)));
  const as = <T>(run: Parameters<typeof withUser<T>>[2]) => withUser(t.db, user.id, run);
  return {
    userId: user.id,
    programId,
    familyId,
    startDate,
    as,
    schedule: async () => (await as((tx) => getSchedule(tx, user.id)))!,
    sessions: (ref: SlotRef) =>
      as((tx) =>
        occurrencesForSlot(tx, user.id, {
          familyId,
          cycleIndex: ref.cycleIndex,
          cycleDayIndex: ref.dayIndex,
        }),
      ),
    /** What the day itself recorded for one of its halves. */
    recorded: (ref: SlotRef, part: SlotPart) =>
      t.db
        .select({ status: programSlotEvents.status })
        .from(programSlotEvents)
        .where(
          and(
            eq(programSlotEvents.programId, programId),
            eq(programSlotEvents.cycleIndex, ref.cycleIndex),
            eq(programSlotEvents.dayIndex, ref.dayIndex),
            eq(programSlotEvents.part, part),
          ),
        ),
    /** The running half of the coach's adherence, as /api/coach/v2/summary sends it. */
    adherence: async () =>
      (await as((tx) => readAdherence(tx, user.id))).find((row) => row.sport === "running")?.counts,
  };
}

type Athlete = Awaited<ReturnType<typeof athlete>>;

const skipForm = (reason = "") => {
  const data = new FormData();
  data.set("reason", reason);
  return data;
};

/** A second session on one day: a swim beside its run, as a coach's blueprint may write. */
async function swimBeside(a: Athlete, ref: SlotRef) {
  const [run] = await a.sessions(ref);
  const [swim] = await t.db
    .insert(plannedOccurrences)
    .values({
      userId: a.userId,
      sport: "swimming",
      familyId: a.familyId,
      cycleIndex: ref.cycleIndex,
      cycleDayIndex: ref.dayIndex,
      disposition: "pending",
      originalWeekIndex: ref.cycleIndex,
      originalScheduledOn: run!.scheduledOn,
    })
    .returning({ id: plannedOccurrences.id });
  const [revision] = await t.db
    .insert(occurrenceVersions)
    .values({
      occurrenceId: swim!.id,
      userId: a.userId,
      sport: "swimming",
      scheduledOn: run!.scheduledOn,
      schedulingZone: ZONE,
      orderIndex: 1,
      prescription: null,
    })
    .returning({ id: occurrenceVersions.id });
  await t.db
    .update(plannedOccurrences)
    .set({ currentRevisionId: revision!.id })
    .where(eq(plannedOccurrences.id, swim!.id));
  return swim!.id;
}

async function logRun(a: Athlete, occurrence: { id: string; revisionId: string }) {
  await a.as((tx) =>
    logTestRun(tx, a.userId, {
      startedAt: new Date(),
      durationSeconds: 1800,
      distanceMeters: 5000,
      origin: plannedOrigin(occurrence.id, occurrence.revisionId),
    }),
  );
}

const DAY_3: SlotRef = { cycleIndex: 1, dayIndex: 3 };
const DAY_6: SlotRef = { cycleIndex: 1, dayIndex: 6 };

describe("the run of a day, skipped from Today", () => {
  it("is skipped on its session too, and counted skipped by the coach", async () => {
    const a = await athlete("lift-and-run@example.test");
    expect(await skipSlotAction(3, "run", { ok: true }, skipForm("Sore calf"))).toEqual({
      ok: true,
    });

    const [run] = await a.sessions(DAY_3);
    expect(run!.resolution.kind).toBe("skipped");
    // Nothing written beside it on the day: the session is the run's one answer.
    expect(await a.recorded(DAY_3, "run")).toEqual([]);
    const schedule = await a.schedule();
    expect(partStatus(schedule.state, DAY_3, "run")).toBe("skipped");
    // The workout half of the same day is still owed: only the run was skipped.
    expect(partStatus(schedule.state, DAY_3, "session")).toBe("pending");
    expect(await a.recorded(DAY_3, "session")).toEqual([]);
    // The programme and the coach say the same thing of it.
    const standing = sessionStanding(
      schedule.state,
      { ...run!, cycleIndex: DAY_3.cycleIndex, cycleDayIndex: DAY_3.dayIndex },
      todayInTimeZone(ZONE),
    );
    expect(standing).toBe("skipped");
    expect(await a.adherence()).toMatchObject({ skipped: 1 });
    // Its history says it was the day that was skipped, and why.
    const events = await t.db
      .select({ kind: occurrenceEvents.kind, detail: occurrenceEvents.detail })
      .from(occurrenceEvents)
      .where(and(eq(occurrenceEvents.occurrenceId, run!.id), eq(occurrenceEvents.kind, "skipped")));
    expect(events).toEqual([{ kind: "skipped", detail: { via: "today", note: "Sore calf" } }]);
  });

  it("skips a day that only runs, and leaves a workout skipped alone with its run", async () => {
    const a = await athlete("run-only@example.test", { runOnly: true });
    expect(await skipSlotAction(3, "run", { ok: true }, skipForm())).toEqual({ ok: true });
    expect((await a.sessions(DAY_3)).map((run) => run.resolution.kind)).toEqual(["skipped"]);

    // The workout of a day that also runs: its run is untouched, and still owed.
    expect(await skipSlotAction(6, "session", { ok: true }, skipForm())).toEqual({ ok: true });
    expect((await a.sessions(DAY_6)).map((run) => run.resolution.kind)).toEqual(["incomplete"]);
    const schedule = await a.schedule();
    expect(partStatus(schedule.state, DAY_6, "session")).toBe("skipped");
    expect(partStatus(schedule.state, DAY_6, "run")).toBe("pending");
    expect(await a.adherence()).toMatchObject({ skipped: 1 });
  });

  it("skips every session of a day that has two, and none already answered", async () => {
    const a = await athlete("two-sessions@example.test");
    const swim = await swimBeside(a, DAY_6);
    const [run] = await a.sessions(DAY_6);
    await logRun(a, run!);
    await skipSlotAction(6, "run", { ok: true }, skipForm());
    const sessions = await a.sessions(DAY_6);
    expect(sessions.find((session) => session.id === swim)?.resolution.kind).toBe("skipped");
    // The run logged first keeps its log, and the day's run half reads done.
    expect(sessions.find((session) => session.id === run!.id)?.resolution.kind).toBe("logged");
    expect(partStatus((await a.schedule()).state, DAY_6, "run")).toBe("completed");
  });

  it("is replaced by logging it later, on the session and on the day", async () => {
    const a = await athlete("logged-later@example.test");
    await skipSlotAction(3, "run", { ok: true }, skipForm());
    const [run] = await a.sessions(DAY_3);
    await logRun(a, run!);

    const [logged] = await a.sessions(DAY_3);
    expect(logged!.resolution.kind).toBe("logged");
    expect(partStatus((await a.schedule()).state, DAY_3, "run")).toBe("completed");
    expect(await a.adherence()).toMatchObject({ logged: 1, skipped: 0 });
  });

  it("is owed again on both once it is put back", async () => {
    const a = await athlete("put-back@example.test");
    await skipSlotAction(3, "run", { ok: true }, skipForm());
    const [run] = await a.sessions(DAY_3);
    expect(await reopenOccurrenceAction(run!.id)).toEqual({ ok: true });

    expect((await a.sessions(DAY_3))[0]!.resolution.kind).toBe("incomplete");
    expect(partStatus((await a.schedule()).state, DAY_3, "run")).toBe("pending");
    expect(await a.adherence()).toMatchObject({ skipped: 0 });
    // And skipped on its own page, the day reads as a skip from Today would leave it.
    expect(await skipOccurrenceAction(run!.id)).toEqual({ ok: true });
    expect(partStatus((await a.schedule()).state, DAY_3, "run")).toBe("skipped");
  });

  /** A day whose run predates occurrences has nowhere else to keep its skip. */
  it("is recorded on the day when the day has no session of its own", async () => {
    const a = await athlete("no-occurrences@example.test", { occurrences: false });
    const schedule = await a.schedule();
    await a.as((tx) =>
      skipSlotPart(tx, a.userId, schedule.program, DAY_3, "run", { occurredOn: "2026-10-01" }),
    );
    expect(await a.recorded(DAY_3, "run")).toEqual([{ status: "skipped" }]);
    expect(partStatus((await a.schedule()).state, DAY_3, "run")).toBe("skipped");
  });
});

describe("a gap picked up from today", () => {
  it("skips the runs it passes on their sessions, every one of a day that has two", async () => {
    const a = await athlete("pick-up@example.test");
    const swim = await swimBeside(a, DAY_6);
    const today = todayInTimeZone(ZONE);
    const before = await a.schedule();
    const { skip } = pickUpFromToday(before.state, a.startDate, today);
    const runs = skip.filter(({ part }) => part === "run").map(({ ref }) => ref);
    // Two weeks behind: both of a week's running days, at least once.
    expect(runs.length).toBeGreaterThanOrEqual(2);

    expect(await pickUpFromTodayAction({ ok: true }, new FormData())).toEqual({ ok: true });

    const after = await a.schedule();
    for (const ref of runs) {
      const sessions = await a.sessions(ref);
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions.map((session) => session.resolution.kind)).toEqual(
        sessions.map(() => "skipped"),
      );
      expect(partStatus(after.state, ref, "run")).toBe("skipped");
      expect(await a.recorded(ref, "run")).toEqual([]);
    }
    expect((await a.sessions(DAY_6)).find((session) => session.id === swim)?.resolution.kind).toBe(
      "skipped",
    );
    // What the programme lists and what the coach is sent agree, run by run.
    const listed = await a.as((tx) => programmeOccurrences(tx, a.userId, a.familyId));
    const skippedHere = listed.filter(
      (occurrence) =>
        occurrence.sport === "running" &&
        sessionStanding(after.state, occurrence, today) === "skipped",
    ).length;
    expect(skippedHere).toBe(runs.length);
    expect(await a.adherence()).toMatchObject({ skipped: runs.length });
  });
});
