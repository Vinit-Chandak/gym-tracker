"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { createGym, setDefaultGym, setGymActive, updateGym } from "@/server/repositories/gyms";
import { formValues, parseForm, type FormState } from "@/server/validation/form";
import { gymInputSchema } from "@/server/validation/gyms";

function revalidateGyms(gymId?: string): void {
  revalidatePath("/gyms");
  revalidatePath("/today");
  revalidatePath("/settings");
  if (gymId) revalidatePath(`/gyms/${gymId}`);
}

export async function createGymAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(gymInputSchema, formData);
  if (!parsed.success) return parsed.state;
  const gym = await withUser(getDb(), user.id, (tx) => createGym(tx, user.id, parsed.data));
  revalidateGyms(gym.id);
  redirect(`/gyms/${gym.id}`);
}

export async function updateGymAction(
  gymId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(gymInputSchema, formData);
  if (!parsed.success) return parsed.state;
  const gym = await withUser(getDb(), user.id, (tx) => updateGym(tx, user.id, gymId, parsed.data));
  if (!gym) return { formError: "This gym no longer exists.", values: formValues(formData) };
  revalidateGyms(gymId);
  redirect(`/gyms/${gymId}`);
}

/** Makes a gym the default. Safe to call from a form or from a client transition. */
export async function setDefaultGymAction(gymId: string): Promise<void> {
  const user = await requireUser();
  await withUser(getDb(), user.id, (tx) => setDefaultGym(tx, user.id, gymId));
  revalidateGyms(gymId);
}

export async function setGymActiveAction(gymId: string, isActive: boolean): Promise<void> {
  const user = await requireUser();
  await withUser(getDb(), user.id, (tx) => setGymActive(tx, user.id, gymId, isActive));
  revalidateGyms(gymId);
}
