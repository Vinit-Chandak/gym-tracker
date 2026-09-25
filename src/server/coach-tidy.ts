import { after } from "next/server";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { reconcileCoachJobs } from "@/server/repositories/coaching-jobs";

/**
 * Records a coach job's timeout once the page showing it has answered.
 *
 * Screens show an expired attempt as it will be recorded (`settleCoachJobs`) and read in a
 * read-only transaction, so rendering one, or prefetching it, never takes the athlete lock. The
 * row itself still has to change: requesting a gym change or confirming an intake refuses while
 * a job looks claimed. So a screen that saw one asks for it here, and the write runs after the
 * response, off the tap's critical path. The update is conditional, so two screens asking at once
 * record it once.
 */
export function tidyCoachJobsLater(userId: string): void {
  after(async () => {
    try {
      await withUser(getDb(), userId, (tx) => reconcileCoachJobs(tx, userId));
    } catch (error) {
      console.error("Recording expired coach jobs failed", error);
    }
  });
}
