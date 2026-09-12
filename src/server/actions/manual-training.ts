"use server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireProfiledUser } from "@/server/auth";
import { CoachingError } from "@/server/repositories/coaching-state";
import {
  createCustomExercise,
  routineFromWorkout,
  saveRoutine,
  startSavedRoutine,
} from "@/server/repositories/manual-training";
import { revalidatePath } from "next/cache";
import type { DbOrTx } from "@/db/types";
async function run<T>(work: (tx: DbOrTx, userId: string) => Promise<T>) {
  const user = await requireProfiledUser();
  try {
    return {
      ok: true as const,
      value: await withUser(getDb(), user.id, (tx) => work(tx, user.id)),
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof CoachingError
          ? error.message
          : error instanceof z.ZodError
            ? error.issues
                .map((i) => i.message)
                .slice(0, 3)
                .join(" ")
            : "Could not save this change. Please retry.",
    };
  }
}
export async function saveRoutineAction(name: string, day: unknown) {
  return run((tx, userId) => saveRoutine(tx, userId, name, day));
}
export async function startRoutineAction(id: string, gymId: string) {
  return run((tx, userId) =>
    startSavedRoutine(tx, userId, z.uuid().parse(id), z.uuid().parse(gymId)),
  );
}
export async function saveWorkoutRoutineAction(sessionId: string, name: string) {
  return run((tx, userId) => routineFromWorkout(tx, userId, z.uuid().parse(sessionId), name));
}
export async function createCustomExerciseAction(input: unknown) {
  const result = await run((tx, userId) => createCustomExercise(tx, userId, input));
  if (result.ok) revalidatePath("/exercises");
  return result;
}
