import type { ExerciseModality, GymKind } from "./types";

/*
 * What an exercise becomes at one location (ADR 0004, amended; ADR 0041).
 *
 * An exercise needs one of several alternatives, each a group of equipment types used together
 * with one primary type: the load-bearing equipment a workout records and keys history on. A
 * Smith hip thrust is one group (Smith machine, primary; flat bench); a dip is two (a dip
 * station; gymnastic rings). A type in a group is:
 *
 * - present: an active machine at the location has it (a machine can have several types);
 * - assumed: the location's kind takes it for granted (the gym basics) and nobody has said
 *   it is missing;
 * - absent: someone said it is not there, and no active machine there has it;
 * - unknown: none of these. Home and outdoors assume nothing, so unanswered equipment there is
 *   unknown too, never unavailable.
 *
 * A group is confirmed when every type is present, assumed when every type is present or
 * assumed, ruled out when any type is absent, and unknown otherwise. The `bodyweight` type is
 * the floor: a group of it alone needs nothing at all.
 */

export interface ExerciseRef {
  id: string;
  modality: ExerciseModality;
  requiresEquipment: boolean;
}

export interface EquipmentInstanceRef {
  id: string;
  gymId: string;
  /** The machine's display type. */
  equipmentTypeId: string;
  name: string;
  isActive: boolean;
  /** Every type the machine is (a lat pulldown with a low row is two); its display type if left out. */
  typeIds?: readonly string[];
}

/**
 * "This exercise can be done on this machine" (a user's own instance-level row: a preferred
 * machine, a custom exercise's machine), or a shared type-level row. Type-level rows are read
 * only for an exercise that has no requirement groups.
 */
export interface EquipmentOptionRef {
  exerciseId: string;
  equipmentTypeId: string | null;
  equipmentInstanceId: string | null;
  preferenceRank: number;
}

/** One type of one alternative of an exercise's requirements. */
export interface RequirementRef {
  exerciseId: string;
  /** 1-based, in preference order. */
  alternative: number;
  equipmentTypeId: string;
  isPrimary: boolean;
}

export interface FallbackRef {
  /** null = applies at every gym. */
  gymId: string | null;
  fallbackExercise: ExerciseRef;
  fallbackEquipmentTypeId: string | null;
  fallbackEquipmentInstanceId: string | null;
  rank: number;
}

export interface ResolutionInput {
  exercise: ExerciseRef;
  gym: { id: string; kind: GymKind };
  preferredEquipmentInstanceId: string | null;
  /** Instance-level options (and, for exercises without groups, type-level ones). */
  options: readonly EquipmentOptionRef[];
  /** Requirement groups for the planned exercise and any fallback exercises. */
  requirements?: readonly RequirementRef[];
  fallbacks: readonly FallbackRef[];
  /** Every equipment instance registered at the gym (inactive ones are ignored). */
  gymEquipment: readonly EquipmentInstanceRef[];
  /** Equipment types the user has marked as not present at this gym. */
  absentEquipmentTypeIds?: ReadonlySet<string>;
  /** Equipment types this kind of location is assumed to have (the gym basics at a gym). */
  assumedEquipmentTypeIds?: ReadonlySet<string>;
  /** Types that stand for no equipment at all (the floor). */
  freeEquipmentTypeIds?: ReadonlySet<string>;
  /**
   * The type a free-weight modality needs when an exercise names nothing else (an athlete's own
   * barbell or dumbbell exercise): barbell → the barbell, dumbbell → dumbbells.
   */
  modalityTypeIds?: ModalityTypeIds;
}

export type ModalityTypeIds = Partial<Record<ExerciseModality, string>>;

export type AvailabilityStatus = "direct" | "fallback" | "unknown" | "unavailable";

/** Why something is available: a registered machine, a basic taken for granted, or nothing needed. */
export type ResolutionBasis = "confirmed" | "assumed" | "free";

/** What the coach and the programme screens are told about one exercise's equipment. */
export type EquipmentState = "confirmed" | "assumed" | "unknown" | "absent" | "none";

type Available = {
  equipmentInstance: EquipmentInstanceRef | null;
  basis: ResolutionBasis;
  /** The primary type of the alternative used; null when nothing is needed. */
  primaryTypeId: string | null;
  /** Types of that alternative taken for granted rather than registered. */
  assumedTypeIds: string[];
};

export type Resolution =
  | ({ status: "direct"; exercise: ExerciseRef } & Available)
  | ({ status: "fallback"; exercise: ExerciseRef; fallback: FallbackRef } & Available)
  | {
      /** Nothing registered matches, and the gym has not been marked as lacking it. */
      status: "unknown";
      exercise: ExerciseRef;
      /**
       * Equipment types that would make the exercise (or a fallback) available, the most useful
       * first: the first is what a workout asks about.
       */
      missingEquipmentTypeIds: string[];
    }
  | {
      status: "unavailable";
      exercise: ExerciseRef;
      /** The absent types that rule out each way of doing it. */
      absentEquipmentTypeIds?: string[];
    };

