"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { fromDateTimeLocal } from "@/lib/time";
import { requireUser } from "@/server/auth";
import { ensureProfile } from "@/server/queries/profile";
import {
  createRun,
  deleteRun,
  getPlannedRunPlace,
  PlannedRunNotFoundError,
  RunNotFoundError,
  updateRun,
  type PlannedRunPlace,
} from "@/server/repositories/runs";
import type { RunInput } from "@/server/repositories/runs";
import type { DbOrTx } from "@/db/types";
import {
  clearRunSlotEvent,
  getSchedule,
  recordSlotEvent,
  slotForPlannedRun,
} from "@/server/repositories/schedule";
import { todayInTimeZone } from "@/domain/program-calendar";
import { formValues, parseForm, type FormState } from "@/server/validation/form";

const optionalNumber = (min: number, max: number, integer: boolean, message: string) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? value.replace(",", ".") : null),
    (integer
      ? z.coerce.number({ error: message }).int({ error: message })
      : z.coerce.number({ error: message })
    )
      .min(min, { error: message })
      .max(max, { error: message })
      .nullable(),
  );

const shinScore = optionalNumber(0, 10, true, "Shin scores are whole numbers from 0 to 10.");

const runSchema = z
  .object({
    startedAt: z.preprocess(
      (value) => (typeof value === "string" ? value.trim() : ""),
      z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, { error: "Enter the date and time." }),
    ),
    treadmill: z.preprocess((value) => value === "on" || value === "true", z.boolean()),
    distanceKm: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() !== "" ? value.replace(",", ".") : undefined,
      z.coerce
        .number({ error: "Enter the distance in km." })
        .positive({ error: "Enter the distance in km." })
        .max(100, { error: "That is more than 100 km." }),
    ),
    durationMinutes: optionalNumber(0, 600, true, "Minutes must be a whole number."),
    durationSeconds: optionalNumber(0, 59, true, "Seconds go from 0 to 59."),
    rpe: optionalNumber(1, 10, false, "RPE goes from 1 to 10."),
    shinLeftPre: shinScore,
    shinRightPre: shinScore,
    shinLeftDuring: shinScore,
    shinRightDuring: shinScore,
    shinLeftPost: shinScore,
    shinRightPost: shinScore,
    programRunId: z.preprocess(
      (value) => (typeof value === "string" && value.length > 0 ? value : null),
      z.uuid({ error: "Choose a planned run or none." }).nullable(),
    ),
    notes: z.preprocess(
      (value) => (typeof value === "string" ? value.trim() : ""),
      z
        .string()
        .max(1000, { error: "Keep notes under 1000 characters." })
        .transform((value) => (value.length > 0 ? value : null)),
    ),
  })
  .superRefine((value, ctx) => {
    if ((value.durationMinutes ?? 0) * 60 + (value.durationSeconds ?? 0) <= 0) {
      ctx.addIssue({ code: "custom", path: ["durationMinutes"], message: "Enter the duration." });
    }
  });

/**
 * Ties a logged run to the day of the programme it answers for.
 *
 * A day that lifts and runs asks for two separate things, and this is what says the run half
 * has been done: without it, finishing the workout was taken to mean the whole day was over
 * and the run simply vanished from Today. The link is by the run's own id, so re-pointing or
 * deleting the run gives the day back.
 */
async function linkRunToProgramme(
  tx: DbOrTx,
  userId: string,
  runId: string,
  planned: PlannedRunPlace | null,
  occurredOn: string,
): Promise<void> {
  await clearRunSlotEvent(tx, userId, runId);
  if (!planned) return;
  const schedule = await getSchedule(tx, userId);
  if (!schedule || schedule.program.id !== planned.programId) return;
  const ref = slotForPlannedRun(schedule, planned);
  if (!ref) return;
  await recordSlotEvent(tx, userId, schedule.program.id, ref, "run", "completed", {
    occurredOn,
    runId,
  });
}

function revalidateRuns(runId?: string): void {
  revalidatePath("/runs");
  revalidatePath("/today");
  revalidatePath("/settings/programme");
  revalidatePath("/history");
  revalidatePath("/progress");
  if (runId) revalidatePath(`/runs/${runId}`);
}

function describe(error: unknown): string {
  if (error instanceof RunNotFoundError || error instanceof PlannedRunNotFoundError)
    return error.message;
  return "Something went wrong. Please try again.";
}

/** Creates a run, or updates it when `runId` is given, then opens it. */
export async function saveRunAction(
  runId: string | null,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(runSchema, formData);
  if (!parsed.success) return parsed.state;
  const value = parsed.data;

  let result: { ok: true; id: string } | { ok: false; state: FormState };
  try {
    result = await withUser(getDb(), user.id, async (tx) => {
      const profile = await ensureProfile(tx, user);
      const startedAt = fromDateTimeLocal(value.startedAt, profile.timeZone);
      if (!startedAt) {
        return {
          ok: false as const,
          state: {
            fieldErrors: { startedAt: "Enter the date and time." },
            values: formValues(formData),
          },
        };
      }
      // Read the plan's place before writing, so an id that is not in this programme is
      // rejected by the same check that decides which day the run answers for.
      const planned = value.programRunId
        ? await getPlannedRunPlace(tx, user.id, value.programRunId)
        : null;
      if (value.programRunId && !planned) throw new PlannedRunNotFoundError();
      const input: RunInput = {
        mode: value.treadmill ? "treadmill" : "outdoor",
        startedAt,
        durationSeconds: (value.durationMinutes ?? 0) * 60 + (value.durationSeconds ?? 0),
        distanceMeters: Math.round(value.distanceKm * 1000),
        rpe: value.rpe,
        shinLeftPre: value.shinLeftPre,
        shinRightPre: value.shinRightPre,
        shinLeftDuring: value.shinLeftDuring,
        shinRightDuring: value.shinRightDuring,
        shinLeftPost: value.shinLeftPost,
        shinRightPost: value.shinRightPost,
        programRunId: value.programRunId,
        notes: value.notes,
      };
      const occurredOn = todayInTimeZone(profile.timeZone, startedAt);
      if (runId) {
        await updateRun(tx, user.id, runId, input);
        await linkRunToProgramme(tx, user.id, runId, planned, occurredOn);
        return { ok: true as const, id: runId };
      }
      const created = await createRun(tx, user.id, input);
      await linkRunToProgramme(tx, user.id, created.id, planned, occurredOn);
      return { ok: true as const, id: created.id };
    });
  } catch (error) {
    return { formError: describe(error), values: formValues(formData) };
  }
  if (!result.ok) return result.state;
  revalidateRuns(result.id);
  redirect(`/runs/${result.id}`);
}

export type DeleteResult = { ok: true } | { ok: false; error: string };

export async function deleteRunAction(runId: string): Promise<DeleteResult> {
  const user = await requireUser();
  try {
    await withUser(getDb(), user.id, async (tx) => {
      // The day gets its run back: the programme must never count a run that is gone.
      await clearRunSlotEvent(tx, user.id, runId);
      await deleteRun(tx, user.id, runId);
    });
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
  revalidateRuns(runId);
  redirect("/runs");
}
