"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { SET_LIMITS } from "@/domain/sets";

import { getDb } from "@/db/client";
import { profiles } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { todayInTimeZone } from "@/domain/program-calendar";
import { nextPendingSlot, pendingParts } from "@/domain/schedule";
import { BODY_LOAD_UNITS, SET_TYPES, type SlotPart } from "@/domain/types";
import { fromKilograms, toKilograms } from "@/lib/units";
import { requireUser } from "@/server/auth";
import { ensureProfile } from "@/server/queries/profile";
import { profileChanged } from "@/server/queries/request-profile";
import { recordBodyWeight } from "@/server/repositories/body-weight";
import { addGymFallback } from "@/server/repositories/fallbacks";
import { voidPlanForSlot } from "@/server/repositories/coach-plans";
import {
  completeRestSlotsBefore,
  getSchedule,
  pendingCycleForDay,
  recordSlotEvent,
} from "@/server/repositories/schedule";
import {
  addExerciseToSession,
  deleteSet,
  discardSession,
  ExerciseHasSetsError,
  finishSession,
  getInProgressSession,
  logSet,
  saveCheckIn,
  removeSupersetGroup,
  saveSupersetGroup,
  SessionFinishedError,
  SetConflictError,
  SessionHasSetsError,
  SessionNotFoundError,
  setExerciseCompleted,
  SupersetGroupError,
  setWarmupCompleted,
  skipExercise,
  startAdHocSession,
  startPlannedSession,
  substituteExercise,
  type SessionSet,
} from "@/server/repositories/sessions";
import { formValues, parseForm, type FormState } from "@/server/validation/form";
import { eq } from "drizzle-orm";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateSession(sessionId?: string): void {
  revalidatePath("/today");
  revalidatePath("/history");
  revalidatePath("/progress");
  revalidatePath("/settings");
  if (sessionId) revalidatePath(`/workouts/${sessionId}`);
}

/**
 * Re-renders the screen the action was called from and sends the new payload back with the
 * action's own reply.
 *
 * The workout screen moves between its list and one exercise with `history.pushState`, not a
 * navigation, so nothing else ever refetches it: without this, sets logged and exercises
 * completed were written to the database but the list went on showing the render the page
 * arrived with — "Start" against an exercise that was done, and an empty grid on reopening it —
 * until the whole route was left and come back to. `refresh` is the right tool rather than
 * `revalidatePath`: this data is read per request behind Row Level Security, so there is no
 * cache entry to invalidate, only a stale render to replace.
 */
function refreshSession(): void {
  refresh();
}

function describe(error: unknown): string {
  if (error instanceof SessionFinishedError || error instanceof SessionHasSetsError)
    return error.message;
  if (error instanceof SupersetGroupError) return error.message;
  if (error instanceof ExerciseHasSetsError) return error.message;
  if (error instanceof SetConflictError) return error.message;
  if (error instanceof SessionNotFoundError) return "That session no longer exists.";
  return "Something went wrong. Please try again.";
}

/** Starts the planned day at a gym and goes to the recovery check-in. */
export async function startPlannedSessionAction(
  gymId: string,
  programDayId: string,
  dayIndex: number,
): Promise<void> {
  const user = await requireUser();
  const sessionId = await withUser(getDb(), user.id, async (tx) => {
    // Three independent reads in one round trip; an open session simply wins.
    const [open, profile, schedule] = await Promise.all([
      getInProgressSession(tx, user.id),
      ensureProfile(tx, user),
      getSchedule(tx, user.id),
    ]);
    if (open) return open.id;
    const today = todayInTimeZone(profile.timeZone);
    if (!schedule) throw new SessionNotFoundError();
    const cycleIndex =
      pendingCycleForDay(schedule.state, dayIndex) ??
      nextPendingSlot(schedule.state)?.cycleIndex ??
      schedule.state.cycles;
    // Passing rest days and starting the session write different rows; both land or neither.
    const [, { sessionId }] = await Promise.all([
      completeRestSlotsBefore(tx, user.id, schedule, { cycleIndex, dayIndex }, today),
      startPlannedSession(tx, user.id, { gymId, programDayId, cycleIndex }),
    ]);
    return sessionId;
  });
  revalidateSession(sessionId);
  redirect(`/workouts/${sessionId}/check-in`);
}

export async function startAdHocSessionAction(gymId: string): Promise<void> {
  const user = await requireUser();
  const sessionId = await withUser(getDb(), user.id, async (tx) => {
    const open = await getInProgressSession(tx, user.id);
    if (open) return open.id;
    const { sessionId } = await startAdHocSession(tx, user.id, { gymId });
    return sessionId;
  });
  revalidateSession(sessionId);
  redirect(`/workouts/${sessionId}/check-in`);
}

