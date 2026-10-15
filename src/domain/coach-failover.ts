export type CoachProvider = "claude" | "chatgpt";
export const COACH_FAILOVER_MS = 10 * 60_000;

/** This gate is separate from the ordinary claim lease, and never reads model-written text. */
export function backupStanding(
  job: {
    status: string;
    workerProvider: CoachProvider;
    backupTakenAt: Date | null;
    primaryProgressAt: Date | null;
    primaryFailedAt: Date | null;
    dispatchStartedAt: Date | null;
    nextAttemptAt: Date;
    createdAt: Date;
    leaseUntil: Date | null;
  },
  scheduledAt: Date | null,
  batchProgressAt: Date | null,
  now: Date,
): { eligible: boolean; after: Date | null; reason: string } {
  if (!["queued", "claimed", "failed"].includes(job.status))
    return { eligible: false, after: null, reason: "This job has already been settled." };
  if (job.backupTakenAt)
    return {
      eligible:
        (job.status === "queued" && job.nextAttemptAt <= now) ||
        (job.status === "claimed" && job.leaseUntil !== null && job.leaseUntil <= now),
      after: job.status === "claimed" ? job.leaseUntil : job.nextAttemptAt,
      reason: "This job already belongs to the backup and retains its bounded retry budget.",
    };
  const latest = Math.max(
    (job.primaryProgressAt ?? job.dispatchStartedAt ?? scheduledAt ?? job.createdAt).getTime(),
    job.primaryFailedAt?.getTime() ?? 0,
    // An unclaimed scheduled job may be waiting behind another athlete in a healthy batch.
    job.status === "queued" &&
      !job.primaryProgressAt &&
      !job.primaryFailedAt &&
      !job.dispatchStartedAt
      ? (batchProgressAt?.getTime() ?? 0)
      : 0,
  );
  const after = new Date(latest + COACH_FAILOVER_MS);
  return {
    eligible: now >= after && (job.status !== "queued" || job.nextAttemptAt <= now),
    after,
    reason: job.primaryFailedAt
      ? "Claude reported a failure and the ten-minute wait has elapsed."
      : "Claude has not reported progress for ten minutes.",
  };
}
