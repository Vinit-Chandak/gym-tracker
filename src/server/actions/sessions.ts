"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { SET_LIMITS } from "@/domain/sets";

import { getDb } from "@/db/client";
import { profiles } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { todayInTimeZone } from "@/domain/program-calendar";
import { nextPendingSlot } from "@/domain/schedule";
import { SET_TYPES } from "@/domain/types";
import { requireUser } from "@/server/auth";
import { ensureProfile } from "@/server/queries/profile";
import { profileChanged } from "@/server/queries/request-profile";
import { addGymFallback } from "@/server/repositories/fallbacks";
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
  SessionFinishedError,
  SetConflictError,
  SessionHasSetsError,
  SessionNotFoundError,
  setExerciseCompleted,
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

function describe(error: unknown): string {
  if (error instanceof SessionFinishedError || error instanceof SessionHasSetsError)
    return error.message;
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

/** Marks the pending occurrence of a day as skipped on purpose. */
export async function skipSlotAction(
  dayIndex: number,
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
    const cycleIndex = pendingCycleForDay(schedule.state, dayIndex);
    if (cycleIndex === null) return { ok: false, error: "That day has nothing left to skip." };
    await recordSlotEvent(tx, user.id, schedule.program.id, { cycleIndex, dayIndex }, "skipped", {
      occurredOn: todayInTimeZone(profile.timeZone),
      note: parsed.data.reason,
    });
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
  })
  .refine((value) => value.reps !== null || value.durationSeconds !== null, {
    message: "Enter reps or a duration.",
  });

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

const finishSchema = z.object({
  notes: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z
      .string()
      .max(1000)
      .transform((value) => (value.length > 0 ? value : null)),
  ),
  bodyWeightKg: optionalNumber(20, 300, false),
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
      if (finished.programId && finished.dayIndex !== null && finished.cycleIndex !== null) {
        await recordSlotEvent(
          tx,
          user.id,
          finished.programId,
          { cycleIndex: finished.cycleIndex, dayIndex: finished.dayIndex },
          "completed",
          { occurredOn: todayInTimeZone(profile.timeZone), workoutSessionId: sessionId },
        );
      }
    });
  } catch (error) {
    return { formError: describe(error), values: formValues(formData) };
  }
  revalidateSession(sessionId);
  redirect(`/workouts/${sessionId}`);
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
    const cycleIndex = pendingCycleForDay(schedule.state, dayIndex);
    if (cycleIndex === null) return { ok: false, error: "Nothing left to mark for that day." };
    await recordSlotEvent(tx, user.id, schedule.program.id, { cycleIndex, dayIndex }, "completed", {
      occurredOn: todayInTimeZone(profile.timeZone),
      note: "Rest day done",
    });
    return { ok: true };
  });
  if (result.ok) revalidateSession();
  return result;
}
