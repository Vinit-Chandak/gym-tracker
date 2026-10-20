import { and, asc, eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { backfillMultisport } from "@/db/backfill-multisport";
import { activities, occurrenceEvents, plannedOccurrences, programs } from "@/db/schema";
import { seedLegacyAccount, type LegacyAccount } from "@/db/test/multisport-fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { AD_HOC_ORIGIN, plannedOrigin, reportedEffort } from "@/domain/activity";
import { nativeDistance } from "@/domain/activity-metrics";

import {
  createActivity,
  getActivity,
  OccurrenceTakenError,
  relinkActivity,
  StaleActivityError,
  type SaveActivityInput,
} from "./activities";
import { getOccurrence, OccurrenceClosedError } from "./occurrences";

/**
 * ADR 0058: what a logged run counts as can change after it is saved, as its own explicit step
 * with the checks a new log has, and never for a session of a programme that has ended.
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
    runType: null,
    laps: [],
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

/** Two of the account's runs that nothing has answered yet. */
async function openRuns(userId: string) {
  const rows = await t.db
    .select({
      id: plannedOccurrences.id,
      revisionId: plannedOccurrences.currentRevisionId,
      familyId: plannedOccurrences.familyId,
    })
    .from(plannedOccurrences)
    .where(
      and(
        eq(plannedOccurrences.userId, userId),
        eq(plannedOccurrences.sport, "running"),
        eq(plannedOccurrences.disposition, "pending"),
        sql`not exists (select 1 from public.activities a where a.occurrence_id = planned_occurrences.id)`,
      ),
    )
    .orderBy(asc(plannedOccurrences.id))
    .limit(2);
  expect(rows).toHaveLength(2);
  return rows as [(typeof rows)[number], (typeof rows)[number]];
}

describe("changing what a run counts as", () => {
  it("counts it as another session, giving the first back, with both histories saying so", async () => {
    const account = await seeded("relink@example.test");
    const as = <T>(work: Parameters<typeof withUser<T>>[2]) => withUser(t.db, account.userId, work);
    const [first, second] = await openRuns(account.userId);
    const saved = await as((tx) =>
      createActivity(
        tx,
        account.userId,
        run({ origin: plannedOrigin(first.id, first.revisionId!) }),
      ),
    );

    const moved = await as((tx) => relinkActivity(tx, account.userId, saved.id, second.id, 1));
    expect(moved).toEqual({ sport: "running", from: first.id, to: second.id });

    const record = await as((tx) => getActivity(tx, account.userId, saved.id));
    expect(record!.origin).toEqual(plannedOrigin(second.id, second.revisionId!));
    expect(record!.revision).toBe(2);
    // The measurements and the day it was done stay as they were.
    expect(record).toMatchObject({ occurredOn: "2026-09-18", durationMs: 1_800_000 });
    expect((await as((tx) => getOccurrence(tx, account.userId, first.id)))!.resolution.kind).toBe(
      "incomplete",
    );
    expect((await as((tx) => getOccurrence(tx, account.userId, second.id)))!.resolution).toEqual(
      expect.objectContaining({ kind: "logged", activityId: saved.id }),
    );
    const events = await t.db
      .select({
        occurrenceId: occurrenceEvents.occurrenceId,
        kind: occurrenceEvents.kind,
        detail: occurrenceEvents.detail,
      })
      .from(occurrenceEvents)
      .where(eq(occurrenceEvents.userId, account.userId));
    expect(events).toContainEqual({
      occurrenceId: first.id,
      kind: "log_deleted",
      detail: { relinkedActivityId: saved.id, to: second.id },
    });
    expect(
      events.filter((event) => event.occurrenceId === second.id).map(({ kind }) => kind),
    ).toContain("logged");
  });

  it("makes it unplanned, and plans it again, reopening a skipped session as done", async () => {
    const account = await seeded("unplanned@example.test");
    const as = <T>(work: Parameters<typeof withUser<T>>[2]) => withUser(t.db, account.userId, work);
    const [first] = await openRuns(account.userId);
    const saved = await as((tx) =>
      createActivity(
        tx,
        account.userId,
        run({ origin: plannedOrigin(first.id, first.revisionId!) }),
      ),
    );

    await as((tx) => relinkActivity(tx, account.userId, saved.id, null, 1));
    expect((await as((tx) => getActivity(tx, account.userId, saved.id)))!.origin).toEqual(
      AD_HOC_ORIGIN,
    );

    await as((tx) =>
      tx
        .update(plannedOccurrences)
        .set({ disposition: "skipped" })
        .where(eq(plannedOccurrences.id, first.id)),
    );
    await as((tx) => relinkActivity(tx, account.userId, saved.id, first.id, 2));
    const answered = await as((tx) => getOccurrence(tx, account.userId, first.id));
    expect(answered!.disposition).toBe("pending");
    expect(answered!.resolution.kind).toBe("logged");
  });

  it("refuses a stale page and a session something else answers", async () => {
    const account = await seeded("refused@example.test");
    const as = <T>(work: Parameters<typeof withUser<T>>[2]) => withUser(t.db, account.userId, work);
    const [first, second] = await openRuns(account.userId);
    const saved = await as((tx) => createActivity(tx, account.userId, run()));
    await as((tx) =>
      createActivity(
        tx,
        account.userId,
        run({ origin: plannedOrigin(second.id, second.revisionId!) }),
      ),
    );

    await expect(
      as((tx) => relinkActivity(tx, account.userId, saved.id, first.id, 7)),
    ).rejects.toBeInstanceOf(StaleActivityError);
    await expect(
      as((tx) => relinkActivity(tx, account.userId, saved.id, second.id, 1)),
    ).rejects.toBeInstanceOf(OccurrenceTakenError);
    // Nothing moved.
    const [row] = await t.db
      .select({ occurrenceId: activities.occurrenceId, revision: activities.revision })
      .from(activities)
      .where(eq(activities.id, saved.id));
    expect(row).toEqual({ occurrenceId: null, revision: 1 });
  });

  it("keeps a session of a programme that has ended answered (ADR 0054)", async () => {
    const account = await seeded("closed@example.test");
    const as = <T>(work: Parameters<typeof withUser<T>>[2]) => withUser(t.db, account.userId, work);
    const [first] = await openRuns(account.userId);
    const saved = await as((tx) =>
      createActivity(
        tx,
        account.userId,
        run({ origin: plannedOrigin(first.id, first.revisionId!) }),
      ),
    );
    await as((tx) =>
      tx.update(programs).set({ status: "archived" }).where(eq(programs.familyId, first.familyId!)),
    );

    await expect(
      as((tx) => relinkActivity(tx, account.userId, saved.id, null, 1)),
    ).rejects.toBeInstanceOf(OccurrenceClosedError);
  });
});
