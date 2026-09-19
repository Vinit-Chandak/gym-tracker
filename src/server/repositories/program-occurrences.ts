import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import {
  activities,
  occurrenceEvents,
  occurrenceVersions,
  plannedOccurrences,
  programFamilies,
  programRuns,
  programs,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { EndurancePrescription } from "@/domain/activity-prescription";
import { blueprintV1ToV2, type ProgramBlueprintV2 } from "@/domain/program-blueprint-v2";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { supersedeStalePlans } from "./coach-plans";

/**
 * Turning an approved programme into occurrences that exist (plan §§8.2 item 2, 10.2).
 *
 * The old model kept a planned run as a week and a weekday, which is a description rather
 * than an identity: two Wednesday runs collapse into one row, and moving one moves both. So
 * activation writes a real occurrence per planned endurance session, each with its own id and
 * its own immutable prescription revision. That is what lets a coach prepare exactly one of
 * them, what lets a log resolve exactly one of them, and what keeps a missed swim from
 * delaying anything else (SCHED-01/02, DATA-02).
 *
 * Strength is deliberately absent. Its sequence is projected by `domain/schedule.ts` from the
 * cycle and the events, it shifts when a day is missed, and nothing here competes with that
 * (plan §2.3). The backfill writes no strength occurrence either, for the same reason.
 *
 * A revision carries occurrences forward by lineage rather than recreating them. Work that is
 * completed, started or claimed is frozen: its prescription is what was actually on screen,
 * and a programme change months later does not get to rewrite what somebody already did
 * (SCHED-06, COACH-08).
 */

export type MaterialisedOccurrences = {
  created: number;
  revised: number;
  carried: number;
  cancelled: number;
  frozen: number;
};

const EMPTY: MaterialisedOccurrences = {
  created: 0,
  revised: 0,
  carried: 0,
  cancelled: 0,
  frozen: 0,
};

/** The programme family as a row, so a composite owner key has something to point at. */
async function ensureFamily(tx: DbOrTx, userId: string, familyId: string): Promise<void> {
  await tx
    .insert(programFamilies)
    .values({ id: familyId, userId })
    .onConflictDoNothing({ target: programFamilies.id });
}

/**
 * The lineage a weekday's endurance work belongs to, derived from the family so that two
 * versions of one programme agree without storing a second registry. Same derivation the
 * backfill uses, so a migrated programme and a freshly activated one produce the same ids.
 */
export function weekdayLineage(familyId: string, dayOfWeek: number): string {
  const hex = familyId.replace(/-/g, "");
  const tail = (Number.parseInt(hex.slice(-4), 16) ^ (dayOfWeek * 7919)) & 0xffff;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(
    20,
    28,
  )}${tail.toString(16).padStart(4, "0")}`;
}

/** An occurrence that already exists in this family, with what has become of it. */
type ExistingOccurrence = {
  id: string;
  slotLineageId: string | null;
  cycleIndex: number | null;
  disposition: string;
  currentRevisionId: string | null;
  scheduledOn: string | null;
  prescription: EndurancePrescription | null;
  /** The activity that answered it, if one did. */
  activityId: string | null;
};

async function existingOccurrences(
  tx: DbOrTx,
  userId: string,
  familyId: string,
): Promise<ExistingOccurrence[]> {
  const rows = await tx
    .select({
      id: plannedOccurrences.id,
      slotLineageId: plannedOccurrences.slotLineageId,
      cycleIndex: plannedOccurrences.cycleIndex,
      disposition: plannedOccurrences.disposition,
      currentRevisionId: plannedOccurrences.currentRevisionId,
      scheduledOn: occurrenceVersions.scheduledOn,
      prescription: occurrenceVersions.prescription,
      activityId: activities.id,
    })
    .from(plannedOccurrences)
    .leftJoin(
      occurrenceVersions,
      and(
        eq(occurrenceVersions.id, plannedOccurrences.currentRevisionId),
        eq(occurrenceVersions.userId, plannedOccurrences.userId),
      ),
    )
    .leftJoin(
      activities,
      and(
        eq(activities.occurrenceId, plannedOccurrences.id),
        eq(activities.userId, plannedOccurrences.userId),
      ),
    )
    .where(and(eq(plannedOccurrences.userId, userId), eq(plannedOccurrences.familyId, familyId)));
  return rows;
}

/**
 * Whether this occurrence's prescription may still be rewritten.
 *
 * Anything answered, abandoned or in the past is history. A revision may only change what has
 * not happened yet, which is the whole of COACH-08 in one predicate.
 */
function frozen(occurrence: ExistingOccurrence, today: string): boolean {
  if (occurrence.activityId !== null) return true;
  if (occurrence.disposition === "legacy_completed") return true;
  if (occurrence.scheduledOn !== null && occurrence.scheduledOn < today) return true;
  return false;
}

/** The occurrences a v2 blueprint asks for, keyed the way an existing row can be matched. */
function plannedKey(slotLineageId: string, weekIndex: number, orderIndex: number): string {
  return `${slotLineageId}:${weekIndex}:${orderIndex}`;
}

export type MaterialiseInput = {
  programId: string;
  familyId: string;
  /** The version the occurrences are approved by; revisions repoint to the new one. */
  blueprint: ProgramBlueprintV2;
  schedulingZone: string;
  /** The athlete's own today, in their zone. Everything before it is history. */
  today: string;
  /** A continuation keeps the family's existing occurrences; a new block starts fresh. */
  transition: "new_block" | "continue";
};

/**
 * Writes the occurrences an approved programme version asks for.
 *
 * Idempotent by construction: an occurrence is matched by lineage, week and order, so running
 * this twice against the same blueprint changes nothing. A prescription that actually differs
 * produces a new immutable revision and repoints the occurrence at it; one that does not is
 * left exactly as it was, which keeps `AT-SCHED-09`'s "unchanged ones preserved by exact
 * identity" true rather than approximately true.
 */
export async function materialiseOccurrences(
  tx: DbOrTx,
  userId: string,
  input: MaterialiseInput,
): Promise<MaterialisedOccurrences> {
  const counts = { ...EMPTY };
  await ensureFamily(tx, userId, input.familyId);
  const slotById = new Map(input.blueprint.enduranceSlots.map((slot) => [slot.lineageId, slot]));
  const planned = input.blueprint.occurrences
    .filter((occurrence) => slotById.has(occurrence.slotLineageId))
    .map((occurrence) => ({
      ...occurrence,
      sport: slotById.get(occurrence.slotLineageId)!.sport,
      prescription: occurrence.prescription ?? slotById.get(occurrence.slotLineageId)!.prescription,
    }));

  const existing =
    input.transition === "continue" ? await existingOccurrences(tx, userId, input.familyId) : [];
  const byKey = new Map<string, ExistingOccurrence>();
  for (const occurrence of existing) {
    if (occurrence.slotLineageId === null || occurrence.cycleIndex === null) continue;
    // Several rows can share a lineage and week when a day carries two of the same sport;
    // they are matched in the order they were written, which is the order they were planned.
    let index = 0;
    while (byKey.has(plannedKey(occurrence.slotLineageId, occurrence.cycleIndex, index))) index++;
    byKey.set(plannedKey(occurrence.slotLineageId, occurrence.cycleIndex, index), occurrence);
  }

  const seen = new Set<string>();
  const usedOrder = new Map<string, number>();
  for (const occurrence of planned) {
    const lineageWeek = `${occurrence.slotLineageId}:${occurrence.weekIndex}`;
    const ordinal = usedOrder.get(lineageWeek) ?? 0;
    usedOrder.set(lineageWeek, ordinal + 1);
    const key = plannedKey(occurrence.slotLineageId, occurrence.weekIndex, ordinal);
    const current = byKey.get(key);
    if (current) {
      seen.add(current.id);
      if (frozen(current, input.today)) {
        counts.frozen++;
        continue;
      }
      const unchanged =
        current.scheduledOn === occurrence.scheduledOn &&
        JSON.stringify(current.prescription) === JSON.stringify(occurrence.prescription);
      if (unchanged) {
        counts.carried++;
        continue;
      }
      const [revision] = await tx
        .insert(occurrenceVersions)
        .values({
          occurrenceId: current.id,
          userId,
          sport: occurrence.sport,
          programVersionId: input.programId,
          scheduledOn: occurrence.scheduledOn,
          schedulingZone: input.schedulingZone,
          scheduledLocalTime: occurrence.scheduledLocalTime,
          orderIndex: occurrence.orderIndex,
          prescription: occurrence.prescription,
        })
        .returning({ id: occurrenceVersions.id });
      await tx
        .update(plannedOccurrences)
        .set({ currentRevisionId: revision!.id, updatedAt: new Date() })
        .where(and(eq(plannedOccurrences.id, current.id), eq(plannedOccurrences.userId, userId)));
      await tx.insert(occurrenceEvents).values({
        userId,
        occurrenceId: current.id,
        kind: "revised",
        actor: "coach",
        source: `programs:${input.programId}`,
        occurredOn: occurrence.scheduledOn,
      });
      // A preparation written against the old revision describes a session the programme no
      // longer asks for, so it stops being the card the athlete is shown (§8.4).
      await supersedeStalePlans(tx, userId, current.id, revision!.id);
      counts.revised++;
      continue;
    }
    const [created] = await tx
      .insert(plannedOccurrences)
      .values({
        userId,
        sport: occurrence.sport,
        familyId: input.familyId,
        slotLineageId: occurrence.slotLineageId,
        cycleIndex: occurrence.weekIndex,
        disposition: "pending",
        originalWeekIndex: occurrence.weekIndex,
        originalScheduledOn: occurrence.scheduledOn,
      })
      .returning({ id: plannedOccurrences.id });
    const [revision] = await tx
      .insert(occurrenceVersions)
      .values({
        occurrenceId: created!.id,
        userId,
        sport: occurrence.sport,
        programVersionId: input.programId,
        scheduledOn: occurrence.scheduledOn,
        schedulingZone: input.schedulingZone,
        scheduledLocalTime: occurrence.scheduledLocalTime,
        orderIndex: occurrence.orderIndex,
        prescription: occurrence.prescription,
      })
      .returning({ id: occurrenceVersions.id });
    await tx
      .update(plannedOccurrences)
      .set({ currentRevisionId: revision!.id })
      .where(and(eq(plannedOccurrences.id, created!.id), eq(plannedOccurrences.userId, userId)));
    await tx.insert(occurrenceEvents).values({
      userId,
      occurrenceId: created!.id,
      kind: "created",
      actor: "coach",
      source: `programs:${input.programId}`,
      occurredOn: occurrence.scheduledOn,
    });
    counts.created++;
  }

  /**
   * Future work the new version no longer asks for is cancelled, not deleted.
   *
   * A cancelled occurrence is visibly withdrawn rather than silently gone: it keeps its
   * identity, its history and its place in the record, and adherence counts it apart from
   * work the athlete actually missed (§9.1). Anything already answered or already past is
   * left alone entirely.
   */
  for (const occurrence of existing) {
    if (seen.has(occurrence.id)) continue;
    if (occurrence.disposition !== "pending") continue;
    if (frozen(occurrence, input.today)) continue;
    await tx
      .update(plannedOccurrences)
      .set({ disposition: "cancelled", updatedAt: new Date() })
      .where(and(eq(plannedOccurrences.id, occurrence.id), eq(plannedOccurrences.userId, userId)));
    await tx.insert(occurrenceEvents).values({
      userId,
      occurrenceId: occurrence.id,
      kind: "cancelled",
      actor: "coach",
      source: `programs:${input.programId}`,
    });
    counts.cancelled++;
  }
  return counts;
}

/**
 * The v2 view of a v1 blueprint that has just been written to the programme tables.
 *
 * The conversion needs the dates a v1 blueprint does not carry, which is why it takes the
 * start date and the zone. Lineage is derived from the family rather than minted, so the same
 * Wednesday run keeps the same role across versions and across the migration.
 */
export function occurrencesFromBlueprint(
  blueprint: ProgramBlueprint,
  context: { familyId: string; startDate: string; schedulingTimeZone: string },
): ProgramBlueprintV2 {
  const { blueprint: v2, lineageByWeekday } = blueprintV1ToV2(blueprint, {
    startDate: context.startDate,
    schedulingTimeZone: context.schedulingTimeZone,
  });
  // Re-key the minted lineage onto the family's stable derivation, so a revision of the same
  // programme matches the occurrences the previous version wrote.
  const stable = new Map(
    [...lineageByWeekday.entries()].map(([dayOfWeek, minted]) => [
      minted,
      weekdayLineage(context.familyId, dayOfWeek),
    ]),
  );
  return {
    ...v2,
    enduranceSlots: v2.enduranceSlots.map((slot) => ({
      ...slot,
      lineageId: stable.get(slot.lineageId) ?? slot.lineageId,
    })),
    occurrences: v2.occurrences.map((occurrence) => ({
      ...occurrence,
      slotLineageId: stable.get(occurrence.slotLineageId) ?? occurrence.slotLineageId,
    })),
  };
}

/**
 * Occurrences that are still open on or after a date, for the daily preparation window.
 *
 * Deliberately not "everything outstanding": old incomplete endurance work is not prepared
 * again on its own, because nothing rolls forward and a Wednesday swim stays Wednesday's
 * until somebody reschedules it (TODAY-01, plan §8.2 item 4).
 */
export async function openOccurrencesBetween(
  tx: DbOrTx,
  userId: string,
  from: string,
  to: string,
): Promise<
  {
    id: string;
    sport: string;
    revisionId: string;
    scheduledOn: string;
    programVersionId: string | null;
    orderIndex: number;
  }[]
> {
  return tx
    .select({
      id: plannedOccurrences.id,
      sport: plannedOccurrences.sport,
      revisionId: occurrenceVersions.id,
      scheduledOn: occurrenceVersions.scheduledOn,
      programVersionId: occurrenceVersions.programVersionId,
      orderIndex: occurrenceVersions.orderIndex,
    })
    .from(plannedOccurrences)
    .innerJoin(
      occurrenceVersions,
      and(
        eq(occurrenceVersions.id, plannedOccurrences.currentRevisionId),
        eq(occurrenceVersions.userId, plannedOccurrences.userId),
      ),
    )
    .leftJoin(
      activities,
      and(
        eq(activities.occurrenceId, plannedOccurrences.id),
        eq(activities.userId, plannedOccurrences.userId),
      ),
    )
    .where(
      and(
        eq(plannedOccurrences.userId, userId),
        eq(plannedOccurrences.disposition, "pending"),
        isNull(activities.id),
        gte(occurrenceVersions.scheduledOn, from),
        sql`${occurrenceVersions.scheduledOn} <= ${to}`,
      ),
    )
    .orderBy(occurrenceVersions.scheduledOn, occurrenceVersions.orderIndex, plannedOccurrences.id);
}

/** Whether a programme still has planned runs the legacy adapter is the authority for. */
export async function hasLegacyProgramRuns(
  tx: DbOrTx,
  userId: string,
  programIds: readonly string[],
): Promise<boolean> {
  if (programIds.length === 0) return false;
  const [row] = await tx
    .select({ id: programRuns.id })
    .from(programRuns)
    .innerJoin(programs, eq(programs.id, programRuns.programId))
    .where(and(eq(programs.userId, userId), inArray(programRuns.programId, [...programIds])))
    .limit(1);
  return Boolean(row);
}
