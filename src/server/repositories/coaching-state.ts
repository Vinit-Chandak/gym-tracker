import { and, eq, isNull } from "drizzle-orm";
import { coachPreferences, coachSourceRevisions, profiles, workoutSessions } from "@/db/schema";
import type { DbOrTx } from "@/db/types";

export class CoachingError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = "CoachingError";
  }
}
export async function sourceRevision(db: DbOrTx, userId: string): Promise<number> {
  const [row] = await db
    .select()
    .from(coachSourceRevisions)
    .where(eq(coachSourceRevisions.userId, userId));
  if (!row) throw new CoachingError("Your account is no longer available.", 404);
  return row.revision;
}
export async function assertNoOpenWorkout(db: DbOrTx, userId: string) {
  const [open] = await db
    .select({ id: workoutSessions.id })
    .from(workoutSessions)
    .where(and(eq(workoutSessions.userId, userId), isNull(workoutSessions.completedAt)))
    .limit(1);
  if (open)
    throw new CoachingError("Finish or discard your open workout before changing its plan.");
}
export async function assertCoachEnabled(db: DbOrTx, userId: string) {
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
  if (!profile?.aiCoachEnabled)
    throw new CoachingError("The AI coach is switched off for this account.", 403);
  return profile;
}
export async function getCoachingPreferences(db: DbOrTx, userId: string) {
  const [row] = await db.select().from(coachPreferences).where(eq(coachPreferences.userId, userId));
  return row ?? null;
}
