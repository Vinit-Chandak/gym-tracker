"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { profiles, programDrafts } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { withUser } from "@/db/with-user";
import { getCoachRoutine, getCoachServiceToken } from "@/lib/env";
import { coachRollout } from "@/lib/coach-rollout";
import { PLAN_LIMITS } from "@/domain/session-plan";
import { requireProfiledUser } from "@/server/auth";
import { dispatchCoachJob } from "@/server/dispatch-coach-job";
import { profileChanged } from "@/server/queries/request-profile";
import {
  answerCoachQuestions,
  confirmIntake,
  latestIntake,
  saveIntake,
  setTrainingMode,
} from "@/server/repositories/coach-intakes";
import { requestProgramCreation, requestProgramReview } from "@/server/repositories/coaching-jobs";
import { CoachingError } from "@/server/repositories/coaching-state";
import {
  activateProgramDraft,
  archiveActiveProgram,
  copyProgramToDraft,
  refreshProgramDraft,
  saveManualDraft,
} from "@/server/repositories/program-drafts";
import { removeCoachAttachment } from "@/server/repositories/coach-attachments";
import { PlanValidationError, saveCoachNotes } from "@/server/repositories/coach-plans";
import {
  answerProgramRequest,
  releaseRequestsForDraft,
  withdrawProgramRequest,
} from "@/server/repositories/coach-program-requests";

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
/**
 * Confirms an intake and asks for a programme from it.
 *
 * Both ways of asking end here — the last step of the form, and answering the questions a
 * request came back with — because they are the same request with different answers behind
 * them, and each spends one of the day's three. The request key is the athlete's own, so a
 * double tap is one request rather than two.
 */
