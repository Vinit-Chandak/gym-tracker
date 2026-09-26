import { and, eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { backfillMultisport } from "@/db/backfill-multisport";
import {
  activities,
  activitySubmissionReceipts,
  occurrenceEvents,
  occurrenceVersions,
  plannedOccurrences,
  sharedSessionStats,
  workoutSessions,
} from "@/db/schema";
import { seedLegacyAccount, type LegacyAccount } from "@/db/test/multisport-fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { AD_HOC_ORIGIN, plannedOrigin, reportedEffort, UNKNOWN_EFFORT } from "@/domain/activity";
import { nativeDistance, paceSecondsPerKm } from "@/domain/activity-metrics";
import {
  ActivityNotFoundError,
  activityTotals,
  closeStrengthParent,
  createActivity,
  deleteActivity,
  discardStrengthParent,
  getActivity,
  InvalidActualError,
  listActivities,
  OccurrenceNotFoundError,
  OccurrenceTakenError,
  openStrengthParent,
  StaleActivityError,
  SubmissionConflictError,
  updateActivity,
  type SaveActivityInput,
} from "./activities";
import { discardSession, finishSession, startAdHocSession } from "./sessions";

/**
 * AT-LIFE, AT-LOG and the save-transaction part of AT-DATA: one boundary for create, correct
 * and delete, proved against the real schema rather than a mock of it.
 */

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});
afterEach(async () => {
  await t.close();
});

const run = (overrides: Partial<SaveActivityInput> = {}): SaveActivityInput => ({
  submissionKey: crypto.randomUUID(),
  origin: AD_HOC_ORIGIN,
  actual: {
    sport: "running",
    environment: "outdoor",
    distance: nativeDistance(5, "km"),
    durationMs: 1_800_000,
    surface: null,
    elevationGainMetres: null,
    treadmillInclinePercent: null,
    averageHeartRate: null,
    maxHeartRate: null,
    cadenceStepsPerMinute: null,
  },
  startedAt: new Date("2026-09-18T06:00:00Z"),
  recordedTimeZone: "Asia/Kolkata",
  timeZoneSource: "profile_at_entry",
  occurredOn: "2026-09-18",
  effort: reportedEffort(5),
  outcome: "logged",
  title: null,
  notes: null,
  ...overrides,
});

async function seeded(email: string): Promise<LegacyAccount> {
  const user = await t.createAuthUser(email);
  const account = await seedLegacyAccount(t.db, user);
  await backfillMultisport(t.db, { userId: account.userId });
  return account;
}

/** An occurrence the migration did not already settle. */
async function freeOccurrence(userId: string) {
  const [occurrence] = await t.db
    .select({ id: plannedOccurrences.id, revisionId: plannedOccurrences.currentRevisionId })
    .from(plannedOccurrences)
    .where(
      and(
        eq(plannedOccurrences.userId, userId),
        sql`not exists (select 1 from public.activities a where a.occurrence_id = planned_occurrences.id)`,
      ),
    )
    .limit(1);
  return occurrence!;
}

