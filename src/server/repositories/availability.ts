import { and, asc, eq, inArray, isNull, or, type SQL, type SQLWrapper } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import {
  equipmentInstances,
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
  compatibleMachines,
  equipmentState,
  evaluateFallback,
  inventoryAt,
  resolveExerciseAtGym,
  type AvailabilityStatus,
  type EquipmentInstanceRef,
  type EquipmentOptionRef,
  type EquipmentState,
  type ExerciseRef,
  type FallbackRef,
  type Resolution,
} from "@/domain/equipment-resolution";
import type { ExerciseModality, GymKind, LoadPortability, MuscleGroup } from "@/domain/types";
import { EQUIPMENT_FAMILIES } from "@/db/seed/data/equipment-types";
import { drawingUrl, drawingVisible } from "@/server/queries/equipment-art";
import { equipmentTypeNames } from "@/server/queries/reference";

import {
  instanceTypeIds,
  referenceInputs,
  referenceSets,
  type ReferenceSets,
} from "./equipment-context";

import type { GymRow } from "./gyms";

/*
 * Every read in this file is written so that nothing waits for another query's result: the ids
 * one query would have supplied to the next are expressed as subqueries instead. A screen's whole
 * availability reads therefore have no unnecessary JavaScript dependencies. Each statement
 * still has a network cost: the transaction pooler's unprepared queries are not one round trip.
 */

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
  /** Confirmed, assumed (a basic nobody has confirmed), unknown, absent, or none needed. */
  equipment: EquipmentState;
  /** Human-readable name of the exercise the resolution landed on (self or fallback). */
  resolvedExerciseName: string;
  /** For "unknown": equipment types that would make it available. */
  missingTypes: NamedType[];
  /** For an assumed basic: the types taken for granted, which can be marked not here. */
  assumedTypes: NamedType[];
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

/** A gym the caller already holds, so no query has to fetch it again. */
export type KnownGym = { id: string; kind: GymKind; name: string };

/** Rows already read under the same account/transaction by the gym detail screen. */
export type GymAvailabilityInputs = {
  gym: GymRow;
  equipment: EquipmentInstanceRef[];
  absentEquipmentTypeIds: Set<string>;
};

/** A list of ids, or a subquery that yields them. */
type Ids = readonly string[] | SQLWrapper;

/** A gym id, or a subquery yielding the gym ids in scope. */
type GymScope = string | SQLWrapper;

const emptySummary = (): AvailabilitySummary => ({
  direct: 0,
  fallback: 0,
  unknown: 0,
  unavailable: 0,
});

function idsCondition(column: AnyPgColumn, ids: Ids): SQL {
  return Array.isArray(ids) ? inArray(column, ids) : inArray(column, ids as SQLWrapper);
}

async function activeProgram(db: DbOrTx, userId: string) {
  const [program] = await db
    .select({ id: programs.id, name: programs.name })
    .from(programs)
    .where(and(eq(programs.userId, userId), eq(programs.status, "active")))
    .limit(1);
  return program ?? null;
}

/** Ids of the active programme's slots, optionally only those planning one exercise. */
function activeSlotIds(db: DbOrTx, userId: string, exerciseId?: string) {
  return db
    .select({ id: programExercises.id })
    .from(programExercises)
    .innerJoin(programDays, eq(programDays.id, programExercises.programDayId))
    .innerJoin(programs, eq(programs.id, programDays.programId))
    .where(
      and(
        eq(programs.userId, userId),
        eq(programs.status, "active"),
        exerciseId ? eq(programExercises.exerciseId, exerciseId) : undefined,
      ),
    );
}

/** Ids of one programme day's slots. */
function daySlotIds(db: DbOrTx, userId: string, programDayId: string) {
  return db
    .select({ id: programExercises.id })
    .from(programExercises)
    .where(
      and(eq(programExercises.programDayId, programDayId), eq(programExercises.userId, userId)),
    );
}

/** The exercises the given slots plan. */
function slotExerciseIds(db: DbOrTx, slotIds: Ids) {
  return db
    .select({ id: programExercises.exerciseId })
    .from(programExercises)
    .where(idsCondition(programExercises.id, slotIds));
}

