"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import {
  AD_HOC_ORIGIN,
  isEnduranceSport,
  plannedOrigin,
  reportedEffort,
  UNKNOWN_EFFORT,
  type Effort,
  type EnduranceSport,
  type LogOrigin,
} from "@/domain/activity";
import {
  DECIMALS,
  EFFORT,
  needsDistanceConfirmation,
  needsDurationConfirmation,
  TEXT_LIMITS,
} from "@/domain/activity-limits";
import {
  actualDistanceMetres,
  nativeDistance,
  type CyclingActualV1,
  type EnduranceActual,
  type RunningActualV1,
  type SwimmingActualV1,
} from "@/domain/activity-metrics";
import { todayInTimeZone } from "@/domain/program-calendar";
import { multisportRollout } from "@/lib/multisport-rollout";
import { fromDateTimeLocal } from "@/lib/time";
import { requireUser } from "@/server/auth";
import { ensureProfile } from "@/server/queries/profile";
import { revalidateActivity } from "@/server/activity-effects";
import {
  ActivityNotFoundError,
  createActivity,
  deleteActivity,
  getActivity,
  InvalidActualError,
  OccurrenceNotFoundError,
  OccurrenceTakenError,
  StaleActivityError,
  SubmissionConflictError,
  updateActivity,
  type SaveActivityInput,
} from "@/server/repositories/activities";
import { formValues, parseForm, type FormState } from "@/server/validation/form";

/**
 * Saving an endurance activity (plan §§4, 5.2).
 *
 * Measurements arrive as the athlete typed them, in the unit they typed them in, and are kept
 * that way beside the metres derived once. Effort is answered, not defaulted: a number or an
 * explicit "not sure", never a coach's target quietly promoted to a performance. The sport
 * and what the log answers for are decided at the entry point and fixed from there.
 */

const trimmed = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z
      .string()
      .max(max, { error: `Keep this under ${max} characters.` })
      .transform((value) => (value.length > 0 ? value : null)),
  );

const optionalNumber = (label: string, decimals: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() !== "" ? value.trim().replace(",", ".") : null,
    z.coerce
      .number({ error: `Enter ${label} as a number.` })
      .refine((value) => Number.isFinite(value), { error: `Enter ${label} as a number.` })
      .refine((value) => decimalPlacesOf(value) <= decimals, {
        error:
          decimals === 0
            ? `Enter ${label} as a whole number.`
            : `Enter ${label} to at most ${decimals} decimal place${decimals === 1 ? "" : "s"}.`,
      })
      .nullable(),
  );

function decimalPlacesOf(value: number): number {
  const text = Math.abs(value).toString();
  if (text.includes("e")) return Number.POSITIVE_INFINITY;
  return (text.split(".")[1] ?? "").length;
}

const wholeNumber = (label: string) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null),
    z.coerce
      .number({ error: `Enter ${label} as a whole number.` })
      .int({ error: `Enter ${label} as a whole number.` })
      .nullable(),
  );

/** Hours, minutes and seconds as one duration. Whole seconds; swimming may add tenths. */
const durationFields = z.object({
  hours: wholeNumber("the hours"),
  minutes: wholeNumber("the minutes"),
  seconds: optionalNumber("the seconds", 1),
});