describe("logging", () => {
  it("saves an ad hoc run with its own measurements and shared row", async () => {
    const account = await seeded("adhoc@example.test");

    const saved = await withUser(t.db, account.userId, (tx) =>
      createActivity(tx, account.userId, run()),
    );

    expect(saved.status).toBe("created");
    const record = await withUser(t.db, account.userId, (tx) =>
      getActivity(tx, account.userId, saved.id),
    );
    expect(record).toMatchObject({ sport: "running", durationMs: 1_800_000 });
    expect(record!.origin).toEqual(AD_HOC_ORIGIN);
    expect(record!.actual).toMatchObject({ distance: { value: 5, unit: "km", metres: 5000 } });
    expect(paceSecondsPerKm(5000, record!.durationMs!)).toBe(360);
    // Running keeps the projection it always had, under its legacy discriminator.
    const [shared] = await t.db
      .select()
      .from(sharedSessionStats)
      .where(eq(sharedSessionStats.sourceId, saved.id));
    expect(shared).toMatchObject({ sport: "run", distanceMeters: 5000, paceSecondsPerKm: 360 });
  });

  it("records Not sure as an answer rather than a missing value", async () => {
    const account = await seeded("unsure@example.test");
    const saved = await withUser(t.db, account.userId, (tx) =>
      createActivity(tx, account.userId, run({ effort: UNKNOWN_EFFORT })),
    );
    const record = await withUser(t.db, account.userId, (tx) =>
      getActivity(tx, account.userId, saved.id),
    );
    expect(record!.effort).toEqual({ status: "unknown", value: null });
  });

  it("refuses measurements its own sport does not allow", async () => {
    const account = await seeded("invalid@example.test");
    await expect(
      withUser(t.db, account.userId, (tx) =>
        createActivity(
          tx,
          account.userId,
          run({
            actual: {
              ...run().actual,
              sport: "running",
              distance: nativeDistance(0, "km"),
            } as SaveActivityInput["actual"],
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(InvalidActualError);
    expect(await t.db.select().from(activities).where(eq(activities.sourceKind, "manual"))).toEqual(
      [],
    );
  });
});

describe("logging a planned session", () => {
  it("settles exactly the occurrence it names", async () => {
    const account = await seeded("planned@example.test");
    const occurrence = await freeOccurrence(account.userId);

    const saved = await withUser(t.db, account.userId, (tx) =>
      createActivity(
        tx,
        account.userId,
        run({ origin: plannedOrigin(occurrence.id, occurrence.revisionId!) }),
      ),
    );

    const record = await withUser(t.db, account.userId, (tx) =>
      getActivity(tx, account.userId, saved.id),
    );
    expect(record!.origin).toEqual({
      kind: "planned",
      occurrenceId: occurrence.id,
      performedRevisionId: occurrence.revisionId,
      performedPlanId: null,
    });
    const events = await t.db
      .select()
      .from(occurrenceEvents)
      .where(
        and(eq(occurrenceEvents.occurrenceId, occurrence.id), eq(occurrenceEvents.kind, "logged")),
      );
    expect(events).toHaveLength(1);
    // The other occurrences of the same programme are untouched.
    const others = await t.db
      .select()
      .from(plannedOccurrences)
      .where(eq(plannedOccurrences.userId, account.userId));
    expect(others.filter((row) => row.disposition !== "pending")).toEqual([]);
  });

  /** AT-SCHED-08: one occurrence, one actual, and a readable conflict for the second. */
  it("refuses a second log for one occurrence", async () => {
    const account = await seeded("twice@example.test");
    const occurrence = await freeOccurrence(account.userId);
    const origin = plannedOrigin(occurrence.id, occurrence.revisionId!);
    const first = await withUser(t.db, account.userId, (tx) =>
      createActivity(tx, account.userId, run({ origin })),
    );

    await expect(
      withUser(t.db, account.userId, (tx) => createActivity(tx, account.userId, run({ origin }))),
    ).rejects.toThrow(OccurrenceTakenError);
    const logged = await t.db
      .select()
      .from(activities)
      .where(eq(activities.occurrenceId, occurrence.id));
    expect(logged.map((row) => row.id)).toEqual([first.id]);
  });

  it("refuses another athlete's occurrence", async () => {
    const mine = await seeded("mine@example.test");
    const theirs = await seeded("theirs@example.test");
    const occurrence = await freeOccurrence(theirs.userId);

    await expect(
      withUser(t.db, mine.userId, (tx) =>
        createActivity(
          tx,
          mine.userId,
          run({ origin: plannedOrigin(occurrence.id, occurrence.revisionId!) }),
        ),
      ),
    ).rejects.toThrow(OccurrenceNotFoundError);
  });

  it("refuses a revision that belongs to another occurrence", async () => {
    const account = await seeded("mixed@example.test");
    const occurrence = await freeOccurrence(account.userId);
    const [other] = await t.db
      .select()
      .from(occurrenceVersions)
      .where(
        and(
          eq(occurrenceVersions.userId, account.userId),
          sql`${occurrenceVersions.occurrenceId} <> ${occurrence.id}`,
        ),
      )
      .limit(1);

    await expect(
      withUser(t.db, account.userId, (tx) =>
        createActivity(
          tx,
          account.userId,
          run({ origin: plannedOrigin(occurrence.id, other!.id) }),
        ),
      ),
    ).rejects.toThrow(OccurrenceNotFoundError);
  });
});

/** AT-LIFE-03: a retry is the same save, and a different payload under the same key is not. */
describe("retrying a save", () => {
  it("returns the first result for the same key and the same payload", async () => {
    const account = await seeded("retry@example.test");
    const input = run();

    const first = await withUser(t.db, account.userId, (tx) =>
      createActivity(tx, account.userId, input),
    );
    const second = await withUser(t.db, account.userId, (tx) =>
      createActivity(tx, account.userId, input),
    );

    expect(second).toEqual({ id: first.id, status: "replayed" });
    expect(await t.db.select().from(activities)).toHaveLength(4);
  });

  it("refuses a different payload under a used key", async () => {
    const account = await seeded("conflict@example.test");
    const input = run();
    await withUser(t.db, account.userId, (tx) => createActivity(tx, account.userId, input));

    await expect(
      withUser(t.db, account.userId, (tx) =>
        createActivity(tx, account.userId, { ...input, notes: "different" }),
      ),
    ).rejects.toThrow(SubmissionConflictError);
  });
});

describe("correcting a record", () => {
  it("changes the same activity and moves its version on", async () => {
    const account = await seeded("edit@example.test");
    const saved = await withUser(t.db, account.userId, (tx) =>
      createActivity(tx, account.userId, run()),
    );

    const updated = await withUser(t.db, account.userId, (tx) =>
      updateActivity(
        tx,
        account.userId,
        saved.id,
        run({ submissionKey: crypto.randomUUID(), notes: "Windy." }),
        1,
      ),
    );

    expect(updated).toEqual({ id: saved.id, status: "updated" });
    const record = await withUser(t.db, account.userId, (tx) =>
      getActivity(tx, account.userId, saved.id),
    );
    expect(record).toMatchObject({ notes: "Windy.", revision: 2 });
  });

  /** AT-LIFE-04: the second of two edits from the same version is refused, not merged. */
  it("refuses an edit written against an old version", async () => {
    const account = await seeded("stale@example.test");
    const saved = await withUser(t.db, account.userId, (tx) =>
      createActivity(tx, account.userId, run()),
    );
    await withUser(t.db, account.userId, (tx) =>
      updateActivity(tx, account.userId, saved.id, run({ submissionKey: crypto.randomUUID() }), 1),
    );

    await expect(
      withUser(t.db, account.userId, (tx) =>
        updateActivity(
          tx,
          account.userId,
          saved.id,
          run({ submissionKey: crypto.randomUUID(), notes: "Other tab" }),
          1,
        ),
      ),
    ).rejects.toThrow(StaleActivityError);
  });

  /** AT-LIFE-02: sport and origin are fixed at save. */
  it("refuses to change the sport or what it answers for", async () => {
    const account = await seeded("immutable@example.test");
    const occurrence = await freeOccurrence(account.userId);
    const saved = await withUser(t.db, account.userId, (tx) =>
      createActivity(tx, account.userId, run()),
    );

    await expect(
      withUser(t.db, account.userId, (tx) =>
        updateActivity(
          tx,
          account.userId,
          saved.id,
          run({
            submissionKey: crypto.randomUUID(),
            actual: {
              sport: "cycling",
              environment: "indoor",
              durationMs: 1_800_000,
              distance: null,
              assistance: "unknown",
              resourceId: null,
              averagePowerWatts: null,
              averageCadenceRpm: null,
              averageHeartRate: null,
              maxHeartRate: null,
              elevationGainMetres: null,
            },
          }),
          1,
        ),
      ),
    ).rejects.toThrow(InvalidActualError);

    await expect(
      withUser(t.db, account.userId, (tx) =>
        updateActivity(
          tx,
          account.userId,
          saved.id,
          run({
            submissionKey: crypto.randomUUID(),
            origin: plannedOrigin(occurrence.id, occurrence.revisionId!),
          }),
          1,
        ),
      ),
    ).rejects.toThrow(InvalidActualError);
  });
});

describe("deleting a record", () => {
  it("removes it, its projection, and gives the occurrence back", async () => {
    const account = await seeded("delete@example.test");
    const occurrence = await freeOccurrence(account.userId);
    const saved = await withUser(t.db, account.userId, (tx) =>
      createActivity(
        tx,
        account.userId,
        run({ origin: plannedOrigin(occurrence.id, occurrence.revisionId!) }),
      ),
    );

    await withUser(t.db, account.userId, (tx) => deleteActivity(tx, account.userId, saved.id));

    expect(
      await withUser(t.db, account.userId, (tx) => getActivity(tx, account.userId, saved.id)),
    ).toBeNull();
    expect(
      await t.db.select().from(sharedSessionStats).where(eq(sharedSessionStats.sourceId, saved.id)),
    ).toEqual([]);
    // The occurrence can be logged again; the event log keeps both halves of the story.
    const events = await t.db
      .select()
      .from(occurrenceEvents)
      .where(eq(occurrenceEvents.occurrenceId, occurrence.id));
    expect(events.map((event) => event.kind)).toContain("log_deleted");
    const relogged = await withUser(t.db, account.userId, (tx) =>
      createActivity(
        tx,
        account.userId,
        run({ origin: plannedOrigin(occurrence.id, occurrence.revisionId!) }),
      ),
    );
    expect(relogged.status).toBe("created");
  });

  /** AT-LIFE-02: a receipt outlives the record, so a late retry cannot recreate it. */
  it("refuses a retry that arrives after the deletion", async () => {
    const account = await seeded("tombstone@example.test");
    const input = run();
    const saved = await withUser(t.db, account.userId, (tx) =>
      createActivity(tx, account.userId, input),
    );
    await withUser(t.db, account.userId, (tx) => deleteActivity(tx, account.userId, saved.id));

    await expect(
      withUser(t.db, account.userId, (tx) => createActivity(tx, account.userId, input)),
    ).rejects.toThrow(ActivityNotFoundError);
    const [receipt] = await t.db
      .select()
      .from(activitySubmissionReceipts)
      .where(eq(activitySubmissionReceipts.submissionKey, input.submissionKey));
    expect(receipt).toMatchObject({ deleted: true, resultStatus: "deleted" });
  });
});

describe("reading history", () => {
  it("pages by instant and id together, and totals the whole range in SQL", async () => {
    const account = await seeded("history@example.test");
    // More rows than any page, so a total taken from a page would be obviously wrong.
    for (let index = 0; index < 60; index++) {
      await withUser(t.db, account.userId, (tx) =>
        createActivity(
          tx,
          account.userId,
          run({
            startedAt: new Date(Date.UTC(2026, 6, 1, 6, 0, 0) + index * 3_600_000),
            occurredOn: "2026-07-01",
          }),
        ),
      );
    }

    const first = await withUser(
      t.db,
      account.userId,
      (tx) => listActivities(tx, account.userId, { sport: "running", pageSize: 25 }),
      { readOnly: true },
    );
    expect(first.activities).toHaveLength(25);
    expect(first.cursor).not.toBeNull();
    const second = await withUser(
      t.db,
      account.userId,
      (tx) =>
        listActivities(tx, account.userId, {
          sport: "running",
          pageSize: 25,
          cursor: { startedAt: new Date(first.cursor!.startedAt), id: first.cursor!.id },
        }),
      { readOnly: true },
    );
    const ids = new Set([...first.activities, ...second.activities].map((row) => row.id));
    expect(ids.size).toBe(50);

    const totals = await withUser(
      t.db,
      account.userId,
      (tx) => activityTotals(tx, account.userId),
      { readOnly: true },
    );
    const running = totals.find((total) => total.sport === "running");
    // 60 logged here plus the two the fixture's account already had.
    expect(running).toMatchObject({ count: 62, unknownDurations: 0 });
    expect(running!.days).toBeGreaterThan(1);
  });
});

/** AT-REG-04: the strength parent is opened, closed and discarded with the session itself. */
describe("the strength lifecycle", () => {
  it("opens a parent with the session and closes it when the session finishes", async () => {
    const account = await seeded("lifecycle@example.test");
    const started = await withUser(t.db, account.userId, (tx) =>
      startAdHocSession(tx, account.userId, { gymId: account.gymId }),
    );

    const [open] = await t.db.select().from(activities).where(eq(activities.id, started.sessionId));
    expect(open).toMatchObject({ sport: "strength", status: "in_progress" });
    // The session keeps everything it had; the parent is beside it, not instead of it.
    const [session] = await t.db
      .select()
      .from(workoutSessions)
      .where(eq(workoutSessions.id, started.sessionId));
    expect(session).toMatchObject({ gymId: account.gymId, activityId: started.sessionId });

    await expect(
      withUser(t.db, account.userId, (tx) => deleteActivity(tx, account.userId, started.sessionId)),
    ).rejects.toThrow("Use the workout screen");

    await withUser(t.db, account.userId, (tx) =>
      finishSession(tx, account.userId, started.sessionId, { notes: null, bodyWeightKg: null }),
    );
    const [finished] = await t.db
      .select()
      .from(activities)
      .where(eq(activities.id, started.sessionId));
    expect(finished!.status).toBe("completed");
    expect(finished!.durationMs).toBeGreaterThan(0);

    await expect(
      withUser(t.db, account.userId, (tx) => deleteActivity(tx, account.userId, started.sessionId)),
    ).rejects.toThrow("Use the workout screen");
    expect(
      await t.db.select().from(workoutSessions).where(eq(workoutSessions.id, started.sessionId)),
    ).toHaveLength(1);
  });

  it("takes the parent with a discarded session and leaves nothing behind", async () => {
    const account = await seeded("discard@example.test");
    const started = await withUser(t.db, account.userId, (tx) =>
      startAdHocSession(tx, account.userId, { gymId: account.gymId }),
    );

    await withUser(t.db, account.userId, (tx) =>
      discardSession(tx, account.userId, started.sessionId),
    );

    expect(
      await t.db.select().from(activities).where(eq(activities.id, started.sessionId)),
    ).toEqual([]);
    expect(
      await t.db.select().from(workoutSessions).where(eq(workoutSessions.id, started.sessionId)),
    ).toEqual([]);
  });
});

describe("the strength parent", () => {
  it("follows the session through start, finish and discard", async () => {
    const account = await seeded("strength@example.test");
    const [session] = await t.db
      .select()
      .from(workoutSessions)
      .where(eq(workoutSessions.userId, account.userId))
      .limit(1);

    await withUser(t.db, account.userId, (tx) =>
      openStrengthParent(
        tx,
        account.userId,
        { id: session!.id, startedAt: session!.startedAt },
        "Asia/Kolkata",
      ),
    );
    const [parent] = await t.db.select().from(activities).where(eq(activities.id, session!.id));
    expect(parent).toMatchObject({ sport: "strength", status: "completed" });

    await withUser(t.db, account.userId, (tx) =>
      closeStrengthParent(
        tx,
        account.userId,
        session!.id,
        new Date(session!.startedAt.getTime() + 3_600_000),
      ),
    );
    const [closed] = await t.db.select().from(activities).where(eq(activities.id, session!.id));
    expect(closed).toMatchObject({ status: "completed", durationMs: 3_600_000 });

    await withUser(t.db, account.userId, (tx) =>
      discardStrengthParent(tx, account.userId, session!.id),
    );
    expect(await t.db.select().from(activities).where(eq(activities.id, session!.id))).toEqual([]);
    // The session itself survives a discarded parent; only the link is gone.
    const [after] = await t.db
      .select()
      .from(workoutSessions)
      .where(eq(workoutSessions.id, session!.id));
    expect(after!.activityId).toBeNull();
  });
});
