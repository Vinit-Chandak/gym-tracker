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
import type { BodyLoadUnit } from "@/domain/types";
import { fromKilograms } from "@/lib/units";
import { requireUser, type SessionUser } from "@/server/auth";
import { ensureProfile } from "@/server/queries/profile";
import { profileChanged } from "@/server/queries/request-profile";
import { knownTimeZone } from "@/server/queries/time-zone";
import { recordBodyWeight } from "@/server/repositories/body-weight";
import { formValues, parseForm, type FormState } from "@/server/validation/form";
import {
  profileInputSchema,
  type ProfileInput,
  UNKNOWN_TIME_ZONE,
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
 * Whether the weight sent back is the one the form showed, rather than a new reading.
 *
 * The form shows a stored weight to a tenth, in the account's units, and restates it when the
 * units are switched; what comes back is that tenth turned back into kilograms, not the reading
 * itself (80 kg shows as 176.4 lb and returns as 80.01 kg; 82.25 kg returns as 82.3). Compared
 * exactly, saving the form for anything else — a new time zone, the other units — recorded a
 * weigh-in nobody took, and the weight drifted (ADR 0020: a round trip returns what was typed).
 * So the two are compared as the form shows them: in the units it opened in, and in the units
 * it was sent in. A change too small to show is not one.
 */
function showsAsStored(
  storedKg: number | null,
  sentKg: number,
  units: readonly BodyLoadUnit[],
): boolean {
  if (storedKg === null) return false;
  return units.some((unit) => fromKilograms(storedKg, unit) === fromKilograms(sentKg, unit));
}

/**
 * Writes the profile and, when the weight has moved, records it as today's reading — dated in
 * the time zone the same submission just set. `recordBodyWeight` owns `profiles.body_weight_kg`
 * from there, so the trend and the number on the profile always tell the same story.
 */
async function saveProfile(tx: DbOrTx, user: SessionUser, input: ProfileInput): Promise<void> {
  // The units the form was opened in: this submission may be the one that changes them.
  const openedIn: BodyLoadUnit =
    (await ensureProfile(tx, user)).preferredUnit === "lb" ? "lb" : "kg";
  const { bodyWeightKg, ...rest } = input;
  // The weight is deliberately not among the columns written here, so what comes back is the
  // weight as it stood before this submission — the thing worth comparing against.
  const [before] = await tx
    .update(profiles)
    .set(rest)
    .where(eq(profiles.id, user.id))
    .returning({ bodyWeightKg: profiles.bodyWeightKg });
  if (showsAsStored(before?.bodyWeightKg ?? null, bodyWeightKg, [openedIn, input.preferredUnit]))
    return;
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
    const saved = await withUser(getDb(), user.id, async (tx) => {
      // Stored as Postgres spells it, so every screen and the graphs read one zone.
      const timeZone = await knownTimeZone(tx, parsed.data.timeZone);
      if (!timeZone) return false;
      await saveProfile(tx, user, { ...parsed.data, timeZone });
      return true;
    });
    if (!saved) return unknownTimeZone(formData);
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
