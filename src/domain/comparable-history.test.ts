import { describe, expect, it } from "vitest";

import {
  comparisonScope,
  isComparable,
  previousComparable,
  selectComparableHistory,
} from "./comparable-history";

const latPulldownOnMachineA = {
  exerciseId: "lat-pulldown",
  equipmentInstanceId: "precor-lat-pulldown-gym-a",
  gymId: "gym-a",
  performedAt: "2026-09-01T10:00:00Z",
  topSetKg: 80,
};

const latPulldownOnMachineB = {
  exerciseId: "lat-pulldown",
  equipmentInstanceId: "matrix-lat-pulldown-gym-b",
  gymId: "gym-b",
  performedAt: "2026-09-03T10:00:00Z",
  topSetKg: 65,
};

describe("comparable history", () => {
  it("scopes machines to the equipment instance and free weights to the exercise", () => {
    expect(comparisonScope("equipment_specific")).toBe("equipment_instance");
    expect(comparisonScope("context_dependent")).toBe("equipment_instance");
    expect(comparisonScope("global")).toBe("exercise");
  });

  it("does not use 80 kg on lat pulldown Machine A as prior load for Machine B", () => {
    const target = {
      exerciseId: "lat-pulldown",
      loadPortability: "equipment_specific" as const,
      equipmentInstanceId: "matrix-lat-pulldown-gym-b",
    };
    expect(isComparable(latPulldownOnMachineA, target)).toBe(false);
    expect(previousComparable([latPulldownOnMachineA], target)).toBeUndefined();
    expect(previousComparable([latPulldownOnMachineA, latPulldownOnMachineB], target)).toBe(
      latPulldownOnMachineB,
    );
  });

  it("keeps barbell bench press comparable across Gym A and Gym B", () => {
    const benchAtGymA = {
      exerciseId: "barbell-bench-press",
      equipmentInstanceId: null,
      gymId: "gym-a",
      performedAt: "2026-09-01T10:00:00Z",
    };
    const benchAtGymB = {
      exerciseId: "barbell-bench-press",
      equipmentInstanceId: null,
      gymId: "gym-b",
      performedAt: "2026-09-05T10:00:00Z",
    };
    const target = {
      exerciseId: "barbell-bench-press",
      loadPortability: "global" as const,
      equipmentInstanceId: null,
    };
    const history = selectComparableHistory([benchAtGymA, benchAtGymB], target);
    expect(history).toEqual([benchAtGymB, benchAtGymA]);
    expect(previousComparable([benchAtGymA, benchAtGymB], target)?.gymId).toBe("gym-b");
  });

  it("never matches a machine exercise when the current machine is unknown", () => {
    const target = {
      exerciseId: "lat-pulldown",
      loadPortability: "equipment_specific" as const,
      equipmentInstanceId: null,
    };
    expect(selectComparableHistory([latPulldownOnMachineA, latPulldownOnMachineB], target)).toEqual(
      [],
    );
  });

  it("ignores other exercises even on the same machine", () => {
    const rowOnSameStack = { ...latPulldownOnMachineA, exerciseId: "seated-cable-row" };
    const target = {
      exerciseId: "lat-pulldown",
      loadPortability: "equipment_specific" as const,
      equipmentInstanceId: "precor-lat-pulldown-gym-a",
    };
    expect(isComparable(rowOnSameStack, target)).toBe(false);
  });
});
