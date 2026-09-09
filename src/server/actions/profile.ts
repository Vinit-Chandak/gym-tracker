"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { profiles } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { parseForm, type FormState } from "@/server/validation/form";
import { profileInputSchema } from "@/server/validation/profile";

export async function saveProfileAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(profileInputSchema, formData);
  if (!parsed.success) return parsed.state;

  await withUser(getDb(), user.id, (tx) =>
    tx.update(profiles).set(parsed.data).where(eq(profiles.id, user.id)),
  );
  revalidatePath("/settings");
  revalidatePath("/today");
  return {};
}

/** Onboarding step 1: the same fields, but it moves the user on to the next step. */
export async function saveOnboardingProfileAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(profileInputSchema, formData);
  if (!parsed.success) return parsed.state;

  await withUser(getDb(), user.id, (tx) =>
    tx.update(profiles).set(parsed.data).where(eq(profiles.id, user.id)),
  );
  redirect("/welcome/gym");
}

/** Marks the first-run flow finished, from the last step or from skipping ahead. */
export async function completeOnboardingAction(): Promise<void> {
  const user = await requireUser();
  await withUser(getDb(), user.id, (tx) =>
    tx.update(profiles).set({ onboardedAt: new Date() }).where(eq(profiles.id, user.id)),
  );
  revalidatePath("/today");
  redirect("/today");
}
