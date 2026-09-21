import { and, asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  plannedOccurrences,
  profiles,
  programDays,
  programRuns,
  programSlotEvents,
  programs,
} from "@/db/schema";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";
import { seedReferenceData } from "@/db/seed/reference";
import { FIXTURE_START_DATE, seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { resetReferenceCache } from "@/server/queries/reference";
import { occurrencesForSlot } from "@/server/repositories/occurrences";
import {
  materialiseOccurrences,
  occurrencesFromBlueprint,
} from "@/server/repositories/program-occurrences";
import { getTodayPlan } from "@/server/repositories/schedule";

/**
 * What Today offers beside the day's workout, for the programme the defect was reported on.
 *
 * `Upper B` is the fifth day of the seeded eight-week hybrid and it does not run; the run the
 * athlete saw on its card belongs to `Easy Run + Light Upper`, the sixth. Both halves of the
 * screen were reading the same rows and disagreeing, because the only thing joining an
 * occurrence to a day was the weekday it falls on — and a weekday is shared. These drive the
 * query the page runs, not a paraphrase of it.
 */

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
  resetReferenceCache();
  await seedReferenceData(t.db);
  resetReferenceCache();
});
afterEach(async () => {
  await t.close();
});

const ZONE = "UTC";

async function account(email: string) {
  const user = await t.createAuthUser(email);
  const { programId } = await seedTestUserData(t.db, user);
  await t.db.update(profiles).set({ timeZone: ZONE }).where(eq(profiles.id, user.id));
  const [program] = await t.db
    .select({ familyId: programs.familyId })
    .from(programs)
    .where(eq(programs.id, programId));
  await materialise(user.id, programId, program!.familyId, STRENGTH_AESTHETICS_HYBRID_8WK, {
    transition: "new_block",
    today: FIXTURE_START_DATE,
  });
  return { userId: user.id, programId, familyId: program!.familyId };
}

async function materialise(
  userId: string,
  programId: string,
  familyId: string,
  blueprint: typeof STRENGTH_AESTHETICS_HYBRID_8WK,
  options: { transition: "new_block" | "continue"; today: string },
) {
  await materialiseOccurrences(t.db, userId, {
    programId,
    familyId,
    blueprint: occurrencesFromBlueprint(blueprint, {
      familyId,
      startDate: FIXTURE_START_DATE,
      schedulingTimeZone: ZONE,
    }),
    schedulingZone: ZONE,
    today: options.today,
    transition: options.transition,
  });
}

/** Answer everything up to and including cycle `through.cycle`, day `through.day`. */
async function answerThrough(
  userId: string,
  programId: string,
  through: { cycle: number; day: number },
) {
  const days = await t.db
    .select({ dayIndex: programDays.dayIndex, includesRun: programDays.includesRun })
    .from(programDays)
    .where(eq(programDays.programId, programId))
    .orderBy(asc(programDays.dayIndex));
  const rows: (typeof programSlotEvents.$inferInsert)[] = [];
  for (let cycleIndex = 1; cycleIndex <= through.cycle; cycleIndex++)
    for (const day of days) {
      if (cycleIndex === through.cycle && day.dayIndex > through.day) continue;
      for (const part of day.includesRun ? (["session", "run"] as const) : (["session"] as const))
        rows.push({
          userId,
          programId,
          cycleIndex,
          dayIndex: day.dayIndex,
          part,
          status: "completed",
          occurredOn: FIXTURE_START_DATE,
        });
    }
  await t.db.insert(programSlotEvents).values(rows);
}

/** Exactly what `today/page.tsx` asks for, through the same two calls in the same order. */
async function today(userId: string) {
  const plan = await getTodayPlan(t.db, userId, ZONE);
  const endurance =
    plan?.suggestion && plan.suggestedDay
      ? await occurrencesForSlot(t.db, userId, {
          familyId: plan.program.familyId,
          cycleDayIndex: plan.suggestedDay.dayIndex,
          cycleIndex: plan.suggestion.slot.cycleIndex,
        })
      : [];
  return { plan, endurance };
}

const minutes = (
  prescription: { sessionTargets: { durationMs: [number, number] | null } } | null,
) => prescription?.sessionTargets.durationMs?.map((ms) => ms / 60_000) ?? null;

