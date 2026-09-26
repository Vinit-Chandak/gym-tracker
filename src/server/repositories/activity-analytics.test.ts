import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { activities, occurrenceVersions, plannedOccurrences } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { withUser } from "@/db/with-user";
import { AD_HOC_ORIGIN, reportedEffort, UNKNOWN_EFFORT } from "@/domain/activity";
import { nativeDistance } from "@/domain/activity-metrics";
import {
  decodeCursor,
  encodeCursor,
  InvalidCursorError,
  listActivityPage,
  readActivityTotals,
  readAdherence,
  readComparableBests,
  readWeeklyActivityVolume,
} from "./activity-analytics";
import { createActivity, type SaveActivityInput } from "./activities";

/**
 * AT-STAT: totals that are computed rather than sampled.
 *
 * The fixtures here deliberately exceed the old display caps, because the failure this guards
 * against is not arithmetic — it is a list limit quietly becoming a lifetime total. A total
 * over 240 rides has to be a total over 240 rides.
 */

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});
afterEach(async () => {
  await t.close();
});

async function athlete(email: string) {
  const user = await t.createAuthUser(email);
  return user.id;
}

const at = (date: string, hour = 6) => new Date(`${date}T0${hour}:00:00Z`);

function ride(
  date: string,
  overrides: {
    distanceKm?: number | null;
    durationMs?: number;
    environment?: "indoor" | "outdoor";
    assistance?: "unknown" | "unassisted" | "assisted";
    hour?: number;
  } = {},
): SaveActivityInput {
  return {
    submissionKey: crypto.randomUUID(),
    origin: AD_HOC_ORIGIN,
    actual: {
      sport: "cycling",
      environment: overrides.environment ?? "outdoor",
      durationMs: overrides.durationMs ?? 1_800_000,
      distance:
        overrides.distanceKm === null || overrides.distanceKm === undefined
          ? null
          : nativeDistance(overrides.distanceKm, "km"),
      assistance: overrides.assistance ?? "unassisted",
      resourceId: null,
      averagePowerWatts: null,
      averageCadenceRpm: null,
      averageHeartRate: null,
      maxHeartRate: null,
      elevationGainMetres: null,
    },
    startedAt: at(date, overrides.hour),
    recordedTimeZone: "UTC",
    timeZoneSource: "profile_at_entry",
    occurredOn: date,
    effort: reportedEffort(5),
    outcome: "logged",
    title: null,
    notes: null,
  };
}

function swim(
  date: string,
  overrides: { poolMetres?: number | null; lengths?: number; elapsedMs?: number } = {},
): SaveActivityInput {
  const usesLengths = overrides.lengths !== undefined && overrides.poolMetres != null;
  return {
    submissionKey: crypto.randomUUID(),
    origin: AD_HOC_ORIGIN,
    actual: {
      sport: "swimming",
      environment: overrides.poolMetres === null ? "open_water" : "pool",
      elapsedMs: overrides.elapsedMs ?? 1_500_000,
      activeMs: null,
      distanceMethod: usesLengths ? "lengths" : "unknown",
      distance: null,
      poolLength: usesLengths ? nativeDistance(overrides.poolMetres!, "m") : null,
      lengths: usesLengths ? overrides.lengths! : null,
      stroke: "freestyle",
      strokeCount: null,
      resourceId: null,
      averageHeartRate: null,
      maxHeartRate: null,
    },
    startedAt: at(date, 7),
    recordedTimeZone: "UTC",
    timeZoneSource: "profile_at_entry",
    occurredOn: date,
    effort: UNKNOWN_EFFORT,
    outcome: "logged",
    title: null,
    notes: null,
  };
}

const save = (userId: string, input: SaveActivityInput) =>
  withUser(t.db, userId, (tx) => createActivity(tx, userId, input));