const baseFields = {
  submissionKey: z.uuid({ error: "This form is out of date. Reload and try again." }),
  startedAt: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, { error: "Enter the date and time." }),
  ),
  /** 1–10, or the explicit "not sure" that LOG-03 requires as its own answer. */
  effort: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z.string().refine(
      (value) => {
        if (value === "unsure") return true;
        if (!/^\d+(\.\d)?$/.test(value)) return false;
        const number = Number(value);
        return number >= EFFORT.min && number <= EFFORT.max;
      },
      { error: "Rate the effort from 1 to 10, or choose Not sure." },
    ),
  ),
  outcome: z.enum(["logged", "ended_early"]).default("logged"),
  title: trimmed(TEXT_LIMITS.title),
  notes: trimmed(TEXT_LIMITS.notes),
  occurrenceId: z.preprocess(
    (value) => (typeof value === "string" && value.length > 0 ? value : null),
    z.uuid({ error: "That planned session is not valid." }).nullable(),
  ),
  revisionId: z.preprocess(
    (value) => (typeof value === "string" && value.length > 0 ? value : null),
    z.uuid({ error: "That planned session is not valid." }).nullable(),
  ),
  planId: z.preprocess(
    (value) => (typeof value === "string" && value.length > 0 ? value : null),
    z.uuid().nullable(),
  ),
  expectedRevision: wholeNumber("the version"),
  /** The athlete's answer to "is that right?" for an unusually large entry. */
  confirmLarge: z.preprocess((value) => value === "on" || value === "true", z.boolean()),
  averageHeartRate: optionalNumber("the average heart rate", DECIMALS.heartRate),
  maxHeartRate: optionalNumber("the maximum heart rate", DECIMALS.heartRate),
};

const distanceUnit = z.enum(["km", "mi"]).default("km");
const poolUnit = z.enum(["m", "yd"]).default("m");

const runningSchema = z.object({
  ...baseFields,
  sport: z.literal("running"),
  environment: z.enum(["outdoor", "treadmill"]),
  distanceValue: optionalNumber("the distance", DECIMALS.distance),
  distanceUnit,
  ...durationFields.shape,
  surface: trimmed(TEXT_LIMITS.surface),
  elevationGainMetres: optionalNumber("the elevation gain", DECIMALS.elevation),
  treadmillInclinePercent: optionalNumber("the incline", DECIMALS.incline),
  cadenceStepsPerMinute: optionalNumber("the cadence", DECIMALS.cadence),
});

const cyclingSchema = z.object({
  ...baseFields,
  sport: z.literal("cycling"),
  environment: z.enum(["outdoor", "indoor"]),
  distanceValue: optionalNumber("the distance", DECIMALS.distance),
  distanceUnit,
  ...durationFields.shape,
  assistance: z.enum(["unknown", "unassisted", "assisted"]).default("unknown"),
  averagePowerWatts: optionalNumber("the average power", DECIMALS.power),
  averageCadenceRpm: optionalNumber("the average cadence", DECIMALS.cadence),
  elevationGainMetres: optionalNumber("the elevation gain", DECIMALS.elevation),
  resourceId: z.preprocess(
    (value) => (typeof value === "string" && value.length > 0 ? value : null),
    z.uuid().nullable(),
  ),
});

const swimmingSchema = z.object({
  ...baseFields,
  sport: z.literal("swimming"),
  environment: z.enum(["pool", "open_water"]),
  ...durationFields.shape,
  activeMinutes: wholeNumber("the swimming minutes"),
  activeSeconds: optionalNumber("the swimming seconds", 1),
  distanceMethod: z.enum(["unknown", "manual", "lengths"]).default("unknown"),
  distanceValue: optionalNumber("the distance", DECIMALS.distance),
  distanceUnit: poolUnit,
  poolLengthValue: optionalNumber("the pool length", DECIMALS.poolLength),
  poolLengthUnit: poolUnit,
  lengths: wholeNumber("the lengths"),
  stroke: z
    .enum(["freestyle", "backstroke", "breaststroke", "butterfly", "mixed", "drill", "unspecified"])
    .default("unspecified"),
  strokeCount: wholeNumber("the stroke count"),
  resourceId: z.preprocess(
    (value) => (typeof value === "string" && value.length > 0 ? value : null),
    z.uuid().nullable(),
  ),
});

const activitySchema = z.discriminatedUnion("sport", [
  runningSchema,
  cyclingSchema,
  swimmingSchema,
]);

type ActivityForm = z.output<typeof activitySchema>;