/** How one exercise stands at a location, before fallbacks are considered. */
export type Evaluation =
  | ({ state: "available" } & Available)
  | { state: "unknown"; missing: string[] }
  | { state: "absent"; absent: string[] };

export type Inventory = {
  active: readonly EquipmentInstanceRef[];
  present: ReadonlySet<string>;
  absent: ReadonlySet<string>;
  assumed: ReadonlySet<string>;
  free: ReadonlySet<string>;
};

export function typesOf(instance: EquipmentInstanceRef): readonly string[] {
  return instance.typeIds && instance.typeIds.length > 0
    ? instance.typeIds
    : [instance.equipmentTypeId];
}

function byName(a: EquipmentInstanceRef, b: EquipmentInstanceRef): number {
  return a.name.localeCompare(b.name);
}

/** What a location holds, as the resolver reads it. */
export function inventoryAt(
  gymId: string,
  gymEquipment: readonly EquipmentInstanceRef[],
  sets: {
    absent?: ReadonlySet<string>;
    assumed?: ReadonlySet<string>;
    free?: ReadonlySet<string>;
  } = {},
): Inventory {
  const active = gymEquipment.filter((i) => i.gymId === gymId && i.isActive);
  return {
    active,
    present: new Set(active.flatMap((i) => typesOf(i))),
    absent: sets.absent ?? new Set(),
    assumed: sets.assumed ?? new Set(),
    free: sets.free ?? new Set(),
  };
}

/** Active machines at the location that have a type, by name. */
export function machinesWithType(inventory: Inventory, typeId: string): EquipmentInstanceRef[] {
  return inventory.active.filter((i) => typesOf(i).includes(typeId)).sort(byName);
}

/** An exercise's alternatives, in preference order, each with its primary type first. */
export function groupsFor(
  exercise: ExerciseRef,
  requirements: readonly RequirementRef[] | undefined,
  options: readonly EquipmentOptionRef[],
  modalityTypeIds: ModalityTypeIds = {},
): string[][] {
  const own = (requirements ?? []).filter((r) => r.exerciseId === exercise.id);
  if (own.length === 0) {
    // No groups (an older caller): each listed type is an alternative of its own, as the flat
    // list meant. An athlete's own free-weight exercise names nothing: its modality says it.
    const listed = options
      .filter((o) => o.exerciseId === exercise.id && o.equipmentTypeId !== null)
      .sort((a, b) => a.preferenceRank - b.preferenceRank)
      .map((o) => [o.equipmentTypeId!]);
    if (listed.length > 0) return listed;
    const byModality = modalityTypeIds[exercise.modality];
    return byModality ? [[byModality]] : [];
  }
  const byAlternative = new Map<number, RequirementRef[]>();
  for (const row of own)
    byAlternative.set(row.alternative, [...(byAlternative.get(row.alternative) ?? []), row]);
  return [...byAlternative.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, rows]) => [
      ...rows.filter((r) => r.isPrimary).map((r) => r.equipmentTypeId),
      ...rows.filter((r) => !r.isPrimary).map((r) => r.equipmentTypeId),
    ]);
}

type GroupState =
  | { state: "confirmed" | "assumed" | "free"; primary: string | null; assumed: string[] }
  | { state: "unknown"; missing: string[] }
  | { state: "absent"; absent: string[] };

function groupState(group: readonly string[], inventory: Inventory): GroupState {
  if (group.length === 0 || group.every((type) => inventory.free.has(type)))
    return { state: "free", primary: null, assumed: [] };
  const needed = group.filter((type) => !inventory.free.has(type));
  // Presence wins over a stale absence: the machine is there.
  const absent = needed.filter(
    (type) => inventory.absent.has(type) && !inventory.present.has(type),
  );
  if (absent.length > 0) return { state: "absent", absent };
  const assumed = needed.filter(
    (type) => !inventory.present.has(type) && inventory.assumed.has(type),
  );
  const missing = needed.filter(
    (type) => !inventory.present.has(type) && !inventory.assumed.has(type),
  );
  if (missing.length > 0) return { state: "unknown", missing };
  return { state: assumed.length > 0 ? "assumed" : "confirmed", primary: group[0]!, assumed };
}

/**
 * How one exercise stands at a location: on a machine of the user's own choosing first, then
 * the first alternative every type of which is registered, then (needing nothing at all) none,
 * then the first alternative the location takes for granted. Otherwise unknown, listing what
 * would help, or absent, when every way of doing it needs something known to be missing.
 */
