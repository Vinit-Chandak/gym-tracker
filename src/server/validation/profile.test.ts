import { describe, expect, it } from "vitest";

import { profileInputSchema } from "./profile";

const metric = {
  displayName: "Sam",
  timeZone: "Europe/Lisbon",
  preferredUnit: "kg",
  bodyWeight: "74.5",
  heightCm: "178",
  heightFeet: "",
  heightInches: "",
  dateOfBirth: "1994-03-21",
  sex: "female",
  trainingGoal: "build_muscle",
};

const imperial = {
  ...metric,
  preferredUnit: "lb",
  bodyWeight: "164.2",
  heightCm: "",
  heightFeet: "5",
  heightInches: "10",
};

function parse(overrides: Record<string, string> = {}) {
  return profileInputSchema.safeParse({ ...metric, ...overrides });
}

/** The message the form would show against one field, or undefined when that field is happy. */
function errorFor(result: ReturnType<typeof parse>, field: string): string | undefined {
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path[0] === field)?.message;
}

describe("profile input", () => {
  it("accepts a filled-in metric profile", () => {
    const result = parse();
    expect(result.success && result.data).toEqual({
      displayName: "Sam",
      timeZone: "Europe/Lisbon",
      preferredUnit: "kg",
      bodyWeightKg: 74.5,
      heightCm: 178,
      dateOfBirth: "1994-03-21",
      sex: "female",
      trainingGoal: "build_muscle",
    });
  });

  it("stores pounds and feet as kilograms and centimetres", () => {
    const result = profileInputSchema.safeParse(imperial);
    expect(result.success && result.data.bodyWeightKg).toBe(74.48);
    // 5′ 10″ is 70 inches.
    expect(result.success && result.data.heightCm).toBe(177.8);
    // The unit itself is still saved: it is how everything is read back.
    expect(result.success && result.data.preferredUnit).toBe("lb");
  });

  it("reads height in feet alone, with the inches left blank", () => {
    const result = profileInputSchema.safeParse({ ...imperial, heightInches: "" });
    expect(result.success && result.data.heightCm).toBe(152.4);
  });

  it("ignores the fields belonging to the other unit", () => {
    // A form that has been switched between units can submit both; the chosen one wins.
    const result = parse({ heightFeet: "3", heightInches: "1" });
    expect(result.success && result.data.heightCm).toBe(178);
  });

  it("accepts a comma as the decimal separator", () => {
    const result = parse({ bodyWeight: "82,25" });
    expect(result.success && result.data.bodyWeightKg).toBe(82.25);
  });

  it("requires a name, a weight, a height, a birth date and a goal", () => {
    expect(errorFor(parse({ displayName: "   " }), "displayName")).toBeDefined();
    expect(errorFor(parse({ bodyWeight: "" }), "bodyWeight")).toBeDefined();
    expect(errorFor(parse({ heightCm: "" }), "heightCm")).toBeDefined();
    expect(errorFor(parse({ dateOfBirth: "" }), "dateOfBirth")).toBeDefined();
    expect(errorFor(parse({ trainingGoal: "" }), "trainingGoal")).toBeDefined();
  });

  it("reports a missing imperial height against the feet field", () => {
    const result = profileInputSchema.safeParse({
      ...imperial,
      heightFeet: "",
      heightInches: "",
    });
    expect(errorFor(result, "heightFeet")).toBeDefined();
  });

  it("treats a blank sex as prefer-not-to-say rather than an error", () => {
    const result = parse({ sex: "" });
    expect(result.success && result.data.sex).toBeNull();
  });

  it("rejects a time zone the platform does not know", () => {
    expect(parse({ timeZone: "Mars/Olympus" }).success).toBe(false);
    expect(parse({ timeZone: "" }).success).toBe(false);
  });

  it("only takes the units a person weighs a barbell in", () => {
    expect(profileInputSchema.safeParse(imperial).success).toBe(true);
    // A machine may count plates or stack steps; a person does not.
    expect(parse({ preferredUnit: "stack_index" }).success).toBe(false);
  });

  it("rejects a body weight that is not a plausible number", () => {
    for (const value of ["0", "-5", "900", "heavy"]) {
      expect(parse({ bodyWeight: value }).success, value).toBe(false);
    }
  });

  it("states the weight range in the unit it was typed in", () => {
    // The bounds are checked in kilograms, so 900 lb — 408 kg — is a real weight.
    expect(profileInputSchema.safeParse({ ...imperial, bodyWeight: "900" }).success).toBe(true);
    // 1200 lb is not, and saying so in kilograms would be no help at all.
    const result = profileInputSchema.safeParse({ ...imperial, bodyWeight: "1200" });
    expect(errorFor(result, "bodyWeight")).toMatchInlineSnapshot(
      `"Enter a body weight between 44.1 and 1102.3 lb."`,
    );
  });

  it("rejects a height that is not a plausible number", () => {
    for (const value of ["30", "300", "tall"]) {
      expect(parse({ heightCm: value }).success, value).toBe(false);
    }
  });

  it("rejects a birth date that is not real, or not in the past", () => {
    for (const value of ["1994-02-30", "not-a-date", "3000-01-01", "1700-01-01"]) {
      expect(parse({ dateOfBirth: value }).success, value).toBe(false);
    }
  });
});