describe("the programme's endurance on Today", () => {
  it("offers no run on a day of the cycle that does not run", async () => {
    const a = await account("upperb@example.test");
    await answerThrough(a.userId, a.programId, { cycle: 2, day: 4 });

    const { plan, endurance } = await today(a.userId);

    expect(plan?.suggestedDay?.name).toBe("Upper B");
    expect(plan?.suggestion?.slot).toEqual({ cycleIndex: 2, dayIndex: 5 });
    expect(plan?.behind).toBeGreaterThan(0);
    expect(endurance).toEqual([]);
  });

  it("offers the day's own run on a day that does run", async () => {
    const a = await account("runday@example.test");
    await answerThrough(a.userId, a.programId, { cycle: 2, day: 5 });

    const { plan, endurance } = await today(a.userId);

    expect(plan?.suggestedDay?.name).toBe("Easy Run + Light Upper");
    expect(endurance).toHaveLength(1);
    // Cycle 2 of the seeded block asks for a flat 30 minutes on this day.
    expect(minutes(endurance[0]!.prescription)).toEqual([30, 30]);
  });

  /**
   * The reported screen. `Upper B` falls on the same weekday as the running day, which the
   * programme is entitled to do — nothing about a lifting day's weekday has to differ from a
   * running day's, and a cycle longer than a week could not avoid it.
   */
  it("keeps a run off a lifting day that shares the running day's weekday", async () => {
    const a = await account("collide@example.test");
    const [upperB] = await t.db
      .select({ dayOfWeek: programDays.dayOfWeek })
      .from(programDays)
      .where(and(eq(programDays.programId, a.programId), eq(programDays.dayIndex, 5)));
    const [runDay] = await t.db
      .select({ dayOfWeek: programDays.dayOfWeek })
      .from(programDays)
      .where(and(eq(programDays.programId, a.programId), eq(programDays.dayIndex, 6)));
    const shared = upperB!.dayOfWeek!;
    await t.db
      .update(programDays)
      .set({ dayOfWeek: shared })
      .where(and(eq(programDays.programId, a.programId), eq(programDays.dayIndex, 6)));
    await t.db
      .update(programRuns)
      .set({ dayOfWeek: shared })
      .where(
        and(eq(programRuns.programId, a.programId), eq(programRuns.dayOfWeek, runDay!.dayOfWeek!)),
      );
    await materialise(
      a.userId,
      a.programId,
      a.familyId,
      {
        ...STRENGTH_AESTHETICS_HYBRID_8WK,
        days: STRENGTH_AESTHETICS_HYBRID_8WK.days.map((day) =>
          day.dayIndex === 6 ? { ...day, dayOfWeek: shared } : day,
        ),
        runs: STRENGTH_AESTHETICS_HYBRID_8WK.runs.map((run) =>
          run.dayOfWeek === runDay!.dayOfWeek ? { ...run, dayOfWeek: shared } : run,
        ),
      },
      { transition: "continue", today: FIXTURE_START_DATE },
    );
    await answerThrough(a.userId, a.programId, { cycle: 2, day: 4 });

    const { plan, endurance } = await today(a.userId);

    expect(plan?.suggestedDay?.name).toBe("Upper B");
    expect(plan?.suggestedDay?.includesRun).toBe(false);
    expect(endurance).toEqual([]);
  });

  /**
   * The other way the same card appeared. A revision that moves a run to another day of the
   * cycle used to leave the old occurrences behind whenever their dates had gone by, and an
   * athlete who is behind their programme is being offered slots whose dates have all gone by.
   */
  it("withdraws a run a revision moved away, however long ago it was due", async () => {
    const a = await account("stale@example.test");
    const [upperB] = await t.db
      .select({ dayOfWeek: programDays.dayOfWeek })
      .from(programDays)
      .where(and(eq(programDays.programId, a.programId), eq(programDays.dayIndex, 5)));
    // A version in which day 5 was the one that ran, materialised while it was still current.
    const moved = {
      ...STRENGTH_AESTHETICS_HYBRID_8WK,
      days: STRENGTH_AESTHETICS_HYBRID_8WK.days.map((day) =>
        day.dayIndex === 5
          ? { ...day, includesRun: true }
          : day.dayIndex === 6
            ? { ...day, includesRun: false }
            : day,
      ),
      runs: STRENGTH_AESTHETICS_HYBRID_8WK.runs.map((run) =>
        run.dayOfWeek === 7 ? { ...run, dayOfWeek: upperB!.dayOfWeek! } : run,
      ),
    };
    await materialise(a.userId, a.programId, a.familyId, moved, {
      transition: "continue",
      today: FIXTURE_START_DATE,
    });
    expect(
      await t.db
        .select({ id: plannedOccurrences.id })
        .from(plannedOccurrences)
        .where(
          and(eq(plannedOccurrences.userId, a.userId), eq(plannedOccurrences.cycleDayIndex, 5)),
        ),
    ).not.toHaveLength(0);

    // Weeks later the programme is put back, by which time those dates are all in the past.
    await materialise(a.userId, a.programId, a.familyId, STRENGTH_AESTHETICS_HYBRID_8WK, {
      transition: "continue",
      today: "2026-11-01",
    });
    await answerThrough(a.userId, a.programId, { cycle: 2, day: 4 });

    const { plan, endurance } = await today(a.userId);

    expect(plan?.suggestedDay?.name).toBe("Upper B");
    expect(endurance.filter((occurrence) => occurrence.disposition === "pending")).toEqual([]);
    const withdrawn = await t.db
      .select({ disposition: plannedOccurrences.disposition })
      .from(plannedOccurrences)
      .where(and(eq(plannedOccurrences.userId, a.userId), eq(plannedOccurrences.cycleDayIndex, 5)));
    expect(withdrawn.every((row) => row.disposition === "cancelled")).toBe(true);
  });

  it("leaves an occurrence somebody already answered exactly as they left it", async () => {
    const a = await account("answered@example.test");
    const [first] = await t.db
      .select({ id: plannedOccurrences.id })
      .from(plannedOccurrences)
      .where(eq(plannedOccurrences.userId, a.userId))
      .orderBy(asc(plannedOccurrences.cycleIndex))
      .limit(1);
    await t.db
      .update(plannedOccurrences)
      .set({ disposition: "skipped" })
      .where(eq(plannedOccurrences.id, first!.id));

    // A revision that drops every run entirely.
    await materialise(
      a.userId,
      a.programId,
      a.familyId,
      {
        ...STRENGTH_AESTHETICS_HYBRID_8WK,
        days: STRENGTH_AESTHETICS_HYBRID_8WK.days.map((day) => ({ ...day, includesRun: false })),
        runs: [],
      },
      { transition: "continue", today: "2026-11-01" },
    );

    const [after] = await t.db
      .select({ disposition: plannedOccurrences.disposition })
      .from(plannedOccurrences)
      .where(eq(plannedOccurrences.id, first!.id));
    expect(after!.disposition).toBe("skipped");
  });
});
