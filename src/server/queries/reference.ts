import { asc, isNull } from "drizzle-orm";

import { equipmentTypes, exercises, warmupProtocols } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { WarmupDrill } from "@/domain/types";

/**
 * The shared library, read once per server instance and reused.
 *
 * Equipment types, warm-up protocols and the canonical exercises are the same rows for every
 * account and only change when a deploy re-seeds them, which also replaces every instance. The
 * time limit is a safety net for a seed run by hand against the live database.
 *
 * Callers get the same arrays back each time: treat them as read-only.
 */
const REFERENCE_TTL_MS = 10 * 60_000;

type Loader<T> = (db: DbOrTx) => Promise<T>;

function remembered<T>(load: Loader<T>): Loader<T> & { reset(): void } {
  let entry: { value: T; readAt: number } | null = null;
  const read: Loader<T> = async (db) => {
    if (entry && Date.now() - entry.readAt < REFERENCE_TTL_MS) return entry.value;
    const value = await load(db);
    entry = { value, readAt: Date.now() };
    return value;
  };
  return Object.assign(read, {
    reset() {
      entry = null;
    },
  });
}

export type EquipmentTypeRow = typeof equipmentTypes.$inferSelect;
export type WarmupProtocolRow = typeof warmupProtocols.$inferSelect;
export type ExerciseRow = typeof exercises.$inferSelect;

/** Every equipment type, in catalogue order. */
export const sharedEquipmentTypes = remembered<EquipmentTypeRow[]>((db) =>
  db.select().from(equipmentTypes).orderBy(asc(equipmentTypes.sortOrder), asc(equipmentTypes.name)),
);

export const sharedWarmupProtocols = remembered<WarmupProtocolRow[]>((db) =>
  db.select().from(warmupProtocols).orderBy(asc(warmupProtocols.slug)),
);

/** The canonical exercises (no owner), by name. A user's own exercises are read separately. */
export const sharedExercises = remembered<ExerciseRow[]>((db) =>
  db.select().from(exercises).where(isNull(exercises.userId)).orderBy(asc(exercises.name)),
);

export async function getWarmupProtocol(
  db: DbOrTx,
  id: string,
): Promise<{ name: string; drills: WarmupDrill[] } | null> {
  const protocol = (await sharedWarmupProtocols(db)).find((row) => row.id === id);
  return protocol ? { name: protocol.name, drills: protocol.drills } : null;
}

/** Equipment type names by id, for turning missing-equipment ids into words. */
export async function equipmentTypeNames(db: DbOrTx): Promise<Map<string, string>> {
  return new Map((await sharedEquipmentTypes(db)).map((row) => [row.id, row.name]));
}

/** Forgets everything read so far. Tests that reseed the library call this. */
export function resetReferenceCache(): void {
  sharedEquipmentTypes.reset();
  sharedWarmupProtocols.reset();
  sharedExercises.reset();
}