export function evaluateExercise(
  exercise: ExerciseRef,
  inventory: Inventory,
  requirements: readonly RequirementRef[] | undefined,
  options: readonly EquipmentOptionRef[],
  modalityTypeIds: ModalityTypeIds = {},
): Evaluation {
  // A machine the user tied to this exercise (a custom exercise's, a preferred one).
  for (const option of options
    .filter((o) => o.exerciseId === exercise.id && o.equipmentInstanceId)
    .sort((a, b) => a.preferenceRank - b.preferenceRank)) {
    const exact = inventory.active.find((i) => i.id === option.equipmentInstanceId);
    if (exact)
      return {
        state: "available",
        equipmentInstance: exact,
        basis: "confirmed",
        primaryTypeId: exact.equipmentTypeId,
        assumedTypeIds: [],
      };
  }

  const states = groupsFor(exercise, requirements, options, modalityTypeIds).map((group) => ({
    group,
    result: groupState(group, inventory),
  }));
  const confirmed = states.find((s) => s.result.state === "confirmed");
  if (confirmed && confirmed.result.state === "confirmed") {
    const primary = confirmed.result.primary!;
    return {
      state: "available",
      equipmentInstance: machinesWithType(inventory, primary)[0] ?? null,
      basis: "confirmed",
      primaryTypeId: primary,
      assumedTypeIds: [],
    };
  }
  if (!exercise.requiresEquipment || states.some((s) => s.result.state === "free"))
    return {
      state: "available",
      equipmentInstance: null,
      basis: "free",
      primaryTypeId: null,
      assumedTypeIds: [],
    };
  const assumed = states.find((s) => s.result.state === "assumed");
  if (assumed && assumed.result.state === "assumed") {
    const primary = assumed.result.primary!;
    return {
      state: "available",
      equipmentInstance: machinesWithType(inventory, primary)[0] ?? null,
      basis: "assumed",
      primaryTypeId: primary,
      assumedTypeIds: assumed.result.assumed,
    };
  }
  const missing = [
    ...new Set(states.flatMap((s) => (s.result.state === "unknown" ? s.result.missing : []))),
  ];
  // An exercise that needs equipment but names none is unknown, not absent: nothing says no.
  if (missing.length > 0 || states.length === 0) return { state: "unknown", missing };
  return {
    state: "absent",
    absent: [
      ...new Set(states.flatMap((s) => (s.result.state === "absent" ? s.result.absent : []))),
    ],
  };
}

export function evaluateFallback(
  fallback: FallbackRef,
  inventory: Inventory,
  requirements: readonly RequirementRef[] | undefined,
  options: readonly EquipmentOptionRef[],
  modalityTypeIds: ModalityTypeIds = {},
): Evaluation {
  if (fallback.fallbackEquipmentInstanceId) {
    const exact = inventory.active.find((i) => i.id === fallback.fallbackEquipmentInstanceId);
    return exact
      ? {
          state: "available",
          equipmentInstance: exact,
          basis: "confirmed",
          primaryTypeId: exact.equipmentTypeId,
          assumedTypeIds: [],
        }
      : // A named machine that is archived or gone is no help, and asking about it is not either.
        { state: "absent", absent: [] };
  }
  if (fallback.fallbackEquipmentTypeId) {
    const result = groupState([fallback.fallbackEquipmentTypeId], inventory);
    if (result.state === "unknown") return { state: "unknown", missing: result.missing };
    if (result.state === "absent") return { state: "absent", absent: result.absent };
    return {
      state: "available",
      equipmentInstance: machinesWithType(inventory, fallback.fallbackEquipmentTypeId)[0] ?? null,
      basis: result.state,
      primaryTypeId: result.primary,
      assumedTypeIds: result.assumed,
    };
  }
  return evaluateExercise(
    fallback.fallbackExercise,
    inventory,
    requirements,
    options,
    modalityTypeIds,
  );
}

function available(evaluation: Evaluation): evaluation is { state: "available" } & Available {
  return evaluation.state === "available";
}

function availability(evaluation: { state: "available" } & Available): Available {
  return {
    equipmentInstance: evaluation.equipmentInstance,
    basis: evaluation.basis,
    primaryTypeId: evaluation.primaryTypeId,
    assumedTypeIds: evaluation.assumedTypeIds,
  };
}

/**
 * Decide what a planned exercise becomes at a specific location:
 * - `direct`: the planned exercise, on its preferred or a compatible registered machine, on a
 *   basic the location is assumed to have, or with no equipment at all. Fallbacks never replace
 *   an exercise that can be done: an assumed basic is here until someone says it is not, and a
 *   machine basic is confirmed in the workout, whose "Not here" then offers the fallbacks;
 * - `fallback`: an alternative that can be done, when the planned exercise cannot. A fallback the
 *   user set for this gym answers for equipment nobody has confirmed; the programme's own
 *   fallbacks apply on their own only once the planned equipment is known to be absent. A
 *   fallback naming the exercise being resolved, and no machine, is that exercise, not a
 *   replacement for it;
 * - `unknown`: the planned exercise needs something nobody has answered for; a workout asks;
 * - `unavailable`: every way of doing it needs equipment known to be absent.
 */
