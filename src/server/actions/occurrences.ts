"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ENDURANCE_SPORTS } from "@/domain/activity";
import { endurancePrescriptionSchema, PRESCRIPTION_VERSION } from "@/domain/activity-prescription";
import { todayInTimeZone } from "@/domain/program-calendar";
import { occurrenceVersions, plannedOccurrences } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { ensureProfile } from "@/server/queries/profile";
import { getTemplateRevision } from "@/server/repositories/activity-templates";
import {
  OccurrenceClosedError,
  OccurrenceNotFoundError,
  removeStandaloneOccurrence,
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
  if (error instanceof OccurrenceNotFoundError || error instanceof OccurrenceClosedError)
    return error.message;
  return "Something went wrong. Please try again.";
}

function revalidateSchedule(occurrenceId: string): void {
  revalidatePath("/today");
  // Plan's week and each programme's weeks show where a session stands (ADR 0058).
  revalidatePath("/plan", "layout");
  revalidatePath(`/training/programme/occurrences/${occurrenceId}`);
}

export async function skipOccurrenceAction(
  occurrenceId: string,
  note?: string,
): Promise<OccurrenceResult> {
  const user = await requireUser();
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
  try {
    await withUser(getDb(), user.id, (tx) => reopenOccurrence(tx, user.id, occurrenceId));
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
  revalidateSchedule(occurrenceId);
  return { ok: true };
}

/**
 * Takes a standalone session off the calendar. A programme's own sessions are not removed
 * here: they change when the programme does.
 */
export async function removeOccurrenceAction(occurrenceId: string): Promise<OccurrenceResult> {
  const user = await requireUser();
  try {
    await withUser(getDb(), user.id, (tx) => removeStandaloneOccurrence(tx, user.id, occurrenceId));
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
  revalidateSchedule(occurrenceId);
  redirect("/plan");
}

/** Said where a date that has gone by is refused. */
const MOVE_TO_PAST = "Choose today or a later day.";
const SCHEDULE_IN_PAST =
  "That day has gone by. To record something you have already done, log it instead.";

const rescheduleSchema = z.object({
  scheduledOn: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z.iso.date({ error: "Choose a valid date." }),
  ),
});

export async function rescheduleOccurrenceAction(
  occurrenceId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(rescheduleSchema, formData);
  if (!parsed.success) return parsed.state;
  let moved: boolean;
  try {
    moved = await withUser(getDb(), user.id, async (tx) => {
      // A session is moved to a day still to come. Moved into the past it would only arrive
      // already missed, which is never what somebody moving it meant.
      const profile = await ensureProfile(tx, user);
      if (parsed.data.scheduledOn < todayInTimeZone(profile.timeZone)) return false;
      await rescheduleOccurrence(tx, user.id, occurrenceId, parsed.data.scheduledOn);
      return true;
    });
  } catch (error) {
    return { formError: describe(error), values: formValues(formData) };
  }
  if (!moved) return { fieldErrors: { scheduledOn: MOVE_TO_PAST }, values: formValues(formData) };
  revalidateSchedule(occurrenceId);
  redirect(`/training/programme/occurrences/${occurrenceId}`);
}

const scheduleSchema = z.object({
  sport: z.enum(ENDURANCE_SPORTS),
  scheduledOn: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z.iso.date({ error: "Choose a valid date." }),
  ),
  scheduledLocalTime: z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null),
    z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, { error: "Enter a time as HH:MM." })
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
  const parsed = parseForm(scheduleSchema, formData);
  if (!parsed.success) return parsed.state;
  const form = parsed.data;

  let occurrenceId: string | null;
  try {
    occurrenceId = await withUser(getDb(), user.id, async (tx) => {
      const profile = await ensureProfile(tx, user);
      // Scheduling is for days to come. A session put on a day that has gone by would be
      // missed the moment it was made; what was done then is logged, not scheduled.
      if (form.scheduledOn < todayInTimeZone(profile.timeZone)) return null;
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
  if (occurrenceId === null)
    return { fieldErrors: { scheduledOn: SCHEDULE_IN_PAST }, values: formValues(formData) };
  revalidateSchedule(occurrenceId);
  redirect("/plan");
}
