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

describe("endurance answers are independent of the lifting sequence", () => {
  it("does not let the obsolete lifting run control skip a scheduled run", async () => {
    const a = await athlete("independent-skip@example.test");
    expect(await skipSlotAction(3, "run", { ok: true }, skipForm())).toEqual({
      ok: false,
      error: "That day has nothing left to skip.",
    });
    expect((await a.sessions(DAY_3))[0]!.resolution.kind).toBe("incomplete");
  });

  it("skips one exact occurrence and leaves lifting and other sports pending", async () => {
    const a = await athlete("exact-skip@example.test");
    const swim = await swimBeside(a, DAY_6);
    const [run] = await a.sessions(DAY_6);
    expect(await skipOccurrenceAction(run!.id)).toEqual({ ok: true });
    const sessions = await a.sessions(DAY_6);
    expect(sessions.find((s) => s.id === run!.id)?.resolution.kind).toBe("skipped");
    expect(sessions.find((s) => s.id === swim)?.resolution.kind).toBe("incomplete");
    expect(partStatus((await a.schedule()).state, DAY_6, "session")).toBe("pending");
    expect(await a.adherence()).toMatchObject({ skipped: 1 });
  });

  it("does not skip a run when its former lifting day is skipped", async () => {
    const a = await athlete("lifting-skip@example.test");
    expect(await skipSlotAction(6, "session", { ok: true }, skipForm())).toEqual({ ok: true });
    expect((await a.sessions(DAY_6))[0]!.resolution.kind).toBe("incomplete");
    expect(partStatus((await a.schedule()).state, DAY_6, "session")).toBe("skipped");
  });

  it("replaces a skipped occurrence with its explicit retrospective log", async () => {
    const a = await athlete("logged-later@example.test");
    const [run] = await a.sessions(DAY_3);
    await skipOccurrenceAction(run!.id);
    await logRun(a, run!);
    expect((await a.sessions(DAY_3))[0]!.resolution.kind).toBe("logged");
    expect(await a.adherence()).toMatchObject({ logged: 1, skipped: 0 });
    expect((await a.schedule()).state.events.every((e) => e.part === "session")).toBe(true);
  });

  it("can reopen and skip an occurrence without changing lifting progress", async () => {
    const a = await athlete("put-back@example.test");
    const [run] = await a.sessions(DAY_3);
    const before = (await a.schedule()).state;
    await skipOccurrenceAction(run!.id);
    expect(await reopenOccurrenceAction(run!.id)).toEqual({ ok: true });
    expect((await a.sessions(DAY_3))[0]!.resolution.kind).toBe("incomplete");
    expect(await a.adherence()).toMatchObject({ skipped: 0 });
    expect((await a.schedule()).state).toEqual(before);
  });

  it("dates the skip on the occurrence's own history", async () => {
    const a = await athlete("dated@example.test");
    const [run] = await a.sessions(DAY_3);
    await skipOccurrenceAction(run!.id);
    const [event] = await t.db
      .select()
      .from(occurrenceEvents)
      .where(and(eq(occurrenceEvents.occurrenceId, run!.id), eq(occurrenceEvents.kind, "skipped")));
    expect(event?.createdAt.toISOString().slice(0, 10)).toBe(todayInTimeZone(ZONE));
    expect((await a.schedule()).state.events.some((e) => e.part === "run")).toBe(false);
  });

  it("retains legacy day events without using them to advance lifting", async () => {
    const a = await athlete("no-occurrences@example.test", { occurrences: false });
    const schedule = await a.schedule();
    await a.as((tx) =>
      skipSlotPart(tx, a.userId, schedule.program, DAY_3, "run", { occurredOn: "2026-10-01" }),
    );
    expect(await a.recorded(DAY_3, "run")).toEqual([{ status: "skipped" }]);
    expect((await a.schedule()).state).toEqual(schedule.state);
  });

  it("picking up lifting from today leaves every endurance occurrence intact", async () => {
    const a = await athlete("pick-up@example.test");
    await swimBeside(a, DAY_6);
    const before = await a.as((tx) => programmeOccurrences(tx, a.userId, a.familyId));
    const schedule = await a.schedule();
    const { skip } = pickUpFromToday(schedule.state, a.startDate, todayInTimeZone(ZONE));
    expect(skip.length).toBeGreaterThan(0);
    expect(skip.every((row) => row.part === "session")).toBe(true);
    expect(await pickUpFromTodayAction({ ok: true }, new FormData())).toEqual({ ok: true });
    const after = await a.as((tx) => programmeOccurrences(tx, a.userId, a.familyId));
    expect(after).toEqual(before);
    expect(await a.adherence()).toMatchObject({ skipped: 0 });
  });
});
