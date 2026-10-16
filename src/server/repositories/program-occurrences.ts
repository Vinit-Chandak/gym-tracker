import { and, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import {
  activities,
  occurrenceEvents,
  occurrenceVersions,
  plannedOccurrences,
  profiles,
  programFamilies,
  programRuns,
  programs,
} from "@/db/schema";
import type { Db, DbOrTx } from "@/db/types";
import type { EndurancePrescription } from "@/domain/activity-prescription";
import { jsonEqual } from "@/domain/json-equal";
import { cycleSlotLineage, unattachedEnduranceLineage } from "@/domain/legacy-multisport";
import { blueprintV1ToV2, type ProgramBlueprintV2 } from "@/domain/program-blueprint-v2";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { addDays, todayInTimeZone } from "@/domain/program-calendar";
import { nextPendingSlot, type SlotRef } from "@/domain/schedule";
import { supersedeStalePlans } from "./coach-plans";
import { readProgramBlueprint } from "./programs";
import { getSchedule } from "./schedule";

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
 * Each endurance programme owns its calendar dates. Today reads exactly today's occurrences;
 * a missed occurrence remains on its own date for retrospective logging. None of these rows
 * advances or blocks lifting. New dated programmes carry no `cycle_day_index`; legacy adapters
 * retain that field only to preserve older prescriptions and pre-split migration identity.
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

/** An occurrence that already exists in this family, with what has become of it. */
type ExistingOccurrence = {
  id: string;
  slotLineageId: string | null;
  cycleDayIndex: number | null;
  cycleIndex: number | null;
  disposition: string;
  currentRevisionId: string | null;
  scheduledOn: string | null;
  prescription: EndurancePrescription | null;
  /** The activity that answered it, if one did. */
  activityId: string | null;
  /** Whether the athlete has moved it to another date themselves. */
  movedByAthlete: boolean;
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
      cycleDayIndex: plannedOccurrences.cycleDayIndex,
      cycleIndex: plannedOccurrences.cycleIndex,
      disposition: plannedOccurrences.disposition,
      currentRevisionId: plannedOccurrences.currentRevisionId,
      scheduledOn: occurrenceVersions.scheduledOn,
      prescription: occurrenceVersions.prescription,
      activityId: activities.id,
      // Plain SQL on purpose: inside a select list Drizzle drops table qualifiers, and an
      // unqualified `id` in here would be the event's own (see listGyms).
      movedByAthlete: sql<boolean>`exists (
        select 1 from occurrence_events e
        where e.user_id = planned_occurrences.user_id
          and e.occurrence_id = planned_occurrences.id
          and e.kind = 'rescheduled'
          and e.actor = 'athlete'
      )`,
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

/** Whether one slot of the sequence comes before another. */
function slotBefore(slot: SlotRef, other: SlotRef): boolean {
  return (
    slot.cycleIndex < other.cycleIndex ||
    (slot.cycleIndex === other.cycleIndex && slot.dayIndex < other.dayIndex)
  );
}

/**
 * Whether this occurrence's prescription may still be rewritten.
 *
 * Anything answered, abandoned or already behind the athlete is history. A revision may only
 * change what has not happened yet, which is the whole of COACH-08 in one predicate.
 *
 * Dated endurance uses the calendar. A supplied position applies only to retained legacy
 * combined rows that still have a cycle day; the independent-sport migration clears that link.
 */
function frozen(
  occurrence: ExistingOccurrence,
  today: string,
  position: SlotRef | null | undefined,
): boolean {
  if (occurrence.activityId !== null) return true;
  if (occurrence.disposition === "legacy_completed") return true;
  // A skip is not history: logging it undoes it, and what it then asks for should be what the
  // current programme asks for, so a skipped occurrence the sequence has not left behind is
  // still revised.
  if (position !== undefined && occurrence.cycleIndex !== null && occurrence.cycleDayIndex !== null)
    return (
      position === null ||
      slotBefore(
        { cycleIndex: occurrence.cycleIndex, dayIndex: occurrence.cycleDayIndex },
        position,
      )
    );
  return occurrence.scheduledOn !== null && occurrence.scheduledOn < today;
}

/**
 * Whether somebody has already settled this occurrence.
 *
 * Deliberately not `frozen`. Being in the past freezes what an occurrence *says* — nobody
 * gets to rewrite a prescription somebody already trained against — but it settles nothing:
 * a run nobody ever logged or skipped is still owed however long ago it was scheduled for
 * (SCHED-04). Withdrawing work the programme no longer contains has to read this rather than
 * `frozen`, or a pending occurrence dated before today survives every revision that removes
 * it, for good, and the sequence hands it out again the next time it reaches that slot.
 */
function answered(occurrence: ExistingOccurrence): boolean {
  return occurrence.activityId !== null || occurrence.disposition !== "pending";
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
  /** The athlete's own today, in their zone. Work no slot owns is history before it. */
  today: string;
  /** A continuation keeps the family's existing occurrences; a new block starts fresh. */
  transition: "new_block" | "continue";
  /**
   * The slot the sequence has reached — the one Today offers — or null once nothing is left.
   * A slot's work before it is history whatever its date. Left out, the date decides.
   */
  position?: SlotRef | null;
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
      if (frozen(current, input.today, input.position)) {
        counts.frozen++;
        continue;
      }
      // A date the athlete moved it to is theirs. The blueprint only knows where the block
      // first put it, and writing that back undid the move and withdrew the preparation the
      // coach had written for it, over a change to some other day.
      const scheduledOn =
        current.movedByAthlete && current.scheduledOn !== null
          ? current.scheduledOn
          : occurrence.scheduledOn;
      // The stored prescription comes out of `jsonb`, which reorders an object's keys, and the
      // blueprint's comes out of the schema, which orders them as it declares them. Compared as
      // strings the two never matched, so every rescale wrote a fresh revision of an unchanged
      // session and superseded the preparation waiting on it. Compare the content (`jsonEqual`).
      const unchanged =
        current.scheduledOn === scheduledOn &&
        jsonEqual(current.prescription, occurrence.prescription);
      if (unchanged) {
        // The slot it belongs to is not part of what it asks for, so correcting one the
        // migration could not place is not a revision and writes no new version.
        if (current.cycleDayIndex !== occurrence.cycleDayIndex)
          await tx
            .update(plannedOccurrences)
            .set({ cycleDayIndex: occurrence.cycleDayIndex, updatedAt: new Date() })
            .where(
              and(eq(plannedOccurrences.id, current.id), eq(plannedOccurrences.userId, userId)),
            );
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
          scheduledOn,
          schedulingZone: input.schedulingZone,
          scheduledLocalTime: occurrence.scheduledLocalTime,
          orderIndex: occurrence.orderIndex,
          prescription: occurrence.prescription,
        })
        .returning({ id: occurrenceVersions.id });
      await tx
        .update(plannedOccurrences)
        .set({
          currentRevisionId: revision!.id,
          cycleDayIndex: occurrence.cycleDayIndex,
          updatedAt: new Date(),
        })
        .where(and(eq(plannedOccurrences.id, current.id), eq(plannedOccurrences.userId, userId)));
      await tx.insert(occurrenceEvents).values({
        userId,
        occurrenceId: current.id,
        kind: "revised",
        actor: "coach",
        source: `programs:${input.programId}`,
        occurredOn: scheduledOn,
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
        cycleDayIndex: occurrence.cycleDayIndex,
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
   * Work the new version no longer asks for is cancelled, not deleted.
   *
   * A cancelled occurrence is visibly withdrawn rather than silently gone: it keeps its
   * identity, its history and its place in the record, and adherence counts it apart from
   * work the athlete actually missed (§9.1). Anything somebody already settled is left alone
   * entirely — logged, skipped, resolved by the migration.
   *
   * What is *not* left alone is a pending occurrence dated before today. This used to skip
   * everything `frozen`, which counts the past as untouchable, and the past is exactly where
   * an abandoned occurrence ends up: an athlete behind their programme is being offered slots
   * whose original dates have gone by. Such a row survived every revision that removed it and
   * the sequence handed it out again on reaching its slot — a run from a block nobody trains
   * any more, unanswerable and permanent. Being late is not being answered (SCHED-04).
   */
  for (const occurrence of existing) {
    if (seen.has(occurrence.id)) continue;
    if (answered(occurrence)) continue;
    // A dated sport keeps past unanswered sessions available for retrospective logging.
    if (
      input.blueprint.strengthCycle === null &&
      occurrence.scheduledOn &&
      occurrence.scheduledOn < input.today
    )
      continue;
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
 * easy run keeps the same role across versions and across the migration.
 *
 * It is derived from the slot of the cycle the run belongs to. Work whose weekday answers to
 * no running day belongs to no slot, and keeps an identity in a namespace of its own so a
 * revision still carries it forward without any day ever claiming it.
 */
export function occurrencesFromBlueprint(
  blueprint: ProgramBlueprint,
  context: { familyId: string; startDate: string; schedulingTimeZone: string },
): ProgramBlueprintV2 {
  if (blueprint.enduranceSessions?.length) {
    const namedSessions = blueprint.enduranceSessions.map((session) => ({
      ...session,
      prescription: { ...session.prescription, title: session.name || session.prescription.title },
    }));
    const slots = new Map(
      namedSessions.map((session) => [
        session.lineageId,
        {
          lineageId: session.lineageId,
          sport: session.prescription.sport,
          name: session.name,
          prescription: session.prescription,
        },
      ]),
    );
    return {
      blueprintVersion: 2,
      slug: blueprint.slug,
      name: blueprint.name,
      notes: blueprint.notes,
      startDate: context.startDate,
      schedulingTimeZone: context.schedulingTimeZone,
      weeks: blueprint.weeks,
      strengthCycle: null,
      enduranceSlots: [...slots.values()],
      legacy: null,
      occurrences: namedSessions.map((session, index) => ({
        localId: `${session.lineageId}:${session.weekIndex}:${index}`,
        slotLineageId: session.lineageId,
        weekIndex: session.weekIndex,
        cycleDayIndex: null,
        scheduledOn: addDays(context.startDate, session.dayOffset),
        scheduledLocalTime: session.scheduledLocalTime,
        orderIndex: index,
        prescription: session.prescription,
      })),
    };
  }
  const {
    blueprint: v2,
    lineageByWeekday,
    cycleDayByWeekday,
  } = blueprintV1ToV2(blueprint, {
    startDate: context.startDate,
    schedulingTimeZone: context.schedulingTimeZone,
  });
  // Re-key the minted lineage onto the family's stable derivation, so a revision of the same
  // programme matches the occurrences the previous version wrote.
  const stable = new Map(
    [...lineageByWeekday.entries()].map(([dayOfWeek, minted]) => {
      const dayIndex = cycleDayByWeekday.get(dayOfWeek);
      return [
        minted,
        dayIndex === undefined
          ? unattachedEnduranceLineage(context.familyId, dayOfWeek)
          : cycleSlotLineage(context.familyId, dayIndex),
      ] as const;
    }),
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

/** The athlete's own zone, which the programme's dates are laid out in. */
async function schedulingZoneOf(tx: DbOrTx, userId: string): Promise<string> {
  const [athlete] = await tx
    .select({ timeZone: profiles.timeZone })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return athlete?.timeZone ?? "UTC";
}

/**
 * Writes the occurrences a programme version that has just been written asks for.
 *
 * Every way a programme comes to run goes through here — a template adopted, a draft approved,
 * a proposal applied — because the run half of a day that lifts and runs is answered only by
 * its occurrence. A version written without them asks for a run nothing can ever answer: the
 * template path once did exactly that, and every athlete who adopted it stopped for good on
 * its first running day.
 *
 * A continuation is placed by where the sequence has got to, read after the new version's
 * events are in, so a change reaches the run Today is about to offer however far behind the
 * calendar the athlete is.
 */
export async function materialiseProgramme(
  tx: DbOrTx,
  userId: string,
  input: {
    programId: string;
    familyId: string;
    blueprint: ProgramBlueprint;
    startDate: string;
    transition: "new_block" | "continue";
    now?: Date;
  },
): Promise<MaterialisedOccurrences> {
  const zone = await schedulingZoneOf(tx, userId);
  const schedule = input.transition === "continue" ? await getSchedule(tx, userId) : null;
  return materialiseOccurrences(tx, userId, {
    programId: input.programId,
    familyId: input.familyId,
    blueprint: occurrencesFromBlueprint(input.blueprint, {
      familyId: input.familyId,
      startDate: input.startDate,
      schedulingTimeZone: zone,
    }),
    schedulingZone: zone,
    today: todayInTimeZone(zone, input.now ?? new Date()),
    transition: input.transition,
    position:
      schedule && schedule.program.familyId === input.familyId
        ? nextPendingSlot(schedule.state)
        : undefined,
  });
}

/**
 * Repairs dated programmes that retained raw legacy runs but have no occurrences. Strength
 * is excluded: recreating its old raw runs would reintroduce the combined programme after the
 * sport split. Each repair is idempotent and isolated from the other programmes.
 */
export async function materialiseMissingOccurrences(
  db: Db,
): Promise<{ programmes: number; occurrences: number; failed: string[] }> {
  const stranded = await db
    .select({
      id: programs.id,
      userId: programs.userId,
      familyId: programs.familyId,
      startDate: programs.startDate,
    })
    .from(programs)
    .where(
      and(
        eq(programs.status, "active"),
        sql`${programs.sport} <> 'strength'`,
        isNotNull(programs.startDate),
        // Plain SQL, qualified by hand, so neither subquery's own columns can stand in.
        sql`exists (select 1 from program_runs r where r.program_id = programs.id)`,
        sql`not exists (
          select 1 from planned_occurrences o
          where o.user_id = programs.user_id and o.family_id = programs.family_id
        )`,
      ),
    );
  const summary = { programmes: 0, occurrences: 0, failed: [] as string[] };
  for (const programme of stranded) {
    try {
      const counts = await db.transaction(async (tx) => {
        const current = await readProgramBlueprint(tx, programme.userId, programme.id);
        if (!current) return null;
        return materialiseProgramme(tx, programme.userId, {
          programId: programme.id,
          familyId: programme.familyId,
          blueprint: current.blueprint,
          startDate: programme.startDate!,
          transition: "continue",
        });
      });
      if (!counts) continue;
      summary.programmes++;
      summary.occurrences += counts.created;
    } catch {
      summary.failed.push(programme.id);
    }
  }
  return summary;
}

/**
 * Withdraws what a programme the athlete has moved on from still had ahead of them.
 *
 * A new block is a new family, so nothing offers the old one's runs again, but they stayed
 * pending and adherence went on counting each as missed as its date went by. From today on
 * they are cancelled, the way a revision cancels work it drops (§9.1). What was due before
 * today and never answered stays as it is: that was missed while the programme still ran.
 */
export async function withdrawFamilyOccurrences(
  tx: DbOrTx,
  userId: string,
  familyId: string,
  source: string,
  now: Date = new Date(),
): Promise<number> {
  const today = todayInTimeZone(await schedulingZoneOf(tx, userId), now);
  const ahead = await tx
    .select({ id: plannedOccurrences.id })
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
        eq(plannedOccurrences.familyId, familyId),
        eq(plannedOccurrences.disposition, "pending"),
        isNull(activities.id),
        gte(occurrenceVersions.scheduledOn, today),
      ),
    );
  if (ahead.length === 0) return 0;
  const ids = ahead.map((row) => row.id);
  await tx
    .update(plannedOccurrences)
    .set({ disposition: "cancelled", updatedAt: new Date() })
    .where(and(eq(plannedOccurrences.userId, userId), inArray(plannedOccurrences.id, ids)));
  await tx.insert(occurrenceEvents).values(
    ids.map((occurrenceId) => ({
      userId,
      occurrenceId,
      kind: "cancelled" as const,
      actor: "athlete",
      source,
    })),
  );
  return ids.length;
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
    /** The programme lineage it belongs to; null for the athlete's own scheduled work. */
    familyId: string | null;
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
      familyId: plannedOccurrences.familyId,
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
