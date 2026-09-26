import { and, desc, eq, gte, inArray, or } from "drizzle-orm";
import { coachJobs } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { todayCoachState, type TodayCoachState } from "./coach-plans";
import { sessionTarget, settleCoachJobs } from "./coaching-jobs";
import { fromDateTimeLocal } from "@/lib/time";
import { todayInTimeZone } from "@/domain/program-calendar";

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
  const { jobs, expired } = settleCoachJobs(stored);
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
  const pending = relevant.find((job) => job.status === "queued" || job.status === "claimed");
  const latest = relevant[0];
  return {
    ...state,
    workflow: true,
    selectedGymId,
    expiredJobs: expired,
    pending: pending ? { gymId: pending.target.gymId, requestedAt: pending.createdAt } : null,
    failure: !pending && latest?.status === "failed" ? { error: latest.error } : null,
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
