import { and, eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { profiles, programDays, programRuns, programs } from "@/db/schema";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";
import { seedReferenceData } from "@/db/seed/reference";
import { FIXTURE_START_DATE, seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { resetReferenceCache } from "@/server/queries/reference";
import {
  materialiseOccurrences,
  occurrencesFromBlueprint,
} from "@/server/repositories/program-occurrences";

import { auditProgrammeSchedules, formatAudit } from "./programme-schedule-audit";

/**
 * The audit is what somebody runs against a real database when a run turns up on the wrong
 * day, so it has to survive a real one — and say something true about a healthy programme as
 * readily as about a broken one.
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
  await materialiseOccurrences(t.db, user.id, {
    programId,
    familyId: program!.familyId,
    blueprint: occurrencesFromBlueprint(STRENGTH_AESTHETICS_HYBRID_8WK, {
      familyId: program!.familyId,
      startDate: FIXTURE_START_DATE,
      schedulingTimeZone: ZONE,
    }),
    schedulingZone: ZONE,
    today: FIXTURE_START_DATE,
    transition: "new_block",
  });
  return { userId: user.id, programId, familyId: program!.familyId };
}

describe("the programme schedule audit", () => {
  it("reports a healthy programme with every run on the day that runs", async () => {
    const a = await account("healthy@example.test");

    const audit = await auditProgrammeSchedules(t.db, { userId: a.userId });

    expect(audit.programmes).toHaveLength(1);
    const [programme] = audit.programmes;
    expect(programme!.days.map((day) => day.dayIndex)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(
      programme!.slots.filter((slot) => slot.cycleDayIndex !== null).map((s) => s.cycleDayIndex),
    ).toEqual([3, 6]);
    expect(programme!.findings).toEqual([]);
    expect(audit.orphanedFamilies).toBe(0);
    // Work that is open and past due is ordinary for an athlete who is behind: counted
    // beside its slot, never reported as a fault.
    expect(programme!.slots.some((slot) => slot.overdue > 0)).toBe(true);
    // The report is text somebody pastes into a thread, so it has to render.
    expect(formatAudit(audit)).toContain("findings: none");
  });

  it("names a lifting day that shares the running day's weekday", async () => {
    const a = await account("collide@example.test");
    const [upperB] = await t.db
      .select({ dayOfWeek: programDays.dayOfWeek })
      .from(programDays)
      .where(and(eq(programDays.programId, a.programId), eq(programDays.dayIndex, 5)));
    await t.db
      .update(programDays)
      .set({ dayOfWeek: upperB!.dayOfWeek })
      .where(and(eq(programDays.programId, a.programId), eq(programDays.dayIndex, 6)));
    await t.db
      .update(programRuns)
      .set({ dayOfWeek: upperB!.dayOfWeek! })
      .where(and(eq(programRuns.programId, a.programId), eq(programRuns.dayOfWeek, 7)));

    const audit = await auditProgrammeSchedules(t.db, { userId: a.userId });

    expect(audit.programmes[0]!.findings.join(" ")).toMatch(
      /shared by a running day and a day that does not run/,
    );
  });

  it("names endurance work that belongs to no slot of the cycle", async () => {
    const a = await account("unattached@example.test");
    // The shape a legacy weekday with no running day leaves behind.
    await t.db.execute(
      sql`update planned_occurrences set cycle_day_index = null where user_id = ${a.userId}`,
    );

    const audit = await auditProgrammeSchedules(t.db, { userId: a.userId });

    expect(audit.programmes[0]!.findings.join(" ")).toMatch(/belong to no slot of the cycle/);
  });

  it("says nothing about another athlete", async () => {
    const mine = await account("mine@example.test");
    await account("theirs@example.test");

    const audit = await auditProgrammeSchedules(t.db, { userId: mine.userId });

    expect(audit.programmes).toHaveLength(1);
    expect(audit.programmes[0]!.familyId).toBe(mine.familyId);
  });
});
