import { and, desc, eq, gte, inArray, or } from "drizzle-orm";
import { coachJobs } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { todayCoachState, type TodayCoachState } from "./coach-plans";
import { sessionTarget, settleCoachJobs } from "./coaching-jobs";
import { fromDateTimeLocal } from "@/lib/time";
import { todayInTimeZone } from "@/domain/program-calendar";
import { jobProgress } from "@/domain/coaching-workflow";

/**
 * Adapt durable jobs to Today's existing plan renderer without creating legacy requests. Today
 * passes the schedule and gyms it has already read, so the job target is worked out from them
 * rather than from a second read of each.
 */
export async function todayWorkflowState(
  db: DbOrTx,
  userId: string,
  input: Parameters<typeof todayCoachState>[2],
  known?: Parameters<typeof sessionTarget>[3],
): Promise<TodayCoachState> {
  const now = new Date();
  const since = fromDateTimeLocal(`${todayInTimeZone(input.timeZone)}T00:00`, input.timeZone)!;
  const [target, stored] = await Promise.all([
    sessionTarget(db, userId, null, known),
    db
      .select()
      .from(coachJobs)
      .where(
        and(
          eq(coachJobs.userId, userId),
          or(gte(coachJobs.createdAt, since), inArray(coachJobs.status, ["queued", "claimed"])),
        ),
      )
      .orderBy(desc(coachJobs.createdAt)),
  ]);
  // An attempt whose lease ran out is shown as it will be recorded; the page records it after
  // answering (`tidyCoachJobsLater`), so reading Today never takes the athlete lock.
  const { jobs, expired } = settleCoachJobs(stored, now);
  const selectedGymId =
    target?.programId === input.programId &&
    target.cycleIndex === input.ref.cycleIndex &&
    target.dayIndex === input.ref.dayIndex
      ? target.gymId
      : input.gymId;
  const state = await todayCoachState(db, userId, { ...input, gymId: selectedGymId });
  const relevant = jobs.filter(
    (job) =>
      job.kind === "prepare_session" &&
      job.target.programId === input.programId &&
      job.target.cycleIndex === input.ref.cycleIndex &&
      job.target.dayIndex === input.ref.dayIndex,
  );
  const unfinished = relevant.find((job) => job.status === "queued" || job.status === "claimed");
  // A review being worked, or on its way, plans this session again when it ends, so the
  // session is on its way too however long it has sat behind it.
  const reviewing = jobs.some(
    (job) =>
      job.kind === "review_program" &&
      ["working", "starting"].includes(jobProgress(job, now) ?? ""),
  );
  const progress = unfinished ? jobProgress(unfinished, now) : null;
  const pending = progress !== null && (progress !== "waiting" || reviewing);
  const latest = relevant[0];
  return {
    ...state,
    workflow: true,
    selectedGymId,
    expiredJobs: expired,
    pending:
      unfinished && pending
        ? { gymId: unfinished.target.gymId, requestedAt: lastStarted(unfinished, now) }
        : null,
    // Queued, but nothing will pick it up before the next nightly run: said so, with a way to
    // start it now, rather than "planning since 04:10" all day.
    waiting:
      unfinished && !pending ? { jobId: unfinished.id, attempted: unfinished.attempts > 0 } : null,
    failure: !unfinished && latest?.status === "failed" ? { error: latest.error } : null,
    requestsLeft: Math.max(
      0,
      3 -
        jobs.filter(
          (job) =>
            (job.trigger === "gym" || job.kind === "create_program") && job.createdAt >= since,
        ).length,
    ),
  };
}

/** When the job was last set going: queued, started again, or handed a run. */
function lastStarted(
  job: { createdAt: Date; nextAttemptAt: Date; dispatchStartedAt: Date | null },
  now: Date,
): Date {
  return new Date(
    Math.max(
      job.createdAt.getTime(),
      Math.min(job.nextAttemptAt.getTime(), now.getTime()),
      job.dispatchStartedAt?.getTime() ?? 0,
    ),
  );
}
