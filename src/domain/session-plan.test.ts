import { describe, expect, it } from "vitest";

import { coachPlanSchema, planLine, planTargets } from "./session-plan";

const base = {
  summary: "Squat day.",
  exercises: [{ exerciseSlug: "high-bar-squat", sets: [{ weight: 60, reps: 5, rir: 2 }] }],
};

describe("coach plan contract", () => {
  it("fills the defaults a coach may leave out", () => {
    const plan = coachPlanSchema.parse(base);
    expect(plan.warmup).toEqual([]);
    expect(plan.exercises[0]).toMatchObject({
      slotId: null,
      action: "keep",
      equipmentInstanceId: null,
      note: "",
      restSeconds: null,
    });
    expect(plan.exercises[0]?.sets[0]).toEqual({
      setType: "working",
      weight: 60,
      reps: 5,
      durationSeconds: null,
      rir: 2,
    });
  });

  it("rejects shapes the app could not store", () => {
    expect(coachPlanSchema.safeParse({ ...base, summary: "" }).success).toBe(false);
    expect(coachPlanSchema.safeParse({ ...base, exercises: [] }).success).toBe(false);
    expect(
      coachPlanSchema.safeParse({
        ...base,
        exercises: [{ exerciseSlug: "Bad Slug", sets: [] }],
      }).success,
    ).toBe(false);
    expect(
      coachPlanSchema.safeParse({
        ...base,
        exercises: [{ exerciseSlug: "x", action: "invent", sets: [] }],
      }).success,
    ).toBe(false);
    expect(
      coachPlanSchema.safeParse({
        ...base,
        exercises: [{ exerciseSlug: "x", sets: Array.from({ length: 13 }, () => ({ reps: 5 })) }],
      }).success,
    ).toBe(false);
  });

  it("turns the sets into targets the session prefills from", () => {
    const plan = coachPlanSchema.parse({
      ...base,
      exercises: [
        {
          exerciseSlug: "x",
          sets: [
            { setType: "warmup", weight: 40, reps: 8, rir: 5 },
            { weight: 60, reps: 5, rir: 2 },
          ],
        },
      ],
    });
    expect(planTargets(plan.exercises[0]!)).toEqual([
      { setIndex: 1, setType: "warmup", weight: 40, reps: 8, rir: 5, durationSeconds: null },
      { setIndex: 2, setType: "working", weight: 60, reps: 5, rir: 2, durationSeconds: null },
    ]);
  });

  it("describes the working sets in one line", () => {
    const sets = (
      ...rows: {
        weight?: number | null;
        reps?: number | null;
        rir?: number | null;
        durationSeconds?: number | null;
        setType?: "warmup" | "working";
      }[]
    ) =>
      coachPlanSchema.parse({ ...base, exercises: [{ exerciseSlug: "x", sets: rows }] })
        .exercises[0]!;
    expect(
      planLine(
        sets(
          { weight: 60, reps: 5, rir: 2 },
          { weight: 60, reps: 5, rir: 2 },
          { weight: 60, reps: 5, rir: 2 },
        ),
        "kg",
      ),
    ).toBe("3 × 5 @ 60 kg · RIR 2");
    expect(
      planLine(sets({ weight: 60, reps: 5, rir: 2 }, { weight: 60, reps: 4, rir: 1 }), "kg"),
    ).toBe("2 × 5/4 @ 60 kg · RIR 2/1");
    expect(
      planLine(sets({ durationSeconds: 30, rir: 2 }, { durationSeconds: 30, rir: 2 }), "kg"),
    ).toBe("2 × 30 s · RIR 2");
    expect(planLine(sets({ reps: 10 }), "kg")).toBe("1 × 10");
    expect(
      planLine(sets({ setType: "warmup", weight: 40, reps: 8 }, { weight: 60, reps: 5 }), "kg"),
    ).toBe("1 × 5 @ 60 kg");
    expect(planLine(sets(), "kg")).toBeNull();
  });
});
