import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  coachAttachments,
  coachIntakes,
  coachJobs,
  coachMemos,
  coachNotes,
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
  validateMemoryQuote,
  type AthleteSource,
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
    ["note", coachNotes],
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

/** Only direct athlete text can support a reported preference or correction. */
async function athleteMemorySources(db: DbOrTx, userId: string, ids: readonly string[]) {
  const sources = new Map<string, AthleteSource>();
  const noteIds = ids.filter((id) => id.startsWith("note:")).map((id) => id.slice(5));
  const intakeIds = ids.filter((id) => id.startsWith("intake:")).map((id) => id.slice(7));
  if (noteIds.length) {
    const notes = await db
      .select()
      .from(coachNotes)
      .where(and(eq(coachNotes.userId, userId), inArray(coachNotes.id, noteIds)));
    for (const note of notes)
      sources.set(`note:${note.id}`, { text: note.text, createdAt: note.createdAt.toISOString() });
  }
  if (intakeIds.length) {
    const intakes = await db
      .select()
      .from(coachIntakes)
      .where(and(eq(coachIntakes.userId, userId), inArray(coachIntakes.id, intakeIds)));
    const textValues = (value: unknown): string[] =>
      typeof value === "string"
        ? [value]
        : value && typeof value === "object"
          ? Object.values(value).flatMap(textValues)
          : [];
    for (const intake of intakes)
      if (intake.confirmedAt)
        sources.set(`intake:${intake.id}`, {
          text: textValues(intake.answers).join("\n"),
          createdAt: intake.confirmedAt.toISOString(),
        });
  }
  return sources;
}

export async function readCoachNotes(db: DbOrTx, userId: string) {
  const [pending, recent] = await Promise.all([
    db
      .select()
      .from(coachNotes)
      .where(and(eq(coachNotes.userId, userId), isNull(coachNotes.reviewedAt)))
      .orderBy(asc(coachNotes.createdAt), asc(coachNotes.id))
      .limit(51),
    db
      .select()
      .from(coachNotes)
      .where(eq(coachNotes.userId, userId))
      .orderBy(desc(coachNotes.createdAt), desc(coachNotes.id))
      .limit(10),
  ]);
  return { pending: pending.slice(0, 50), hasMorePending: pending.length > 50, recent };
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
  const athleteSources = await athleteMemorySources(
    db,
    userId,
    items.flatMap((item) => item.sourceIds),
  );
  const active = items.filter((item) => {
    if (item.origin === "athlete") return true;
    if (
      !item.sourceIds.length ||
      item.sourceIds.some((id) => !valid.has(id)) ||
      (item.reviewAfter && item.reviewAfter <= today)
    )
      return false;
    if (item.status !== "reported") return true;
    if (!item.sourceQuote) return false;
    try {
      validateMemoryQuote(item.sourceQuote, athleteSources);
      return true;
    } catch {
      return false;
    }
  });
  return {
    overview: items.length ? memoryOverview(active) : (row?.overview ?? ""),
    legacyOverview: items.length ? "" : (row?.overview ?? ""),
    userNotes: row?.userNotes ?? "",
    notes: await readCoachNotes(db, userId),
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
  const athleteSources = await athleteMemorySources(db, userId, [
    ...row.items.flatMap((item) => item.sourceIds),
    ...patch.upsert.flatMap((item) => item.sourceIds),
    ...patch.corrections.map((correction) => correction.sourceId),
    ...patch.reviewedNoteIds.map((id) => `note:${id}`),
  ]);
  if (patch.reviewedNoteIds.some((id) => !athleteSources.has(`note:${id}`)))
    throw new CoachingError("Only mark this athlete's existing notes as reviewed.", 422);
  let items: MemoryItem[];
  try {
    items = mergeMemory(row.items, patch, origin, valid, now, athleteSources);
  } catch (error) {
    throw new CoachingError(error instanceof Error ? error.message : "Invalid memo update.", 422);
  }
  await db
    .update(coachMemos)
    .set({
      items,
      // A note acknowledgement alone must not erase the legacy overview before conversion.
      overview: items.length || row.items.length ? memoryOverview(items) : row.overview,
      overviewUpdatedAt:
        patch.upsert.length || patch.removeIds.length ? now : row.overviewUpdatedAt,
      memoryRevision: row.memoryRevision + 1,
    })
    .where(eq(coachMemos.id, row.id));
  if (patch.reviewedNoteIds.length)
    await db
      .update(coachNotes)
      .set({ reviewedAt: now })
      .where(
        and(
          eq(coachNotes.userId, userId),
          inArray(coachNotes.id, patch.reviewedNoteIds),
          isNull(coachNotes.reviewedAt),
        ),
      );
  return { items, memoryRevision: row.memoryRevision + 1 };
}
