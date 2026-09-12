"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { coachPreferences, profiles, programDrafts } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { withUser } from "@/db/with-user";
import { getCoachRoutine, getCoachServiceToken } from "@/lib/env";
import { coachRollout } from "@/lib/coach-rollout";
import { requireProfiledUser } from "@/server/auth";
import { dispatchCoachJob } from "@/server/dispatch-coach-job";
import { profileChanged } from "@/server/queries/request-profile";
import {
  confirmIntake,
  latestIntake,
  saveIntake,
  setTrainingMode,
} from "@/server/repositories/coach-intakes";
import { requestProgramCreation } from "@/server/repositories/coaching-jobs";
import { CoachingError } from "@/server/repositories/coaching-state";
import {
  activateProgramDraft,
  archiveActiveProgram,
  copyProgramToDraft,
  refreshProgramDraft,
  saveManualDraft,
} from "@/server/repositories/program-drafts";
import { removeCoachAttachment } from "@/server/repositories/coach-attachments";
import { PlanValidationError } from "@/server/repositories/coach-plans";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
async function mutate<T>(work: (tx: DbOrTx, userId: string) => Promise<T>): Promise<Result<T>> {
  const user = await requireProfiledUser();
  try {
    const value = await withUser(getDb(), user.id, (tx) => work(tx, user.id));
    return { ok: true, value };
  } catch (error) {
    if (error instanceof z.ZodError)
      return {
        ok: false,
        error: error.issues
          .map((i) => i.message)
          .slice(0, 4)
          .join(" "),
      };
    if (error instanceof CoachingError || error instanceof PlanValidationError)
      return { ok: false, error: error.message };
    console.error(
      "Coaching workflow action failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return {
      ok: false,
      error: "Could not save this change. Your screen still has your answers; please retry.",
    };
  }
}
export async function saveCoachIntakeAction(answers: unknown, revision: number | null) {
  return mutate(async (tx, userId) => {
    if (!coachRollout().intake && !(await latestIntake(tx, userId)))
      throw new CoachingError(
        "New coaching setup is temporarily paused. You can still build a programme or track workouts.",
        503,
      );
    return saveIntake(tx, userId, answers, z.number().int().positive().nullable().parse(revision));
  });
}
export async function createCoachProgramAction(intakeId: string, requestKey: string) {
  if (
    process.env.COACH_WORKFLOW_ENABLED !== "true" ||
    !coachRollout().generation ||
    !getCoachRoutine() ||
    !getCoachServiceToken()
  )
    return {
      ok: false as const,
      error: "Programme generation is not configured yet. Your answers and reports are saved.",
    };
  const result = await mutate(async (tx, userId) => {
    await confirmIntake(tx, userId, z.uuid().parse(intakeId));
    const request = await requestProgramCreation(tx, userId, intakeId, z.uuid().parse(requestKey));
    return { userId, jobId: request.job.id, created: request.created };
  });
  if (result.ok) {
    await profileChanged(result.value.userId);
    if (result.value.created)
      after(() => dispatchCoachJob(getDb(), result.value.userId, result.value.jobId));
  }
  return result;
}
export async function removeCoachAttachmentAction(id: string) {
  return mutate((tx, userId) => removeCoachAttachment(tx, userId, z.uuid().parse(id)));
}
export async function saveProgramDraftAction(blueprint: unknown, id?: string, revision?: number) {
  return mutate((tx, userId) =>
    saveManualDraft(tx, userId, blueprint, {
      id: z.uuid().optional().parse(id),
      expectedRevision: z.number().int().positive().optional().parse(revision),
    }),
  );
}
export async function copyProgramAction(id: string, duplicate: boolean) {
  return mutate((tx, userId) =>
    copyProgramToDraft(tx, userId, z.uuid().parse(id), z.boolean().parse(duplicate)),
  );
}
export async function archiveProgramAction(id: string) {
  const result = await mutate((tx, userId) => archiveActiveProgram(tx, userId, z.uuid().parse(id)));
  if (result.ok) {
    revalidatePath("/today");
    revalidatePath("/settings/programme");
  }
  return result;
}
export async function reviewProgramDraftAction(id: string, revision: number) {
  return mutate((tx, userId) =>
    refreshProgramDraft(
      tx,
      userId,
      z.uuid().parse(id),
      z.number().int().positive().parse(revision),
    ),
  );
}
export async function activateProgramDraftAction(input: {
  id: string;
  revision: number;
  startDate: string;
  transition: "new_block" | "continue";
}) {
  const result = await mutate(async (tx, userId) => {
    const parsed = z
      .object({
        id: z.uuid(),
        revision: z.number().int().positive(),
        startDate: z.iso.date(),
        transition: z.enum(["new_block", "continue"]),
      })
      .parse(input);
    const activated = await activateProgramDraft(tx, userId, parsed.id, {
      expectedRevision: parsed.revision,
      startDate: parsed.startDate,
      transition: parsed.transition,
    });
    await tx
      .update(profiles)
      .set({ onboardedAt: new Date() })
      .where(and(eq(profiles.id, userId)));
    return { ...activated, userId };
  });
  if (result.ok) {
    await profileChanged(result.value.userId);
    revalidatePath("/today");
    revalidatePath("/settings/programme");
  }
  return result;
}
export async function rejectProgramDraftAction(id: string) {
  return mutate(async (tx, userId) => {
    const rows = await tx
      .update(programDrafts)
      .set({ status: "rejected" })
      .where(
        and(
          eq(programDrafts.id, z.uuid().parse(id)),
          eq(programDrafts.userId, userId),
          inArray(programDrafts.status, ["editing", "ready"]),
        ),
      )
      .returning({ id: programDrafts.id });
    if (!rows.length) throw new CoachingError("That draft is no longer waiting for review.");
    return rows[0];
  });
}
export async function chooseTrainingModeAction(mode: "manual" | "track") {
  const result = await mutate(async (tx, userId) => {
    await setTrainingMode(tx, userId, z.enum(["manual", "track"]).parse(mode));
    await tx.update(profiles).set({ onboardedAt: new Date() }).where(eq(profiles.id, userId));
    return userId;
  });
  if (result.ok) {
    await profileChanged(result.value);
    revalidatePath("/today");
  }
  return result;
}
export async function saveReviewWeekdayAction(reviewWeekday: number) {
  return mutate(async (tx, userId) => {
    const [updated] = await tx
      .update(coachPreferences)
      .set({ reviewWeekday: z.number().int().min(1).max(7).parse(reviewWeekday) })
      .where(eq(coachPreferences.userId, userId))
      .returning();
    if (!updated) throw new CoachingError("Complete your coaching intake first.");
    return updated;
  });
}
