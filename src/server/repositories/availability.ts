import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";

import {
  equipmentInstances,
  equipmentTypes,
  exerciseEquipmentOptions,
  exercises,
  gymAbsentEquipmentTypes,
  gyms,
  programDays,
  programExerciseFallbacks,
  programExercises,
  programs,
} from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import {
  resolveExerciseAtGym,
  type AvailabilityStatus,
  type EquipmentInstanceRef,
  type EquipmentOptionRef,
  type ExerciseRef,
  type FallbackRef,
  type Resolution,
} from "@/domain/equipment-resolution";
import type { ExerciseModality, GymKind, LoadPortability, MuscleGroup } from "@/domain/types";

import type { GymRow } from "./gyms";

export type PlannedExerciseSummary = {
  id: string;
  name: string;
  slug: string;
  modality: ExerciseModality;
  loadPortability: LoadPortability;
  requiresEquipment: boolean;
  primaryMuscles: MuscleGroup[];
};

export type NamedType = { id: string; name: string };

export type GymFallbackSummary = {
  id: string;
  fallbackExerciseName: string;
  fallbackInstanceName: string | null;
};

export type PlannedExerciseAvailability = {
  exercise: PlannedExerciseSummary;
  days: string[];
  programExerciseIds: string[];
  resolution: Resolution;
  /** Human-readable name of the exercise the resolution landed on (self or fallback). */
  resolvedExerciseName: string;
  /** For "unknown": equipment types that would make it available. */
  missingTypes: NamedType[];
  /** Gym-specific fallbacks the user added (removable). */
  gymFallbacks: GymFallbackSummary[];
};

export type AvailabilitySummary = Record<AvailabilityStatus, number>;

export type GymAvailability = {
  gym: GymRow;
  program: { id: string; name: string } | null;
  rows: PlannedExerciseAvailability[];
  summary: AvailabilitySummary;
};

const emptySummary = (): AvailabilitySummary => ({
  direct: 0,
  fallback: 0,
  unknown: 0,
  unavailable: 0,
});

async function activeProgram(db: DbOrTx, userId: string) {
  const [program] = await db
    .select({ id: programs.id, name: programs.name })
    .from(programs)
    .where(and(eq(programs.userId, userId), eq(programs.status, "active")))
    .limit(1);
  return program ?? null;
}

async function gymEquipmentRefs(db: DbOrTx, gymId: string): Promise<EquipmentInstanceRef[]> {
  return db
    .select({
      id: equipmentInstances.id,
      gymId: equipmentInstances.gymId,
      equipmentTypeId: equipmentInstances.equipmentTypeId,
      name: equipmentInstances.name,
      isActive: equipmentInstances.isActive,
    })
    .from(equipmentInstances)
    .where(eq(equipmentInstances.gymId, gymId));
}

async function absentTypeIds(db: DbOrTx, gymId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: gymAbsentEquipmentTypes.equipmentTypeId })
    .from(gymAbsentEquipmentTypes)
    .where(eq(gymAbsentEquipmentTypes.gymId, gymId));
  return new Set(rows.map((row) => row.id));
}

async function optionRefs(db: DbOrTx, exerciseIds: string[]): Promise<EquipmentOptionRef[]> {
  if (exerciseIds.length === 0) return [];
  return db
    .select({
      exerciseId: exerciseEquipmentOptions.exerciseId,
      equipmentTypeId: exerciseEquipmentOptions.equipmentTypeId,
      equipmentInstanceId: exerciseEquipmentOptions.equipmentInstanceId,
      preferenceRank: exerciseEquipmentOptions.preferenceRank,
    })
    .from(exerciseEquipmentOptions)
    .where(inArray(exerciseEquipmentOptions.exerciseId, exerciseIds));
}

async function typeNames(db: DbOrTx): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: equipmentTypes.id, name: equipmentTypes.name })
    .from(equipmentTypes);
  return new Map(rows.map((row) => [row.id, row.name]));
}

type FallbackRow = {
  id: string;
  programExerciseId: string;
  gymId: string | null;
  rank: number;
  fallbackEquipmentTypeId: string | null;
  fallbackEquipmentInstanceId: string | null;
  fallbackInstanceName: string | null;
  exercise: ExerciseRef & { name: string };
};

