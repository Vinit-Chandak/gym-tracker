import { readFile } from "node:fs/promises";

import { and, asc, eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { occurrenceVersions, plannedOccurrences, profiles, programs } from "@/db/schema";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";
import { seedReferenceData } from "@/db/seed/reference";
import { FIXTURE_START_DATE, seedTestUserData } from "@/db/test/fixtures";
import { createTestDatabase, type TestDatabase } from "@/db/test/pglite";
import { unattachedEnduranceLineage, cycleSlotLineage } from "@/domain/legacy-multisport";
import { resetReferenceCache } from "@/server/queries/reference";
import {
  materialiseOccurrences,
  occurrencesFromBlueprint,
} from "@/server/repositories/program-occurrences";

/**
 * Migration 0032, against rows in the shape the weekday derivation actually left behind.
 *
 * The migration has to reverse a hash nobody stored the input of, so it is run here as the
 * file itself writes it rather than as a paraphrase: the statements are read off disk. The
 * fixture is the programme the defect was reported on — seven days, runs on the third and
 * sixth — put back into its pre-migration shape and handed to the real SQL.
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

/** The data half of 0032: everything after the DDL the schema itself already carries. */
async function runBackfill(): Promise<void> {
  const file = await readFile("src/db/migrations/0032_cycle_day_index.sql", "utf8");
  const statements = file
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => !/^(--[^\n]*\n)*\s*ALTER TABLE|^(--[^\n]*\n)*\s*CREATE INDEX/.test(statement));
  for (const statement of statements) await t.client.exec(statement);
}

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

/** The keys as they stood before the migration: no slot, and a lineage per ISO weekday. */
async function asWeekdayKeyed(userId: string): Promise<void> {
  await t.db.execute(sql`
    update planned_occurrences o
    set cycle_day_index = null,
        slot_lineage_id = (
          select (
            substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-' || substr(h, 13, 4) || '-' ||
            substr(h, 17, 4) || '-' || substr(h, 21, 8) ||
            lpad(to_hex(((('x' || right(h, 4))::bit(16)::int) # (extract(isodow from v.scheduled_on)::int * 7919)) & 65535), 4, '0')
          )::uuid
          from (select replace(o.family_id::text, '-', '')) as s(h)
        )
    from occurrence_versions v
    where v.id = o.current_revision_id and o.user_id = ${userId}
  `);
}

async function slots(userId: string) {
  return t.db
    .select({
      cycleDayIndex: plannedOccurrences.cycleDayIndex,
      cycleIndex: plannedOccurrences.cycleIndex,
      lineage: plannedOccurrences.slotLineageId,
      scheduledOn: occurrenceVersions.scheduledOn,
    })
    .from(plannedOccurrences)
    .innerJoin(occurrenceVersions, eq(occurrenceVersions.id, plannedOccurrences.currentRevisionId))
    .where(eq(plannedOccurrences.userId, userId))
    .orderBy(asc(occurrenceVersions.scheduledOn));
}

describe("migration 0032", () => {
  it("places every weekday-keyed run on the slot of the cycle that runs", async () => {
    const a = await account("hybrid@example.test");
    await asWeekdayKeyed(a.userId);
    expect((await slots(a.userId)).every((row) => row.cycleDayIndex === null)).toBe(true);

    await runBackfill();

    // Day 3 "Easy Run + Arms" falls on weekday 4, day 6 "Easy Run + Light Upper" on weekday 7.
    const placed = await slots(a.userId);
    expect(placed).toHaveLength(16);
    expect(new Set(placed.map((row) => row.cycleDayIndex))).toEqual(new Set([3, 6]));
    for (const row of placed)
      expect(row.lineage).toBe(cycleSlotLineage(a.familyId, row.cycleDayIndex!));
  });

  it("leaves work whose weekday no running day falls on unattached, with its key intact", async () => {
    const a = await account("orphan@example.test");
    // A block that once ran on Upper B's weekday, and does not any more. Nothing in the
    // current cycle answers for it, so no slot may claim it.
    await t.db.execute(sql`
      update planned_occurrences o
      set cycle_day_index = null,
          slot_lineage_id = ${unattachedEnduranceLineage(a.familyId, 6)}::uuid
      where o.user_id = ${a.userId}
    `);

    await runBackfill();

    const after = await slots(a.userId);
    expect(after.every((row) => row.cycleDayIndex === null)).toBe(true);
    expect(after.every((row) => row.lineage === unattachedEnduranceLineage(a.familyId, 6))).toBe(
      true,
    );
  });

  it("is idempotent: a second run changes nothing", async () => {
    const a = await account("again@example.test");
    await asWeekdayKeyed(a.userId);
    await runBackfill();
    const once = await slots(a.userId);
    await runBackfill();
    expect(await slots(a.userId)).toEqual(once);
  });

  it("touches no other athlete's work", async () => {
    const mine = await account("mine@example.test");
    const theirs = await account("theirs@example.test");
    await asWeekdayKeyed(mine.userId);
    const before = await slots(theirs.userId);
    await runBackfill();
    expect(await slots(theirs.userId)).toEqual(before);
    expect((await slots(mine.userId)).every((row) => row.cycleDayIndex !== null)).toBe(true);
  });

  it("leaves standalone work alone, which has no family to key against", async () => {
    const a = await account("standalone@example.test");
    const [standalone] = await t.db
      .insert(plannedOccurrences)
      .values({ userId: a.userId, sport: "running", disposition: "pending" })
      .returning({ id: plannedOccurrences.id });

    await runBackfill();

    const [row] = await t.db
      .select({
        familyId: plannedOccurrences.familyId,
        cycleDayIndex: plannedOccurrences.cycleDayIndex,
        lineage: plannedOccurrences.slotLineageId,
      })
      .from(plannedOccurrences)
      .where(
        and(eq(plannedOccurrences.userId, a.userId), eq(plannedOccurrences.id, standalone!.id)),
      );
    expect(row).toEqual({ familyId: null, cycleDayIndex: null, lineage: null });
  });
});
