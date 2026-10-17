import { and, eq, isNotNull, lt, or } from "drizzle-orm";
import { activities, occurrenceVersions, plannedOccurrences } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { enduranceIdentityWeek } from "@/domain/programme-sport";

/** An approval may change future prescriptions, never what was due or already performed. */
export async function keepEnduranceHistory(
  db: DbOrTx,
  userId: string,
  familyId: string,
  today: string,
  base: ProgramBlueprint,
  proposed: ProgramBlueprint,
): Promise<ProgramBlueprint> {
  if (!base.enduranceSessions?.length) return proposed;
  const rows = await db
    .select({ lineageId: plannedOccurrences.slotLineageId, week: plannedOccurrences.cycleIndex })
    .from(plannedOccurrences)
    .innerJoin(occurrenceVersions, eq(occurrenceVersions.id, plannedOccurrences.currentRevisionId))
    .leftJoin(activities, eq(activities.occurrenceId, plannedOccurrences.id))
    .where(
      and(
        eq(plannedOccurrences.userId, userId),
        eq(plannedOccurrences.familyId, familyId),
        or(
          lt(occurrenceVersions.scheduledOn, today),
          isNotNull(activities.id),
          eq(plannedOccurrences.disposition, "legacy_completed"),
        ),
      ),
    );
  const frozen = new Set(rows.map((row) => `${row.lineageId}:${row.week}`));
  const key = (session: NonNullable<ProgramBlueprint["enduranceSessions"]>[number]) =>
    `${session.lineageId}:${enduranceIdentityWeek(session)}`;
  return {
    ...proposed,
    enduranceSessions: [
      ...(proposed.enduranceSessions ?? []).filter((session) => !frozen.has(key(session))),
      ...base.enduranceSessions.filter((session) => frozen.has(key(session))),
    ].sort((a, b) => a.dayOffset - b.dayOffset),
  };
}
