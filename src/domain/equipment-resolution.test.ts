import { describe, expect, it } from "vitest";

import { resolveExerciseAtGym, type EquipmentInstanceRef } from "./equipment-resolution";

const smithCalfRaise = {
  id: "smith-machine-calf-raise",
  modality: "smith_machine",
  requiresEquipment: true,
} as const;
const legPressCalfPress = {
  id: "leg-press-calf-press",
  modality: "machine",
  requiresEquipment: true,
} as const;
const barbellBench = {
  id: "barbell-bench-press",
  modality: "barbell",
  requiresEquipment: true,
} as const;
const sidePlank = { id: "side-plank", modality: "bodyweight", requiresEquipment: false } as const;

const options = [
  {
    exerciseId: "smith-machine-calf-raise",
    equipmentTypeId: "smith_machine",
    equipmentInstanceId: null,
    preferenceRank: 1,
  },
  {
    exerciseId: "leg-press-calf-press",
    equipmentTypeId: "leg_press_45",
    equipmentInstanceId: null,
    preferenceRank: 1,
  },
  {
    exerciseId: "leg-press-calf-press",
    equipmentTypeId: "leg_press_horizontal",
    equipmentInstanceId: null,
    preferenceRank: 2,
  },
  {
    exerciseId: "barbell-bench-press",
    equipmentTypeId: "barbell",
    equipmentInstanceId: null,
    preferenceRank: 1,
  },
];

const fallbacks = [
  {
    gymId: null,
    fallbackExercise: legPressCalfPress,
    fallbackEquipmentTypeId: "leg_press_45",
    fallbackEquipmentInstanceId: null,
    rank: 1,
  },
  {
    gymId: null,
    fallbackExercise: legPressCalfPress,
    fallbackEquipmentTypeId: "leg_press_horizontal",
    fallbackEquipmentInstanceId: null,
    rank: 2,
  },
];

const gymA = { id: "gym-a", kind: "gym" } as const;
const gymB = { id: "gym-b", kind: "gym" } as const;
const outdoor = { id: "outdoor", kind: "outdoor" } as const;

const equipment: EquipmentInstanceRef[] = [
  {
    id: "a-smith",
    gymId: "gym-a",
    equipmentTypeId: "smith_machine",
    name: "Smith machine",
    isActive: true,
  },
  {
    id: "a-leg-press-45",
    gymId: "gym-a",
    equipmentTypeId: "leg_press_45",
    name: "45° leg press",
    isActive: true,
  },
  {
    id: "b-leg-press-h",
    gymId: "gym-b",
    equipmentTypeId: "leg_press_horizontal",
    name: "Horizontal leg press",
    isActive: true,
  },
  {
    id: "b-smith-broken",
    gymId: "gym-b",
    equipmentTypeId: "smith_machine",
    name: "Smith (out of order)",
    isActive: false,
  },
];

describe("equipment resolution", () => {
  it("uses the Smith machine directly where one exists", () => {
    const result = resolveExerciseAtGym({
      exercise: smithCalfRaise,
      gym: gymA,
      preferredEquipmentInstanceId: null,
      options,
      fallbacks,
      gymEquipment: equipment,
    });
    expect(result.status).toBe("direct");
    if (result.status === "direct") expect(result.equipmentInstance?.id).toBe("a-smith");
  });

  it("falls back to the leg-press calf press on Gym B's horizontal leg press when no Smith is active", () => {
    const result = resolveExerciseAtGym({
      exercise: smithCalfRaise,
      gym: gymB,
      preferredEquipmentInstanceId: null,
      options,
      fallbacks,
      gymEquipment: equipment,
    });
    expect(result.status).toBe("fallback");
    if (result.status === "fallback") {
      expect(result.exercise.id).toBe("leg-press-calf-press");
      expect(result.equipmentInstance?.id).toBe("b-leg-press-h");
      expect(result.fallback.rank).toBe(2);
    }
  });

  it("prefers a gym-specific fallback over a global one", () => {
    const gymSpecific = {
      gymId: "gym-b",
      fallbackExercise: sidePlank,
      fallbackEquipmentTypeId: null,
      fallbackEquipmentInstanceId: null,
      rank: 9,
    };
    const result = resolveExerciseAtGym({
      exercise: smithCalfRaise,
      gym: gymB,
      preferredEquipmentInstanceId: null,
      options,
      fallbacks: [...fallbacks, gymSpecific],
      gymEquipment: equipment,
    });
    expect(result.status).toBe("fallback");
    if (result.status === "fallback") expect(result.exercise.id).toBe("side-plank");
  });

  it("honours a preferred equipment instance when it is at this gym", () => {
    const result = resolveExerciseAtGym({
      exercise: smithCalfRaise,
      gym: gymA,
      preferredEquipmentInstanceId: "a-smith",
      options,
      fallbacks,
      gymEquipment: equipment,
    });
    expect(result).toMatchObject({ status: "direct", equipmentInstance: { id: "a-smith" } });
  });

  it("treats free weights as available at any real gym but not outdoors", () => {
    const atGym = resolveExerciseAtGym({
      exercise: barbellBench,
      gym: gymB,
      preferredEquipmentInstanceId: null,
      options,
      fallbacks: [],
      gymEquipment: equipment,
    });
    expect(atGym).toEqual({ status: "direct", exercise: barbellBench, equipmentInstance: null });
    const outside = resolveExerciseAtGym({
      exercise: barbellBench,
      gym: outdoor,
      preferredEquipmentInstanceId: null,
      options,
      fallbacks: [],
      gymEquipment: equipment,
    });
    expect(outside.status).toBe("unavailable");
  });

  it("reports unavailable when neither the exercise nor any fallback fits", () => {
    const result = resolveExerciseAtGym({
      exercise: smithCalfRaise,
      gym: outdoor,
      preferredEquipmentInstanceId: null,
      options,
      fallbacks,
      gymEquipment: equipment,
    });
    expect(result.status).toBe("unavailable");
  });
});
