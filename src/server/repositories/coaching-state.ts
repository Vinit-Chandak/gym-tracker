import { and, eq, isNull } from "drizzle-orm";
import { coachPreferences, coachSourceRevisions, profiles, workoutSessions } from "@/db/schema";
import type { DbOrTx } from "@/db/types";

export class CoachingError extends Error {
  /**
   * Every problem this result has, where the check that raised it could find more than one.
   *
   * A worker gets two corrections per lease, and the guardrails used to stop at the first
   * thing they disliked: a session with three independent faults could not be fixed inside
   * that budget however well the worker corrected each one, because it only ever learnt about
   * them one at a time. It spent its attempts discovering the list. A check that can see the
   * whole list says the whole list, and `message` stays the first of them so every existing
   * reader keeps working.
   */
  readonly issues: readonly string[];

  constructor(
    message: string,
    readonly status = 409,
    issues: readonly string[] = [],
  ) {
    super(message);
    this.name = "CoachingError";
    this.issues = issues.length > 0 ? issues : [message];
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