/** The exercises the given slots fall back to at the gyms in scope. */
function fallbackExerciseIds(db: DbOrTx, slotIds: Ids, gym: GymScope) {
  return db
    .select({ id: programExerciseFallbacks.fallbackExerciseId })
    .from(programExerciseFallbacks)
    .where(
      and(idsCondition(programExerciseFallbacks.programExerciseId, slotIds), gymCondition(gym)),
    );
}

/** The user's active real gyms: where an exercise can be looked for. */
function activeRealGymIds(db: DbOrTx, userId: string) {
  return db
    .select({ id: gyms.id })
    .from(gyms)
    .where(and(eq(gyms.userId, userId), eq(gyms.isActive, true), eq(gyms.kind, "gym")));
}

/** Fallbacks that apply everywhere, or at the gyms in scope. */
function gymCondition(gym: GymScope): SQL {
  return or(
    isNull(programExerciseFallbacks.gymId),
    typeof gym === "string"
      ? eq(programExerciseFallbacks.gymId, gym)
      : inArray(programExerciseFallbacks.gymId, gym),
  )!;
}

async function gymEquipmentRefs(db: DbOrTx, gym: GymScope): Promise<EquipmentInstanceRef[]> {
  return db
    .select({
      id: equipmentInstances.id,
      gymId: equipmentInstances.gymId,
      equipmentTypeId: equipmentInstances.equipmentTypeId,
      name: equipmentInstances.name,
      isActive: equipmentInstances.isActive,
      typeIds: instanceTypeIds,
    })
    .from(equipmentInstances)
    .where(
      typeof gym === "string"
        ? eq(equipmentInstances.gymId, gym)
        : inArray(equipmentInstances.gymId, gym),
    );
}

async function absentTypes(
  db: DbOrTx,
  gym: GymScope,
): Promise<{ gymId: string; equipmentTypeId: string }[]> {
  return db
    .select({
      gymId: gymAbsentEquipmentTypes.gymId,
      equipmentTypeId: gymAbsentEquipmentTypes.equipmentTypeId,
    })
    .from(gymAbsentEquipmentTypes)
    .where(
      typeof gym === "string"
        ? eq(gymAbsentEquipmentTypes.gymId, gym)
        : inArray(gymAbsentEquipmentTypes.gymId, gym),
    );
}

async function absentTypeIds(db: DbOrTx, gymId: string): Promise<Set<string>> {
  return new Set((await absentTypes(db, gymId)).map((row) => row.equipmentTypeId));
}