describe("totals over the whole period", () => {
  /** AT-STAT-02: more rows than any display cap, and the total is still the total. */
  it("counts every ride, not the first page of them", async () => {
    const userId = await athlete("volume@example.test");
    for (let index = 0; index < 240; index++) {
      const day = String((index % 28) + 1).padStart(2, "0");
      await save(userId, ride(`2026-03-${day}`, { distanceKm: 10, hour: index % 9 }));
    }
    const totals = await withUser(t.db, userId, (tx) => readActivityTotals(tx, userId), {
      readOnly: true,
    });
    const cycling = totals.bySport.find((entry) => entry.sport === "cycling")!;
    expect(cycling.count).toBe(240);
    expect(cycling.distanceMetres).toBeCloseTo(240 * 10_000, 3);
    expect(cycling.days).toBe(28);
    expect(totals.coverage.complete).toBe(true);
  });

  /** AT-STAT-01: a day with two sports is one training day. */
  it("deduplicates a mixed day into one training day", async () => {
    const userId = await athlete("mixed@example.test");
    await save(userId, ride("2026-04-01", { distanceKm: 20 }));
    await save(userId, swim("2026-04-01", { poolMetres: 25, lengths: 16 }));
    const totals = await withUser(t.db, userId, (tx) => readActivityTotals(tx, userId), {
      readOnly: true,
    });
    expect(totals.activities).toBe(2);
    expect(totals.trainingDays).toBe(1);
    expect(totals.bySport.find((entry) => entry.sport === "cycling")?.days).toBe(1);
    expect(totals.bySport.find((entry) => entry.sport === "swimming")?.days).toBe(1);
  });

  /** AT-LOG-03 / §9.1: a ride with no distance counts, and says so. */
  it("counts a distanceless ride without inventing a distance for it", async () => {
    const userId = await athlete("unknown-distance@example.test");
    await save(userId, ride("2026-04-02", { distanceKm: null }));
    await save(userId, ride("2026-04-03", { distanceKm: 12 }));
    const cycling = (
      await withUser(t.db, userId, (tx) => readActivityTotals(tx, userId), { readOnly: true })
    ).bySport.find((entry) => entry.sport === "cycling")!;
    expect(cycling.count).toBe(2);
    expect(cycling.distanceMetres).toBeCloseTo(12_000, 3);
    expect(cycling.unknownDistances).toBe(1);
  });

  /** AT-LOG-04: an explicit zero stays zero and is not confused with unknown. */
  it("keeps an explicit zero distance apart from an unknown one", async () => {
    const userId = await athlete("zero-distance@example.test");
    await save(userId, ride("2026-04-04", { distanceKm: 0 }));
    const cycling = (
      await withUser(t.db, userId, (tx) => readActivityTotals(tx, userId), { readOnly: true })
    ).bySport.find((entry) => entry.sport === "cycling")!;
    expect(cycling.distanceMetres).toBe(0);
    expect(cycling.unknownDistances).toBe(0);
  });

  /** AT-STAT-05: reported, unconfirmed and unknown effort are three different answers. */
  it("reports effort provenance rather than an average", async () => {
    const userId = await athlete("effort@example.test");
    await save(userId, ride("2026-04-05", { distanceKm: 10 }));
    await save(userId, swim("2026-04-05", { poolMetres: 25, lengths: 8 }));
    const totals = await withUser(t.db, userId, (tx) => readActivityTotals(tx, userId), {
      readOnly: true,
    });
    expect(totals.bySport.find((entry) => entry.sport === "cycling")?.reportedEfforts).toBe(1);
    expect(totals.bySport.find((entry) => entry.sport === "swimming")?.unknownEfforts).toBe(1);
  });

  it("reads a bounded period without counting what falls outside it", async () => {
    const userId = await athlete("period@example.test");
    await save(userId, ride("2026-04-10", { distanceKm: 5 }));
    await save(userId, ride("2026-05-10", { distanceKm: 5 }));
    const totals = await withUser(
      t.db,
      userId,
      (tx) => readActivityTotals(tx, userId, { from: "2026-05-01", to: "2026-05-31" }),
      { readOnly: true },
    );
    expect(totals.activities).toBe(1);
    expect(totals.coverage).toMatchObject({ from: "2026-05-01", to: "2026-05-31" });
  });
});

