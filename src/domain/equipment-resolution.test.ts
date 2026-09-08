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
const pecDeckFly = { id: "pec-deck-fly", modality: "machine", requiresEquipment: true } as const;

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
  {
    exerciseId: "pec-deck-fly",
    equipmentTypeId: "pec_deck",
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
const gymC = { id: "gym-c", kind: "gym" } as const; // nothing registered yet
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
    id: "a-pec-deck-1",
    gymId: "gym-a",
    equipmentTypeId: "pec_deck",
    name: "Pec deck (window)",
    isActive: true,
  },
  {
    id: "a-pec-deck-2",
    gymId: "gym-a",
    equipmentTypeId: "pec_deck",
    name: "Pec deck (back)",
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

const base = { preferredEquipmentInstanceId: null, options, fallbacks, gymEquipment: equipment };

describe("equipment resolution", () => {
  it("uses the Smith machine directly where one exists", () => {
    const result = resolveExerciseAtGym({ ...base, exercise: smithCalfRaise, gym: gymA });
    expect(result).toMatchObject({ status: "direct", equipmentInstance: { id: "a-smith" } });
  });

  it("falls back to the leg-press calf press on Gym B's horizontal leg press when no Smith is active", () => {
    const result = resolveExerciseAtGym({ ...base, exercise: smithCalfRaise, gym: gymB });
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
      ...base,
      exercise: smithCalfRaise,
      gym: gymB,
      fallbacks: [...fallbacks, gymSpecific],
    });
    expect(result).toMatchObject({ status: "fallback", exercise: { id: "side-plank" } });
  });

  it("honours a preferred machine at this gym over the alphabetical first match", () => {
    const auto = resolveExerciseAtGym({ ...base, exercise: pecDeckFly, gym: gymA });
    expect(auto).toMatchObject({ status: "direct", equipmentInstance: { id: "a-pec-deck-2" } });
    const preferred = resolveExerciseAtGym({
      ...base,
      exercise: pecDeckFly,
      gym: gymA,
      preferredEquipmentInstanceId: "a-pec-deck-1",
    });
    expect(preferred).toMatchObject({
      status: "direct",
      equipmentInstance: { id: "a-pec-deck-1" },
    });
  });

  it("uses a user's machine-level option before type matching", () => {
    const userOption = {
      exerciseId: "pec-deck-fly",
      equipmentTypeId: null,
      equipmentInstanceId: "a-pec-deck-1",
      preferenceRank: 0,
    };
    const result = resolveExerciseAtGym({
      ...base,
      exercise: pecDeckFly,
      gym: gymA,
      options: [...options, userOption],
    });
    expect(result).toMatchObject({ status: "direct", equipmentInstance: { id: "a-pec-deck-1" } });
  });

  it("treats free weights as available at any real gym but not outdoors", () => {
    expect(
      resolveExerciseAtGym({ ...base, exercise: barbellBench, gym: gymC, fallbacks: [] }),
    ).toEqual({
      status: "direct",
      exercise: barbellBench,
      equipmentInstance: null,
    });
    expect(
      resolveExerciseAtGym({ ...base, exercise: barbellBench, gym: outdoor, fallbacks: [] }).status,
    ).toBe("unavailable");
  });

  it("reports unknown, listing the machines that would help, when a gym's inventory is silent", () => {
    const result = resolveExerciseAtGym({ ...base, exercise: smithCalfRaise, gym: gymC });
    expect(result.status).toBe("unknown");
    if (result.status === "unknown") {
      expect(result.missingEquipmentTypeIds).toEqual([
        "smith_machine",
        "leg_press_45",
        "leg_press_horizontal",
      ]);
    }
  });

  it("turns unknown into unavailable once every option is marked absent", () => {
    const partly = resolveExerciseAtGym({
      ...base,
      exercise: smithCalfRaise,
      gym: gymC,
      absentEquipmentTypeIds: new Set(["smith_machine"]),
    });
    expect(partly).toMatchObject({
      status: "unknown",
      missingEquipmentTypeIds: ["leg_press_45", "leg_press_horizontal"],
    });
    const fully = resolveExerciseAtGym({
      ...base,
      exercise: smithCalfRaise,
      gym: gymC,
      absentEquipmentTypeIds: new Set(["smith_machine", "leg_press_45", "leg_press_horizontal"]),
    });
    expect(fully.status).toBe("unavailable");
  });

  it("never reports unknown for virtual locations", () => {
    expect(resolveExerciseAtGym({ ...base, exercise: smithCalfRaise, gym: outdoor }).status).toBe(
      "unavailable",
    );
    expect(
      resolveExerciseAtGym({ ...base, exercise: sidePlank, gym: outdoor, fallbacks: [] }).status,
    ).toBe("direct");
  });
});
