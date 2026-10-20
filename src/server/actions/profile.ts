"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { profiles } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { chosenSportUnits } from "@/lib/distance-units";
import { requireUser } from "@/server/auth";
import { ensureProfile } from "@/server/queries/profile";
import { profileChanged } from "@/server/queries/request-profile";
import { knownTimeZone } from "@/server/queries/time-zone";
import { formValues, parseForm, type FormState } from "@/server/validation/form";
import {
  profileInputSchema,
  UNKNOWN_TIME_ZONE,
  unitsInputSchema,
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

/** A zone the browser reads but Postgres, which dates the graphs, does not. */
function unknownTimeZone(formData: FormData): FormState {
  return { fieldErrors: { timeZone: UNKNOWN_TIME_ZONE }, values: formValues(formData) };
}

/**
 * Edit profile: who the person training is. Saving asks for every answer the screen shows
 * (ADR 0020), so an account that predates a question answers it here before anything saves.
 */
export async function saveProfileAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(profileInputSchema, formData);
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
  revalidatePath("/profile");
  revalidatePath("/profile/edit");
  // The goal chooses Food's split, and the age estimates the heart-rate zones.
  revalidatePath("/food");
  revalidatePath("/profile/heart-rate");
  return {};
}

/**
 * Profile › Units and time zone: the weight unit, which the height follows (ADR 0020), the
 * distances, which follow the weight unit unless set apart from it (ADR 0055), and the zone
 * every day the app names is dated in.
 */
export async function saveUnitsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(unitsInputSchema, formData);
  if (!parsed.success) return parsed.state;
  const { preferredUnit, distanceUnit, poolUnit } = parsed.data;

  const saved = await withUser(getDb(), user.id, async (tx) => {
    // Stored as Postgres spells it, so every screen and the graphs read one zone.
    const timeZone = await knownTimeZone(tx, parsed.data.timeZone);
    if (!timeZone) return false;
    await ensureProfile(tx, user);
    await tx
      .update(profiles)
      .set({
        preferredUnit,
        // Kept only where they differ from what the weight unit gives, so distances nobody set
        // apart go on following it (ADR 0055).
        ...chosenSportUnits(preferredUnit, { distanceUnit, poolUnit }),
        timeZone,
      })
      .where(eq(profiles.id, user.id));
    return true;
  });
  if (!saved) return unknownTimeZone(formData);
  await profileChanged(user.id);
  revalidatePath("/profile");
  revalidatePath("/profile/units");
  // The height is shown in the weight unit's measure.
  revalidatePath("/profile/edit");
  revalidatePath("/progress");
  revalidatePath("/today");
  revalidatePath("/food");
  return {};
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
