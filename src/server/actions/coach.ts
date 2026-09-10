"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb } from "@/db/client";
import { profiles } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { PLAN_LIMITS } from "@/domain/session-plan";
import { requireUser } from "@/server/auth";
import {
  fireCoachRoutine,
  replanPayload,
  RoutineFireError,
  RoutineNotConfiguredError,
} from "@/server/coach-routine";
import { ensureProfile } from "@/server/queries/profile";
import { profileChanged } from "@/server/queries/request-profile";
import {
  CoachRequestLimitError,
  createCoachRequest,
  markRequestFailed,
  recordRoutineRun,
  saveCoachNotes,
} from "@/server/repositories/coach-plans";
import { getGym } from "@/server/repositories/gyms";
import { formValues, parseForm, type FormState } from "@/server/validation/form";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function setAiCoachEnabledAction(enabled: boolean): Promise<void> {
  const user = await requireUser();
  await withUser(getDb(), user.id, (tx) =>
    tx.update(profiles).set({ aiCoachEnabled: enabled }).where(eq(profiles.id, user.id)),
  );
  await profileChanged(user.id);
  revalidatePath("/settings/ai-coach");
  revalidatePath("/today");
}

const notesSchema = z.object({
  userNotes: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z.string().max(PLAN_LIMITS.memo),
  ),
});

/** What the athlete wants the coach to know, in their own words. */
export async function saveCoachNotesAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(notesSchema, formData);
  if (!parsed.success) return parsed.state;
  try {
    await withUser(getDb(), user.id, (tx) => saveCoachNotes(tx, user.id, parsed.data.userNotes));
  } catch {
    return { formError: "Could not save your notes. Please retry.", values: formValues(formData) };
  }
  revalidatePath("/settings/ai-coach");
  return {};
}

const requestSchema = z.object({
  gymId: z.uuid(),
  reason: z
    .string()
    .trim()
    .max(200)
    .transform((value) => (value.length > 0 ? value : null)),
});

/**
 * Asks the coach for a plan at a gym, now. Records the request, then starts a run of the
 * routine; the plan arrives through the service API a few minutes later. A run the app
 * could not start is marked failed at once, so Today never waits for it.
 */
export async function requestCoachPlanAction(gymId: string, reason: string): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = requestSchema.safeParse({ gymId, reason });
  if (!parsed.success) return { ok: false, error: "Choose a gym." };
  let requestId: string;
  try {
    const created = await withUser(getDb(), user.id, async (tx) => {
      const [profile, gym] = await Promise.all([
        ensureProfile(tx, user),
        getGym(tx, user.id, parsed.data.gymId),
      ]);
      if (!profile.aiCoachEnabled) throw new Error("The AI coach is switched off in Settings.");
      if (!gym || !gym.isActive || gym.kind !== "gym") throw new Error("Choose one of your gyms.");
      return createCoachRequest(tx, user.id, {
        gymId: gym.id,
        reason: parsed.data.reason,
        timeZone: profile.timeZone,
      });
    });
    requestId = created.id;
  } catch (error) {
    if (error instanceof CoachRequestLimitError || error instanceof Error)
      return { ok: false, error: error.message };
    return { ok: false, error: "Could not ask the coach. Please retry." };
  }

  try {
    const run = await fireCoachRoutine(
      replanPayload({
        userId: user.id,
        gymId: parsed.data.gymId,
        requestId,
        reason: parsed.data.reason,
      }),
    );
    await withUser(getDb(), user.id, (tx) => recordRoutineRun(tx, user.id, requestId, run));
  } catch (error) {
    const message =
      error instanceof RoutineFireError || error instanceof RoutineNotConfiguredError
        ? error.message
        : "Could not start the coach. Please retry.";
    await withUser(getDb(), user.id, (tx) => markRequestFailed(tx, user.id, requestId, message));
    revalidatePath("/today");
    return { ok: false, error: message };
  }
  revalidatePath("/today");
  return { ok: true };
}
