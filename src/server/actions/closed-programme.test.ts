import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  activities,
  occurrenceEvents,
  occurrenceVersions,
  plannedOccurrences,
  profiles,
  programs,
} from "@/db/schema";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";
import { seedReferenceData } from "@/db/seed/reference";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { addDays, todayInTimeZone } from "@/domain/program-calendar";

/*
 * After a switch, the replaced programme's sessions keep what became of them and can no longer
 * be logged (ADR 0054). Liam's old blocks kept a past-dated run pending, loggable by its URL,
 * so a block he had moved on from could still be changed months later. Through the real
 * actions and a real database: every action that would answer, skip, put back or move one of
 * them is refused, and nothing it read is rewritten.
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

import { ensureProfile } from "@/server/queries/profile";
import { resetReferenceCache } from "@/server/queries/reference";
import {
  getOccurrence,
  namedOccurrence,
  programmeClosure,
} from "@/server/repositories/occurrences";
import {
  activateProgramDraft,
  adoptProgramme,
  archiveActiveProgram,
  copyProgramToDraft,
  refreshProgramDraft,
} from "@/server/repositories/program-drafts";

import { deleteActivityAction, saveActivityAction } from "./activities";
import {
  reopenOccurrenceAction,
  rescheduleOccurrenceAction,
  scheduleActivityAction,
  skipOccurrenceAction,
} from "./occurrences";

const ZONE = "UTC";
const HYBRID = STRENGTH_AESTHETICS_HYBRID_8WK;
/** The block that replaces it: the same days under a name of its own. */
const NEXT = { ...HYBRID, slug: "hybrid-next-block", name: "Hybrid Next Block" };
const CLOSED =
  "This session's programme has ended, so it can no longer be logged, skipped or moved.";
/** The log form's refusal, which offers the way on. */
const CLOSED_LOG =
  "This session's programme has ended, so it can no longer be logged. You can still log the run on its own.";

let t: TestDatabase;
const today = todayInTimeZone(ZONE);

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

async function athlete() {
  const email = `${crypto.randomUUID()}@example.test`;
  const user = await t.createAuthUser(email);
  state.user = { id: user.id, email };
  await withUser(t.db, user.id, async (tx) => {
    await ensureProfile(tx, user);
    await tx.update(profiles).set({ timeZone: ZONE }).where(eq(profiles.id, user.id));
  });
  return user;
}
type Athlete = Awaited<ReturnType<typeof athlete>>;
const as = <T>(a: Athlete, work: Parameters<typeof withUser<T>>[2]) => withUser(t.db, a.id, work);

/** A family's runs dated before today, in date order. */
async function pastRuns(a: Athlete, familyId: string) {
  const rows = await as(a, (tx) =>
    tx
      .select({ id: plannedOccurrences.id, scheduledOn: occurrenceVersions.scheduledOn })
      .from(plannedOccurrences)
      .innerJoin(
        occurrenceVersions,
        eq(occurrenceVersions.id, plannedOccurrences.currentRevisionId),
      )
      .where(and(eq(plannedOccurrences.userId, a.id), eq(plannedOccurrences.familyId, familyId))),
  );
  return rows
    .filter((row) => row.scheduledOn < today)
    .sort((x, y) => (x.scheduledOn < y.scheduledOn ? -1 : 1));
}

const read = (a: Athlete, id: string) => as(a, (tx) => getOccurrence(tx, a.id, id));

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

/** The log form as it posts a planned run: the session it answers and the revision on screen. */
const runLog = (occurrence: { id: string; revisionId: string }) =>
  form({
    sport: "running",
    submissionKey: crypto.randomUUID(),
    startedAt: `${addDays(today, -1)}T06:00`,
    environment: "outdoor",
    distanceValue: "5",
    distanceUnit: "km",
    minutes: "30",
    effort: "3",
    occurrenceId: occurrence.id,
    revisionId: occurrence.revisionId,
  });

/**
 * An athlete three weeks into the hybrid block, its past runs answered three ways — one logged,
 * one skipped, the rest left owed — who then starts another programme today.
 */
