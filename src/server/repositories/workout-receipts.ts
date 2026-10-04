import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { workoutSubmissionReceipts } from "@/db/schema";
import type { DbOrTx } from "@/db/types";

export class WorkoutSubmissionConflictError extends Error {
  constructor() {
    super(
      "These were already added with a different selection. Open the workout to check it before adding more.",
    );
    this.name = "WorkoutSubmissionConflictError";
  }
}

/**
 * Runs a change to a workout once per submission key, as food's receipts do (ADR 0032). Must run
 * inside the same transaction as the write: the receipt and the change commit together or not at
 * all. A key already committed with the same payload is a no-op, so a retry after a lost reply
 * adds nothing twice; the same key with a different payload is refused. Answers whether the write
 * ran, so a caller can tell a replay from a first save if it needs to.
 */
export async function submitWorkoutOnce(
  db: DbOrTx,
  userId: string,
  key: string,
  payload: unknown,
  write: () => Promise<unknown>,
): Promise<{ replayed: boolean }> {
  const payloadDigest = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const inserted = await db
    .insert(workoutSubmissionReceipts)
    .values({ userId, submissionKey: key, payloadDigest })
    .onConflictDoNothing()
    .returning({ key: workoutSubmissionReceipts.submissionKey });
  if (inserted.length === 0) {
    const [receipt] = await db
      .select({ payloadDigest: workoutSubmissionReceipts.payloadDigest })
      .from(workoutSubmissionReceipts)
      .where(
        and(
          eq(workoutSubmissionReceipts.userId, userId),
          eq(workoutSubmissionReceipts.submissionKey, key),
        ),
      );
    if (receipt?.payloadDigest !== payloadDigest) throw new WorkoutSubmissionConflictError();
    return { replayed: true };
  }
  await write();
  return { replayed: false };
}