describe("comparable bests", () => {
  /** AT-STAT-04: indoor and outdoor rides are not one another's records. */
  it("keeps indoor and outdoor rides in separate contexts", async () => {
    const userId = await athlete("contexts@example.test");
    await save(userId, ride("2026-04-11", { distanceKm: 40, environment: "outdoor" }));
    await save(userId, ride("2026-04-12", { distanceKm: 30, environment: "indoor" }));
    const bests = await withUser(t.db, userId, (tx) => readComparableBests(tx, userId), {
      readOnly: true,
    });
    const contexts = bests.filter((best) => best.sport === "cycling");
    expect(contexts).toHaveLength(2);
    expect(
      contexts.find((best) => best.context.startsWith("outdoor"))?.longestDistanceMetres,
    ).toBeCloseTo(40_000, 3);
    expect(
      contexts.find((best) => best.context.startsWith("indoor"))?.longestDistanceMetres,
    ).toBeCloseTo(30_000, 3);
  });

  /** AT-LOG-19: a ride whose assistance is unknown is not a performance claim. */
  it("excludes a ride with unknown assistance from bests but not from totals", async () => {
    const userId = await athlete("assistance@example.test");
    await save(userId, ride("2026-04-13", { distanceKm: 80, assistance: "unknown" }));
    const bests = await withUser(t.db, userId, (tx) => readComparableBests(tx, userId), {
      readOnly: true,
    });
    expect(bests.filter((best) => best.sport === "cycling")).toHaveLength(0);
    const totals = await withUser(t.db, userId, (tx) => readActivityTotals(tx, userId), {
      readOnly: true,
    });
    expect(totals.bySport.find((entry) => entry.sport === "cycling")?.count).toBe(1);
  });

  /** AT-STAT-04: a swim with no recorded pool length has no comparable context. */
  it("excludes a pool swim whose pool was not recorded", async () => {
    const userId = await athlete("pool@example.test");
    await save(userId, swim("2026-04-14"));
    const bests = await withUser(t.db, userId, (tx) => readComparableBests(tx, userId), {
      readOnly: true,
    });
    expect(bests.filter((best) => best.sport === "swimming")).toHaveLength(0);
  });

  /** AT-LOG-05: sixteen lengths of a 25 m pool is 400 m, and it is comparable. */
  it("compares pool swims of the same length", async () => {
    const userId = await athlete("lengths@example.test");
    await save(userId, swim("2026-04-15", { poolMetres: 25, lengths: 16 }));
    await save(userId, swim("2026-04-16", { poolMetres: 25, lengths: 24 }));
    const bests = await withUser(t.db, userId, (tx) => readComparableBests(tx, userId), {
      readOnly: true,
    });
    const pool = bests.filter((best) => best.sport === "swimming");
    expect(pool).toHaveLength(1);
    expect(pool[0]?.longestDistanceMetres).toBeCloseTo(600, 3);
    expect(pool[0]?.activityCount).toBe(2);
  });
});

