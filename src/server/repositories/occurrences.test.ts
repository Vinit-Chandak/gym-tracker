import { and, asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { backfillMultisport } from "@/db/backfill-multisport";
import { occurrenceEvents, occurrenceVersions, plannedOccurrences } from "@/db/schema";
import { seedLegacyAccount, type LegacyAccount } from "@/db/test/multisport-fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { AD_HOC_ORIGIN, plannedOrigin, reportedEffort } from "@/domain/activity";
import { nativeDistance } from "@/domain/activity-metrics";
import { createActivity } from "./activities";
import {
  claimOccurrence,
  ClaimLostError,
  getOccurrence,
  holdsClaim,
  occurrencesForSlot,
  OccurrenceNotFoundError,
  programmeOccurrences,
  reopenOccurrence,
  rescheduleOccurrence,
  skipOccurrence,
  standaloneOccurrencesOnDate,
  standaloneSchedule,
} from "./occurrences";

/**
 * AT-SCHED: every scheduled session answers for itself. Skipping one, moving one or missing
 * one does nothing to its neighbours, its day or another sport.
 */

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});
afterEach(async () => {
  await t.close();
});

async function seeded(email: string): Promise<LegacyAccount> {
  const user = await t.createAuthUser(email);
  const account = await seedLegacyAccount(t.db, user, { logPlannedRun: false, logAdHocRun: false });
  await backfillMultisport(t.db, { userId: account.userId });
  return account;
}

/** The migrated occurrences, in the order their planned runs were written. */
async function occurrences(userId: string) {
  return t.db
    .select({
      id: plannedOccurrences.id,
      revisionId: plannedOccurrences.currentRevisionId,
      scheduledOn: occurrenceVersions.scheduledOn,
    })
    .from(plannedOccurrences)
    .innerJoin(occurrenceVersions, eq(occurrenceVersions.id, plannedOccurrences.currentRevisionId))
    .where(eq(plannedOccurrences.userId, userId))
    .orderBy(asc(occurrenceVersions.scheduledOn));
}

