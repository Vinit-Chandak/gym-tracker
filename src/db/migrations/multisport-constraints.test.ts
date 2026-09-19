import { and, eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { backfillMultisport } from "@/db/backfill-multisport";
import {
  activities,
  activitySubmissionReceipts,
  cyclingActivityDetails,
  occurrenceVersions,
  plannedOccurrences,
  runningActivityDetails,
} from "@/db/schema";
import { seedLegacyAccount, type LegacyAccount } from "@/db/test/multisport-fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";

/**
 * AT-DATA-01 to AT-DATA-07: what the database refuses, whatever the code above it believes.
 *
 * Each case here is attempted the way an attacker or a bug would attempt it — straight at the
 * tables, bypassing the action — because a rule that only exists in a server action is a rule
 * that one forgotten call site can break.
 */

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});
afterEach(async () => {
  await t.close();
});

const activityValues = (userId: string, overrides: Record<string, unknown> = {}) => ({
  userId,
  sport: "running" as const,
  status: "completed" as const,
  outcome: "logged" as const,
  startedAt: new Date("2026-09-18T06:00:00Z"),
  recordedTimeZone: "Asia/Kolkata",
  timeZoneSource: "entered" as const,
  occurredOn: "2026-09-18",
  durationMs: 1_800_000,
  effortStatus: "reported" as const,
  effortValue: 5,
  sourceKind: "manual" as const,
  ...overrides,
});

const runningDetail = (activityId: string, userId: string, overrides: Record<string, unknown> = {}) => ({
  activityId,
  userId,
  sport: "running" as const,
  environment: "outdoor" as const,
  distanceMetres: 5000,
  distanceNativeValue: 5,
  distanceNativeUnit: "km" as const,
  ...overrides,
});

/** `tx.execute` is driver-generic; this reads one boolean column out of whatever it returns. */
function booleanResult(result: unknown): boolean | undefined {
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
  return (rows[0] as { value?: boolean } | undefined)?.value;
}

/** Drizzle wraps a driver error; the constraint that actually fired is underneath it. */
async function constraintFrom(work: Promise<unknown>): Promise<string | undefined> {
  try {
    await work;
    return undefined;
  } catch (error) {
    let current: unknown = error;
    while (current instanceof Error) {
      const name = (current as { constraint?: unknown }).constraint;
      if (typeof name === "string") return name;
      current = current.cause;
    }
    return "unknown";
  }
}

async function account(email: string): Promise<LegacyAccount> {
  const user = await t.createAuthUser(email);
  return seedLegacyAccount(t.db, user, { logPlannedRun: false, logAdHocRun: false, finishSession: false });
}

describe("one typed detail per activity", () => {
  it("accepts a parent and its detail written together", async () => {
    const owner = await account("pair@example.test");
    await t.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(activities)
        .values(activityValues(owner.userId))
        .returning({ id: activities.id });
      await tx.insert(runningActivityDetails).values(runningDetail(row!.id, owner.userId));
    });
    expect(await t.db.select().from(activities)).toHaveLength(1);
  });

  it("refuses a parent with no detail at all", async () => {
    const owner = await account("orphan@example.test");
    await expect(
      t.db.transaction(async (tx) => {
        await tx.insert(activities).values(activityValues(owner.userId));
      }),
    ).rejects.toThrow(/exactly one typed detail/);
    expect(await t.db.select().from(activities)).toHaveLength(0);
  });

  it("refuses two typed details for one parent", async () => {
    const owner = await account("two@example.test");
    await expect(
      t.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(activities)
          .values(activityValues(owner.userId, { sport: "cycling" }))
          .returning({ id: activities.id });
        await tx.insert(cyclingActivityDetails).values({
          activityId: row!.id,
          userId: owner.userId,
          sport: "cycling",
          environment: "indoor",
        });
        // The same parent cannot also be a run.
        await tx
          .insert(runningActivityDetails)
          .values(runningDetail(row!.id, owner.userId, { sport: "running" }));
      }),
    ).rejects.toThrow();
  });

  /** The composite key carries the sport, so a mismatched detail fails on the key itself. */
  it("refuses a running detail under a swimming parent", async () => {
    const owner = await account("mismatch@example.test");
    await expect(
      t.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(activities)
          .values(activityValues(owner.userId, { sport: "swimming" }))
          .returning({ id: activities.id });
        await tx.insert(runningActivityDetails).values(runningDetail(row!.id, owner.userId));
      }),
    ).rejects.toThrow();
  });

  it("refuses a detail whose owner is not the parent's owner", async () => {
    const owner = await account("owner@example.test");
    const stranger = await account("stranger@example.test");
    await expect(
      t.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(activities)
          .values(activityValues(owner.userId))
          .returning({ id: activities.id });
        await tx.insert(runningActivityDetails).values(runningDetail(row!.id, stranger.userId));
      }),
    ).rejects.toThrow();
  });
});

