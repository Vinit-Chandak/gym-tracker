"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { profiles } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { withUser } from "@/db/with-user";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireUser, type SessionUser } from "@/server/auth";
import { ensureProfile } from "@/server/queries/profile";
import { profileChanged } from "@/server/queries/request-profile";
import { recordBodyWeight } from "@/server/repositories/body-weight";
import { formValues, parseForm, type FormState } from "@/server/validation/form";
import {
  basicProfileInputSchema,
  profileInputSchema,
  type ProfileInput,
} from "@/server/validation/profile";
import { USERNAME_TAKEN_MESSAGE } from "@/server/validation/username";

/**
 * The unique index on `profiles.username` is the last word on whether a name is free: the live
 * check under the field can lose a race. Its refusal comes back against the field, with the
 * rest of the form intact.
 */
function usernameTaken(formData: FormData): FormState {
  return { fieldErrors: { username: USERNAME_TAKEN_MESSAGE }, values: formValues(formData) };
}

/**
 * Writes the profile and, when the weight has moved, records it as today's reading — dated in
 * the time zone the same submission just set. `recordBodyWeight` owns `profiles.body_weight_kg`
 * from there, so the trend and the number on the profile always tell the same story.
 */
async function saveProfile(tx: DbOrTx, user: SessionUser, input: ProfileInput): Promise<void> {
  await ensureProfile(tx, user);
  const { bodyWeightKg, ...rest } = input;
  // The weight is deliberately not among the columns written here, so what comes back is the
  // weight as it stood before this submission — the thing worth comparing against.
  const [before] = await tx
    .update(profiles)
    .set(rest)
    .where(eq(profiles.id, user.id))
    .returning({ bodyWeightKg: profiles.bodyWeightKg });
  if (before?.bodyWeightKg === bodyWeightKg) return;
  await recordBodyWeight(tx, user.id, {
    measuredOn: todayInTimeZone(input.timeZone),
    weightKg: bodyWeightKg,
  });
}

export async function saveProfileAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(profileInputSchema, formData);
  if (!parsed.success) return parsed.state;

  try {
    await withUser(getDb(), user.id, (tx) => saveProfile(tx, user, parsed.data));
  } catch (error) {
    if (isUniqueViolation(error)) return usernameTaken(formData);
    throw error;
  }
  await profileChanged(user.id);
  revalidatePath("/profile");
  revalidatePath("/profile/edit");
  revalidatePath("/progress");
  revalidatePath("/today");
  return {};
}

/** Onboarding step 1: optional name, username, units and time zone, then the next step. */
export async function saveOnboardingProfileAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(basicProfileInputSchema, formData);
  if (!parsed.success) return parsed.state;

  try {
    await withUser(getDb(), user.id, async (tx) => {
      await ensureProfile(tx, user);
      await tx.update(profiles).set(parsed.data).where(eq(profiles.id, user.id));
    });
  } catch (error) {
    if (isUniqueViolation(error)) return usernameTaken(formData);
    throw error;
  }
  await profileChanged(user.id);
  // Which sports come next; the gym step follows only if lifting is one of them.
  redirect("/welcome/sports");
}

/**
 * Marks the first-run flow finished, including the programme-free tracking path.
 * Optional coaching details never block access to ordinary logging.
 */
export async function completeOnboardingAction(): Promise<void> {
  const user = await requireUser();
  await withUser(getDb(), user.id, async (tx) => {
    await ensureProfile(tx, user);
    await tx.update(profiles).set({ onboardedAt: new Date() }).where(eq(profiles.id, user.id));
  });
  await profileChanged(user.id);
  revalidatePath("/today");
  redirect("/today");
}