async function requestProgramme(
  requestKey: string,
  settle: (tx: DbOrTx, userId: string) => Promise<string>,
) {
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
    const intakeId = await settle(tx, userId);
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
export async function createCoachProgramAction(intakeId: string, requestKey: string) {
  return requestProgramme(requestKey, async (tx, userId) => {
    await confirmIntake(tx, userId, z.uuid().parse(intakeId));
    return z.uuid().parse(intakeId);
  });
}

/**
 * Answers the questions a request came back with, from the screen that asked them, and asks
 * again. The answers become a new revision of the intake in a write of their own, so a request
 * that cannot be made — the day's three spent, a workout still open — keeps what was typed.
 */
export async function answerCoachQuestionsAction(
  jobId: string,
  answers: unknown,
  requestKey: string,
) {
  const saved = await mutate((tx, userId) =>
    answerCoachQuestions(tx, userId, z.uuid().parse(jobId), answers).then((intake) => intake.id),
  );
  if (!saved.ok) return saved;
  return requestProgramme(requestKey, async (tx, userId) => {
    await confirmIntake(tx, userId, saved.value);
    return saved.value;
  });
}

/**
 * "Look at my programme now."
 *
 * The cadence reviews about once a week on a day the athlete rested, which is right until
 * something changes — a new gym, a week away, a run of sessions that went nothing like the
 * plan. This starts that same review against the same evidence, once a week each. Whatever it
 * proposes still waits for approval.
 */
export async function requestProgramReviewAction() {
  if (
    process.env.COACH_WORKFLOW_ENABLED !== "true" ||
    !getCoachRoutine() ||
    !getCoachServiceToken()
  )
    return {
      ok: false as const,
      error:
        "On-demand coaching is not set up on this server. Your next scheduled review still runs.",
    };
  const result = await mutate(async (tx, userId) => {
    const request = await requestProgramReview(tx, userId);
    return { userId, jobId: request.job.id, created: request.created };
  });
  if (result.ok) {
    if (result.value.created)
      after(() => dispatchCoachJob(getDb(), result.value.userId, result.value.jobId));
    revalidatePath("/profile/programme");
    revalidatePath("/profile/ai-coach");
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
    revalidatePath("/profile/programme");
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
    revalidatePath("/profile/programme");
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
/**
 * "No thanks" on a reviewed set of changes.
 *
 * The draft stops being offered and the requests it answered are settled with the athlete's
 * own decision, rather than being left waiting for a proposal that no longer exists. Nothing
 * they have logged, and nothing in the running programme, moves.
 */
export async function declineProgramChangeAction(id: string) {
  const result = await mutate(async (tx, userId) => {
    const draftId = z.uuid().parse(id);
    const rows = await tx
      .update(programDrafts)
      .set({ status: "rejected" })
      .where(
        and(
          eq(programDrafts.id, draftId),
          eq(programDrafts.userId, userId),
          inArray(programDrafts.status, ["editing", "ready"]),
        ),
      )
      .returning({ id: programDrafts.id });
    if (!rows.length) throw new CoachingError("That change is no longer waiting for an answer.");
    await releaseRequestsForDraft(tx, userId, draftId, "declined", "You declined this change.");
    return rows[0]!;
  });
  if (result.ok) revalidatePath("/profile/programme");
  return result;
}

/**
 * "Not quite — here is what I want instead."
 *
 * The note is saved the way every note is saved, so the coach may quote it, and the requests
 * this proposal was answering go back to waiting. Like any request, it is assessed at the
 * next scheduled daily run: this does not start a coach run, and it does not go through
 * whole-programme creation, which would throw away the block the athlete is part-way through.
 */
export async function requestChangeRevisionsAction(id: string, notes: string, noteId: string) {
  const result = await mutate(async (tx, userId) => {
    const parsed = z
      .object({
        id: z.uuid(),
        noteId: z.uuid(),
        notes: z.string().trim().min(1, "Say what you would like changed.").max(PLAN_LIMITS.memo),
      })
      .parse({ id, noteId, notes });
    const rows = await tx
      .update(programDrafts)
      .set({ status: "rejected" })
      .where(
        and(
          eq(programDrafts.id, parsed.id),
          eq(programDrafts.userId, userId),
          inArray(programDrafts.status, ["editing", "ready"]),
        ),
      )
      .returning({ id: programDrafts.id });
    if (!rows.length) throw new CoachingError("That change is no longer waiting for an answer.");
    await saveCoachNotes(tx, userId, parsed.notes, parsed.noteId);
    await releaseRequestsForDraft(
      tx,
      userId,
      parsed.id,
      "waiting",
      "You asked for revisions. The coach reworks this at its next daily run.",
    );
    return rows[0]!;
  });
  if (result.ok) {
    revalidatePath("/profile/programme");
    revalidatePath("/profile/ai-coach");
  }
  return result;
}

/**
 * The answer to one coach question, given where the question was asked.
 *
 * It resumes that request rather than starting a programme from scratch, and it waits for the
 * next scheduled daily run like everything else the athlete saves.
 */
export async function answerProgramRequestAction(id: string, answer: string, noteId: string) {
  const result = await mutate(async (tx, userId) => {
    const parsed = z
      .object({
        id: z.uuid(),
        noteId: z.uuid(),
        answer: z.string().trim().min(1, "Write your answer.").max(PLAN_LIMITS.memo),
      })
      .parse({ id, noteId, answer });
    return answerProgramRequest(tx, userId, parsed.id, parsed.answer, parsed.noteId);
  });
  if (result.ok) {
    revalidatePath("/profile/ai-coach");
    revalidatePath("/profile/programme");
  }
  return result;
}

/** The athlete no longer wants this; it stops coming back, without being marked granted. */
export async function withdrawProgramRequestAction(id: string) {
  const result = await mutate((tx, userId) =>
    withdrawProgramRequest(tx, userId, z.uuid().parse(id)),
  );
  if (result.ok) {
    revalidatePath("/profile/ai-coach");
    revalidatePath("/profile/programme");
  }
  return result;
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
