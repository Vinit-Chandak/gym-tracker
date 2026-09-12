import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/types";
import { coachJobs } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { fireCoachRoutine, RoutineFireError } from "./coach-routine";

/** Durable intent precedes the network call. An uncertain response never fires it twice. */
export async function dispatchCoachJob(db: Db, userId: string, id: string) {
  const dispatch = await withUser(db, userId, async (tx) => {
    const [job] = await tx
      .update(coachJobs)
      .set({ dispatchStartedAt: new Date() })
      .where(
        and(
          eq(coachJobs.userId, userId),
          eq(coachJobs.id, id),
          eq(coachJobs.status, "queued"),
          isNull(coachJobs.dispatchStartedAt),
        ),
      )
      .returning();
    return job;
  });
  if (!dispatch) return;
  try {
    const run = await fireCoachRoutine(
      `workflow\nuser: ${userId}\njob: ${id}\nRead .claude/skills/coach/SKILL.md and process only this queued job using the workflow API.`,
    );
    await withUser(db, userId, (tx) =>
      tx
        .update(coachJobs)
        .set({ routineSessionId: run.sessionId, routineSessionUrl: run.sessionUrl })
        .where(and(eq(coachJobs.id, id), eq(coachJobs.userId, userId))),
    );
  } catch (error) {
    const uncertain =
      error instanceof RoutineFireError &&
      (error.status === null || error.status === 200 || error.status >= 500);
    await withUser(db, userId, (tx) =>
      tx
        .update(coachJobs)
        .set({
          error: uncertain
            ? "The request is saved, but the routine's start could not be confirmed. The scheduled coach can pick it up; no duplicate run was started."
            : "The routine could not start. Your request is saved for the scheduled coach.",
        })
        .where(
          and(eq(coachJobs.id, id), eq(coachJobs.userId, userId), eq(coachJobs.status, "queued")),
        ),
    );
  }
}
