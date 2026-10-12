import { readFile } from "node:fs/promises";

import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
import { FIXTURE_START_DATE, logTestRun, seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { plannedOrigin } from "@/domain/activity";
import { partStatus, type SlotRef } from "@/domain/schedule";
import type { SlotPart } from "@/domain/types";
import { resetReferenceCache } from "@/server/queries/reference";
import { readAdherence } from "@/server/repositories/activity-analytics";
import { reopenOccurrence, skipOccurrence } from "@/server/repositories/occurrences";
import {
  materialiseOccurrences,
  occurrencesFromBlueprint,
} from "@/server/repositories/program-occurrences";
import { createProgramFromBlueprint } from "@/server/repositories/programs";
import { getSchedule } from "@/server/repositories/schedule";

/**
 * Migration 0054, run as the file itself writes it, against the rows the old Today wrote: a
 * day's run skipped on the day, its occurrences left pending. Each becomes skipped, with the
 * event a skip from Today now writes; nothing answered, nothing from another programme, and
 * nothing the athlete took up again after the skip is touched.
 */

let t: TestDatabase;
const ZONE = "UTC";

beforeAll(async () => {
  t = await createTestDatabase();
  resetReferenceCache();
  await seedReferenceData(t.db);
  resetReferenceCache();
});
afterAll(async () => {
  await t.close();
});

async function runMigration(): Promise<void> {
  const file = await readFile("src/db/migrations/0054_runs_skipped_from_today.sql", "utf8");
  for (const statement of file.split("--> statement-breakpoint")) {
    await t.client.exec(statement.trim());
  }
}

/** The hybrid programme, its runs on days 3 and 6 written as occurrences, eight cycles of each. */
async function athlete(email: string) {
  const user = await t.createAuthUser(email);
  const { programId } = await withUser(t.db, user.id, (tx) => seedTestUserData(tx, user));
  await t.db.update(profiles).set({ timeZone: ZONE }).where(eq(profiles.id, user.id));
  const [program] = await t.db
    .select({ familyId: programs.familyId })
    .from(programs)
    .where(eq(programs.id, programId));
  const familyId = program!.familyId;
  await materialiseOccurrences(t.db, user.id, {
    programId,
    familyId,
    blueprint: occurrencesFromBlueprint(STRENGTH_AESTHETICS_HYBRID_8WK, {
      familyId,
      startDate: FIXTURE_START_DATE,
      schedulingTimeZone: ZONE,
    }),
    schedulingZone: ZONE,
    today: FIXTURE_START_DATE,
    transition: "new_block",
  });
  const as = <T>(run: Parameters<typeof withUser<T>>[2]) => withUser(t.db, user.id, run);
  return {
    userId: user.id,
    programId,
    familyId,
    as,
    /** A day's half answered on the day, as the old Today and "Pick up from today" wrote it. */
    onTheDay: async (
      ref: SlotRef,
      part: SlotPart,
      status: "skipped" | "completed",
      options: { programId?: string; note?: string | null; at?: Date } = {},
    ) => {
      const [row] = await t.db
        .insert(programSlotEvents)
        .values({
          userId: user.id,
          programId: options.programId ?? programId,
          cycleIndex: ref.cycleIndex,
          dayIndex: ref.dayIndex,
          part,
          status,
          occurredOn: "2026-10-12",
          note: options.note === undefined ? "Picked up from today" : options.note,
          ...(options.at ? { createdAt: options.at } : {}),
        })
        .returning({ id: programSlotEvents.id });
      return row!.id;
    },
    /** The day's sessions, in the order they were written. */
    sessions: (ref: SlotRef) =>
      t.db
        .select({
          id: plannedOccurrences.id,
          disposition: plannedOccurrences.disposition,
          revisionId: plannedOccurrences.currentRevisionId,
          sport: plannedOccurrences.sport,
        })
        .from(plannedOccurrences)
        .where(
          and(
            eq(plannedOccurrences.userId, user.id),
            eq(plannedOccurrences.familyId, familyId),
            eq(plannedOccurrences.cycleIndex, ref.cycleIndex),
            eq(plannedOccurrences.cycleDayIndex, ref.dayIndex),
          ),
        )
        .orderBy(asc(plannedOccurrences.createdAt), asc(plannedOccurrences.sport)),
  };
}

type Athlete = Awaited<ReturnType<typeof athlete>>;

const disposition = async (a: Athlete, ref: SlotRef) =>
  (await a.sessions(ref)).map((session) => session.disposition);

/** Every event the migration wrote for one occurrence. */
const migrated = (occurrenceId: string) =>
  t.db
    .select({
      kind: occurrenceEvents.kind,
      actor: occurrenceEvents.actor,
      source: occurrenceEvents.source,
      occurredOn: occurrenceEvents.occurredOn,
      detail: occurrenceEvents.detail,
    })
    .from(occurrenceEvents)
    .where(
      and(eq(occurrenceEvents.occurrenceId, occurrenceId), eq(occurrenceEvents.actor, "migration")),
    );

async function swimBeside(a: Athlete, ref: SlotRef) {
  const [run] = await t.db
    .select({ scheduledOn: occurrenceVersions.scheduledOn })
    .from(plannedOccurrences)
    .innerJoin(occurrenceVersions, eq(occurrenceVersions.id, plannedOccurrences.currentRevisionId))
    .where(
      and(
        eq(plannedOccurrences.familyId, a.familyId),
        eq(plannedOccurrences.cycleIndex, ref.cycleIndex),
        eq(plannedOccurrences.cycleDayIndex, ref.dayIndex),
      ),
    );
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
    })
    .returning({ id: occurrenceVersions.id });
  await t.db
    .update(plannedOccurrences)
    .set({ currentRevisionId: revision!.id })
    .where(eq(plannedOccurrences.id, swim!.id));
  return swim!.id;
}

