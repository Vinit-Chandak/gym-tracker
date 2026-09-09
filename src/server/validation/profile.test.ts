import { describe, expect, it } from "vitest";

import { profileInputSchema } from "./profile";

const base = {
  displayName: "Sam",
  timeZone: "Europe/Lisbon",
  preferredUnit: "kg",
  bodyWeightKg: "",
};

function parse(overrides: Record<string, string> = {}) {
  return profileInputSchema.safeParse({ ...base, ...overrides });
}

describe("profile input", () => {
  it("accepts a filled-in profile", () => {
    const result = parse({ bodyWeightKg: "74.5" });
    expect(result.success && result.data).toEqual({
      displayName: "Sam",
      timeZone: "Europe/Lisbon",
      preferredUnit: "kg",
      bodyWeightKg: 74.5,
    });
  });

  it("treats an empty name and an empty body weight as not set", () => {
    const result = parse({ displayName: "   " });
    expect(result.success && result.data.displayName).toBeNull();
    expect(result.success && result.data.bodyWeightKg).toBeNull();
  });

  it("accepts a comma as the decimal separator", () => {
    const result = parse({ bodyWeightKg: "82,25" });
    expect(result.success && result.data.bodyWeightKg).toBe(82.25);
  });

  it("rejects a time zone the platform does not know", () => {
    expect(parse({ timeZone: "Mars/Olympus" }).success).toBe(false);
    expect(parse({ timeZone: "" }).success).toBe(false);
  });

  it("only takes the units a person weighs a barbell in", () => {
    expect(parse({ preferredUnit: "lb" }).success).toBe(true);
    // A machine may count plates or stack steps; a person does not.
    expect(parse({ preferredUnit: "stack_index" }).success).toBe(false);
  });

  it("rejects a body weight that is not a plausible number", () => {
    for (const value of ["0", "-5", "900", "heavy"]) {
      expect(parse({ bodyWeightKg: value }).success, value).toBe(false);
    }
  });
});