const run = (origin = AD_HOC_ORIGIN) => ({
  submissionKey: crypto.randomUUID(),
  origin,
  actual: {
    sport: "running" as const,
    environment: "outdoor" as const,
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
  timeZoneSource: "profile_at_entry" as const,
  occurredOn: "2026-09-18",
  effort: reportedEffort(4),
  outcome: "logged" as const,
  title: null,
  notes: null,
});

describe("what is on a day", () => {
  /** The slot an occurrence belongs to, as the backfill and activation both key it. */
  async function slotOf(userId: string, occurrenceId: string) {
    const [row] = await t.db
      .select({
        familyId: plannedOccurrences.familyId,
        slotLineageId: plannedOccurrences.slotLineageId,
        cycleIndex: plannedOccurrences.cycleIndex,
      })
      .from(plannedOccurrences)
      .where(and(eq(plannedOccurrences.userId, userId), eq(plannedOccurrences.id, occurrenceId)));
    return {
      familyId: row!.familyId!,
      slotLineageId: row!.slotLineageId!,
      cycleIndex: row!.cycleIndex!,
    };
  }

  /** One session the athlete put on the calendar themselves, on the date given. */
  async function scheduleStandalone(userId: string, scheduledOn: string) {
    return withUser(t.db, userId, async (tx) => {
      const [occurrence] = await tx
        .insert(plannedOccurrences)
        .values({ userId, sport: "swimming", originalScheduledOn: scheduledOn })
        .returning({ id: plannedOccurrences.id });
      const [version] = await tx
        .insert(occurrenceVersions)
        .values({
          occurrenceId: occurrence!.id,
          userId,
          sport: "swimming",
          scheduledOn,
          schedulingZone: "Asia/Kolkata",
        })
        .returning({ id: occurrenceVersions.id });
      await tx
        .update(plannedOccurrences)
        .set({ currentRevisionId: version!.id })
        .where(eq(plannedOccurrences.id, occurrence!.id));
      return occurrence!.id;
    });
  }

  /**
   * TODAY-01: Today asks for the programme's work by where the sequence has got to, so a
   * date query must not hand it back as well. It did, and an athlete two days behind was
   * shown a run belonging to a day they had not reached — the programme dated every session
   * when the block was written, and only the strength half ever shifts.
   */
  it("keeps the programme's own sessions out of what is dated today", async () => {
    const account = await seeded("day@example.test");
    const all = await occurrences(account.userId);
    const first = all[0]!;
    const mine = await scheduleStandalone(account.userId, first.scheduledOn);

    const dated = await withUser(
      t.db,
      account.userId,
      (tx) => standaloneOccurrencesOnDate(tx, account.userId, first.scheduledOn),
      { readOnly: true },
    );
    expect(dated.map((occurrence) => occurrence.id)).toEqual([mine]);
    expect(dated.every((occurrence) => occurrence.familyId === null)).toBe(true);

    const later = await withUser(
      t.db,
      account.userId,
      (tx) => standaloneOccurrencesOnDate(tx, account.userId, "2026-09-30"),
      { readOnly: true },
    );
    expect(later).toEqual([]);
  });

  /** The programme's endurance is found by the role and cycle it belongs to, not by its date. */
  it("finds a programme session by its slot, wherever it has been moved to", async () => {
    const account = await seeded("slot@example.test");
    const all = await occurrences(account.userId);
    const first = all[0]!;
    const slot = await slotOf(account.userId, first.id);

    const found = await withUser(
      t.db,
      account.userId,
      (tx) => occurrencesForSlot(tx, account.userId, slot),
      { readOnly: true },
    );
    expect(found.map((occurrence) => occurrence.id)).toContain(first.id);

    // Moving it changes its date and nothing about which day of the cycle it answers for.
    await withUser(t.db, account.userId, (tx) =>
      rescheduleOccurrence(tx, account.userId, first.id, "2026-12-01"),
    );
    const afterMove = await withUser(
      t.db,
      account.userId,
      (tx) => occurrencesForSlot(tx, account.userId, slot),
      { readOnly: true },
    );
    expect(afterMove.map((occurrence) => occurrence.id)).toContain(first.id);
    expect(afterMove.find((occurrence) => occurrence.id === first.id)?.scheduledOn).toBe(
      "2026-12-01",
    );
  });

  it("reports a programme's sessions with what became of each", async () => {
    const account = await seeded("programme@example.test");
    const [row] = await t.db
      .select({ familyId: plannedOccurrences.familyId })
      .from(plannedOccurrences)
      .where(eq(plannedOccurrences.userId, account.userId))
      .limit(1);

    const listed = await withUser(
      t.db,
      account.userId,
      (tx) => programmeOccurrences(tx, account.userId, row!.familyId!),
      { readOnly: true },
    );

    expect(listed.length).toBeGreaterThan(0);
    // Nothing was logged in this fixture, so every session is still outstanding.
    expect(listed.every((occurrence) => occurrence.resolution.kind === "incomplete")).toBe(true);
    expect(listed.map((occurrence) => occurrence.scheduledOn)).toEqual(
      [...listed.map((occurrence) => occurrence.scheduledOn)].sort(),
    );
  });
});

describe("skipping and putting back", () => {
  /** AT-SCHED-04: one id, and only that id. */
  it("skips exactly one session", async () => {
    const account = await seeded("skip@example.test");
    const [first, second] = await occurrences(account.userId);

    await withUser(t.db, account.userId, (tx) => skipOccurrence(tx, account.userId, first!.id));

    const skipped = await withUser(t.db, account.userId, (tx) =>
      getOccurrence(tx, account.userId, first!.id),
    );
    expect(skipped!.resolution.kind).toBe("skipped");
    const neighbour = await withUser(t.db, account.userId, (tx) =>
      getOccurrence(tx, account.userId, second!.id),
    );
    expect(neighbour!.resolution.kind).toBe("incomplete");
  });

  it("restores the same session rather than making a second one", async () => {
    const account = await seeded("reopen@example.test");
    const [first] = await occurrences(account.userId);
    const before = (await occurrences(account.userId)).length;

    await withUser(t.db, account.userId, (tx) => skipOccurrence(tx, account.userId, first!.id));
    await withUser(t.db, account.userId, (tx) => reopenOccurrence(tx, account.userId, first!.id));

    const restored = await withUser(t.db, account.userId, (tx) =>
      getOccurrence(tx, account.userId, first!.id),
    );
    expect(restored!.resolution.kind).toBe("incomplete");
    expect(restored!.loggable).toBe(true);
    expect((await occurrences(account.userId)).length).toBe(before);
    const events = await t.db
      .select()
      .from(occurrenceEvents)
      .where(eq(occurrenceEvents.occurrenceId, first!.id));
    expect(events.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["skipped", "reopened"]),
    );
  });

  it("will not skip something already logged", async () => {
    const account = await seeded("logged@example.test");
    const [first] = await occurrences(account.userId);
    await withUser(t.db, account.userId, (tx) =>
      createActivity(tx, account.userId, run(plannedOrigin(first!.id, first!.revisionId!))),
    );

    await expect(
      withUser(t.db, account.userId, (tx) => skipOccurrence(tx, account.userId, first!.id)),
    ).rejects.toThrow(OccurrenceNotFoundError);
  });

  it("refuses to touch another athlete's session", async () => {
    const mine = await seeded("mine@example.test");
    const theirs = await seeded("theirs@example.test");
    const [first] = await occurrences(theirs.userId);

    await expect(
      withUser(t.db, mine.userId, (tx) => skipOccurrence(tx, mine.userId, first!.id)),
    ).rejects.toThrow(OccurrenceNotFoundError);
  });
});