const skipSlotSchema = z.object({
  reason: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z
      .string()
      .max(200)
      .transform((value) => (value.length > 0 ? value : null)),
  ),
});

/**
 * Marks one half of the pending occurrence of a day as skipped on purpose: the workout, or
 * the run. A day that does both keeps the other half, which is still owed.
 */
export async function skipSlotAction(
  dayIndex: number,
  part: SlotPart,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = skipSlotSchema.safeParse(formValues(formData));
  if (!parsed.success) return { ok: false, error: "Keep the reason under 200 characters." };
  const result = await withUser(getDb(), user.id, async (tx): Promise<ActionResult> => {
    const [profile, schedule] = await Promise.all([
      ensureProfile(tx, user),
      getSchedule(tx, user.id),
    ]);
    if (!schedule) return { ok: false, error: "No active programme." };
    const cycleIndex = pendingCycleForDay(schedule.state, dayIndex, part);
    if (cycleIndex === null) return { ok: false, error: "That day has nothing left to skip." };
    await recordSlotEvent(
      tx,
      user.id,
      schedule.program.id,
      { cycleIndex, dayIndex },
      part,
      "skipped",
      { occurredOn: todayInTimeZone(profile.timeZone), note: parsed.data.reason },
    );
    // Nobody will train what is left of this slot, so the coach's plan for it goes with it.
    if (pendingParts(schedule.state, { cycleIndex, dayIndex }).every((p) => p === part)) {
      await voidPlanForSlot(tx, user.id, schedule.program.id, { cycleIndex, dayIndex });
    }
    return { ok: true };
  });
  if (result.ok) revalidateSession();
  return result;
}

const optionalNumber = (min: number, max: number, integer: boolean) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? value.replace(",", ".") : null),
    (integer ? z.coerce.number().int() : z.coerce.number()).min(min).max(max).nullable(),
  );

const checkInSchema = z.object({
  sleepHours: optionalNumber(0, 24, false),
  sleepQuality: optionalNumber(1, 5, true),
  energy: optionalNumber(1, 5, true),
  fatigue: optionalNumber(1, 5, true),
  soreness: optionalNumber(1, 5, true),
  backPainPre: optionalNumber(0, 10, true),
  shinLeftPre: optionalNumber(0, 10, true),
  shinRightPre: optionalNumber(0, 10, true),
});

export async function saveCheckInAction(
  sessionId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(checkInSchema, formData);
  if (!parsed.success) return parsed.state;
  try {
    await withUser(getDb(), user.id, (tx) => saveCheckIn(tx, user.id, sessionId, parsed.data));
  } catch (error) {
    return { formError: describe(error), values: formValues(formData) };
  }
  revalidateSession(sessionId);
  redirect(`/workouts/${sessionId}`);
}

export async function setWarmupCompletedAction(
  sessionId: string,
  completed: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await withUser(getDb(), user.id, (tx) => setWarmupCompleted(tx, user.id, sessionId, completed));
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
  refreshSession();
  return { ok: true };
}

const logSetSchema = z
  .object({
    expectedCompletedAt: z.iso.datetime().nullable().optional(),
    expectedExerciseId: z.uuid().optional(),
    expectedEquipmentInstanceId: z.uuid().nullable().optional(),
    workoutExerciseId: z.uuid(),
    setIndex: z.number().int().min(1).max(50),
    setType: z.enum(SET_TYPES),
    weight: z.number().min(0).max(SET_LIMITS.weight).nullable(),
    reps: z.number().int().min(0).max(SET_LIMITS.reps).nullable(),
    rir: z.number().min(0).max(SET_LIMITS.rir).nullable(),
    durationSeconds: z.number().int().min(0).max(SET_LIMITS.durationSeconds).nullable(),
    distanceMeters: z.number().min(0).max(SET_LIMITS.distanceMeters).nullable().default(null),
  })
  .refine(
    (value) =>
      value.reps !== null || value.durationSeconds !== null || value.distanceMeters !== null,
    { message: "Enter reps, a duration or a distance." },
  );

/** Logged set with a JSON-safe timestamp (matches the client view model). */
export type LoggedSet = Omit<SessionSet, "completedAt"> & { completedAt: string };

export type LogSetResult = { ok: true; set: LoggedSet } | { ok: false; error: string };

