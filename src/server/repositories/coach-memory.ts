import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import {
  coachAttachments,
  coachIntakes,
  coachJobs,
  coachMemos,
  coachNoteReviews,
  coachNotes,
  coachPreferences,
  dailyRecovery,
  exercises,
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
export async function athleteMemorySources(db: DbOrTx, userId: string, ids: readonly string[]) {
  const sources = new Map<string, AthleteSource>();
  const noteIds = ids.filter((id) => id.startsWith("note:")).map((id) => id.slice(5));
  const intakeIds = ids.filter((id) => id.startsWith("intake:")).map((id) => id.slice(7));
  const sessionIds = ids.filter((id) => id.startsWith("workout:")).map((id) => id.slice(8));
  const slotIds = ids.filter((id) => id.startsWith("exercise:")).map((id) => id.slice(9));
  if (noteIds.length) {
    const notes = await db
      .select()
      .from(coachNotes)
      .where(and(eq(coachNotes.userId, userId), inArray(coachNotes.id, noteIds)));
    for (const note of notes)
      sources.set(`note:${note.id}`, { text: note.text, createdAt: note.createdAt.toISOString() });
  }
  // A note written on the finish screen, or against one exercise, is the athlete speaking at
  // the moment it was true. It is dated by when the work was put down, not when the row began,
  // so a session opened in the morning and finished at night is quoted as the evening it was.
  if (sessionIds.length) {
    const sessions = await db
      .select({
        id: workoutSessions.id,
        notes: workoutSessions.notes,
        startedAt: workoutSessions.startedAt,
        completedAt: workoutSessions.completedAt,
      })
      .from(workoutSessions)
      .where(and(eq(workoutSessions.userId, userId), inArray(workoutSessions.id, sessionIds)));
    for (const session of sessions)
      if (session.notes?.trim())
        sources.set(`workout:${session.id}`, {
          text: session.notes,
          createdAt: (session.completedAt ?? session.startedAt).toISOString(),
        });
  }
  if (slotIds.length) {
    const slots = await db
      .select({
        id: workoutExercises.id,
        notes: workoutExercises.notes,
        createdAt: workoutExercises.createdAt,
        completedAt: workoutExercises.completedAt,
      })
      .from(workoutExercises)
      .where(and(eq(workoutExercises.userId, userId), inArray(workoutExercises.id, slotIds)));
    for (const slot of slots)
      if (slot.notes?.trim())
        sources.set(`exercise:${slot.id}`, {
          text: slot.notes,
          createdAt: (slot.completedAt ?? slot.createdAt).toISOString(),
        });
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

/** How far back an unread training note is still worth answering, and how many at once. */
const TRAINING_NOTE_DAYS = 30;
const TRAINING_NOTE_LIMIT = 20;

/**
 * Notes written while training that the coach has not closed yet.
 *
 * These used to reach the coach only as a field on a session inside seven days of raw history
 * — visible, unanswerable, and gone by the eighth day. Read as messages they behave like every
 * other note: they arrive oldest first, they stay pending until they are answered, and a
 * backlog waits for the next job rather than being dropped.
 */
async function pendingTrainingNotes(db: DbOrTx, userId: string, now: Date) {
  const since = new Date(now.getTime() - TRAINING_NOTE_DAYS * 86_400_000);
  const written = and(eq(workoutSessions.userId, userId), gte(workoutSessions.startedAt, since));
  const [sessions, slots] = await Promise.all([
    db
      .select({
        id: workoutSessions.id,
        text: workoutSessions.notes,
        startedAt: workoutSessions.startedAt,
        completedAt: workoutSessions.completedAt,
      })
      .from(workoutSessions)
      .where(and(written, isNotNull(workoutSessions.notes), ne(workoutSessions.notes, ""))),
    db
      .select({
        id: workoutExercises.id,
        text: workoutExercises.notes,
        exercise: exercises.name,
        startedAt: workoutSessions.startedAt,
        completedAt: workoutExercises.completedAt,
      })
      .from(workoutExercises)
      .innerJoin(workoutSessions, eq(workoutSessions.id, workoutExercises.workoutSessionId))
      .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
      .where(
        and(
          written,
          eq(workoutExercises.userId, userId),
          isNotNull(workoutExercises.notes),
          ne(workoutExercises.notes, ""),
        ),
      ),
  ]);
  const found = [
    ...sessions.map((session) => ({
      sourceId: `workout:${session.id}`,
      about: "the session",
      text: session.text!,
      createdAt: (session.completedAt ?? session.startedAt).toISOString(),
    })),
    ...slots.map((slot) => ({
      sourceId: `exercise:${slot.id}`,
      about: slot.exercise,
      text: slot.text!,
      createdAt: (slot.completedAt ?? slot.startedAt).toISOString(),
    })),
  ].filter((note) => note.text.trim().length > 0);
  if (!found.length) return { pending: [], hasMore: false };
  const closed = new Set(
    (
      await db
        .select({ sourceId: coachNoteReviews.sourceId })
        .from(coachNoteReviews)
        .where(
          and(
            eq(coachNoteReviews.userId, userId),
            inArray(
              coachNoteReviews.sourceId,
              found.map((note) => note.sourceId),
            ),
          ),
        )
    ).map((row) => row.sourceId),
  );
  const open = found
    .filter((note) => !closed.has(note.sourceId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.sourceId.localeCompare(b.sourceId));
  return {
    pending: open.slice(0, TRAINING_NOTE_LIMIT),
    hasMore: open.length > TRAINING_NOTE_LIMIT,
  };
}

export async function readCoachNotes(db: DbOrTx, userId: string, now = new Date()) {
  const [pending, recent, training] = await Promise.all([
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
    pendingTrainingNotes(db, userId, now),
  ]);
  return { pending: pending.slice(0, 50), hasMorePending: pending.length > 50, recent, training };
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
    notes: await readCoachNotes(db, userId, now),
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
    ...patch.reviewedNotes.map((note) => note.sourceId),
  ]);
  if (patch.reviewedNotes.some((note) => !athleteSources.has(note.sourceId)))
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
  for (const note of patch.reviewedNotes) {
    if (note.sourceId.startsWith("note:"))
      await db
        .update(coachNotes)
        .set({ reviewedAt: now, disposition: note.disposition, dispositionDetail: note.detail })
        .where(
          and(
            eq(coachNotes.userId, userId),
            eq(coachNotes.id, note.sourceId.slice(5)),
            isNull(coachNotes.reviewedAt),
          ),
        );
    else
      await db
        .insert(coachNoteReviews)
        .values({
          userId,
          sourceId: note.sourceId,
          disposition: note.disposition,
          detail: note.detail,
          reviewedAt: now,
        })
        .onConflictDoNothing({ target: [coachNoteReviews.userId, coachNoteReviews.sourceId] });
  }
  // Something only a programme review can grant stops waiting for the weekly cadence.
  if (patch.reviewedNotes.some((note) => note.disposition === "queued_for_review"))
    await db
      .update(coachPreferences)
      .set({ reviewRequestedAt: now })
      .where(eq(coachPreferences.userId, userId));
  return { items, memoryRevision: row.memoryRevision + 1 };
}
