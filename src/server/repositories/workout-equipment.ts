import { and, eq } from "drizzle-orm";

import { workoutExercises, workoutSessions } from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { EquipmentInput } from "@/server/validation/gyms";
import type { WorkoutReturn } from "@/server/validation/params";

import { createEquipment, machinesByExerciseAtGym } from "./equipment";
import { SessionNotFoundError, substituteExercise } from "./sessions";

export class IncompatibleWorkoutEquipmentError extends Error {
  constructor() {
    super("Choose an equipment type that supports this exercise.");
    this.name = "IncompatibleWorkoutEquipmentError";
  }
}

/** Register and attach in one transaction; a stale workout must not create an orphan machine. */
export async function registerWorkoutEquipment(
  db: DbOrTx,
  userId: string,
  gymId: string,
  target: WorkoutReturn,
  input: EquipmentInput,
) {
  const [slot] = await db
    .select({
      exerciseId: workoutExercises.exerciseId,
      reason: workoutExercises.substitutionReason,
    })
    .from(workoutExercises)
    .innerJoin(workoutSessions, eq(workoutSessions.id, workoutExercises.workoutSessionId))
    .where(
      and(
        eq(workoutExercises.id, target.workoutExerciseId),
        eq(workoutExercises.userId, userId),
        eq(workoutSessions.id, target.sessionId),
        eq(workoutSessions.userId, userId),
        eq(workoutSessions.gymId, gymId),
      ),
    )
    .limit(1);
  if (!slot) throw new SessionNotFoundError();

  const machine = await createEquipment(db, userId, gymId, input);
  const compatible = await machinesByExerciseAtGym(db, userId, gymId);
  if (!compatible[slot.exerciseId]?.includes(machine.id)) {
    throw new IncompatibleWorkoutEquipmentError();
  }
  await substituteExercise(db, userId, {
    workoutExerciseId: target.workoutExerciseId,
    exerciseId: slot.exerciseId,
    equipmentInstanceId: machine.id,
    reason: slot.reason,
  });
  return machine;
}
