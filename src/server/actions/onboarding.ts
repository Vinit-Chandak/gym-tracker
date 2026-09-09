"use server";

import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db/client";
import { equipmentInstances, equipmentTypes } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { ensureProfile } from "@/server/queries/profile";
import { createGym, listGyms } from "@/server/repositories/gyms";
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
  equipmentTypeIds: z.array(z.uuid()).max(200),
});

/**
 * Onboarding step 3: register one machine per ticked equipment type, named after the type.
 * These are starting points — stack increments, manufacturers and better names are edited
 * per machine afterwards, and anything missed is added from the gym screen.
 */
export async function addStarterEquipmentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = equipmentStepSchema.safeParse({
    gymId: formData.get("gymId"),
    equipmentTypeIds: formData.getAll("equipmentTypeIds").filter((v) => typeof v === "string"),
  });
  if (!parsed.success) return { formError: "Something in the form is not valid." };
  const { gymId, equipmentTypeIds } = parsed.data;

  if (equipmentTypeIds.length > 0) {
    await withUser(getDb(), user.id, async (tx) => {
      const gyms = await listGyms(tx, user.id);
      if (!gyms.some((gym) => gym.id === gymId)) return;
      const profile = await ensureProfile(tx, user);
      const types = await tx
        .select({
          id: equipmentTypes.id,
          name: equipmentTypes.name,
          defaultResistanceMode: equipmentTypes.defaultResistanceMode,
          defaultUnit: equipmentTypes.defaultUnit,
        })
        .from(equipmentTypes)
        .where(inArray(equipmentTypes.id, equipmentTypeIds));
      if (types.length === 0) return;
      await tx
        .insert(equipmentInstances)
        .values(
          types.map((type) => ({
            userId: user.id,
            gymId,
            equipmentTypeId: type.id,
            name: type.name,
            resistanceMode: type.defaultResistanceMode,
            // The catalogue states weights in kilograms; a machine is logged in the unit
            // the owner reads. Cardio and other unitless kinds keep their own default.
            unit: type.defaultUnit === "kg" ? profile.preferredUnit : type.defaultUnit,
          })),
        )
        // Going back a step and submitting again must not duplicate a machine.
        .onConflictDoNothing({ target: [equipmentInstances.gymId, equipmentInstances.name] });
    });
    revalidatePath("/gyms");
    revalidatePath(`/gyms/${gymId}`);
  }
  redirect("/welcome/programme");
}
