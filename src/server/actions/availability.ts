"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { markEquipmentAbsent, unmarkEquipmentAbsent } from "@/server/repositories/absent-equipment";
import { MachineNotAtGymError, setPreferredMachine } from "@/server/repositories/exercises";
import { addGymFallback, removeGymFallback } from "@/server/repositories/fallbacks";
import { formValues, parseForm, type FormState } from "@/server/validation/form";

function revalidateAvailability(gymId: string, exerciseId?: string): void {
  revalidatePath("/gyms");
  revalidatePath(`/gyms/${gymId}`);
  revalidatePath(`/gyms/${gymId}/programme`);
  revalidatePath("/exercises");
  if (exerciseId) revalidatePath(`/exercises/${exerciseId}`);
}

export async function markEquipmentAbsentAction(
  gymId: string,
  equipmentTypeId: string,
): Promise<void> {
  const user = await requireUser();
  await withUser(getDb(), user.id, (tx) =>
    markEquipmentAbsent(tx, user.id, gymId, equipmentTypeId),
  );
  revalidateAvailability(gymId);
}

/** Form variant: the equipment type comes from a <select name="equipmentTypeId">. */
export async function markEquipmentAbsentFromFormAction(
  gymId: string,
  formData: FormData,
): Promise<void> {
  const parsed = z.uuid().safeParse(formData.get("equipmentTypeId"));
  if (!parsed.success) return;
  await markEquipmentAbsentAction(gymId, parsed.data);
}

export async function unmarkEquipmentAbsentAction(
  gymId: string,
  equipmentTypeId: string,
): Promise<void> {
  const user = await requireUser();
  await withUser(getDb(), user.id, (tx) =>
    unmarkEquipmentAbsent(tx, user.id, gymId, equipmentTypeId),
  );
  revalidateAvailability(gymId);
}

/** Sets the preferred machine for an exercise at a gym; an empty selection means "automatic". */
export async function setPreferredMachineAction(
  exerciseId: string,
  gymId: string,
  formData: FormData,
): Promise<void> {
  const user = await requireUser();
  const raw = formData.get("equipmentInstanceId");
  const instanceId = typeof raw === "string" && raw.length > 0 ? raw : null;
  if (instanceId !== null && !z.uuid().safeParse(instanceId).success) return;
  try {
    await withUser(getDb(), user.id, (tx) =>
      setPreferredMachine(tx, user.id, exerciseId, gymId, instanceId),
    );
  } catch (error) {
    if (error instanceof MachineNotAtGymError) return;
    throw error;
  }
  revalidateAvailability(gymId, exerciseId);
}

const gymFallbackSchema = z.object({
  fallbackExerciseId: z.uuid({ error: "Choose an exercise." }),
  fallbackEquipmentInstanceId: z.preprocess(
    (value) => (typeof value === "string" && value.length > 0 ? value : null),
    z.uuid().nullable(),
  ),
});

export async function addGymFallbackAction(
  gymId: string,
  exerciseId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(gymFallbackSchema, formData);
  if (!parsed.success) return parsed.state;
  if (parsed.data.fallbackExerciseId === exerciseId) {
    return {
      fieldErrors: { fallbackExerciseId: "Pick a different exercise." },
      values: formValues(formData),
    };
  }
  let updated = 0;
  try {
    updated = await withUser(getDb(), user.id, (tx) =>
      addGymFallback(tx, user.id, {
        gymId,
        exerciseId,
        fallbackExerciseId: parsed.data.fallbackExerciseId,
        fallbackEquipmentInstanceId: parsed.data.fallbackEquipmentInstanceId,
      }),
    );
  } catch (error) {
    if (error instanceof MachineNotAtGymError) {
      return {
        fieldErrors: { fallbackEquipmentInstanceId: error.message },
        values: formValues(formData),
      };
    }
    throw error;
  }
  if (updated === 0) {
    return {
      formError: "This exercise is not in your active programme.",
      values: formValues(formData),
    };
  }
  revalidateAvailability(gymId, exerciseId);
  redirect(`/gyms/${gymId}/programme`);
}

export async function removeGymFallbackAction(gymId: string, fallbackId: string): Promise<void> {
  const user = await requireUser();
  await withUser(getDb(), user.id, (tx) => removeGymFallback(tx, user.id, fallbackId));
  revalidateAvailability(gymId);
}