async function fallbackRows(
  db: DbOrTx,
  programExerciseIds: string[],
  gymId: string,
): Promise<FallbackRow[]> {
  if (programExerciseIds.length === 0) return [];
  const rows = await db
    .select({
      id: programExerciseFallbacks.id,
      programExerciseId: programExerciseFallbacks.programExerciseId,
      gymId: programExerciseFallbacks.gymId,
      rank: programExerciseFallbacks.rank,
      fallbackEquipmentTypeId: programExerciseFallbacks.fallbackEquipmentTypeId,
      fallbackEquipmentInstanceId: programExerciseFallbacks.fallbackEquipmentInstanceId,
      fallbackInstanceName: equipmentInstances.name,
      exerciseId: exercises.id,
      exerciseName: exercises.name,
      modality: exercises.modality,
      requiresEquipment: exercises.requiresEquipment,
    })
    .from(programExerciseFallbacks)
    .innerJoin(exercises, eq(exercises.id, programExerciseFallbacks.fallbackExerciseId))
    .leftJoin(
      equipmentInstances,
      eq(equipmentInstances.id, programExerciseFallbacks.fallbackEquipmentInstanceId),
    )
    .where(
      and(
        inArray(programExerciseFallbacks.programExerciseId, programExerciseIds),
        or(isNull(programExerciseFallbacks.gymId), eq(programExerciseFallbacks.gymId, gymId)),
      ),
    )
    .orderBy(asc(programExerciseFallbacks.rank));
  return rows.map((row) => ({
    id: row.id,
    programExerciseId: row.programExerciseId,
    gymId: row.gymId,
    rank: row.rank,
    fallbackEquipmentTypeId: row.fallbackEquipmentTypeId,
    fallbackEquipmentInstanceId: row.fallbackEquipmentInstanceId,
    fallbackInstanceName: row.fallbackInstanceName,
    exercise: {
      id: row.exerciseId,
      name: row.exerciseName,
      modality: row.modality,
      requiresEquipment: row.requiresEquipment,
    },
  }));
}

function toFallbackRef(row: FallbackRow): FallbackRef {
  return {
    gymId: row.gymId,
    fallbackExercise: row.exercise,
    fallbackEquipmentTypeId: row.fallbackEquipmentTypeId,
    fallbackEquipmentInstanceId: row.fallbackEquipmentInstanceId,
    rank: row.rank,
  };
}

/** Availability of every exercise in the active programme at one gym. */
export async function gymAvailability(
  db: DbOrTx,
  userId: string,
  gymId: string,
): Promise<GymAvailability | null> {
  const [gym] = await db
    .select()
    .from(gyms)
    .where(and(eq(gyms.id, gymId), eq(gyms.userId, userId)))
    .limit(1);
  if (!gym) return null;

  const program = await activeProgram(db, userId);
  if (!program) return { gym, program: null, rows: [], summary: emptySummary() };

  const planned = await db
    .select({
      programExerciseId: programExercises.id,
      preferredEquipmentInstanceId: programExercises.preferredEquipmentInstanceId,
      dayName: programDays.name,
      exercise: {
        id: exercises.id,
        name: exercises.name,
        slug: exercises.slug,
        modality: exercises.modality,
        loadPortability: exercises.loadPortability,
        requiresEquipment: exercises.requiresEquipment,
        primaryMuscles: exercises.primaryMuscles,
      },
    })
    .from(programExercises)
    .innerJoin(programDays, eq(programDays.id, programExercises.programDayId))
    .innerJoin(exercises, eq(exercises.id, programExercises.exerciseId))
    .where(and(eq(programDays.programId, program.id), eq(programExercises.userId, userId)))
    .orderBy(asc(programDays.dayIndex), asc(programExercises.orderIndex));

  const fallbacks = await fallbackRows(
    db,
    planned.map((p) => p.programExerciseId),
    gym.id,
  );
  const exerciseIds = [
    ...new Set([...planned.map((p) => p.exercise.id), ...fallbacks.map((f) => f.exercise.id)]),
  ];
  const [options, equipment, absent, names] = await Promise.all([
    optionRefs(db, exerciseIds),
    gymEquipmentRefs(db, gym.id),
    absentTypeIds(db, gym.id),
    typeNames(db),
  ]);

  // One row per exercise, in programme order; several days can share an exercise.
  const groups = new Map<
    string,
    { exercise: PlannedExerciseSummary; days: string[]; slots: string[]; preferred: string | null }
  >();
  for (const item of planned) {
    const group = groups.get(item.exercise.id);
    if (group) {
      if (!group.days.includes(item.dayName)) group.days.push(item.dayName);
      group.slots.push(item.programExerciseId);
      group.preferred ??= item.preferredEquipmentInstanceId;
    } else {
      groups.set(item.exercise.id, {
        exercise: item.exercise,
        days: [item.dayName],
        slots: [item.programExerciseId],
        preferred: item.preferredEquipmentInstanceId,
      });
    }
  }

  const summary = emptySummary();
  const rows: PlannedExerciseAvailability[] = [];
  for (const group of groups.values()) {
    const slotFallbacks = fallbacks.filter((f) => group.slots.includes(f.programExerciseId));
    const resolution = resolveExerciseAtGym({
      exercise: group.exercise,
      gym: { id: gym.id, kind: gym.kind },
      preferredEquipmentInstanceId: group.preferred,
      options,
      fallbacks: slotFallbacks.map(toFallbackRef),
      gymEquipment: equipment,
      absentEquipmentTypeIds: absent,
    });
    summary[resolution.status] += 1;
    const resolvedExerciseName =
      resolution.status === "fallback"
        ? (slotFallbacks.find((f) => f.exercise.id === resolution.exercise.id)?.exercise.name ??
          group.exercise.name)
        : group.exercise.name;
    const seenGymFallbacks = new Set<string>();
    rows.push({
      exercise: group.exercise,
      days: group.days,
      programExerciseIds: group.slots,
      resolution,
      resolvedExerciseName,
      missingTypes:
        resolution.status === "unknown"
          ? resolution.missingEquipmentTypeIds.map((id) => ({
              id,
              name: names.get(id) ?? "Unknown",
            }))
          : [],
      gymFallbacks: slotFallbacks
        .filter((f) => f.gymId === gym.id)
        .filter((f) => {
          const key = `${f.exercise.id}:${f.fallbackEquipmentInstanceId ?? ""}`;
          if (seenGymFallbacks.has(key)) return false;
          seenGymFallbacks.add(key);
          return true;
        })
        .map((f) => ({
          id: f.id,
          fallbackExerciseName: f.exercise.name,
          fallbackInstanceName: f.fallbackInstanceName,
        })),
    });
  }

  return { gym, program, rows, summary };
}

