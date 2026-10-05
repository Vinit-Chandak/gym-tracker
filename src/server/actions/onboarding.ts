"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { ensureProfile } from "@/server/queries/profile";
import { GymNotFoundError } from "@/server/repositories/equipment";
import { createGym } from "@/server/repositories/gyms";
import {
  confirmStarterEquipment,
  StarterChoiceError,
} from "@/server/repositories/starter-equipment";
import { parseForm, type FormState } from "@/server/validation/form";
import { gymInputSchema } from "@/server/validation/gyms";

/** Onboarding step 2: the user's first gym, then straight on to its machines. */
export async function createFirstGymAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(gymInputSchema, formData);
  if (!parsed.success) return parsed.state;

  const gym = await withUser(getDb(), user.id, (tx) => createGym(tx, user.id, parsed.data));
  revalidatePath("/gyms");
  revalidatePath("/today");
  redirect(`/welcome/equipment?gym=${gym.id}`);
}

const equipmentStepSchema = z.object({
  gymId: z.uuid(),
  typeIds: z.array(z.uuid()).max(300),
  combinationIds: z.array(z.uuid()).max(50),
  notHereTypeIds: z.array(z.uuid()).max(100),
});

/**
 * Onboarding step 3, the machines step (plan: onboarding flow): what was confirmed, recorded in
 * one transaction. Each confirmed type or combination becomes one machine named after it, unless
 * the place already has it (an archived one is restored); the gym basics marked not here are
 * recorded as absent. Submitting again creates nothing more. Anything missed is confirmed as it
 * becomes relevant, in a workout, or added from the gym's page.
 */
export async function addStarterEquipmentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const strings = (name: string) =>
    formData.getAll(name).filter((value): value is string => typeof value === "string");
  const parsed = equipmentStepSchema.safeParse({
    gymId: formData.get("gymId"),
    typeIds: strings("typeId"),
    combinationIds: strings("combinationId"),
    notHereTypeIds: strings("notHereTypeId"),
  });
  if (!parsed.success) return { formError: "Something in the form is not valid." };
  const { gymId, ...choices } = parsed.data;

  try {
    await withUser(getDb(), user.id, async (tx) => {
      const profile = await ensureProfile(tx, user);
      return confirmStarterEquipment(
        tx,
        user.id,
        gymId,
        profile.preferredUnit === "lb" ? "lb" : "kg",
        choices,
      );
    });
  } catch (error) {
    if (error instanceof StarterChoiceError || error instanceof GymNotFoundError)
      return { formError: error.message };
    throw error;
  }
  revalidatePath("/gyms");
  revalidatePath(`/gyms/${gymId}`);
  revalidatePath("/today");
  redirect("/welcome/programme");
}