function durationMsOf(value: {
  hours: number | null;
  minutes: number | null;
  seconds: number | null;
}) {
  return Math.round(
    (value.hours ?? 0) * 3_600_000 + (value.minutes ?? 0) * 60_000 + (value.seconds ?? 0) * 1000,
  );
}

function effortOf(value: string): Effort {
  return value === "unsure" ? UNKNOWN_EFFORT : reportedEffort(Number(value));
}

/** The form as the typed measurements its sport actually has. */
function actualFrom(form: ActivityForm): EnduranceActual {
  const durationMs = durationMsOf(form);
  if (form.sport === "running") {
    const running: RunningActualV1 = {
      sport: "running",
      environment: form.environment,
      distance: nativeDistance(form.distanceValue ?? 0, form.distanceUnit),
      durationMs,
      surface: form.surface,
      elevationGainMetres: form.elevationGainMetres,
      treadmillInclinePercent: form.treadmillInclinePercent,
      averageHeartRate: form.averageHeartRate,
      maxHeartRate: form.maxHeartRate,
      cadenceStepsPerMinute: form.cadenceStepsPerMinute,
    };
    return running;
  }
  if (form.sport === "cycling") {
    const cycling: CyclingActualV1 = {
      sport: "cycling",
      environment: form.environment,
      durationMs,
      distance:
        form.distanceValue === null ? null : nativeDistance(form.distanceValue, form.distanceUnit),
      assistance: form.assistance,
      resourceId: form.resourceId,
      averagePowerWatts: form.averagePowerWatts,
      averageCadenceRpm: form.averageCadenceRpm,
      averageHeartRate: form.averageHeartRate,
      maxHeartRate: form.maxHeartRate,
      elevationGainMetres: form.elevationGainMetres,
    };
    return cycling;
  }
  const activeMs =
    form.activeMinutes === null && form.activeSeconds === null
      ? null
      : Math.round((form.activeMinutes ?? 0) * 60_000 + (form.activeSeconds ?? 0) * 1000);
  const swimming: SwimmingActualV1 = {
    sport: "swimming",
    environment: form.environment,
    elapsedMs: durationMs,
    activeMs,
    distanceMethod: form.distanceMethod,
    distance:
      form.distanceMethod === "manual" && form.distanceValue !== null
        ? nativeDistance(form.distanceValue, form.distanceUnit)
        : null,
    poolLength:
      form.poolLengthValue === null
        ? null
        : nativeDistance(form.poolLengthValue, form.poolLengthUnit),
    lengths: form.distanceMethod === "lengths" ? form.lengths : null,
    stroke: form.stroke,
    strokeCount: form.strokeCount,
    resourceId: form.resourceId,
    averageHeartRate: form.averageHeartRate,
    maxHeartRate: form.maxHeartRate,
  };
  return swimming;
}

function originOf(form: ActivityForm): LogOrigin {
  if (form.occurrenceId && form.revisionId)
    return plannedOrigin(form.occurrenceId, form.revisionId, form.planId);
  return AD_HOC_ORIGIN;
}

/**
 * An entry far outside what anyone trains is usually a unit mistake. The form asks once and
 * takes the answer; it never quietly shortens what somebody typed (§4.6).
 */
function confirmationNeeded(sport: EnduranceSport, actual: EnduranceActual): string | null {
  const metres = actualDistanceMetres(actual);
  const durationMs = actual.sport === "swimming" ? actual.elapsedMs : actual.durationMs;
  if (metres !== null && needsDistanceConfirmation(sport, metres))
    return "That is a long way. Confirm the distance is right.";
  if (needsDurationConfirmation(sport, durationMs))
    return "That is a long time. Confirm the duration is right.";
  return null;
}

