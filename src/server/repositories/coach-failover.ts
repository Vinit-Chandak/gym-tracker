import { and, asc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { coachJobs, coachPrimaryBatches, profiles } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { backupStanding, COACH_FAILOVER_MS } from "@/domain/coach-failover";
import type { CoachProvider } from "@/domain/coach-failover";
import { lastCoachBoundary } from "@/domain/coach-cadence";
import type { CoachJob } from "./coaching-jobs";

export async function primaryBatchProgress(db: DbOrTx, now = new Date()) {
  const boundary = lastCoachBoundary(now);
  const [row] = await db
    .select()
    .from(coachPrimaryBatches)
    .where(eq(coachPrimaryBatches.batchDate, boundary.date));
  return { boundary, progressAt: row?.progressAt ?? null, completedAt: row?.completedAt ?? null };
}

export async function touchPrimaryBatch(db: DbOrTx, now = new Date(), batchDate?: string) {
  const date = batchDate ?? lastCoachBoundary(now).date;
  await db
    .insert(coachPrimaryBatches)
    .values({ batchDate: date, progressAt: now })
    .onConflictDoUpdate({ target: coachPrimaryBatches.batchDate, set: { progressAt: now } });
}

export async function backupDispatchStanding(db: DbOrTx, now = new Date()) {
  const { boundary, progressAt, completedAt } = await primaryBatchProgress(db, now);
  const after = new Date(
    Math.max(boundary.at.getTime(), progressAt?.getTime() ?? 0) + COACH_FAILOVER_MS,
  );
  return {
    eligible: !completedAt && now >= after,
    after: after.toISOString(),
    batchDate: boundary.date,
    completed: completedAt !== null,
  };
}

/** Once the daily batch was drained, later checks only recover saved jobs, never redispatch it. */
export async function completeCoachBatch(db: DbOrTx, provider: CoachProvider, now = new Date()) {
  const { boundary } = await primaryBatchProgress(db, now);
  await db
    .insert(coachPrimaryBatches)
    .values({
      batchDate: boundary.date,
      progressAt: provider === "claude" ? now : boundary.at,
      completedAt: now,
      completedBy: provider,
    })
    .onConflictDoUpdate({
      target: coachPrimaryBatches.batchDate,
      set: { completedAt: now, completedBy: provider },
    });
  return { completed: true, batchDate: boundary.date };
}

export async function backupJobStanding(db: DbOrTx, job: CoachJob, now = new Date()) {
  return standingForJob(job, await primaryBatchProgress(db, now), now);
}

function standingForJob(
  job: CoachJob,
  { boundary, progressAt }: Awaited<ReturnType<typeof primaryBatchProgress>>,
  now: Date,
) {
  const scheduled = !job.dispatchStartedAt && (job.trigger === "daily" || job.trigger === "weekly");
  // A review's target may retain an older boundary; ten minutes is never measured from
  // the backup's dispatch time, otherwise a missed 05:00 run would wait until 05:20.
  const scheduledAt = scheduled && job.target.batchDate === boundary.date ? boundary.at : null;
  return backupStanding(job, scheduledAt, progressAt, now);
}

/** Stable pages include silent claims and failed primary jobs, which the normal queue omits. */
export async function backupCoachJobs(db: DbOrTx, after: string | null, now = new Date()) {
  const rows = await db
    .select({ job: coachJobs })
    .from(coachJobs)
    .innerJoin(profiles, eq(profiles.id, coachJobs.userId))
    .where(
      and(
        eq(profiles.aiCoachEnabled, true),
        inArray(coachJobs.status, ["queued", "claimed", "failed"]),
        or(isNull(coachJobs.backupTakenAt), inArray(coachJobs.status, ["queued", "claimed"])),
        after ? gt(coachJobs.id, after) : undefined,
      ),
    )
    .orderBy(asc(coachJobs.id))
    .limit(51);
  const jobs: { id: string; userId: string; kind: CoachJob["kind"] }[] = [];
  const progress = await primaryBatchProgress(db, now);
  for (const { job } of rows.slice(0, 50)) {
    if (standingForJob(job, progress, now).eligible)
      jobs.push({ id: job.id, userId: job.userId, kind: job.kind });
  }
  // Reviews first; the claim path remains the authority even across page boundaries.
  const priority = { create_program: 0, review_program: 1, prepare_session: 2 };
  jobs.sort((a, b) => priority[a.kind] - priority[b.kind]);
  return { jobs, nextCursor: rows.length > 50 ? rows[49]!.job.id : null };
}
