import { describe, expect, it } from "vitest";

import { ownEntry, pairBySlot, plannedWorkingSets } from "./session-print";

const row = (slotId: string | null, exerciseId: string) => ({ slotId, exerciseId });

describe("pairing a plan's rows with a session's", () => {
  it("pairs a slot's row with its slot, and an added one with the next of its exercise", () => {
    const rows = [row("s1", "squat"), row(null, "curl"), row("s2", "bench"), row(null, "curl")];
    const items = [
      { ...row(null, "curl"), n: 1 },
      { ...row("s1", "front-squat"), n: 2 },
      { ...row(null, "curl"), n: 3 },
    ];
    expect(pairBySlot(rows, items).map((item) => item?.n ?? null)).toEqual([2, 1, null, 3]);
  });
});

describe("the sets an exercise's plan asks for", () => {
  const sets = (...types: string[]) => types.map((setType) => ({ setType }));

  it("counts the coach's working sets, else the programme's", () => {
    const coach = { action: "keep" as const, sets: sets("warmup", "working", "working") };
    expect(plannedWorkingSets(coach, 4)).toBe(2);
    expect(plannedWorkingSets(null, 4)).toBe(4);
    // A dropped exercise, or a coach's entry of warm-ups alone, keeps the programme's count.
    expect(plannedWorkingSets({ ...coach, action: "drop" }, 4)).toBe(4);
    expect(plannedWorkingSets({ action: "keep", sets: sets("warmup") }, 3)).toBe(3);
    expect(plannedWorkingSets(null, null)).toBeNull();
  });

  it("follows the coach only while the exercise is the one it wrote for", () => {
    const entry = { exerciseId: "squat" };
    expect(ownEntry(entry, "squat")).toBe(entry);
    expect(ownEntry(entry, "front-squat")).toBeNull();
    expect(ownEntry(null, "squat")).toBeNull();
  });
});