describe("moving a session", () => {
  /** SCHED-03 and §7: the date changes, the programme position it counts against does not. */
  it("writes a new revision and keeps the original week", async () => {
    const account = await seeded("move@example.test");
    const [first, second] = await occurrences(account.userId);
    const before = await withUser(t.db, account.userId, (tx) =>
      getOccurrence(tx, account.userId, first!.id),
    );

    await withUser(t.db, account.userId, (tx) =>
      rescheduleOccurrence(tx, account.userId, first!.id, "2026-09-30"),
    );

    const moved = await withUser(t.db, account.userId, (tx) =>
      getOccurrence(tx, account.userId, first!.id),
    );
    expect(moved!.scheduledOn).toBe("2026-09-30");
    expect(moved!.revisionId).not.toBe(before!.revisionId);
    // Adherence still counts against where it was first placed.
    expect(moved!.originalScheduledOn).toBe(before!.originalScheduledOn);
    expect(moved!.originalWeekIndex).toBe(before!.originalWeekIndex);
    // The next session stayed exactly where it was.
    const neighbour = await withUser(t.db, account.userId, (tx) =>
      getOccurrence(tx, account.userId, second!.id),
    );
    expect(neighbour!.scheduledOn).toBe(second!.scheduledOn);
    // The prescription travelled with it, unchanged.
    expect(moved!.prescription?.sessionTargets).toEqual(before!.prescription?.sessionTargets);
  });

  it("keeps every earlier revision readable", async () => {
    const account = await seeded("history@example.test");
    const [first] = await occurrences(account.userId);
    await withUser(t.db, account.userId, (tx) =>
      rescheduleOccurrence(tx, account.userId, first!.id, "2026-10-01"),
    );

    const versions = await t.db
      .select()
      .from(occurrenceVersions)
      .where(
        and(
          eq(occurrenceVersions.userId, account.userId),
          eq(occurrenceVersions.occurrenceId, first!.id),
        ),
      );
    expect(versions).toHaveLength(2);
  });
});

describe("the edit claim", () => {
  /** AT-LIFE-08: a lease on the session, pinned to the revision on screen. */
  it("pins the revision and refuses a second holder while it lives", async () => {
    const account = await seeded("claim@example.test");
    const [first] = await occurrences(account.userId);

    const claim = await withUser(t.db, account.userId, (tx) =>
      claimOccurrence(tx, account.userId, first!.id),
    );
    expect(claim.pinnedRevisionId).toBe(first!.revisionId);
    await expect(
      withUser(t.db, account.userId, (tx) => claimOccurrence(tx, account.userId, first!.id)),
    ).rejects.toThrow(ClaimLostError);

    const held = await withUser(
      t.db,
      account.userId,
      (tx) => holdsClaim(tx, account.userId, first!.id, claim.draftToken),
      { readOnly: true },
    );
    expect(held).toBe(true);
  });

  it("rotates the token on a takeover, so the other tab cannot save with the old one", async () => {
    const account = await seeded("takeover@example.test");
    const [first] = await occurrences(account.userId);
    const first_claim = await withUser(t.db, account.userId, (tx) =>
      claimOccurrence(tx, account.userId, first!.id),
    );

    const taken = await withUser(t.db, account.userId, (tx) =>
      claimOccurrence(tx, account.userId, first!.id, { takeOver: true }),
    );

    expect(taken.draftToken).not.toBe(first_claim.draftToken);
    expect(
      await withUser(
        t.db,
        account.userId,
        (tx) => holdsClaim(tx, account.userId, first!.id, first_claim.draftToken),
        { readOnly: true },
      ),
    ).toBe(false);
  });

  it("lets an expired claim go rather than freezing the programme", async () => {
    const account = await seeded("expired@example.test");
    const [first] = await occurrences(account.userId);
    const stale = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await withUser(t.db, account.userId, (tx) =>
      claimOccurrence(tx, account.userId, first!.id, { now: stale }),
    );

    // An hour later the lease has lapsed and somebody else may take it.
    const fresh = await withUser(t.db, account.userId, (tx) =>
      claimOccurrence(tx, account.userId, first!.id),
    );
    expect(fresh.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("standalone scheduling", () => {
  /** AT-SCHED-12: it appears on its date and in its own view, and creates no programme. */
  it("splits into upcoming and earlier without touching the programme", async () => {
    const account = await seeded("standalone@example.test");
    const created = await withUser(t.db, account.userId, async (tx) => {
      const [occurrence] = await tx
        .insert(plannedOccurrences)
        .values({ userId: account.userId, sport: "swimming", originalScheduledOn: "2026-09-25" })
        .returning({ id: plannedOccurrences.id });
      const [version] = await tx
        .insert(occurrenceVersions)
        .values({
          occurrenceId: occurrence!.id,
          userId: account.userId,
          sport: "swimming",
          scheduledOn: "2026-09-25",
          schedulingZone: "Asia/Kolkata",
        })
        .returning({ id: occurrenceVersions.id });
      await tx
        .update(plannedOccurrences)
        .set({ currentRevisionId: version!.id })
        .where(eq(plannedOccurrences.id, occurrence!.id));
      return occurrence!.id;
    });

    const { upcoming, earlier } = await withUser(
      t.db,
      account.userId,
      (tx) => standaloneSchedule(tx, account.userId, "2026-09-20"),
      { readOnly: true },
    );
    expect(upcoming.map((occurrence) => occurrence.id)).toEqual([created]);
    expect(earlier).toEqual([]);
    // Programme sessions are not in this view: they belong to the programme.
    expect(upcoming.every((occurrence) => occurrence.familyId === null)).toBe(true);
  });
});