export type ExerciseGymAvailability = {
  gym: { id: string; name: string; kind: GymKind };
  resolution: Resolution;
  resolvedExerciseName: string;
  missingTypes: NamedType[];
  /** Active machines at the gym, for the "preferred machine" picker. */
  machines: { id: string; name: string }[];
  preferredInstanceId: string | null;
};

/** Where one exercise can be done, across the user's active real gyms. */
export async function exerciseAvailability(
  db: DbOrTx,
  userId: string,
  exerciseId: string,
): Promise<ExerciseGymAvailability[]> {
  const [exercise] = await db
    .select({
      id: exercises.id,
      name: exercises.name,
      modality: exercises.modality,
      requiresEquipment: exercises.requiresEquipment,
    })
    .from(exercises)
    .where(eq(exercises.id, exerciseId))
    .limit(1);
  if (!exercise) return [];

  const gymRows = await db
    .select({ id: gyms.id, name: gyms.name, kind: gyms.kind })
    .from(gyms)
    .where(and(eq(gyms.userId, userId), eq(gyms.isActive, true), eq(gyms.kind, "gym")))
    .orderBy(asc(gyms.name));

  const program = await activeProgram(db, userId);
  const slotRows = program
    ? await db
        .select({ id: programExercises.id })
        .from(programExercises)
        .innerJoin(programDays, eq(programDays.id, programExercises.programDayId))
        .where(
          and(eq(programDays.programId, program.id), eq(programExercises.exerciseId, exerciseId)),
        )
    : [];
  const slotIds = slotRows.map((row) => row.id);
  const names = await typeNames(db);

  const results: ExerciseGymAvailability[] = [];
  for (const gym of gymRows) {
    const fallbacks = await fallbackRows(db, slotIds, gym.id);
    const [options, equipment, absent] = await Promise.all([
      optionRefs(db, [...new Set([exercise.id, ...fallbacks.map((f) => f.exercise.id)])]),
      gymEquipmentRefs(db, gym.id),
      absentTypeIds(db, gym.id),
    ]);
    const resolution = resolveExerciseAtGym({
      exercise,
      gym: { id: gym.id, kind: gym.kind },
      preferredEquipmentInstanceId: null,
      options,
      fallbacks: fallbacks.map(toFallbackRef),
      gymEquipment: equipment,
      absentEquipmentTypeIds: absent,
    });
    const machines = equipment
      .filter((item) => item.isActive)
      .map((item) => ({ id: item.id, name: item.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const preferred = options.find(
      (option) =>
        option.exerciseId === exercise.id &&
        option.equipmentInstanceId !== null &&
        machines.some((machine) => machine.id === option.equipmentInstanceId),
    );
    results.push({
      gym,
      resolution,
      resolvedExerciseName:
        resolution.status === "fallback"
          ? (fallbacks.find((f) => f.exercise.id === resolution.exercise.id)?.exercise.name ??
            exercise.name)
          : exercise.name,
      missingTypes:
        resolution.status === "unknown"
          ? resolution.missingEquipmentTypeIds.map((id) => ({
              id,
              name: names.get(id) ?? "Unknown",
            }))
          : [],
      machines,
      preferredInstanceId: preferred?.equipmentInstanceId ?? null,
    });
  }
  return results;
}