describe("paging", () => {
  /** AT-API-04: two activities on one instant, and the page boundary keeps both. */
  it("pages by timestamp and id so a tie cannot drop a row", async () => {
    const userId = await athlete("cursor@example.test");
    for (let index = 0; index < 4; index++)
      await save(userId, {
        ...ride("2026-04-20", { distanceKm: index + 1 }),
        startedAt: at("2026-04-20"),
      });
    const first = await withUser(t.db, userId, (tx) => listActivityPage(tx, userId, { limit: 2 }), {
      readOnly: true,
    });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await withUser(
      t.db,
      userId,
      (tx) => listActivityPage(tx, userId, { limit: 2, cursor: first.nextCursor }),
      { readOnly: true },
    );
    const ids = [...first.items, ...second.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(4);
    expect(second.nextCursor).toBeNull();
  });

  it("refuses a cursor it did not issue", async () => {
    const userId = await athlete("bad-cursor@example.test");
    for (const cursor of [
      "not-a-cursor",
      "12:not-a-uuid",
      `12:${"-".repeat(36)}`,
      `9007199254740991:${userId}`,
    ]) {
      expect(decodeCursor(cursor)).toBeNull();
      await expect(
        withUser(t.db, userId, (tx) => listActivityPage(tx, userId, { cursor }), {
          readOnly: true,
        }),
      ).rejects.toThrow(InvalidCursorError);
    }
    const historic = { startedAt: new Date("1969-12-31T12:00:00Z"), id: userId };
    expect(decodeCursor(encodeCursor(historic))).toEqual(historic);
  });

  it("filters by sport without leaking the others", async () => {
    const userId = await athlete("filter@example.test");
    await save(userId, ride("2026-04-21", { distanceKm: 10 }));
    await save(userId, swim("2026-04-21", { poolMetres: 25, lengths: 8 }));
    const page = await withUser(
      t.db,
      userId,
      (tx) => listActivityPage(tx, userId, { sports: ["swimming"] }),
      { readOnly: true },
    );
    expect(page.items.map((item) => item.sport)).toEqual(["swimming"]);
  });

  /** AT-DATA-05: another athlete's history is not in this athlete's page. */
  it("never returns another athlete's activities", async () => {
    const mine = await athlete("mine@example.test");
    const theirs = await athlete("theirs@example.test");
    await save(theirs, ride("2026-04-22", { distanceKm: 10 }));
    const page = await withUser(t.db, mine, (tx) => listActivityPage(tx, mine), {
      readOnly: true,
    });
    expect(page.items).toHaveLength(0);
  });
});

describe("adherence", () => {
  /**
   * AT-STAT-06 / AT-SCHED-02: a late swim still answers the day it was scheduled for.
   *
   * The occurrence is written here by hand rather than through a programme, because what is
   * being checked is the counting rule and not the materialiser.
   */
  it("counts a late log against its original occurrence, per sport", async () => {
    const userId = await athlete("adherence@example.test");
    const { occurrenceId, revisionId } = await withUser(t.db, userId, async (tx) => {
      const [occurrence] = await tx
        .insert(plannedOccurrences)
        .values({ userId, sport: "swimming", disposition: "pending" })
        .returning({ id: plannedOccurrences.id });
      const [revision] = await tx
        .insert(occurrenceVersions)
        .values({
          occurrenceId: occurrence!.id,
          userId,
          sport: "swimming",
          scheduledOn: "2026-05-06",
          schedulingZone: "UTC",
        })
        .returning({ id: occurrenceVersions.id });
      await tx
        .update(plannedOccurrences)
        .set({ currentRevisionId: revision!.id })
        .where(eq(plannedOccurrences.id, occurrence!.id));
      return { occurrenceId: occurrence!.id, revisionId: revision!.id };
    });

    // Wednesday's swim, logged on the Friday.
    await save(userId, {
      ...swim("2026-05-08", { poolMetres: 25, lengths: 16 }),
      origin: {
        kind: "planned",
        occurrenceId,
        performedRevisionId: revisionId,
        performedPlanId: null,
      },
    });

    const adherence = await withUser(t.db, userId, (tx) => readAdherence(tx, userId), {
      readOnly: true,
    });
    const swimming = adherence.find((entry) => entry.sport === "swimming");
    expect(swimming?.counts.logged).toBe(1);
    expect(swimming?.counts.incomplete).toBe(0);
    // Strength is untouched: it has no occurrences and therefore no adherence row.
    expect(adherence.find((entry) => entry.sport === "strength")).toBeUndefined();

    const stored = await t.db
      .select({ occurredOn: activities.occurredOn })
      .from(activities)
      .where(eq(activities.userId, userId));
    // The actual date is the Friday. Adherence is the Wednesday. Both are true at once.
    expect(stored[0]?.occurredOn).toBe("2026-05-08");
  });
});

describe("weekly volume", () => {
  it("groups recorded time by local week and sport", async () => {
    const userId = await athlete("weekly@example.test");
    await save(userId, ride("2026-06-01", { distanceKm: 10, durationMs: 1_200_000 }));
    await save(userId, ride("2026-06-03", { distanceKm: 15, durationMs: 1_800_000 }));
    await save(userId, ride("2026-06-09", { distanceKm: 20, durationMs: 2_400_000 }));
    const weeks = await withUser(
      t.db,
      userId,
      (tx) => readWeeklyActivityVolume(tx, userId, { from: "2026-06-01", to: "2026-06-30" }),
      { readOnly: true },
    );
    expect(weeks).toHaveLength(2);
    expect(weeks[0]?.count).toBe(2);
    expect(weeks[0]?.durationMs).toBe(3_000_000);
    expect(weeks[1]?.count).toBe(1);
  });
});
