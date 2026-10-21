import { describe, expect, it } from "vitest";

import { bodyWeightLogSchema } from "./body-weight";

const TODAY = "2026-10-20";

function parse(fields: Record<string, string>) {
  return bodyWeightLogSchema(TODAY).safeParse({
    measuredOn: TODAY,
    unit: "kg",
    bodyWeight: "74.5",
    ...fields,
  });
}

/** The message the form would show against one field, or undefined when that field is happy. */
function errorFor(result: ReturnType<typeof parse>, field: string): string | undefined {
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path[0] === field)?.message;
}

describe("a body weight reading", () => {
  it("is the day and the weight in kilograms, whatever unit it was typed in", () => {
    expect(parse({}).data).toEqual({ measuredOn: TODAY, weightKg: 74.5 });
    expect(parse({ unit: "lb", bodyWeight: "164.2" }).data).toEqual({
      measuredOn: TODAY,
      weightKg: 74.48,
    });
    expect(parse({ bodyWeight: "82,25" }).data?.weightKg).toBe(82.25);
  });

  it("is for today or an earlier day, never a later one", () => {
    expect(parse({ measuredOn: "2026-10-17" }).success).toBe(true);
    expect(errorFor(parse({ measuredOn: "2026-10-21" }), "measuredOn")).toBe(
      "Enter today or an earlier date.",
    );
    expect(errorFor(parse({ measuredOn: "" }), "measuredOn")).toBe("Enter a date.");
    expect(errorFor(parse({ measuredOn: "2026-02-30" }), "measuredOn")).toBe(
      "That is not a real date.",
    );
  });

  it("asks for a plausible weight, said in the unit it was typed in", () => {
    expect(errorFor(parse({ bodyWeight: "" }), "bodyWeight")).toBe("Enter your body weight.");
    expect(errorFor(parse({ bodyWeight: "heavy" }), "bodyWeight")).toBe("Enter a number.");
    expect(errorFor(parse({ bodyWeight: "0" }), "bodyWeight")).toBe(
      "Enter a body weight between 20 and 500 kg.",
    );
    // The bounds are checked in kilograms, so 900 lb (408 kg) is a real weight, and 1200 is not.
    expect(parse({ unit: "lb", bodyWeight: "900" }).success).toBe(true);
    expect(errorFor(parse({ unit: "lb", bodyWeight: "1200" }), "bodyWeight")).toBe(
      "Enter a body weight between 44.1 and 1102.3 lb.",
    );
  });

  it("reads a form that does not say its unit in kilograms", () => {
    expect(parse({ unit: "stack_index" }).data?.weightKg).toBe(74.5);
  });
});