/** Equipment options for any of the given exercise sources (explicit ids or subqueries). */
async function optionRefs(db: DbOrTx, sources: readonly Ids[]): Promise<EquipmentOptionRef[]> {
  const conditions: SQL[] = [];
  for (const source of sources) {
    if (Array.isArray(source)) {
      if (source.length > 0) conditions.push(inArray(exerciseEquipmentOptions.exerciseId, source));
    } else {
      conditions.push(inArray(exerciseEquipmentOptions.exerciseId, source as SQLWrapper));
    }
  }
  if (conditions.length === 0) return [];
  return db
    .select({
      exerciseId: exerciseEquipmentOptions.exerciseId,
      equipmentTypeId: exerciseEquipmentOptions.equipmentTypeId,
      equipmentInstanceId: exerciseEquipmentOptions.equipmentInstanceId,
      preferenceRank: exerciseEquipmentOptions.preferenceRank,
    })
    .from(exerciseEquipmentOptions)
    .where(or(...conditions));
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

async function fallbackRows(db: DbOrTx, slotIds: Ids, gym: GymScope): Promise<FallbackRow[]> {
  if (Array.isArray(slotIds) && slotIds.length === 0) return [];
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
      and(idsCondition(programExerciseFallbacks.programExerciseId, slotIds), gymCondition(gym)),
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
  known?: GymAvailabilityInputs,
): Promise<GymAvailability | null> {
  const slotIds = activeSlotIds(db, userId);
  const [[gym], program, planned, fallbacks, options, equipment, absent, names, refs] =
    await Promise.all([
      known
        ? Promise.resolve([known.gym])
        : db
            .select()
            .from(gyms)
            .where(and(eq(gyms.id, gymId), eq(gyms.userId, userId)))
            .limit(1),
      activeProgram(db, userId),
      db
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
        .innerJoin(programs, eq(programs.id, programDays.programId))
        .innerJoin(exercises, eq(exercises.id, programExercises.exerciseId))
        .where(
          and(
            eq(programs.userId, userId),
            eq(programs.status, "active"),
            eq(programExercises.userId, userId),
          ),
        )
        .orderBy(asc(programDays.dayIndex), asc(programExercises.orderIndex)),
      fallbackRows(db, slotIds, gymId),
      optionRefs(db, [slotExerciseIds(db, slotIds), fallbackExerciseIds(db, slotIds, gymId)]),
      known ? Promise.resolve(known.equipment) : gymEquipmentRefs(db, gymId),
      known ? Promise.resolve(known.absentEquipmentTypeIds) : absentTypeIds(db, gymId),
      equipmentTypeNames(db),
      referenceSets(db),
    ]);
  if (!gym) return null;
  if (!program) return { gym, program: null, rows: [], summary: emptySummary() };

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
      ...referenceInputs(refs, gym.kind),
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
      equipment: equipmentState(resolution),
      resolvedExerciseName,
      missingTypes:
        resolution.status === "unknown"
          ? resolution.missingEquipmentTypeIds.map((id) => ({
              id,
              name: names.get(id) ?? "Unknown",
            }))
          : [],
      assumedTypes:
        resolution.status === "direct" || resolution.status === "fallback"
          ? resolution.assumedTypeIds.map((id) => ({ id, name: names.get(id) ?? "Unknown" }))
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
  equipment: EquipmentState;
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
  knownExercise?: ExerciseRef & { name: string },
): Promise<ExerciseGymAvailability[]> {
  const slotIds = activeSlotIds(db, userId, exerciseId);
  const gymIds = activeRealGymIds(db, userId);
  const [[exercise], gymRows, names, allFallbacks, options, allEquipment, allAbsent, refs] =
    await Promise.all([
      knownExercise
        ? Promise.resolve([
            {
              id: knownExercise.id,
              name: knownExercise.name,
              modality: knownExercise.modality,
              requiresEquipment: knownExercise.requiresEquipment,
            },
          ])
        : db
            .select({
              id: exercises.id,
              name: exercises.name,
              modality: exercises.modality,
              requiresEquipment: exercises.requiresEquipment,
            })
            .from(exercises)
            .where(eq(exercises.id, exerciseId))
            .limit(1),
      db
        .select({ id: gyms.id, name: gyms.name, kind: gyms.kind })
        .from(gyms)
        .where(and(eq(gyms.userId, userId), eq(gyms.isActive, true), eq(gyms.kind, "gym")))
        .orderBy(asc(gyms.name)),
      equipmentTypeNames(db),
      fallbackRows(db, slotIds, gymIds),
      optionRefs(db, [[exerciseId], fallbackExerciseIds(db, slotIds, gymIds)]),
      gymEquipmentRefs(db, gymIds),
      absentTypes(db, gymIds),
      referenceSets(db),
    ]);
  if (!exercise || gymRows.length === 0) return [];

  const results: ExerciseGymAvailability[] = [];
  for (const gym of gymRows) {
    const fallbacks = allFallbacks.filter((f) => f.gymId === null || f.gymId === gym.id);
    const equipment = allEquipment.filter((e) => e.gymId === gym.id);
    const absent = new Set(
      allAbsent.filter((e) => e.gymId === gym.id).map((e) => e.equipmentTypeId),
    );
    const inputs = referenceInputs(refs, gym.kind);
    const resolution = resolveExerciseAtGym({
      exercise,
      gym: { id: gym.id, kind: gym.kind },
      preferredEquipmentInstanceId: null,
      options,
      fallbacks: fallbacks.map(toFallbackRef),
      gymEquipment: equipment,
      absentEquipmentTypeIds: absent,
      ...inputs,
    });
    const machines = compatibleMachines(
      exercise,
      inventoryAt(gym.id, equipment, {
        absent,
        assumed: inputs.assumedEquipmentTypeIds,
        free: inputs.freeEquipmentTypeIds,
      }),
      inputs.requirements,
      options,
      inputs.modalityTypeIds,
    ).map((item) => ({ id: item.id, name: item.name }));
    const preferred = options.find(
      (option) =>
        option.exerciseId === exercise.id &&
        option.equipmentInstanceId !== null &&
        machines.some((machine) => machine.id === option.equipmentInstanceId),
    );
    results.push({
      gym,
      resolution,
      equipment: equipmentState(resolution),
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

export type FallbackOption = {
  fallbackId: string;
  exerciseId: string;
  exerciseName: string;
  equipmentInstanceId: string | null;
  equipmentInstanceName: string | null;
  /** Whether the fallback can actually be done at this gym right now. */
  available: boolean;
};

/**
 * What a workout asks about a machine (plan: gradual confirmation during workouts): a gym basic
 * nobody has confirmed, settled with one tap ("Yes, it's here", "Not here", or, for a family, "A
 * different one"), or any other machine nobody has answered for ("Available", "Not here", "Not
 * sure"). The drawing is there only where it may be shown.
 */
export type EquipmentAsk = {
  kind: "confirm_basic" | "unknown";
  typeId: string;
  slug: string;
  name: string;
  art: string | null;
  /** For a basic in a family, the family's name and its other variants. */
  family: {
    name: string;
    variants: { typeId: string; slug: string; name: string; art: string | null }[];
  } | null;
};

export type ExerciseDecision = {
  resolution: Resolution;
  resolvedExerciseName: string;
  fallbackOptions: FallbackOption[];
  missingTypes: NamedType[];
  ask: EquipmentAsk | null;
  /**
   * Every registered machine here that can do the exercise, the resolved one first: when there
   * are several of one type, each keeps its own name, id and history, and the workout asks which.
   */
  machines: { id: string; name: string }[];
};

/** The ask a resolution leaves, if any: the basic to confirm, or the first unknown type. */
function askFor(resolution: Resolution, refs: ReferenceSets): EquipmentAsk | null {
  const basic =
    resolution.status === "direct" &&
    resolution.basis === "assumed" &&
    resolution.equipmentInstance === null &&
    resolution.primaryTypeId !== null
      ? resolution.primaryTypeId
      : null;
  const typeId =
    basic ?? (resolution.status === "unknown" ? resolution.missingEquipmentTypeIds[0] : null);
  const type = typeId ? refs.typeById.get(typeId) : undefined;
  if (!typeId || !type) return null;
  const familyDef = basic && type.family ? EQUIPMENT_FAMILIES[type.family] : undefined;
  const variants = (familyDef?.members ?? []).flatMap((slug) => {
    if (slug === type.slug) return [];
    const entry = [...refs.typeById.entries()].find(([, other]) => other.slug === slug);
    return entry ? [{ typeId: entry[0], slug, name: entry[1].name, art: drawingFor(slug) }] : [];
  });
  return {
    kind: basic ? "confirm_basic" : "unknown",
    typeId,
    slug: type.slug,
    name: type.name,
    art: drawingFor(type.slug),
    family: familyDef && variants.length > 0 ? { name: familyDef.name, variants } : null,
  };
}

function drawingFor(slug: string): string | null {
  return drawingVisible(slug) ? drawingUrl(slug) : null;
}

type DecisionContext = {
  gym: KnownGym;
  options: EquipmentOptionRef[];
  equipment: EquipmentInstanceRef[];
  absent: Set<string>;
  names: Map<string, string>;
  refs: ReferenceSets;
};

function decide(
  ctx: DecisionContext,
  exercise: ExerciseRef & { name: string },
  fallbacks: FallbackRow[],
  preferredEquipmentInstanceId: string | null,
): ExerciseDecision {
  const inputs = referenceInputs(ctx.refs, ctx.gym.kind);
  const resolution = resolveExerciseAtGym({
    exercise,
    gym: { id: ctx.gym.id, kind: ctx.gym.kind },
    preferredEquipmentInstanceId,
    options: ctx.options,
    fallbacks: fallbacks.map(toFallbackRef),
    gymEquipment: ctx.equipment,
    absentEquipmentTypeIds: ctx.absent,
    ...inputs,
  });
  const inventory = inventoryAt(ctx.gym.id, ctx.equipment, {
    absent: ctx.absent,
    assumed: inputs.assumedEquipmentTypeIds,
    free: inputs.freeEquipmentTypeIds,
  });
  const fallbackOptions: FallbackOption[] = fallbacks.map((f) => {
    // The same rule the resolver uses, so "Use" is offered exactly when it would work.
    const result = evaluateFallback(
      toFallbackRef(f),
      inventory,
      inputs.requirements,
      ctx.options,
      inputs.modalityTypeIds,
    );
    const instance = result.state === "available" ? result.equipmentInstance : null;
    return {
      fallbackId: f.id,
      exerciseId: f.exercise.id,
      exerciseName: f.exercise.name,
      equipmentInstanceId: instance?.id ?? null,
      equipmentInstanceName: instance?.name ?? null,
      available: result.state === "available",
    };
  });
  return {
    resolution,
    resolvedExerciseName:
      resolution.status === "fallback"
        ? (fallbacks.find((f) => f.exercise.id === resolution.exercise.id)?.exercise.name ??
          exercise.name)
        : exercise.name,
    fallbackOptions,
    missingTypes:
      resolution.status === "unknown"
        ? resolution.missingEquipmentTypeIds.map((id) => ({
            id,
            name: ctx.names.get(id) ?? "Unknown",
          }))
        : [],
    ask: askFor(resolution, ctx.refs),
    machines: (() => {
      const fits = compatibleMachines(
        exercise,
        inventory,
        inputs.requirements,
        ctx.options,
        inputs.modalityTypeIds,
      ).map((machine) => ({ id: machine.id, name: machine.name }));
      const chosen =
        resolution.status === "direct" && resolution.equipmentInstance
          ? resolution.equipmentInstance.id
          : null;
      return [
        ...fits.filter((machine) => machine.id === chosen),
        ...fits.filter((machine) => machine.id !== chosen),
      ];
    })(),
  };
}

/**
 * Independent reads of everything `decide` needs about a gym. `known` is the gym row when
 * the caller already has it, which saves looking it up again.
 */
async function decisionContext(
  db: DbOrTx,
  userId: string,
  gymId: string,
  exerciseSources: readonly Ids[],
  known?: KnownGym,
): Promise<DecisionContext | null> {
  const [gym, options, equipment, absent, names, refs] = await Promise.all([
    known
      ? Promise.resolve(known)
      : db
          .select({ id: gyms.id, kind: gyms.kind, name: gyms.name })
          .from(gyms)
          .where(and(eq(gyms.id, gymId), eq(gyms.userId, userId)))
          .limit(1)
          .then((rows) => rows[0] ?? null),
    optionRefs(db, exerciseSources),
    gymEquipmentRefs(db, gymId),
    absentTypeIds(db, gymId),
    equipmentTypeNames(db),
    referenceSets(db),
  ]);
  if (!gym) return null;
  return { gym, options, equipment, absent, names, refs } satisfies DecisionContext;
}

export type PlannedDayResolution = {
  programExerciseId: string;
  exercise: ExerciseRef & { name: string };
  preferredEquipmentInstanceId: string | null;
  /** The programme's grouping, which a new session copies and then owns. */
  supersetGroup: string | null;
  decision: ExerciseDecision;
};

/** Resolves every planned exercise of one programme day at a gym, in programme order. */
export async function resolvePlannedDay(
  db: DbOrTx,
  userId: string,
  gymId: string,
  programDayId: string,
  gym?: KnownGym,
): Promise<PlannedDayResolution[] | null> {
  const slotIds = daySlotIds(db, userId, programDayId);
  const [planned, fallbacks, ctx] = await Promise.all([
    db
      .select({
        programExerciseId: programExercises.id,
        preferredEquipmentInstanceId: programExercises.preferredEquipmentInstanceId,
        supersetGroup: programExercises.supersetGroup,
        exerciseId: exercises.id,
        exerciseName: exercises.name,
        modality: exercises.modality,
        requiresEquipment: exercises.requiresEquipment,
      })
      .from(programExercises)
      .innerJoin(exercises, eq(exercises.id, programExercises.exerciseId))
      .where(
        and(eq(programExercises.programDayId, programDayId), eq(programExercises.userId, userId)),
      )
      .orderBy(asc(programExercises.orderIndex)),
    fallbackRows(db, slotIds, gymId),
    decisionContext(
      db,
      userId,
      gymId,
      [slotExerciseIds(db, slotIds), fallbackExerciseIds(db, slotIds, gymId)],
      gym,
    ),
  ]);
  if (!ctx) return null;
  return planned.map((p) => {
    const exercise = {
      id: p.exerciseId,
      name: p.exerciseName,
      modality: p.modality,
      requiresEquipment: p.requiresEquipment,
    };
    return {
      programExerciseId: p.programExerciseId,
      exercise,
      preferredEquipmentInstanceId: p.preferredEquipmentInstanceId,
      supersetGroup: p.supersetGroup,
      decision: decide(
        ctx,
        exercise,
        fallbacks.filter((f) => f.programExerciseId === p.programExerciseId),
        p.preferredEquipmentInstanceId,
      ),
    };
  });
}

/** Decision for one exercise at a gym, with the fallbacks of its planned slot if any. */
export async function decideExerciseAtGym(
  db: DbOrTx,
  userId: string,
  gymId: string,
  exerciseId: string,
  programExerciseId: string | null,
): Promise<ExerciseDecision | null> {
  const slotIds = programExerciseId ? [programExerciseId] : [];
  const [[exercise], fallbacks, ctx] = await Promise.all([
    db
      .select({
        id: exercises.id,
        name: exercises.name,
        modality: exercises.modality,
        requiresEquipment: exercises.requiresEquipment,
      })
      .from(exercises)
      .where(eq(exercises.id, exerciseId))
      .limit(1),
    fallbackRows(db, slotIds, gymId),
    decisionContext(db, userId, gymId, [
      [exerciseId],
      ...(slotIds.length > 0 ? [fallbackExerciseIds(db, slotIds, gymId)] : []),
    ]),
  ]);
  if (!exercise || !ctx) return null;
  return decide(ctx, exercise, fallbacks, null);
}

/**
 * Whether a workout exercise with no machine attached still has something to settle (ADR 0041):
 * anything unknown, absent or met by a fallback; a registered machine the exercise's history
 * belongs on; and a basic machine nobody has confirmed, asked once on first use. Free weights,
 * benches and bars, and anything needing no equipment, are never asked about.
 */
export function needsDecision(
  resolution: Resolution,
  loadPortability: LoadPortability,
  categoryById: ReadonlyMap<string, string>,
): boolean {
  if (resolution.status !== "direct") return true;
  if (resolution.basis === "free") return false;
  if (loadPortability === "global") return false;
  if (resolution.basis === "confirmed") return resolution.equipmentInstance !== null;
  const category = resolution.primaryTypeId ? categoryById.get(resolution.primaryTypeId) : null;
  return category === "machine" || category === "cable";
}

/**
 * Reuse one gym context for every workout exercise without a machine, and return a decision only
 * for those that still have something to settle.
 */
export async function decideExercisesAtGym(
  db: DbOrTx,
  userId: string,
  gymId: string,
  slots: {
    id: string;
    exercise: ExerciseRef & { name: string; loadPortability: LoadPortability };
    programExerciseId: string | null;
  }[],
  gym?: KnownGym,
): Promise<Map<string, ExerciseDecision>> {
  if (slots.length === 0) return new Map();
  const slotIds = slots.flatMap((s) => (s.programExerciseId ? [s.programExerciseId] : []));
  const [fallbacks, ctx] = await Promise.all([
    fallbackRows(db, slotIds, gymId),
    decisionContext(
      db,
      userId,
      gymId,
      [
        slots.map((s) => s.exercise.id),
        ...(slotIds.length > 0 ? [fallbackExerciseIds(db, slotIds, gymId)] : []),
      ],
      gym,
    ),
  ]);
  if (!ctx) return new Map();
  const decisions = new Map<string, ExerciseDecision>();
  for (const slot of slots) {
    const decision = decide(
      ctx,
      slot.exercise,
      fallbacks.filter((f) => f.programExerciseId === slot.programExerciseId),
      null,
    );
    if (needsDecision(decision.resolution, slot.exercise.loadPortability, ctx.refs.categoryById))
      decisions.set(slot.id, decision);
  }
  return decisions;
}
