import { and, desc, eq, gte, inArray, or } from "drizzle-orm";
import { coachJobs } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { todayCoachState, type TodayCoachState } from "./coach-plans";
import { reconcileCoachJobs, sessionTarget } from "./coaching-jobs";
import { fromDateTimeLocal } from "@/lib/time";
import { todayInTimeZone } from "@/domain/program-calendar";

/** Adapt durable jobs to Today's existing plan renderer without creating legacy requests. */
export async function todayWorkflowState(
  db: DbOrTx,
  userId: string,
  input: Parameters<typeof todayCoachState>[2],
): Promise<TodayCoachState> {
  await reconcileCoachJobs(db, userId);
  const since = fromDateTimeLocal(`${todayInTimeZone(input.timeZone)}T00:00`, input.timeZone)!;
  const [target, jobs] = await Promise.all([
    sessionTarget(db, userId),
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