function describe(error: unknown): string {
  if (
    error instanceof ActivityNotFoundError ||
    error instanceof OccurrenceNotFoundError ||
    error instanceof StaleActivityError ||
    error instanceof SubmissionConflictError ||
    error instanceof InvalidActualError
  )
    return error.message;
  if (error instanceof OccurrenceTakenError) return error.message;
  return "Something went wrong. Please try again.";
}

function fieldErrorsOf(error: unknown): Record<string, string> | undefined {
  if (!(error instanceof InvalidActualError)) return undefined;
  const fields: Record<string, string> = {};
  for (const problem of error.problems) fields[problem.field] ??= problem.message;
  return fields;
}

/** Creates an activity, or corrects the one named by `activityId`, then opens it. */
export async function saveActivityAction(
  activityId: string | null,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const rollout = multisportRollout();
  if (!rollout.canonicalWrites)
    return { formError: "Logging through this form is not switched on yet." };

  const parsed = parseForm(activitySchema, formData);
  if (!parsed.success) return parsed.state;
  const form = parsed.data;
  if (!rollout.newSports && form.sport !== "running")
    return { formError: "That sport is not switched on yet.", values: formValues(formData) };

  const actual = actualFrom(form);
  const confirmation = confirmationNeeded(form.sport, actual);
  if (confirmation && !form.confirmLarge)
    return { formError: confirmation, values: formValues(formData) };

  let result:
    | { ok: true; id: string; sport: EnduranceSport; occurrenceId: string | null }
    | { ok: false; state: FormState };
  try {
    result = await withUser(getDb(), user.id, async (tx) => {
      const profile = await ensureProfile(tx, user);
      const startedAt = fromDateTimeLocal(form.startedAt, profile.timeZone);
      if (!startedAt)
        return {
          ok: false as const,
          state: {
            fieldErrors: { startedAt: "Enter the date and time." },
            values: formValues(formData),
          },
        };
      const input: SaveActivityInput = {
        submissionKey: form.submissionKey,
        origin: originOf(form),
        actual,
        startedAt,
        recordedTimeZone: profile.timeZone,
        timeZoneSource: "profile_at_entry",
        occurredOn: todayInTimeZone(profile.timeZone, startedAt),
        effort: effortOf(form.effort),
        outcome: form.outcome,
        title: form.title,
        notes: form.notes,
      };
      const saved = activityId
        ? await updateActivity(tx, user.id, activityId, input, form.expectedRevision ?? 0)
        : await createActivity(tx, user.id, input);
      const record = await getActivity(tx, user.id, saved.id);
      return {
        ok: true as const,
        id: saved.id,
        sport: form.sport,
        occurrenceId: record?.origin.occurrenceId ?? null,
      };
    });
  } catch (error) {
    return {
      formError: describe(error),
      fieldErrors: fieldErrorsOf(error),
      values: formValues(formData),
    };
  }
  if (!result.ok) return result.state;
  revalidateActivity({
    sport: result.sport,
    activityId: result.id,
    occurrenceId: result.occurrenceId,
  });
  redirect(`/training/activities/${result.id}`);
}

export type DeleteActivityResult = { ok: true } | { ok: false; error: string };

/**
 * Removes an activity and everything derived from it, and gives its occurrence back. The
 * confirmation that this will happen belongs to the screen; by the time this runs, it has
 * been given (§5.2).
 */
export async function deleteActivityAction(activityId: string): Promise<DeleteActivityResult> {
  const user = await requireUser();
  if (!multisportRollout().canonicalWrites)
    return { ok: false, error: "Logging through this form is not switched on yet." };
  let removed: { occurrenceId: string | null; sport: string };
  try {
    removed = await withUser(getDb(), user.id, (tx) => deleteActivity(tx, user.id, activityId));
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
  revalidateActivity({
    sport: isEnduranceSport(removed.sport as EnduranceSport)
      ? (removed.sport as EnduranceSport)
      : "running",
    activityId,
    occurrenceId: removed.occurrenceId,
  });
  redirect("/history");
}
