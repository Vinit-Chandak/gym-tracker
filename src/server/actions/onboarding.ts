"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db/client";
import { profiles } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORTS } from "@/domain/activity";
import { GYM_KINDS, TRAINING_EXPERIENCES } from "@/domain/types";
import { chosenSportUnits } from "@/lib/distance-units";
import { SETUP_PLACE_NAMES } from "@/lib/setup-place";
import { requireUser } from "@/server/auth";
import { ensureProfile } from "@/server/queries/profile";
import { profileChanged } from "@/server/queries/request-profile";
import { readSetupState } from "@/server/queries/setup-state";
import { knownTimeZone } from "@/server/queries/time-zone";
import { GymNotFoundError } from "@/server/repositories/equipment";
import { createGym, getGym, updateGym } from "@/server/repositories/gyms";
import { setSportPreference } from "@/server/repositories/sport-preferences";
import {
  confirmStarterEquipment,
  StarterChoiceError,
} from "@/server/repositories/starter-equipment";
import { formValues, parseForm, type FormState } from "@/server/validation/form";
import { UNKNOWN_TIME_ZONE, unitsInputSchema } from "@/server/validation/profile";

/** The two answers, and the units and zone as Profile › Units and time zone checks them. */
const youStepSchema = unitsInputSchema.extend({
  trainingExperience: z.enum(TRAINING_EXPERIENCES, {
    error: "Choose the one that sounds like you.",
  }),
  sports: z.preprocess(
    (value) => (typeof value === "string" ? value.split(",").filter(Boolean) : []),
    z.array(z.enum(ACTIVITY_SPORTS)).min(1, "Choose at least one.").max(ACTIVITY_SPORTS.length),
  ),
});

/**
 * Setup's first step (board You): which sounds like you, what you train, and the units and time
 * zone the phone proposed. Nothing asked at sign-up is asked again. Lifting goes on to where you
 * train; an athlete who only runs, rides or swims is finished here and goes to Today, since
 * nothing else in setup is about them.
 */
export async function saveYouStepAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(youStepSchema, formData);
  if (!parsed.success) return parsed.state;
  const { trainingExperience, sports, preferredUnit, distanceUnit, poolUnit, timeZone } =
    parsed.data;
  const lifts = sports.includes("strength");

  const saved = await withUser(getDb(), user.id, async (tx) => {
    // Stored as Postgres spells it, so every screen and the graphs read one zone.
    const zone = await knownTimeZone(tx, timeZone);
    if (!zone) return false;
    await ensureProfile(tx, user);
    await tx
      .update(profiles)
      .set({
        trainingExperience,
        preferredUnit,
        // Kept only where they differ from what the weight unit gives, so distances nobody set
        // apart go on following it (ADR 0055).
        ...chosenSportUnits(preferredUnit, { distanceUnit, poolUnit }),
        timeZone: zone,
        ...(lifts ? {} : { onboardedAt: new Date() }),
      })
      .where(eq(profiles.id, user.id));
    for (const sport of ACTIVITY_SPORTS) {
      await setSportPreference(tx, user.id, sport, { enabled: sports.includes(sport) });
    }
    return true;
  });
  // A zone the browser reads but Postgres, which dates the graphs, does not: said under the line
  // that names it.
  if (!saved) return { fieldErrors: { timeZone: UNKNOWN_TIME_ZONE }, values: formValues(formData) };
  await profileChanged(user.id);
  revalidatePath("/plan");
  revalidatePath("/profile/sports");
  revalidatePath("/today");
  redirect(lifts ? "/welcome/gym" : "/today");
}

const placeSchema = z.object({
  kind: z.enum(GYM_KINDS, { error: "Choose where you train." }),
  name: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z.string().max(80, "Keep this under 80 characters."),
  ),
});

/**
 * Setup's second step (board Where you train): the kind of place first, then its name, which is
 * optional. There is no way past it for a lifter: a programme cannot start without somewhere to
 * train (audit B8). Coming back to the step changes the place it made rather than adding a
 * second one.
 *
 * Then: at a gym, a beginner goes straight to the coach's questions (the basics are taken as
 * there, and a workout asks about anything else); someone who already trains is offered the
 * optional search for anything unusual. At home or outdoors nothing is taken as there, so both
 * are asked what they have.
 */
export async function saveSetupPlaceAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(placeSchema, formData);
  if (!parsed.success) return parsed.state;
  const { kind } = parsed.data;
  const name = parsed.data.name || SETUP_PLACE_NAMES[kind];

  const experience = await withUser(getDb(), user.id, async (tx) => {
    const profile = await ensureProfile(tx, user);
    const state = await readSetupState(tx, user.id, profile.trainingExperience);
    const existing = state.place ? await getGym(tx, user.id, state.place.id) : null;
    if (existing)
      await updateGym(tx, user.id, existing.id, {
        name,
        kind,
        address: existing.address,
        notes: existing.notes,
      });
    else await createGym(tx, user.id, { name, kind, address: null, notes: null });
    return profile.trainingExperience;
  });
  revalidatePath("/gyms");
  revalidatePath("/today");
  redirect(
    kind === "gym" && experience !== "experienced" ? "/welcome/programme" : "/welcome/equipment",
  );
}

const equipmentStepSchema = z.object({
  gymId: z.uuid(),
  typeIds: z.array(z.uuid()).max(300),
  combinationIds: z.array(z.uuid()).max(50),
  notHereTypeIds: z.array(z.uuid()).max(100),
});

/**
 * The optional equipment step (boards Anything unusual, What you have): what was confirmed,
 * recorded in one transaction. Each confirmed type or combination becomes one machine named after
 * it, unless the place already has it (an archived one is restored); the gym basics marked not
 * here are recorded as absent. Submitting again creates nothing more. Anything missed is
 * confirmed as it becomes relevant, in a workout, or added from the place's page.
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