export function resolveExerciseAtGym(input: ResolutionInput): Resolution {
  const { exercise, gym } = input;
  const inventory = inventoryAt(gym.id, input.gymEquipment, {
    absent: input.absentEquipmentTypeIds,
    assumed: input.assumedEquipmentTypeIds,
    free: input.freeEquipmentTypeIds,
  });

  if (input.preferredEquipmentInstanceId) {
    const preferred = inventory.active.find((i) => i.id === input.preferredEquipmentInstanceId);
    if (preferred)
      return {
        status: "direct",
        exercise,
        equipmentInstance: preferred,
        basis: "confirmed",
        primaryTypeId: preferred.equipmentTypeId,
        assumedTypeIds: [],
      };
  }

  const planned = evaluateExercise(
    exercise,
    inventory,
    input.requirements,
    input.options,
    input.modalityTypeIds,
  );
  if (available(planned)) return { status: "direct", exercise, ...availability(planned) };

  const fallbacks = input.fallbacks
    .filter((f) => f.gymId === null || f.gymId === gym.id)
    // A workout row already doing its slot's fallback is resolved against that slot's
    // fallbacks: the fallback is the row's own exercise there, and never a way out of itself.
    .filter((f) => f.fallbackExercise.id !== exercise.id || f.fallbackEquipmentInstanceId)
    .sort((a, b) => {
      if (a.gymId !== b.gymId) return a.gymId === gym.id ? -1 : 1;
      return a.rank - b.rank;
    })
    .map((fallback) => ({
      fallback,
      result: evaluateFallback(
        fallback,
        inventory,
        input.requirements,
        input.options,
        input.modalityTypeIds,
      ),
    }));

  const own = fallbacks.find((f) => f.fallback.gymId === gym.id && available(f.result));
  if (own && available(own.result))
    return {
      status: "fallback",
      exercise: own.fallback.fallbackExercise,
      fallback: own.fallback,
      ...availability(own.result),
    };

  if (planned.state === "absent") {
    const usable = fallbacks.find((f) => available(f.result));
    if (usable && available(usable.result))
      return {
        status: "fallback",
        exercise: usable.fallback.fallbackExercise,
        fallback: usable.fallback,
        ...availability(usable.result),
      };
  }

  const missing = new Set<string>(planned.state === "unknown" ? planned.missing : []);
  for (const { result } of fallbacks)
    if (result.state === "unknown") for (const id of result.missing) missing.add(id);
  if (missing.size > 0 || planned.state === "unknown")
    return { status: "unknown", exercise, missingEquipmentTypeIds: [...missing] };
  return {
    status: "unavailable",
    exercise,
    absentEquipmentTypeIds: planned.state === "absent" ? planned.absent : [],
  };
}

/** The resolution in the coach's and the programme screens' terms. */
export function equipmentState(resolution: Resolution): EquipmentState {
  switch (resolution.status) {
    case "direct":
    case "fallback":
      return resolution.basis === "free"
        ? "none"
        : resolution.basis === "assumed"
          ? "assumed"
          : "confirmed";
    case "unknown":
      return "unknown";
    case "unavailable":
      return "absent";
  }
}

/** Available now, a basic counted: what the coach may plan without a backup. */
export function isAvailableNow(resolution: Resolution): boolean {
  return resolution.status === "direct" || resolution.status === "fallback";
}

/**
 * The machines at a location an exercise can be recorded on: those with the primary type of an
 * alternative nothing absent rules out, and any machine the athlete tied to the exercise. A bench
 * that only supports a Smith hip thrust is never offered as its machine.
 */
export function compatibleMachines(
  exercise: ExerciseRef,
  inventory: Inventory,
  requirements: readonly RequirementRef[] | undefined,
  options: readonly EquipmentOptionRef[],
  modalityTypeIds: ModalityTypeIds = {},
): EquipmentInstanceRef[] {
  const ids = new Set<string>();
  for (const option of options)
    if (option.exerciseId === exercise.id && option.equipmentInstanceId)
      ids.add(option.equipmentInstanceId);
  for (const group of groupsFor(exercise, requirements, options, modalityTypeIds)) {
    const primary = group[0];
    if (!primary || inventory.free.has(primary)) continue;
    if (groupState(group, inventory).state === "absent") continue;
    for (const machine of machinesWithType(inventory, primary)) ids.add(machine.id);
  }
  return inventory.active.filter((i) => ids.has(i.id)).sort(byName);
}
