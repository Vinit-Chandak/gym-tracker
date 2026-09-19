import { lte } from "drizzle-orm";

import { coachAttemptDiagnostics } from "@/db/schema";
import type { Db, DbOrTx } from "@/db/types";
import { COACH_CONTRACT_VERSION } from "@/domain/coaching-workflow";
import { COACH_TRAINING_REFERENCE_VERSION } from "@/domain/coach-training-reference";

/** How long a debugging receipt is worth keeping. After this it is deleted, unconditionally. */
export const DIAGNOSTIC_RETENTION_DAYS = 30;

/**
 * A receipt for one finished coaching attempt.
 *
 * Enough to answer "which guidance did that run read, and what did the server make of its
 * result" a fortnight later, and nothing else: counts, versions and the error the attempt
 * ended with. No prompts, no histories, no model reasoning, nothing the athlete wrote. It is
 * never read back into a job's context and never shown in the app, so it cannot quietly
 * become a second, unreviewed memory of the athlete.
 */
export async function recordAttemptDiagnostics(
  db: DbOrTx,
  userId: string,
  input: {
    jobId: string;
    attemptId: string | null;
    kind: string;
    outcome: string;
    diagnostics?: Record<string, number | string | boolean>;
    error?: string | null;
  },
  now = new Date(),
) {
  await db.insert(coachAttemptDiagnostics).values({
    userId,
    jobId: input.jobId,
    attemptId: input.attemptId,
    kind: input.kind,
    outcome: input.outcome,
    referenceVersion: COACH_TRAINING_REFERENCE_VERSION,
    contractVersion: COACH_CONTRACT_VERSION,
    diagnostics: input.diagnostics ?? {},
    error: input.error ? input.error.slice(0, 500) : null,
    completedAt: now,
    expiresAt: new Date(now.getTime() + DIAGNOSTIC_RETENTION_DAYS * 86_400_000),
  });
}

/**
 * Deletes every expired receipt, whatever else the batch did.
 *
 * It runs from the dispatcher's first page rather than from a successful coaching job, so an
 * account whose coach never succeeds — or an account that has stopped training altogether —
 * does not accumulate debugging material indefinitely. It touches nothing but this table:
 * workouts, programmes, revisions, preferences, open requests, drafts and the evidence
 * baselines a review reads all keep their own, longer lives.
 */
export async function expireCoachDiagnostics(db: Db, now = new Date()) {
  const deleted = await db
    .delete(coachAttemptDiagnostics)
    .where(lte(coachAttemptDiagnostics.expiresAt, now))
    .returning({ id: coachAttemptDiagnostics.id });
  return deleted.length;
}
