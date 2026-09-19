import { and, eq } from "drizzle-orm";

import { activities, multisportMigrationLinks, plannedOccurrences } from "@/db/schema";
import type { DbOrTx } from "@/db/types";

/**
 * Where an old link goes now (plan §3.2).
 *
 * The rule is the same for all of them: resolve the exact record the old URL named, through
 * the durable map the migration wrote, and send the athlete there. When it cannot be
 * resolved — deleted, foreign, or never mapped — the answer is that it is unavailable. It is
 * never the next unlogged plan, never the most recent run, never something plausible.
 */

/** The canonical activity a legacy run id refers to, if this account owns it. */
export async function activityForLegacyRun(
  tx: DbOrTx,
  userId: string,
  runId: string,
): Promise<string | null> {
  const [mapped] = await tx
    .select({ targetId: multisportMigrationLinks.targetId })
    .from(multisportMigrationLinks)
    .where(
      and(
        eq(multisportMigrationLinks.userId, userId),
        eq(multisportMigrationLinks.sourceKind, "runs"),
        eq(multisportMigrationLinks.sourceId, runId),
      ),
    )
    .limit(1);
  const candidate = mapped?.targetId ?? runId;
  const [activity] = await tx
    .select({ id: activities.id })
    .from(activities)
    .where(and(eq(activities.userId, userId), eq(activities.id, candidate)))
    .limit(1);
  return activity?.id ?? null;
}

/** The occurrence a legacy planned-run id refers to, if this account owns it. */
export async function occurrenceForLegacyPlannedRun(
  tx: DbOrTx,
  userId: string,
  programRunId: string,
): Promise<string | null> {
  const [occurrence] = await tx
    .select({ id: plannedOccurrences.id })
    .from(plannedOccurrences)
    .where(
      and(
        eq(plannedOccurrences.userId, userId),
        eq(plannedOccurrences.legacySource, `program_runs:${programRunId}`),
      ),
    )
    .limit(1);
  return occurrence?.id ?? null;
}

export const LEGACY_UNAVAILABLE =
  "That link points at something this account no longer has. Nothing was opened in its place.";
