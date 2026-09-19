import { and, asc, eq, isNull } from "drizzle-orm";

import { activityResources } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { ActivityResourceKind } from "@/domain/activity";
import { toMetres, type PoolUnit } from "@/lib/distance-units";

/**
 * The pool, the bike, the trainer, the lake (DATA-03).
 *
 * Owned, private, and independent of gyms: a swimmer needs a pool length, not a gym record.
 * A log takes its own snapshot of whatever it used, so renaming or archiving a resource later
 * never rewrites what was actually measured on the day.
 */

export type ActivityResource = {
  id: string;
  kind: ActivityResourceKind;
  name: string;
  poolLengthNative: number | null;
  poolLengthUnit: PoolUnit | null;
  poolLengthMetres: number | null;
  isDefault: boolean;
  archivedAt: Date | null;
};

export async function listResources(
  tx: DbOrTx,
  userId: string,
  options: { kind?: ActivityResourceKind; includeArchived?: boolean } = {},
): Promise<ActivityResource[]> {
  const where = [eq(activityResources.userId, userId)];
  if (options.kind) where.push(eq(activityResources.kind, options.kind));
  if (!options.includeArchived) where.push(isNull(activityResources.archivedAt));
  const rows = await tx
    .select()
    .from(activityResources)
    .where(and(...where))
    .orderBy(asc(activityResources.kind), asc(activityResources.name));
  return rows as ActivityResource[];
}

export async function createResource(
  tx: DbOrTx,
  userId: string,
  input: {
    kind: ActivityResourceKind;
    name: string;
    poolLength?: { value: number; unit: PoolUnit } | null;
    isDefault?: boolean;
  },
): Promise<{ id: string }> {
  const pool = input.poolLength ?? null;
  const [row] = await tx
    .insert(activityResources)
    .values({
      userId,
      kind: input.kind,
      name: input.name,
      poolLengthNative: pool?.value ?? null,
      poolLengthUnit: pool?.unit ?? null,
      poolLengthMetres: pool ? toMetres(pool.value, pool.unit) : null,
      isDefault: input.isDefault ?? false,
    })
    .returning({ id: activityResources.id });
  return { id: row!.id };
}

/** Archived, not deleted: history refers to it, and a snapshot is not a substitute for it. */
export async function archiveResource(
  tx: DbOrTx,
  userId: string,
  resourceId: string,
): Promise<void> {
  await tx
    .update(activityResources)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(activityResources.userId, userId), eq(activityResources.id, resourceId)));
}
