import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { coachMemos, coachNotes, coachPreferences, sportCoachPreferences } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { ACTIVITY_SPORTS, type ActivitySport } from "@/domain/activity";
import { saveCoachNotes } from "./coach-plans";
import { CoachingError } from "./coaching-state";
import { activeSportProgrammes } from "./sport-programmes";

/** The same submission keeps the same receipt in each programme when a mobile request retries. */
function programmeNoteId(noteId: string, sport: ActivitySport): string {
  const hex = createHash("sha256").update(`coach-message:${noteId}:${sport}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * A message addressed to all programmes needs a separate receipt for each one. A single
 * global note is consumed by whichever coach job reads it first, so the other programmes
 * would never hear the request. These copies retain their own answer and review status.
 * The caller owns the transaction, so a message and its review flags are saved together.
 */
export async function saveCoachMessage(
  db: DbOrTx,
  userId: string,
  input: { noteId: string; userNotes: string; sport: ActivitySport | null },
  now = new Date(),
) {
  const receipts = await db
    .select({ id: coachNotes.id, text: coachNotes.text, sport: coachNotes.sport })
    .from(coachNotes)
    .where(
      and(
        eq(coachNotes.userId, userId),
        inArray(coachNotes.id, [
          input.noteId,
          ...ACTIVITY_SPORTS.map((sport) => programmeNoteId(input.noteId, sport)),
        ]),
      ),
    );
  if (receipts.length) {
    const sameScope = input.sport
      ? receipts.length === 1 &&
        receipts[0]!.id === input.noteId &&
        receipts[0]!.sport === input.sport
      : receipts.every((note) =>
          note.sport === null
            ? note.id === input.noteId
            : note.id === programmeNoteId(input.noteId, note.sport),
        );
    if (sameScope && receipts.every((note) => note.text === input.userNotes)) return;
    throw new CoachingError(
      "This message changed after it was saved. Reload before sending again.",
    );
  }
  const programmes = await activeSportProgrammes(db, userId);
  if (input.sport && !programmes.some((programme) => programme.sport === input.sport))
    throw new CoachingError("Choose one of your active programmes.", 422);
  const sports = input.sport ? [input.sport] : programmes.map((programme) => programme.sport);
  if (!sports.length) {
    await saveCoachNotes(db, userId, input.userNotes, input.noteId);
    return;
  }
  for (const sport of sports) {
    const saved = await saveCoachNotes(
      db,
      userId,
      input.userNotes,
      input.sport ? input.noteId : programmeNoteId(input.noteId, sport),
      sport,
    );
    if (!saved) continue;
    await db
      .insert(sportCoachPreferences)
      .values({ userId, sport, reviewRequestedAt: now })
      .onConflictDoUpdate({
        target: [sportCoachPreferences.userId, sportCoachPreferences.sport],
        set: { reviewRequestedAt: now },
      });
    if (sport === "strength")
      await db
        .insert(coachPreferences)
        .values({ userId, reviewRequestedAt: now })
        .onConflictDoUpdate({
          target: coachPreferences.userId,
          set: { reviewRequestedAt: now },
        });
  }
  // Older routine clients read the last general message here; scoped messages never replace it.
  if (input.sport === null)
    await db
      .insert(coachMemos)
      .values({ userId, userNotes: input.userNotes })
      .onConflictDoUpdate({ target: coachMemos.userId, set: { userNotes: input.userNotes } });
}
