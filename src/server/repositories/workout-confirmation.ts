import { and, asc, count, eq, isNull, or } from "drizzle-orm";

import {
  equipmentInstances,
  exerciseEquipmentRequirements,
  exercises,
  gyms,
  setLogs,
  workoutExercises,
  workoutSessions,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import type { BodyLoadUnit } from "@/domain/types";
import { sharedEquipmentTypes } from "@/server/queries/reference";

import { markEquipmentAbsent, type AbsenceOutcome } from "./absent-equipment";
import { instanceTypeIds } from "./equipment-context";
import { createEquipment, machinesByExerciseAtGym, setEquipmentActive } from "./equipment";
import { SessionFinishedError, SessionNotFoundError, substituteExercise } from "./sessions";
import { defaultMachineInput, freeMachineName } from "./starter-equipment";

/*
 * Settling a machine in the workout (plan: gradual confirmation during workouts): "Yes, it's
 * here" and "Available" register it there and then and carry on; "Not here" records the
 * absence, or asks about the registered machine that says otherwise; "A different one" names
 * the family's variant that is here. Each runs in the action's one transaction.
 */

type Slot = {
  workoutExerciseId: string;
  exerciseId: string;
  movementPattern: string;
  equipmentInstanceId: string | null;
  reason: string | null;
  gymId: string;
  gymName: string;
  sets: number;
};

async function openSlot(db: DbOrTx, userId: string, workoutExerciseId: string): Promise<Slot> {
  const [row] = await db
    .select({
      workoutExerciseId: workoutExercises.id,
      exerciseId: workoutExercises.exerciseId,
      movementPattern: exercises.movementPattern,
      equipmentInstanceId: workoutExercises.equipmentInstanceId,
      reason: workoutExercises.substitutionReason,
      gymId: workoutSessions.gymId,
      gymName: gyms.name,
      completedAt: workoutSessions.completedAt,
    })
    .from(workoutExercises)
    .innerJoin(workoutSessions, eq(workoutSessions.id, workoutExercises.workoutSessionId))
    .innerJoin(gyms, eq(gyms.id, workoutSessions.gymId))
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(and(eq(workoutExercises.id, workoutExerciseId), eq(workoutExercises.userId, userId)))
    .limit(1)
    .for("update", { of: workoutSessions });
  if (!row) throw new SessionNotFoundError();
  if (row.completedAt) throw new SessionFinishedError();
  const [logged] = await db
    .select({ n: count() })
    .from(setLogs)
    .where(eq(setLogs.workoutExerciseId, workoutExerciseId));
  return { ...row, sets: logged?.n ?? 0 };
}

export class UnknownEquipmentTypeError extends Error {
  constructor() {
    super("That equipment is not in the catalogue. Reload the workout and try again.");
    this.name = "UnknownEquipmentTypeError";
  }
}

/**
 * The machine of a type at a gym: an active one if there is one, else a new one named after the
 * type with the catalogue's defaults. An archived machine is never brought back here: archived is
 * how the athlete says a machine has gone, so one found here now is another machine, with its
 * own history from its first set. The gym's own screen restores an archived machine.
 */
async function machineOfType(
  db: DbOrTx,
  userId: string,
  gymId: string,
  equipmentTypeId: string,
  preferredUnit: BodyLoadUnit,
): Promise<{ id: string; created: boolean }> {
  const type = (await sharedEquipmentTypes(db)).find((row) => row.id === equipmentTypeId);
  if (!type) throw new UnknownEquipmentTypeError();
  const machines = await db
    .select({
      id: equipmentInstances.id,
      name: equipmentInstances.name,
      isActive: equipmentInstances.isActive,
      typeIds: instanceTypeIds,
    })
    .from(equipmentInstances)
    .where(and(eq(equipmentInstances.gymId, gymId), eq(equipmentInstances.userId, userId)))
    .orderBy(asc(equipmentInstances.name));
  const active = machines.find(
    (machine) => machine.isActive && machine.typeIds.includes(equipmentTypeId),
  );
  if (active) return { id: active.id, created: false };
  // Names stay unique at a gym, archived machines' included.
  const taken = new Set(machines.map((machine) => machine.name.toLowerCase()));
  const created = await createEquipment(
    db,
    userId,
    gymId,
    defaultMachineInput(type, preferredUnit, freeMachineName(taken, type.name)),
  );
  return { id: created.id, created: true };
}

/** Puts the machine on the exercise when it can do it and nothing is logged yet. */
async function attach(db: DbOrTx, userId: string, slot: Slot, machineId: string) {
  if (slot.sets > 0) return false;
  const compatible = await machinesByExerciseAtGym(db, userId, slot.gymId);
  if (!compatible[slot.exerciseId]?.includes(machineId)) return false;
  await substituteExercise(db, userId, {
    workoutExerciseId: slot.workoutExerciseId,
    exerciseId: slot.exerciseId,
    equipmentInstanceId: machineId,
    reason: slot.reason,
  });
  return true;
}

export type HereOutcome = { equipmentInstanceId: string; attached: boolean };

/**
 * "Yes, it's here" for a gym basic, and "Available" for any other machine: registered at once,
 * named after its type with the onboarding defaults, its absence cleared in the same
 * transaction, and put on the exercise before the first set.
 */
export async function confirmEquipmentHere(
  db: DbOrTx,
  userId: string,
  workoutExerciseId: string,
  equipmentTypeId: string,
  preferredUnit: BodyLoadUnit,
): Promise<HereOutcome> {
  const slot = await openSlot(db, userId, workoutExerciseId);
  const machine = await machineOfType(db, userId, slot.gymId, equipmentTypeId, preferredUnit);
  const attached = await attach(db, userId, slot, machine.id);
  return { equipmentInstanceId: machine.id, attached };
}

/**
 * "Not here": the type is recorded as absent at the session's gym, so the exercise offers its
 * fallbacks, a fallback to add, or Skip. When an active machine there has the type, nothing is
 * written and the machines come back, for the person to say whether one has gone.
 */
export async function markEquipmentNotHere(
  db: DbOrTx,
  userId: string,
  workoutExerciseId: string,
  equipmentTypeId: string,
): Promise<AbsenceOutcome> {
  const slot = await openSlot(db, userId, workoutExerciseId);
  return markEquipmentAbsent(db, userId, slot.gymId, equipmentTypeId);
}

export type VariantOutcome =
  | { kind: "attached"; equipmentInstanceId: string }
  /** The exercise needs the variant that is not here, so it became the one for this variant. */
  | { kind: "switched"; exerciseId: string; equipmentInstanceId: string }
  /** Registered, but nothing here does this exercise on it: the decision offers the rest. */
  | { kind: "registered"; equipmentInstanceId: string };

/**
 * "A different one": the variant of the family that is actually here. It is registered, the
 * assumed variant is recorded as not here, and the exercise goes on to the new machine: as it is
 * when it can be done on it, else as the same movement for that variant (a 45° leg press becomes
 * the horizontal leg press), and only while nothing is logged.
 */
export async function chooseEquipmentVariant(
  db: DbOrTx,
  userId: string,
  workoutExerciseId: string,
  assumedTypeId: string,
  variantTypeId: string,
  preferredUnit: BodyLoadUnit,
): Promise<VariantOutcome> {
  const slot = await openSlot(db, userId, workoutExerciseId);
  const machine = await machineOfType(db, userId, slot.gymId, variantTypeId, preferredUnit);
  if (assumedTypeId !== variantTypeId)
    await markEquipmentAbsent(db, userId, slot.gymId, assumedTypeId);
  if (await attach(db, userId, slot, machine.id))
    return { kind: "attached", equipmentInstanceId: machine.id };
  if (slot.sets > 0) return { kind: "registered", equipmentInstanceId: machine.id };

  // The same movement on the variant: an active exercise whose way of doing it is led by it.
  const [sibling] = await db
    .select({ id: exercises.id, name: exercises.name })
    .from(exerciseEquipmentRequirements)
    .innerJoin(exercises, eq(exercises.id, exerciseEquipmentRequirements.exerciseId))
    .where(
      and(
        eq(exerciseEquipmentRequirements.equipmentTypeId, variantTypeId),
        eq(exerciseEquipmentRequirements.isPrimary, true),
        isNull(exerciseEquipmentRequirements.userId),
        eq(exercises.movementPattern, slot.movementPattern),
        eq(exercises.isActive, true),
        or(isNull(exercises.userId), eq(exercises.userId, userId)),
      ),
    )
    .orderBy(asc(exercises.name))
    .limit(1);
  if (!sibling) return { kind: "registered", equipmentInstanceId: machine.id };
  const compatible = await machinesByExerciseAtGym(db, userId, slot.gymId);
  if (!compatible[sibling.id]?.includes(machine.id))
    return { kind: "registered", equipmentInstanceId: machine.id };
  await substituteExercise(db, userId, {
    workoutExerciseId: slot.workoutExerciseId,
    exerciseId: sibling.id,
    equipmentInstanceId: machine.id,
    reason: `A different one at ${slot.gymName}`,
  });
  return { kind: "switched", exerciseId: sibling.id, equipmentInstanceId: machine.id };
}

export class NothingToArchiveError extends Error {
  constructor() {
    super("This exercise has no machine to archive, or its sets are already logged on it.");
    this.name = "NothingToArchiveError";
  }
}

/**
 * "It has gone": the exercise's machine is archived, keeping its history, and the exercise is
 * left without one, for the workout to settle again. Only before anything is logged on it.
 */
export async function archiveWorkoutMachine(
  db: DbOrTx,
  userId: string,
  workoutExerciseId: string,
  equipmentInstanceId: string,
): Promise<void> {
  const slot = await openSlot(db, userId, workoutExerciseId);
  const [machine] = await db
    .select({ id: equipmentInstances.id })
    .from(equipmentInstances)
    .where(
      and(
        eq(equipmentInstances.id, equipmentInstanceId),
        eq(equipmentInstances.userId, userId),
        eq(equipmentInstances.gymId, slot.gymId),
      ),
    )
    .limit(1);
  if (!machine || slot.sets > 0) throw new NothingToArchiveError();
  await setEquipmentActive(db, userId, machine.id, false);
  if (slot.equipmentInstanceId === machine.id)
    await db
      .update(workoutExercises)
      .set({ equipmentInstanceId: null })
      .where(
        and(eq(workoutExercises.id, slot.workoutExerciseId), eq(workoutExercises.userId, userId)),
      );
}