describe("what an activity may answer for", () => {
  it("refuses an occurrence and a revision that do not belong to each other", async () => {
    const owner = await account("origin@example.test");
    const full = await seedLegacyAccount(t.db, await t.createAuthUser("full@example.test"));
    await backfillMultisport(t.db, { userId: full.userId });
    const [theirs] = await t.db
      .select()
      .from(occurrenceVersions)
      .where(eq(occurrenceVersions.userId, full.userId))
      .limit(1);

    // Another account's occurrence, under this account's activity.
    await expect(
      t.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(activities)
          .values(
            activityValues(owner.userId, {
              occurrenceId: theirs!.occurrenceId,
              performedRevisionId: theirs!.id,
            }),
          )
          .returning({ id: activities.id });
        await tx.insert(runningActivityDetails).values(runningDetail(row!.id, owner.userId));
      }),
    ).rejects.toThrow();
  });

  it("refuses half a link", async () => {
    const owner = await account("half@example.test");
    const constraint = await constraintFrom(
      t.db
        .insert(activities)
        .values(activityValues(owner.userId, { occurrenceId: crypto.randomUUID() })),
    );
    expect(constraint).toBe("activities_origin_chk");
  });

  /** AT-SCHED-08 and AT-DATA-03: one occurrence, one actual, whatever races for it. */
  it("refuses a second activity for one occurrence", async () => {
    const full = await seedLegacyAccount(t.db, await t.createAuthUser("one@example.test"));
    await backfillMultisport(t.db, { userId: full.userId });
    // One the migration did not already resolve: only its first planned run was logged.
    const [occurrence] = await t.db
      .select()
      .from(plannedOccurrences)
      .where(
        and(
          eq(plannedOccurrences.userId, full.userId),
          sql`not exists (select 1 from public.activities a where a.occurrence_id = planned_occurrences.id)`,
        ),
      )
      .limit(1);
    const [revision] = await t.db
      .select()
      .from(occurrenceVersions)
      .where(eq(occurrenceVersions.occurrenceId, occurrence!.id))
      .limit(1);

    const write = () =>
      t.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(activities)
          .values(
            activityValues(full.userId, {
              occurrenceId: occurrence!.id,
              performedRevisionId: revision!.id,
            }),
          )
          .returning({ id: activities.id });
        await tx.insert(runningActivityDetails).values(runningDetail(row!.id, full.userId));
      });

    await write();
    expect(await constraintFrom(write())).toBe("activities_occurrence_uq");
    const logged = await t.db
      .select()
      .from(activities)
      .where(eq(activities.occurrenceId, occurrence!.id));
    expect(logged).toHaveLength(1);
  });

  it("keeps one submission key per owner", async () => {
    const owner = await account("receipt@example.test");
    const key = crypto.randomUUID();
    await t.db
      .insert(activitySubmissionReceipts)
      .values({ userId: owner.userId, submissionKey: key, payloadDigest: "abc", resultStatus: "created" });
    await expect(
      t.db
        .insert(activitySubmissionReceipts)
        .values({ userId: owner.userId, submissionKey: key, payloadDigest: "abc", resultStatus: "created" }),
    ).rejects.toThrow();
    // Another account may use the same key: it is scoped to its owner.
    const other = await account("receipt2@example.test");
    await expect(
      t.db
        .insert(activitySubmissionReceipts)
        .values({ userId: other.userId, submissionKey: key, payloadDigest: "abc", resultStatus: "created" }),
    ).resolves.toBeDefined();
  });
});

