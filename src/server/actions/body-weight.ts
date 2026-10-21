"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireUser } from "@/server/auth";
import { getRequestProfile, profileChanged } from "@/server/queries/request-profile";
import { recordBodyWeight } from "@/server/repositories/body-weight";
import { bodyWeightLogSchema } from "@/server/validation/body-weight";
import { parseForm, type FormState } from "@/server/validation/form";

/**
 * Today › Log › Body weight: a reading for the day it was taken, today or earlier, written as a
 * workout's Finish writes one (`recordBodyWeight`). A day holds one reading, so a second that day
 * corrects it; the profile's own weight is whichever reading is newest (ADR 0020).
 */
export async function logBodyWeightAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const parsed = parseForm(bodyWeightLogSchema(todayInTimeZone(profile.timeZone)), formData);
  if (!parsed.success) return parsed.state;

  await withUser(getDb(), user.id, (tx) => recordBodyWeight(tx, user.id, parsed.data));
  // The reading may have moved the profile's own body weight, which protein is read against.
  await profileChanged(user.id);
  revalidatePath("/progress");
  revalidatePath("/food");
  revalidatePath("/food/targets");
  return {};
}