export async function logSetAction(input: unknown): Promise<LogSetResult> {
  const user = await requireUser();
  const parsed = logSetSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid set." };
  try {
    const set = await withUser(getDb(), user.id, (tx) => logSet(tx, user.id, parsed.data));
    // The set count on Today, History and Progress comes from this row too.
    revalidateSession();
    refreshSession();
    return { ok: true, set: { ...set, completedAt: set.completedAt.toISOString() } };
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
}

export async function deleteSetAction(
  workoutExerciseId: string,
  setIndex: number,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await withUser(getDb(), user.id, (tx) => deleteSet(tx, user.id, workoutExerciseId, setIndex));
    revalidateSession();
    refreshSession();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
}

export async function setExerciseCompletedAction(
  workoutExerciseId: string,
  completed: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await withUser(getDb(), user.id, (tx) =>
      setExerciseCompleted(tx, user.id, workoutExerciseId, completed),
    );
    refreshSession();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
}

export async function skipExerciseAction(
  workoutExerciseId: string,
  reason: string | null,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await withUser(getDb(), user.id, (tx) => skipExercise(tx, user.id, workoutExerciseId, reason));
    refreshSession();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
}

/** Applies a configured fallback to a slot that has no sets yet. */
export async function applyFallbackAction(
  workoutExerciseId: string,
  exerciseId: string,
  equipmentInstanceId: string | null,
  reason: string,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await withUser(getDb(), user.id, (tx) =>
      substituteExercise(tx, user.id, {
        workoutExerciseId,
        exerciseId,
        equipmentInstanceId,
        reason,
      }),
    );
    refreshSession();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
}

const substituteSchema = z.object({
  exerciseId: z.uuid({ error: "Choose an exercise." }),
  equipmentInstanceId: z.preprocess(
    (value) => (typeof value === "string" && value.length > 0 ? value : null),
    z.uuid().nullable(),
  ),
  remember: z.preprocess((value) => value === "on" || value === "true", z.boolean()),
});

/** Manual substitution from the picker; optionally remembered as a fallback at this gym. */
export async function substituteExerciseAction(
  sessionId: string,
  workoutExerciseId: string,
  gymId: string,
  plannedExerciseId: string | null,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(substituteSchema, formData);
  if (!parsed.success) return parsed.state;
  try {
    await withUser(getDb(), user.id, async (tx) => {
      await substituteExercise(tx, user.id, {
        workoutExerciseId,
        exerciseId: parsed.data.exerciseId,
        equipmentInstanceId: parsed.data.equipmentInstanceId,
        reason: "Chosen during the session",
      });
      if (
        parsed.data.remember &&
        plannedExerciseId &&
        plannedExerciseId !== parsed.data.exerciseId
      ) {
        await addGymFallback(tx, user.id, {
          gymId,
          exerciseId: plannedExerciseId,
          fallbackExerciseId: parsed.data.exerciseId,
          fallbackEquipmentInstanceId: parsed.data.equipmentInstanceId,
        });
      }
    });
  } catch (error) {
    return { formError: describe(error), values: formValues(formData) };
  }
  revalidateSession(sessionId);
  revalidatePath(`/gyms/${gymId}/programme`);
  redirect(`/workouts/${sessionId}`);
}

const addExerciseSchema = z.object({
  exerciseId: z.uuid({ error: "Choose an exercise." }),
  equipmentInstanceId: z.preprocess(
    (value) => (typeof value === "string" && value.length > 0 ? value : null),
    z.uuid().nullable(),
  ),
});

export async function addExerciseAction(
  sessionId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(addExerciseSchema, formData);
  if (!parsed.success) return parsed.state;
  try {
    await withUser(getDb(), user.id, (tx) =>
      addExerciseToSession(tx, user.id, sessionId, parsed.data),
    );
  } catch (error) {
    return { formError: describe(error), values: formValues(formData) };
  }
  revalidateSession(sessionId);
  redirect(`/workouts/${sessionId}`);
}

/**
 * The weight is typed in whichever unit the account uses, so the form carries that unit and the
 * plausibility check happens once the number is in kilograms — the unit it is stored in.
 */
const finishSchema = z
  .object({
    notes: z.preprocess(
      (value) => (typeof value === "string" ? value.trim() : ""),
      z
        .string()
        .max(1000)
        .transform((value) => (value.length > 0 ? value : null)),
    ),
    unit: z.enum(BODY_LOAD_UNITS).catch("kg"),
    bodyWeight: optionalNumber(0, 2000, false),
  })
  .transform((values, ctx) => {
    const bodyWeightKg =
      values.bodyWeight === null ? null : toKilograms(values.bodyWeight, values.unit);
    if (bodyWeightKg !== null && (bodyWeightKg < 20 || bodyWeightKg > 500)) {
      ctx.addIssue({
        code: "custom",
        path: ["bodyWeight"],
        message: `Enter a body weight between ${fromKilograms(20, values.unit)} and ${fromKilograms(500, values.unit)} ${values.unit}.`,
      });
      return z.NEVER;
    }
    return { notes: values.notes, bodyWeightKg };
  });

export async function finishSessionAction(
  sessionId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseForm(finishSchema, formData);
  if (!parsed.success) return parsed.state;
  try {
    await withUser(getDb(), user.id, async (tx) => {
      const [profile, finished] = await Promise.all([
        ensureProfile(tx, user),
        finishSession(tx, user.id, sessionId, parsed.data),
      ]);
      const today = todayInTimeZone(profile.timeZone);
      // Weighing yourself is part of finishing, so the reading is dated now rather than when
      // the session started: a session that ran past midnight was still weighed today.
      if (parsed.data.bodyWeightKg !== null) {
        await recordBodyWeight(tx, user.id, {
          measuredOn: today,
          weightKg: parsed.data.bodyWeightKg,
        });
      }
      // Only the lifting half of the day. A day that also runs still owes its run, and the
      // sequence stays on it until that is logged or skipped in its own right.
      if (finished.programId && finished.dayIndex !== null && finished.cycleIndex !== null) {
        await recordSlotEvent(
          tx,
          user.id,
          finished.programId,
          { cycleIndex: finished.cycleIndex, dayIndex: finished.dayIndex },
          "session",
          "completed",
          { occurredOn: today, workoutSessionId: sessionId },
        );
      }
    });
  } catch (error) {
    return { formError: describe(error), values: formValues(formData) };
  }
  // The reading may have moved the profile's own body weight.
  if (parsed.data.bodyWeightKg !== null) {
    await profileChanged(user.id);
    revalidatePath("/settings/profile");
  }
  revalidateSession(sessionId);
  redirect(`/workouts/${sessionId}`);
}

const supersetSchema = z.object({
  group: z.string().min(1).max(60).nullable(),
  workoutExerciseIds: z.array(z.uuid()).min(2).max(20),
});

/**
 * Creates or edits a superset for this workout. The programme template is never written:
 * grouping lives on the workout's own rows, so a change here applies to today only.
 */
export async function saveSupersetAction(sessionId: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = supersetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose at least two exercises to group." };
  try {
    await withUser(getDb(), user.id, (tx) =>
      saveSupersetGroup(tx, user.id, {
        sessionId,
        group: parsed.data.group,
        workoutExerciseIds: parsed.data.workoutExerciseIds,
      }),
    );
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
  revalidatePath(`/workouts/${sessionId}`);
  return { ok: true };
}

/** Ungroups a superset. The exercises and their logged sets are untouched. */
export async function removeSupersetAction(
  sessionId: string,
  group: string,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await withUser(getDb(), user.id, (tx) => removeSupersetGroup(tx, user.id, sessionId, group));
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
  revalidatePath(`/workouts/${sessionId}`);
  return { ok: true };
}

export async function discardSessionAction(sessionId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await withUser(getDb(), user.id, (tx) => discardSession(tx, user.id, sessionId));
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
  revalidateSession(sessionId);
  redirect("/today");
}

export async function setRestTimerEnabledAction(enabled: boolean): Promise<void> {
  const user = await requireUser();
  await withUser(getDb(), user.id, (tx) =>
    tx.update(profiles).set({ restTimerEnabled: enabled }).where(eq(profiles.id, user.id)),
  );
  await profileChanged(user.id);
  revalidatePath("/settings");
}

/** Marks the pending rest slot of a day as done without starting anything. */
export async function completeRestSlotAction(dayIndex: number): Promise<ActionResult> {
  const user = await requireUser();
  const result = await withUser(getDb(), user.id, async (tx): Promise<ActionResult> => {
    const [profile, schedule] = await Promise.all([
      ensureProfile(tx, user),
      getSchedule(tx, user.id),
    ]);
    if (!schedule) return { ok: false, error: "No active programme." };
    const cycleIndex = pendingCycleForDay(schedule.state, dayIndex, "session");
    if (cycleIndex === null) return { ok: false, error: "Nothing left to mark for that day." };
    await recordSlotEvent(
      tx,
      user.id,
      schedule.program.id,
      { cycleIndex, dayIndex },
      "session",
      "completed",
      { occurredOn: todayInTimeZone(profile.timeZone), note: "Rest day done" },
    );
    if (pendingParts(schedule.state, { cycleIndex, dayIndex }).every((p) => p === "session")) {
      await voidPlanForSlot(tx, user.id, schedule.program.id, { cycleIndex, dayIndex });
    }
    return { ok: true };
  });
  if (result.ok) revalidateSession();
  return result;
}