describe("row level security", () => {
  it("lets an owner write through a server transaction and read it back", async () => {
    const owner = await account("rls@example.test");
    const id = await withUser(t.db, owner.userId, async (tx) => {
      const [row] = await tx
        .insert(activities)
        .values(activityValues(owner.userId))
        .returning({ id: activities.id });
      await tx.insert(runningActivityDetails).values(runningDetail(row!.id, owner.userId));
      return row!.id;
    });
    const mine = await withUser(t.db, owner.userId, (tx) => tx.select().from(activities), {
      readOnly: true,
    });
    expect(mine.map((row) => row.id)).toEqual([id]);
  });

  it("shows an athlete nothing of another athlete's activities", async () => {
    const owner = await account("mine@example.test");
    const stranger = await account("theirs@example.test");
    await withUser(t.db, owner.userId, async (tx) => {
      const [row] = await tx
        .insert(activities)
        .values(activityValues(owner.userId))
        .returning({ id: activities.id });
      await tx.insert(runningActivityDetails).values(runningDetail(row!.id, owner.userId));
    });

    const seen = await withUser(t.db, stranger.userId, (tx) => tx.select().from(activities), {
      readOnly: true,
    });
    expect(seen).toEqual([]);
    const details = await withUser(
      t.db,
      stranger.userId,
      (tx) => tx.select().from(runningActivityDetails),
      { readOnly: true },
    );
    expect(details).toEqual([]);
  });

  it("refuses a row written into someone else's account", async () => {
    const owner = await account("victim@example.test");
    const stranger = await account("attacker@example.test");
    await expect(
      withUser(t.db, stranger.userId, (tx) =>
        tx.insert(activities).values(activityValues(owner.userId)),
      ),
    ).rejects.toThrow();
  });

  /** AT-DATA-07: the owner is necessary and not sufficient; a server write is also required. */
  it("refuses a direct write without the server-write marker", async () => {
    const owner = await account("marker@example.test");
    const values = activityValues(owner.userId);
    await expect(
      t.db.transaction(async (tx) => {
        // A browser holding the anon key: authenticated as the owner, but not a server write.
        await tx.execute(
          sql`select set_config('request.jwt.claim.sub', ${owner.userId}, true),
                   set_config('role', 'authenticated', true)`,
        );
        await tx.insert(activities).values(values);
      }),
    ).rejects.toThrow();
    expect(await t.db.select().from(activities)).toHaveLength(0);
  });

  it("never sets the marker on a read-only transaction", async () => {
    const owner = await account("readonly@example.test");
    const marker = await withUser(
      t.db,
      owner.userId,
      async (tx) => booleanResult(await tx.execute(sql`select public.server_write() as value`)),
      { readOnly: true },
    );
    expect(marker).toBe(false);
    const writing = await withUser(t.db, owner.userId, async (tx) =>
      booleanResult(await tx.execute(sql`select public.server_write() as value`)),
    );
    expect(writing).toBe(true);
  });

  it("does not leak the marker to the next transaction on the same connection", async () => {
    const owner = await account("leak@example.test");
    await withUser(t.db, owner.userId, async (tx) => {
      await tx.execute(sql`select 1`);
    });
    const after = await t.db.execute<{ value: boolean }>(sql`select public.server_write() as value`);
    expect(after.rows[0]?.value).toBe(false);
  });
});