const at = (ref: [number, number]): SlotRef => ({ cycleIndex: ref[0], dayIndex: ref[1] });
const MINUTE = 60_000;

describe("runs skipped on the day before Today skipped the runs themselves", () => {
  it("skips the pending runs of a day whose run was skipped, and says where from", async () => {
    const a = await athlete("picked-up@example.test");
    // "Pick up from today" over a day that lifts and runs: both halves skipped on the day.
    await a.onTheDay(at([2, 3]), "session", "skipped");
    const dayEvent = await a.onTheDay(at([2, 3]), "run", "skipped");
    // Today's run skip, with the athlete's reason, and one with none.
    await a.onTheDay(at([2, 6]), "run", "skipped", { note: "Sore calf" });
    await a.onTheDay(at([3, 3]), "run", "skipped", { note: null });

    await runMigration();

    const [run] = await a.sessions(at([2, 3]));
    expect(run!.disposition).toBe("skipped");
    expect(await migrated(run!.id)).toEqual([
      {
        kind: "skipped",
        actor: "migration",
        source: `program_slot_events:${dayEvent}`,
        occurredOn: "2026-10-12",
        detail: { via: "today", note: "Picked up from today" },
      },
    ]);
    expect(await disposition(a, at([2, 6]))).toEqual(["skipped"]);
    const [quiet] = await a.sessions(at([3, 3]));
    expect((await migrated(quiet!.id))[0]?.detail).toEqual({ via: "today" });
    // The day's own row is left as it was, and the programme reads it as before.
    const schedule = (await a.as((tx) => getSchedule(tx, a.userId)))!;
    expect(partStatus(schedule.state, at([2, 3]), "run")).toBe("skipped");
    expect(partStatus(schedule.state, at([2, 3]), "session")).toBe("skipped");
    // The coach is now told what the programme said: three skipped, none of them owed.
    const running = (await a.as((tx) => readAdherence(tx, a.userId))).find(
      (row) => row.sport === "running",
    )!.counts;
    expect(running.skipped).toBe(3);
    // Everything else is still to come, sixteen runs less the three.
    expect(running.incomplete).toBe(13);

    // Safe to run twice: nothing pending is left to skip, and no event is written again.
    await runMigration();
    expect(await migrated(run!.id)).toHaveLength(1);
  });

  it("skips a day that only runs, and every session of a day that has two", async () => {
    const a = await athlete("two-sessions@example.test");
    await t.db
      .update(programDays)
      .set({ includesLifting: false })
      .where(and(eq(programDays.programId, a.programId), eq(programDays.dayIndex, 3)));
    const swim = await swimBeside(a, at([2, 6]));
    await a.onTheDay(at([2, 3]), "run", "skipped");
    await a.onTheDay(at([2, 6]), "run", "skipped");

    await runMigration();

    expect(await disposition(a, at([2, 3]))).toEqual(["skipped"]);
    const sessions = await a.sessions(at([2, 6]));
    expect(sessions.map((session) => session.disposition)).toEqual(["skipped", "skipped"]);
    expect(sessions.some((session) => session.id === swim)).toBe(true);
  });

  it("leaves a workout skipped alone, and the runs of every other day", async () => {
    const a = await athlete("workout-only@example.test");
    // Only the lifting of a day that also runs: its run is still owed.
    await a.onTheDay(at([2, 3]), "session", "skipped");
    // A run completed on the day, from before occurrences answered for runs.
    await a.onTheDay(at([2, 6]), "run", "completed");

    await runMigration();

    expect(await disposition(a, at([2, 3]))).toEqual(["pending"]);
    expect(await disposition(a, at([2, 6]))).toEqual(["pending"]);
    expect(await disposition(a, at([3, 3]))).toEqual(["pending"]);
  });

  it("never touches a run logged, skipped, cancelled or completed before occurrences", async () => {
    const a = await athlete("answered@example.test");
    const [logged] = await a.sessions(at([2, 3]));
    await a.as((tx) =>
      logTestRun(tx, a.userId, {
        startedAt: new Date("2026-09-17T07:00:00Z"),
        durationSeconds: 1800,
        distanceMeters: 5000,
        origin: plannedOrigin(logged!.id, logged!.revisionId!),
      }),
    );
    const [cancelled] = await a.sessions(at([2, 6]));
    await t.db
      .update(plannedOccurrences)
      .set({ disposition: "cancelled" })
      .where(eq(plannedOccurrences.id, cancelled!.id));
    const [legacy] = await a.sessions(at([3, 3]));
    await t.db
      .update(plannedOccurrences)
      .set({ disposition: "legacy_completed" })
      .where(eq(plannedOccurrences.id, legacy!.id));
    const [skipped] = await a.sessions(at([3, 6]));
    await a.as((tx) => skipOccurrence(tx, a.userId, skipped!.id, "Away"));
    for (const ref of [at([2, 3]), at([2, 6]), at([3, 3]), at([3, 6])])
      await a.onTheDay(ref, "run", "skipped");

    await runMigration();

    expect(await disposition(a, at([2, 3]))).toEqual(["pending"]);
    expect(await disposition(a, at([2, 6]))).toEqual(["cancelled"]);
    expect(await disposition(a, at([3, 3]))).toEqual(["legacy_completed"]);
    expect(await disposition(a, at([3, 6]))).toEqual(["skipped"]);
    for (const occurrence of [logged!, cancelled!, legacy!, skipped!])
      expect(await migrated(occurrence.id)).toEqual([]);
    // The run logged after its day was skipped is what the day reads: logging replaced the skip.
    const schedule = (await a.as((tx) => getSchedule(tx, a.userId)))!;
    expect(partStatus(schedule.state, at([2, 3]), "run")).toBe("completed");
  });

  it("leaves a run owed that was put back or moved after its day was skipped", async () => {
    const a = await athlete("taken-up@example.test");
    const skippedAt = new Date(Date.now() - 60 * MINUTE);
    // Put back after the day was skipped: skipped on its page, then put back.
    const [putBack] = await a.sessions(at([2, 3]));
    await a.onTheDay(at([2, 3]), "run", "skipped", { at: skippedAt });
    await a.as((tx) => skipOccurrence(tx, a.userId, putBack!.id));
    await a.as((tx) => reopenOccurrence(tx, a.userId, putBack!.id));
    // Moved to another date after the day was skipped.
    const [moved] = await a.sessions(at([2, 6]));
    await a.onTheDay(at([2, 6]), "run", "skipped", { at: skippedAt });
    await t.db.insert(occurrenceEvents).values({
      userId: a.userId,
      occurrenceId: moved!.id,
      kind: "rescheduled",
      actor: "athlete",
      detail: { from: "2026-09-20", to: "2026-10-14" },
    });
    // Put back before its day was skipped: the skip is the later word, and stands.
    const [earlier] = await a.sessions(at([3, 3]));
    await a.as((tx) => skipOccurrence(tx, a.userId, earlier!.id));
    await a.as((tx) => reopenOccurrence(tx, a.userId, earlier!.id));
    await a.onTheDay(at([3, 3]), "run", "skipped", { at: new Date(Date.now() + MINUTE) });

    await runMigration();

    expect(await disposition(a, at([2, 3]))).toEqual(["pending"]);
    expect(await disposition(a, at([2, 6]))).toEqual(["pending"]);
    expect(await disposition(a, at([3, 3]))).toEqual(["skipped"]);
    // Owed on the programme as it is to the coach: the day's skip gives way to it.
    const schedule = (await a.as((tx) => getSchedule(tx, a.userId)))!;
    expect(partStatus(schedule.state, at([2, 3]), "run")).toBe("pending");
    expect(partStatus(schedule.state, at([2, 6]), "run")).toBe("pending");
    expect(partStatus(schedule.state, at([3, 3]), "run")).toBe("skipped");
  });

  /**
   * A revision copies the day's rows onto the new version, written that day. The run put back
   * between the skip and the revision was put back after the skip, whatever the copy's date.
   */
  it("reads the skip from when it happened, not from a revision's copy of it", async () => {
    const a = await athlete("revised@example.test");
    const [run] = await a.sessions(at([2, 3]));
    await a.onTheDay(at([2, 3]), "run", "skipped", { at: new Date(Date.now() - 60 * MINUTE) });
    await a.as((tx) => skipOccurrence(tx, a.userId, run!.id));
    await a.as((tx) => reopenOccurrence(tx, a.userId, run!.id));
    const revised = await a.as((tx) =>
      createProgramFromBlueprint(tx, a.userId, STRENGTH_AESTHETICS_HYBRID_8WK, {
        startDate: FIXTURE_START_DATE,
        familyId: a.familyId,
      }),
    );
    await a.onTheDay(at([2, 3]), "run", "skipped", {
      programId: revised.id,
      at: new Date(Date.now() + MINUTE),
    });
    // A day the new version skipped after the revision, on the version that holds it.
    await a.onTheDay(at([2, 6]), "run", "skipped", { programId: revised.id });

    await runMigration();

    expect(await disposition(a, at([2, 3]))).toEqual(["pending"]);
    expect(await disposition(a, at([2, 6]))).toEqual(["skipped"]);
  });

  it("matches a skip only to its own programme's runs, on a day that runs", async () => {
    const a = await athlete("new-block@example.test");
    // A new block is a new family: its day 3 of cycle 2 is not the old block's.
    const block = await a.as((tx) =>
      createProgramFromBlueprint(tx, a.userId, STRENGTH_AESTHETICS_HYBRID_8WK, {
        startDate: "2026-11-03",
      }),
    );
    await a.onTheDay(at([2, 3]), "run", "skipped", { programId: block.id });
    // A version whose day 6 no longer runs: a run skip on it answers for no run.
    await t.db
      .update(programDays)
      .set({ includesRun: false })
      .where(and(eq(programDays.programId, a.programId), eq(programDays.dayIndex, 6)));
    await a.onTheDay(at([2, 6]), "run", "skipped");

    await runMigration();

    expect(await disposition(a, at([2, 3]))).toEqual(["pending"]);
    expect(await disposition(a, at([2, 6]))).toEqual(["pending"]);
  });
});
