import { describe, expect, it } from "vitest";

import { parseForm } from "./form";
import { equipmentInputSchema, gymInputSchema } from "./gyms";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe("gym form validation", () => {
  it("accepts a minimal gym and turns blanks into nulls", () => {
    const parsed = parseForm(
      gymInputSchema,
      form({ name: "  Samsung Gym ", kind: "gym", address: "", notes: " " }),
    );
    expect(parsed).toEqual({
      success: true,
      data: { name: "Samsung Gym", kind: "gym", address: null, notes: null },
    });
  });

  it("reports missing name and bad kind per field, echoing the values", () => {
    const parsed = parseForm(gymInputSchema, form({ name: "", kind: "spaceship" }));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.state.fieldErrors).toEqual({
        name: "Give the gym a name.",
        kind: "Choose a location type.",
      });
      expect(parsed.state.values).toEqual({ name: "", kind: "spaceship" });
    }
  });
});

describe("equipment form validation", () => {
  const base = {
    name: "Precor lat pulldown",
    equipmentTypeId: "6f1f9c2e-6c2a-4a2b-9f0e-0a1b2c3d4e5f",
    resistanceMode: "selectorized",
    unit: "kg",
  };

  it("parses numbers, accepting a comma decimal separator", () => {
    const parsed = parseForm(
      equipmentInputSchema,
      form({ ...base, loadIncrement: "2,5", angleDegrees: "45", manufacturer: "", notes: "" }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.loadIncrement).toBe(2.5);
      expect(parsed.data.angleDegrees).toBe(45);
      expect(parsed.data.manufacturer).toBeNull();
      expect(parsed.data.pulleyRatio).toBeNull();
    }
  });

  it("rejects out-of-range numbers and unknown enum values", () => {
    const parsed = parseForm(
      equipmentInputSchema,
      form({ ...base, unit: "stones", loadIncrement: "abc", angleDegrees: "120" }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(Object.keys(parsed.state.fieldErrors ?? {}).sort()).toEqual([
        "angleDegrees",
        "loadIncrement",
        "unit",
      ]);
    }
  });

  it("requires a real equipment type id", () => {
    const parsed = parseForm(equipmentInputSchema, form({ ...base, equipmentTypeId: "" }));
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(parsed.state.fieldErrors?.equipmentTypeId).toBe("Choose an equipment type.");
  });
});
