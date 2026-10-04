import { asc, isNull } from "drizzle-orm";

import {
  assumedEquipmentTypes,
  equipmentCombinations,
  equipmentCombinationTypes,
  equipmentPresets,
  equipmentTypes,
  exerciseEquipmentRequirements,
  exerciseGuides,
  exerciseMedia,
  exercises,
  warmupProtocols,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { RequirementRef } from "@/domain/equipment-resolution";
import type { GymKind, WarmupDrill } from "@/domain/types";

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
  let pending: Promise<T> | null = null;
  const read: Loader<T> = async (db) => {
    if (entry && Date.now() - entry.readAt < REFERENCE_TTL_MS) return entry.value;
    if (pending) return pending;
    const request = Promise.resolve().then(() => load(db));
    pending = request;
    try {
      const value = await request;
      if (pending === request) entry = { value, readAt: Date.now() };
      return value;
    } finally {
      if (pending === request) pending = null;
    }
  };
  return Object.assign(read, {
    reset() {
      entry = null;
      pending = null;
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

/**
 * Every shared exercise's requirement groups (ADR 0041): a few hundred narrow rows, read once.
 * A user's own groups (a custom free-weight exercise) are read with their account's data.
 */
export const sharedRequirements = remembered<RequirementRef[]>((db) =>
  db
    .select({
      exerciseId: exerciseEquipmentRequirements.exerciseId,
      alternative: exerciseEquipmentRequirements.alternative,
      equipmentTypeId: exerciseEquipmentRequirements.equipmentTypeId,
      isPrimary: exerciseEquipmentRequirements.isPrimary,
    })
    .from(exerciseEquipmentRequirements)
    .where(isNull(exerciseEquipmentRequirements.userId)),
);

const sharedAssumedRows = remembered<{ gymKind: GymKind; equipmentTypeId: string }[]>((db) =>
  db.select().from(assumedEquipmentTypes),
);

/** What a kind of location is taken to have: the gym basics at a gym, nothing elsewhere. */
export async function assumedTypeIds(db: DbOrTx, kind: GymKind): Promise<Set<string>> {
  return new Set(
    (await sharedAssumedRows(db))
      .filter((row) => row.gymKind === kind)
      .map((row) => row.equipmentTypeId),
  );
}

/** Types that stand for no equipment at all: the floor. */
export async function freeTypeIds(db: DbOrTx): Promise<Set<string>> {
  return new Set(
    (await sharedEquipmentTypes(db)).filter((t) => t.slug === "bodyweight").map((t) => t.id),
  );
}

export type CombinationRow = typeof equipmentCombinations.$inferSelect & {
  /** Member types, the display type first. */
  typeIds: string[];
};

/** The combination machines, each with its types in order. */
export const sharedCombinations = remembered<CombinationRow[]>(async (db) => {
  const [rows, members] = await Promise.all([
    db.select().from(equipmentCombinations).orderBy(asc(equipmentCombinations.sortOrder)),
    db.select().from(equipmentCombinationTypes).orderBy(asc(equipmentCombinationTypes.position)),
  ]);
  return rows.map((row) => ({
    ...row,
    typeIds: members.filter((m) => m.combinationId === row.id).map((m) => m.equipmentTypeId),
  }));
});

export type PresetRow = typeof equipmentPresets.$inferSelect;

export const sharedPresets = remembered<PresetRow[]>((db) => db.select().from(equipmentPresets));

export type GuideRow = typeof exerciseGuides.$inferSelect;
export type MediaRow = typeof exerciseMedia.$inferSelect;

/** Every guide, drafts included; whoever shows one decides whether drafts may be seen. */
export const sharedGuides = remembered<GuideRow[]>((db) => db.select().from(exerciseGuides));

export const sharedMedia = remembered<MediaRow[]>((db) =>
  db.select().from(exerciseMedia).orderBy(asc(exerciseMedia.position)),
);

/** One guide and its demonstrations, as drafts allow: null and [] where there is none to show. */
export async function guidanceFor(
  db: DbOrTx,
  exerciseId: string,
  drafts: boolean,
): Promise<{ guide: GuideRow | null; media: MediaRow[] }> {
  const [guides, media] = await Promise.all([sharedGuides(db), sharedMedia(db)]);
  const guide = guides.find((g) => g.exerciseId === exerciseId) ?? null;
  return {
    guide: guide && (drafts || guide.status === "published") ? guide : null,
    media: media.filter((m) => m.exerciseId === exerciseId && (drafts || m.status === "approved")),
  };
}

/** An equipment type by slug, from the cached catalogue. */
export async function equipmentTypeBySlug(db: DbOrTx, slug: string) {
  return (await sharedEquipmentTypes(db)).find((t) => t.slug === slug) ?? null;
}

/** Forgets everything read so far. Tests that reseed the library call this. */
export function resetReferenceCache(): void {
  sharedEquipmentTypes.reset();
  sharedWarmupProtocols.reset();
  sharedExercises.reset();
  sharedRequirements.reset();
  sharedAssumedRows.reset();
  sharedCombinations.reset();
  sharedPresets.reset();
  sharedGuides.reset();
  sharedMedia.reset();
}