async function switched() {
  const a = await athlete();
  const first = await as(a, (tx) =>
    adoptProgramme(tx, a.id, HYBRID, { startDate: addDays(today, -20) }),
  );
  const past = await pastRuns(a, first.familyId);
  expect(past.length).toBeGreaterThanOrEqual(3);
  const [logged, skipped, owed] = await Promise.all(past.slice(0, 3).map(({ id }) => read(a, id)));
  // Before the switch, each is the athlete's to answer.
  expect(owed!.closed).toBe(false);
  expect(owed!.loggable).toBe(true);
  const { savedActivityId: activityId } = await saveActivityAction(null, {}, runLog(logged!));
  expect(activityId).toBeTruthy();
  expect(await skipOccurrenceAction(skipped!.id)).toEqual({ ok: true });

  const next = await as(a, (tx) => adoptProgramme(tx, a.id, NEXT, { startDate: today }));
  return {
    a,
    first,
    next,
    logged: logged!,
    activityId: activityId!,
    skipped: skipped!,
    owed: owed!,
  };
}

describe("a programme the athlete has moved on from", () => {
  it("keeps what became of each of its sessions, and opens none of them to logging", async () => {
    const { a, logged, skipped, owed } = await switched();
    const [afterLogged, afterSkipped, afterOwed] = await Promise.all(
      [logged, skipped, owed].map(({ id }) => read(a, id)),
    );
    // Logged, skipped and not done, as they were when the block ended: adherence is not rewritten.
    expect(afterLogged!.resolution.kind).toBe("logged");
    expect(afterSkipped!.resolution.kind).toBe("skipped");
    expect(afterOwed!.resolution.kind).toBe("incomplete");
    for (const occurrence of [afterLogged!, afterSkipped!, afterOwed!]) {
      expect(occurrence.closed).toBe(true);
      expect(occurrence.loggable).toBe(false);
    }
  });

  it("refuses every action that would answer, skip, put back or move one", async () => {
    const { a, skipped, owed } = await switched();
    const eventsBefore = await as(a, (tx) =>
      tx.select().from(occurrenceEvents).where(eq(occurrenceEvents.userId, a.id)),
    );

    // Logging either one, by the form its page would have posted.
    for (const occurrence of [owed, skipped]) {
      const state = await saveActivityAction(null, {}, runLog(occurrence));
      expect(state.formError).toBe(CLOSED_LOG);
      expect(state).not.toHaveProperty("savedActivityId");
    }
    // Skipping the one still owed, putting back the skipped one, moving either.
    expect(await skipOccurrenceAction(owed.id)).toEqual({ ok: false, error: CLOSED });
    expect(await reopenOccurrenceAction(skipped.id)).toEqual({ ok: false, error: CLOSED });
    for (const occurrence of [owed, skipped]) {
      const moved = await rescheduleOccurrenceAction(
        occurrence.id,
        {},
        form({ scheduledOn: addDays(today, 2) }),
      );
      expect(moved.formError).toBe(CLOSED);
    }

    // Nothing was written: no activity answers either, and neither has a new event.
    const answered = await as(a, (tx) =>
      tx
        .select({ id: activities.id })
        .from(activities)
        .where(
          and(eq(activities.userId, a.id), inArray(activities.occurrenceId, [owed.id, skipped.id])),
        ),
    );
    expect(answered).toEqual([]);
    const eventsAfter = await as(a, (tx) =>
      tx.select().from(occurrenceEvents).where(eq(occurrenceEvents.userId, a.id)),
    );
    expect(eventsAfter).toHaveLength(eventsBefore.length);
    expect((await read(a, owed.id))!.disposition).toBe("pending");
    expect((await read(a, skipped.id))!.disposition).toBe("skipped");
  });

  /**
   * The review of 12 October: the activity page promised a deleted run's session back to be
   * logged, which it is not. The page reads `closed` from `namedOccurrence` to say so instead.
   */
  it("does not give a session back to be logged when the activity that answered it is deleted", async () => {
    const { a, logged, activityId } = await switched();
    const named = await as(a, (tx) => namedOccurrence(tx, a.id, logged.id));
    expect(named!.closed).toBe(true);
    // Named for its own day, as the block that wrote it named it, though that block has ended.
    expect(named!.dayName).toMatch(/^Easy Run \+ /);
    expect(named!.dayFocus).toMatch(/^Aerobic \+ /);

    await expect(deleteActivityAction(activityId)).rejects.toThrow("redirect:/progress/history");
    const after = await read(a, logged.id);
    expect(after!.resolution.kind).toBe("incomplete");
    expect(after!.closed).toBe(true);
    expect(after!.loggable).toBe(false);
    const state = await saveActivityAction(null, {}, runLog(after!));
    expect(state.formError).toBe(CLOSED_LOG);
  });

  it("leaves the programme that replaced it open", async () => {
    const { a, next } = await switched();
    const [first] = await as(a, (tx) =>
      tx
        .select({ id: plannedOccurrences.id })
        .from(plannedOccurrences)
        .innerJoin(
          occurrenceVersions,
          eq(occurrenceVersions.id, plannedOccurrences.currentRevisionId),
        )
        .where(
          and(
            eq(plannedOccurrences.userId, a.id),
            eq(plannedOccurrences.familyId, next.familyId),
            gt(occurrenceVersions.scheduledOn, today),
          ),
        )
        .limit(1),
    );
    const run = await read(a, first!.id);
    expect(run!.closed).toBe(false);
    expect(run!.loggable).toBe(true);
    expect((await as(a, (tx) => namedOccurrence(tx, a.id, run!.id)))!.closed).toBe(false);
    expect(await skipOccurrenceAction(run!.id)).toEqual({ ok: true });
    expect(await reopenOccurrenceAction(run!.id)).toEqual({ ok: true });
  });

  it("says which programme followed it and when, or that it was archived", async () => {
    const { a, first, next } = await switched();
    expect(await as(a, (tx) => programmeClosure(tx, a.id, first.familyId, ZONE))).toEqual({
      name: HYBRID.name,
      closedOn: today,
      followedBy: NEXT.name,
    });
    // The athlete's programme now has closed nothing.
    expect(await as(a, (tx) => programmeClosure(tx, a.id, next.familyId, ZONE))).toBeNull();

    // Archived with nothing in its place, it ended that day; what replaced the first is unchanged.
    await as(a, (tx) => archiveActiveProgram(tx, a.id, next.id));
    expect(await as(a, (tx) => programmeClosure(tx, a.id, next.familyId, ZONE))).toEqual({
      name: NEXT.name,
      closedOn: today,
      followedBy: null,
    });
    expect(
      (await as(a, (tx) => programmeClosure(tx, a.id, first.familyId, ZONE)))!.followedBy,
    ).toBe(NEXT.name);

    // A programme started on a later day than the last was archived followed it; it did not
    // replace it.
    await as(a, (tx) =>
      tx
        .update(programs)
        .set({ updatedAt: new Date(`${addDays(today, -1)}T12:00:00Z`) })
        .where(eq(programs.id, next.id)),
    );
    await as(a, (tx) => adoptProgramme(tx, a.id, HYBRID, { startDate: today }));
    expect(await as(a, (tx) => programmeClosure(tx, a.id, next.familyId, ZONE))).toEqual({
      name: NEXT.name,
      closedOn: addDays(today, -1),
      followedBy: null,
    });
  });

  it("closes nothing the athlete put on the calendar themselves, with no programme at all", async () => {
    const { a, next } = await switched();
    await as(a, (tx) => archiveActiveProgram(tx, a.id, next.id));
    await expect(
      scheduleActivityAction(
        {},
        form({ sport: "running", scheduledOn: addDays(today, 1), scheduledLocalTime: "" }),
      ),
    ).rejects.toThrow("redirect:/training/scheduled");
    const [own] = await as(a, (tx) =>
      tx
        .select({ id: plannedOccurrences.id })
        .from(plannedOccurrences)
        .where(and(eq(plannedOccurrences.userId, a.id), isNull(plannedOccurrences.familyId))),
    );
    const scheduled = await read(a, own!.id);
    expect(scheduled!.closed).toBe(false);
    expect(scheduled!.loggable).toBe(true);
    expect(await skipOccurrenceAction(own!.id)).toEqual({ ok: true });
  });
});

describe("a programme the athlete is still on", () => {
  /** A revision keeps the family, so the sessions of the version it replaced stay theirs. */
  it("keeps its sessions open through a revision", async () => {
    const a = await athlete();
    const first = await as(a, (tx) =>
      adoptProgramme(tx, a.id, HYBRID, { startDate: addDays(today, -20) }),
    );
    const [owed] = await pastRuns(a, first.familyId);
    const copy = await as(a, (tx) => copyProgramToDraft(tx, a.id, first.id, false));
    const ready = await as(a, (tx) => refreshProgramDraft(tx, a.id, copy.id, copy.revision));
    await as(a, (tx) =>
      activateProgramDraft(tx, a.id, ready.id, {
        expectedRevision: ready.revision,
        startDate: today,
        transition: "continue",
      }),
    );
    const run = await read(a, owed!.id);
    expect(run!.closed).toBe(false);
    expect(run!.loggable).toBe(true);
    expect(await as(a, (tx) => programmeClosure(tx, a.id, first.familyId, ZONE))).toBeNull();
  });
});
