import { describe, expect, it } from "vitest";

import { bodyLoad, bodyweightShare, STAND_IN_BODY_WEIGHT_KG } from "./body-load";

describe("the body under the load (ADR 0040)", () => {
  const splitSquat = { modality: "bodyweight", movementPattern: "lunge" };

  it("counts the body a bodyweight movement lifts, and every lunge whatever is held", () => {
    expect(bodyweightShare(splitSquat)).toBe(0.85);
    expect(bodyweightShare({ modality: "dumbbell", movementPattern: "lunge" })).toBe(0.85);
    expect(bodyweightShare({ modality: "bodyweight", movementPattern: "vertical_pull" })).toBe(
      0.95,
    );
    expect(bodyweightShare({ modality: "bodyweight", movementPattern: "horizontal_push" })).toBe(
      0.65,
    );
  });

  it("reads a barbell or machine lift, and an unlisted movement, against its logged load", () => {
    expect(bodyweightShare({ modality: "barbell", movementPattern: "squat" })).toBe(0);
    expect(bodyweightShare({ modality: "dumbbell", movementPattern: "hinge" })).toBe(0);
    expect(bodyweightShare({ modality: "cable", movementPattern: "vertical_pull" })).toBe(0);
    expect(bodyweightShare({ modality: "bodyweight", movementPattern: "anti_extension" })).toBe(0);
  });

  it("weighs the share in the load's unit, with a stand-in where no weight is recorded", () => {
    expect(bodyLoad(splitSquat, 80, "kg")).toBe(68);
    expect(bodyLoad(splitSquat, 80, "lb")).toBeCloseTo(149.9, 1);
    expect(STAND_IN_BODY_WEIGHT_KG).toBe(70);
    expect(bodyLoad(splitSquat, null, "kg")).toBe(59.5);
    // A stack's numbers are not a weight the body converts into.
    expect(bodyLoad(splitSquat, 80, "stack_index")).toBe(0);
    expect(bodyLoad({ modality: "barbell", movementPattern: "squat" }, 80, "kg")).toBe(0);
    // An exercise read without its movement is read as it always was.
    expect(bodyLoad({}, 80, "kg")).toBe(0);
  });
});
