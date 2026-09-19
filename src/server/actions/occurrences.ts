"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ENDURANCE_SPORTS } from "@/domain/activity";
import { endurancePrescriptionSchema, PRESCRIPTION_VERSION } from "@/domain/activity-prescription";
import { occurrenceVersions, plannedOccurrences } from "@/db/schema";
import { multisportRollout } from "@/lib/multisport-rollout";
import { requireUser } from "@/server/auth";
import { ensureProfile } from "@/server/queries/profile";
import { getTemplateRevision } from "@/server/repositories/activity-templates";
import {
  OccurrenceNotFoundError,
  reopenOccurrence,
  rescheduleOccurrence,
  skipOccurrence,
} from "@/server/repositories/occurrences";
import { formValues, parseForm, type FormState } from "@/server/validation/form";

/**
 * Deciding what happens to one scheduled session (plan §7).
 *
 * Each of these touches exactly the occurrence it names. Skipping a swim does not delay a
 * run; moving a ride does not move the day; undoing a skip restores that same session rather
 * than creating a second one. Standalone scheduling puts work on the calendar without
 * inventing a programme around it (SCHED-08).
 */

export type OccurrenceResult = { ok: true } | { ok: false; error: string };

function describe(error: unknown): string {
  if (error instanceof OccurrenceNotFoundError) return error.message;
  return "Something went wrong. Please try again.";
}

function revalidateSchedule(occurrenceId: string): void {
  revalidatePath("/today");
  revalidatePath("/training");
  revalidatePath("/training/scheduled");
  revalidatePath("/training/programme");
  revalidatePath(`/training/programme/occurrences/${occurrenceId}`);
}

export async function skipOccurrenceAction(
  occurrenceId: string,
  note?: string,
): Promise<OccurrenceResult> {
  const user = await requireUser();
  if (!multisportRollout().sharedNavigation)
    return { ok: false, error: "Scheduling is not switched on yet." };
  try {
    await withUser(getDb(), user.id, (tx) => skipOccurrence(tx, user.id, occurrenceId, note));
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
  revalidateSchedule(occurrenceId);
  return { ok: true };
}

export async function reopenOccurrenceAction(occurrenceId: string): Promise<OccurrenceResult> {
  const user = await requireUser();
  if (!multisportRollout().sharedNavigation)
    return { ok: false, error: "Scheduling is not switched on yet." };
  try {
    await withUser(getDb(), user.id, (tx) => reopenOccurrence(tx, user.id, occurrenceId));
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
  revalidateSchedule(occurrenceId);
  return { ok: true };
}

const rescheduleSchema = z.object({
  scheduledOn: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Choose a date." }),
  ),
});

export async function rescheduleOccurrenceAction(
  occurrenceId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!multisportRollout().sharedNavigation)
    return { formError: "Scheduling is not switched on yet." };
  const parsed = parseForm(rescheduleSchema, formData);
  if (!parsed.success) return parsed.state;
  try {
    await withUser(getDb(), user.id, (tx) =>
      rescheduleOccurrence(tx, user.id, occurrenceId, parsed.data.scheduledOn),
    );
  } catch (error) {
    return { formError: describe(error), values: formValues(formData) };
  }
  revalidateSchedule(occurrenceId);
  redirect(`/training/programme/occurrences/${occurrenceId}`);
}

const scheduleSchema = z.object({
  sport: z.enum(ENDURANCE_SPORTS),
  scheduledOn: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Choose a date." }),
  ),
  scheduledLocalTime: z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null),
    z
      .string()
      .regex(/^\d{2}:\d{2}$/, { error: "Enter a time as HH:MM." })
      .nullable(),
  ),
  templateId: z.preprocess(
    (value) => (typeof value === "string" && value.length > 0 ? value : null),
    z.uuid({ error: "Choose a template or none." }).nullable(),
  ),
  templateRevisionId: z.preprocess(
    (value) => (typeof value === "string" && value.length > 0 ? value : null),
    z.uuid().nullable(),
  ),
});

/**
 * Puts one session on the calendar, outside any programme.
 *
 * A template is copied by revision, so editing it later leaves this occurrence alone. Without
 * one, the occurrence carries an empty prescription: the athlete has said when, not what.
 */
export async function scheduleActivityAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const rollout = multisportRollout();
  if (!rollout.sharedNavigation) return { formError: "Scheduling is not switched on yet." };
  const parsed = parseForm(scheduleSchema, formData);
  if (!parsed.success) return parsed.state;
  const form = parsed.data;
  if (form.sport !== "running" && !rollout.newSports)
    return { formError: "That sport is not switched on yet.", values: formValues(formData) };

  let occurrenceId: string;
  try {
    occurrenceId = await withUser(getDb(), user.id, async (tx) => {
      const profile = await ensureProfile(tx, user);
      const revision = form.templateRevisionId
        ? await getTemplateRevision(tx, user.id, form.templateRevisionId)
        : null;
      if (form.templateRevisionId && (!revision || revision.sport !== form.sport))
        throw new OccurrenceNotFoundError();
      const prescription =
        revision?.prescription ??
        endurancePrescriptionSchema.parse({
          prescriptionVersion: PRESCRIPTION_VERSION,
          sport: form.sport,
          structureSource: "legacy_summary",
        });
      const [occurrence] = await tx
        .insert(plannedOccurrences)
        .values({
          userId: user.id,
          sport: form.sport,
          // Standalone: no programme family, and so no programme week to count against.
          familyId: null,
          disposition: "pending",
          originalScheduledOn: form.scheduledOn,
        })
        .returning({ id: plannedOccurrences.id });
      const [version] = await tx
        .insert(occurrenceVersions)
        .values({
          occurrenceId: occurrence!.id,
          userId: user.id,
          sport: form.sport,
          scheduledOn: form.scheduledOn,
          schedulingZone: profile.timeZone,
          scheduledLocalTime: form.scheduledLocalTime,
          prescription,
          templateRevisionId: revision?.id ?? null,
        })
        .returning({ id: occurrenceVersions.id });
      await tx
        .update(plannedOccurrences)
        .set({ currentRevisionId: version!.id })
        .where(eq(plannedOccurrences.id, occurrence!.id));
      return occurrence!.id;
    });
  } catch (error) {
    return { formError: describe(error), values: formValues(formData) };
  }
  revalidateSchedule(occurrenceId);
  redirect("/training/scheduled");
}
