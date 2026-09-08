import { describe, expect, it } from "vitest";

import { formatSets, sanitizeNumberEntry, stepValue, weightStepFor, workingVolume } from "./sets";

describe("set helpers", () => {
  it("picks the load step from the machine, then the exercise, then 2.5", () => {
    expect(weightStepFor({ equipmentLoadIncrement: 5, exerciseDefaultIncrement: 2.5 })).toBe(5);
    expect(weightStepFor({ equipmentLoadIncrement: null, exerciseDefaultIncrement: 1 })).toBe(1);
    expect(weightStepFor({ equipmentLoadIncrement: null, exerciseDefaultIncrement: null })).toBe(
      2.5,
    );
  });

  it("steps values from the current entry or from the faint prefill", () => {
    expect(stepValue("", 2.5, 60)).toBe("62.5");
    expect(stepValue("", 2.5, null)).toBe("2.5");
    expect(stepValue("62.5", -2.5, 60)).toBe("60");
    expect(stepValue("1", -1, null)).toBe("0");
    expect(stepValue("0.1", 0.2, null)).toBe("0.3");
  });

  it("formats and totals working sets", () => {
    const sets = [
      {
        setIndex: 1,
        setType: "warmup",
        weight: 40,
        unit: "kg",
        reps: 8,
        rir: null,
        durationSeconds: null,
      },
      {
        setIndex: 2,
        setType: "working",
        weight: 80,
        unit: "kg",
        reps: 10,
        rir: 2,
        durationSeconds: null,
      },
      {
        setIndex: 3,
        setType: "working",
        weight: 80,
        unit: "kg",
        reps: 9,
        rir: 1,
        durationSeconds: null,
      },
    ] as const;
    expect(formatSets(sets)).toBe("80×10, 80×9");
    expect(workingVolume(sets)).toBe(1520);
    expect(
      formatSets([
        {
          setIndex: 1,
          setType: "working",
          weight: null,
          unit: "kg",
          reps: null,
          rir: null,
          durationSeconds: 40,
        },
      ]),
    ).toBe("40 s");
  });

  it("keeps typed entry to something the log-set action accepts", () => {
    // Letters and signs never reach the server as a failed save.
    expect(sanitizeNumberEntry("abc")).toBe("");
    expect(sanitizeNumberEntry("6a0")).toBe("60");
    expect(sanitizeNumberEntry("-20")).toBe("20");
    // Decimals are typeable one key at a time, and only one point survives.
    expect(sanitizeNumberEntry("60.")).toBe("60.");
    expect(sanitizeNumberEntry("60.5")).toBe("60.5");
    expect(sanitizeNumberEntry("1.2.3")).toBe("1.23");
    expect(sanitizeNumberEntry("60,5")).toBe("60.5");
    // Whole-number fields take no decimal point at all.
    expect(sanitizeNumberEntry("8.5", "numeric")).toBe("85");
    // Nothing above the schema's ceiling.
    expect(sanitizeNumberEntry("99999", "decimal", 2000)).toBe("2000");
    expect(sanitizeNumberEntry("50", "decimal", 10)).toBe("10");
    expect(sanitizeNumberEntry("", "decimal", 10)).toBe("");
  });
});
