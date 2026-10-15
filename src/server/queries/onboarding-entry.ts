import type { Route } from "next";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import type { TrainingExperience } from "@/domain/types";
import { pendingFirstProgramme, readSetupState } from "@/server/queries/setup-state";

/**
 * Where a setup that was left unfinished picks up again.
 *
 * What has been saved says how far it got: the first step's answers (experience and sports),
 * then a place to train, then the plan. A step that may be passed with nothing chosen (what is
 * unusual at a gym, what is at home) is not resumed: an empty answer is an answer, and sending
 * anyone who gave it back to the same step was the loop the audit found (B4). A programme the
 * coach is writing, or has written, is where a beginner comes back to.
 */
export async function onboardingEntry(
  userId: string,
  experience: TrainingExperience | null,
): Promise<Route> {
  return withUser(
    getDb(),
    userId,
    async (tx): Promise<Route> => {
      const state = await readSetupState(tx, userId, experience);
      if (state.experience === null || state.sports === null) return "/welcome";
      // Runs, rides or swims only: setup ends on the first step, so that is where it resumes.
      if (!state.sports.includes("strength")) return "/welcome";
      if (!state.place) return "/welcome/gym";
      const programme = await pendingFirstProgramme(tx, userId);
      if (programme && "draftId" in programme)
        return `/welcome/programme/drafts/${programme.draftId}` as Route;
      if (programme) return `/welcome/programme/jobs/${programme.jobId}` as Route;
      return "/welcome/programme";
    },
    { readOnly: true },
  );
}
