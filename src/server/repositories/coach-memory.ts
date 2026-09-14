import { and, eq, inArray } from "drizzle-orm";
import {
  coachAttachments,
  coachIntakes,
  coachJobs,
  coachMemos,
  dailyRecovery,
  runs,
  workoutExercises,
  workoutSessions,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import {
  evidenceIdSchema,
  memoryOverview,
  memoryPatchSchema,
  mergeMemory,
  type MemoryItem,
} from "@/domain/coach-memory";
import { CoachingError } from "./coaching-state";

/** Verify provenance within this account, including when a supporting record was removed. */
export async function existingEvidenceIds(db: DbOrTx, userId: string, input: readonly string[]) {
  const idsFor = (prefix: string) =>
    input
      .filter((id) => id.startsWith(prefix + ":") && evidenceIdSchema.safeParse(id).success)
      .map((id) => id.slice(prefix.length + 1));
  const groups = [
    ["workout", workoutSessions],
    ["exercise", workoutExercises],
    ["run", runs],
    ["recovery", dailyRecovery],
    ["attachment", coachAttachments],
    ["intake", coachIntakes],
    ["job", coachJobs],
  ] as const;
  const records = await Promise.all(
    groups.map(async ([prefix, table]) => {
      const ids = idsFor(prefix);
      if (!ids.length) return [];
      const rows = await db
        .select({ id: table.id })
        .from(table)
        .where(and(eq(table.userId, userId), inArray(table.id, ids)));
      return rows.map((row) => `${prefix}:${row.id}`);
    }),
  );
  return new Set(records.flat());
}

export async function readCoachMemory(db: DbOrTx, userId: string, now = new Date()) {
  const [row] = await db.select().from(coachMemos).where(eq(coachMemos.userId, userId)).limit(1);
  const items = row?.items ?? [];
  const valid = await existingEvidenceIds(
    db,
    userId,
    items.flatMap((item) => item.sourceIds),
  );
  const today = now.toISOString().slice(0, 10);
  const active = items.filter(
    (item) =>
      item.origin === "athlete" ||
      (item.sourceIds.length > 0 &&
        item.sourceIds.every((id) => valid.has(id)) &&
        (!item.reviewAfter || item.reviewAfter > today)),
  );
  return {
    overview: items.length ? memoryOverview(active) : (row?.overview ?? ""),
    legacyOverview: items.length ? "" : (row?.overview ?? ""),
    userNotes: row?.userNotes ?? "",
    overviewUpdatedAt: row?.overviewUpdatedAt ?? null,
    items: active,
    reviewDueItems: items.filter((item) => !active.includes(item)),
    memoryRevision: row?.memoryRevision ?? 0,
  };
}

export async function updateCoachMemory(
  db: DbOrTx,
  userId: string,
  raw: unknown,
  origin: MemoryItem["origin"],
  now = new Date(),
) {
  const patch = memoryPatchSchema.parse(raw);
  // Ensure a lockable row even for the first memo, then compare after acquiring the lock.
  await db.insert(coachMemos).values({ userId }).onConflictDoNothing();
  const [row] = await db
    .select()
    .from(coachMemos)
    .where(eq(coachMemos.userId, userId))
    .for("update");
  if (!row || row.memoryRevision !== patch.expectedRevision)
    throw new CoachingError("The memo changed. Read it again before saving.", 409);
  const valid = await existingEvidenceIds(
    db,
    userId,
    patch.upsert.flatMap((item) => item.sourceIds),
  );
  let items: MemoryItem[];
  try {
    items = mergeMemory(row.items, patch, origin, valid, now);
  } catch (error) {
    throw new CoachingError(error instanceof Error ? error.message : "Invalid memo update.", 422);
  }
  await db
    .update(coachMemos)
    .set({
      items,
      overview: memoryOverview(items),
      overviewUpdatedAt: now,
      memoryRevision: row.memoryRevision + 1,
    })
    .where(eq(coachMemos.id, row.id));
  return { items, memoryRevision: row.memoryRevision + 1 };
}
