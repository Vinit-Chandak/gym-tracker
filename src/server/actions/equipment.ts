"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import {
  createEquipment,
  EquipmentNameTakenError,
  GymNotFoundError,
  setEquipmentActive,
  updateEquipment,
} from "@/server/repositories/equipment";
import { formValues, parseForm, type FormState } from "@/server/validation/form";
import { equipmentInputSchema } from "@/server/validation/gyms";
import { workoutReturnPath, type WorkoutReturn } from "@/server/validation/params";

function revalidateGym(gymId: string): void {
  revalidatePath("/gyms");
  revalidatePath(`/gyms/${gymId}`);
  revalidatePath("/today");
}

/**
 * Adds a machine. `returnTo` carries the workout that sent the user here, so registering a
 * missing machine mid-session hands them back to the exercise that needed it rather than
 * leaving them on the gym screen with their workout somewhere behind them.
 */
export async function createEquipmentAction(
  gymId: string,
  returnTo: WorkoutReturn | null,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(equipmentInputSchema, formData);
  if (!parsed.success) return parsed.state;
  try {
    await withUser(getDb(), user.id, (tx) => createEquipment(tx, user.id, gymId, parsed.data));
  } catch (error) {
    if (error instanceof EquipmentNameTakenError) {
      return { fieldErrors: { name: error.message }, values: formValues(formData) };
    }
    if (error instanceof GymNotFoundError) {
      return { formError: "This gym no longer exists.", values: formValues(formData) };
    }
    throw error;
  }
  revalidateGym(gymId);
  if (returnTo) {
    revalidatePath(`/workouts/${returnTo.sessionId}`);
    redirect(workoutReturnPath(returnTo));
  }
  redirect(`/gyms/${gymId}`);
}

export async function updateEquipmentAction(
  equipmentId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(equipmentInputSchema, formData);
  if (!parsed.success) return parsed.state;
  let gymId: string;
  try {
    const updated = await withUser(getDb(), user.id, (tx) =>
      updateEquipment(tx, user.id, equipmentId, parsed.data),
    );
    if (!updated) {
      return { formError: "This machine no longer exists.", values: formValues(formData) };
    }
    gymId = updated.gymId;
  } catch (error) {
    if (error instanceof EquipmentNameTakenError) {
      return { fieldErrors: { name: error.message }, values: formValues(formData) };
    }
    throw error;
  }
  revalidateGym(gymId);
  redirect(`/gyms/${gymId}`);
}

export async function setEquipmentActiveAction(
  gymId: string,
  equipmentId: string,
  isActive: boolean,
): Promise<void> {
  const user = await requireUser();
  await withUser(getDb(), user.id, (tx) => setEquipmentActive(tx, user.id, equipmentId, isActive));
  revalidateGym(gymId);
  revalidatePath(`/gyms/${gymId}/equipment/${equipmentId}`);
}
