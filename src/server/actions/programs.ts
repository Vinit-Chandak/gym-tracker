"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db/client";
import { profiles } from "@/db/schema";
import { findProgramTemplate } from "@/db/seed/data/templates";
import { withUser } from "@/db/with-user";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireUser } from "@/server/auth";
import { ensureProfile } from "@/server/queries/profile";
import { profileChanged } from "@/server/queries/request-profile";
import {
  createProgramFromBlueprint,
  MissingReferenceDataError,
} from "@/server/repositories/programs";
import { civilDate } from "@/server/validation/date-range";

export type AdoptProgramState = { error?: string };

const adoptSchema = z.object({
  templateSlug: z.string().min(1),
  startDate: civilDate.optional(),
  /** Set by the last onboarding step: finish setup and go and train. */
  finishOnboarding: z.literal("1").optional(),
});

/** Copies a shared programme template into the signed-in user's own programme rows. */
export async function adoptProgramTemplateAction(
  _previous: AdoptProgramState,
  formData: FormData,
): Promise<AdoptProgramState> {
  const user = await requireUser();
  const parsed = adoptSchema.safeParse({
    templateSlug: formData.get("templateSlug"),
    startDate: formData.get("startDate") || undefined,
    finishOnboarding: formData.get("finishOnboarding") || undefined,
  });
  if (!parsed.success) return { error: "Choose a programme and a valid start date." };

  const template = findProgramTemplate(parsed.data.templateSlug);
  if (!template) return { error: "That programme is no longer available." };

  let finishedOnboarding = false;
  try {
    await withUser(getDb(), user.id, async (tx) => {
      const profile = await ensureProfile(tx, user);
      const startDate = parsed.data.startDate ?? todayInTimeZone(profile.timeZone);
      await createProgramFromBlueprint(tx, user.id, template.blueprint, { startDate });
      if (parsed.data.finishOnboarding && profile.onboardedAt === null) {
        await tx.update(profiles).set({ onboardedAt: new Date() }).where(eq(profiles.id, user.id));
        finishedOnboarding = true;
      }
    });
  } catch (error) {
    if (error instanceof MissingReferenceDataError) return { error: error.message };
    throw error;
  }
  if (finishedOnboarding) await profileChanged(user.id);
  revalidatePath("/settings");
  revalidatePath("/today");
  if (parsed.data.finishOnboarding) redirect("/today");
  return {};
}
