import { describe, expect, it } from "vitest";

import { coachPlanSchema, planLine, planTargets, runPlanLine } from "./session-plan";

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
      distanceMeters: null,
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

  it("takes a run, and a day that only runs", () => {
    const planned = coachPlanSchema.parse({
      ...base,
      run: { durationMinutes: 25, rpe: 3, paceNote: "Conversational." },
    });
    expect(planned.run).toEqual({
      mode: "outdoor",
      durationMinutes: 25,
      distanceKm: null,
      rpe: 3,
      paceNote: "Conversational.",
      stopRule: "",
      note: "",
      programRunId: null,
    });
    expect(coachPlanSchema.parse(base).run).toBeNull();
    // A run is a session in its own right, so it stands without exercises.
    expect(
      coachPlanSchema.safeParse({
        summary: "Easy 25.",
        exercises: [],
        run: { durationMinutes: 25 },
      }).success,
    ).toBe(true);
    // But a plan with neither is nothing at all.
    expect(coachPlanSchema.safeParse({ summary: "Nothing.", exercises: [] }).success).toBe(false);
  });

  it("carries a superset label and per-side work through", () => {
    const plan = coachPlanSchema.parse({
      ...base,
      exercises: [
        { exerciseSlug: "lateral-raise", supersetGroup: "A", perSide: true, sets: [] },
        { exerciseSlug: "face-pull", supersetGroup: "A", sets: [] },
      ],
    });
    expect(plan.exercises.map((e) => [e.supersetGroup, e.perSide])).toEqual([
      ["A", true],
      ["A", null],
    ]);
  });

  it("describes a run in one line", () => {
    const run = (input: Record<string, unknown>) =>
      runPlanLine(coachPlanSchema.parse({ ...base, run: input }).run!);
    expect(run({ durationMinutes: 25, distanceKm: 4, rpe: 3 })).toBe("25 min · 4 km · RPE 3");
    expect(run({ durationMinutes: 30 })).toBe("30 min");
    expect(run({})).toBe("Easy run");
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
      {
        setIndex: 1,
        setType: "warmup",
        weight: 40,
        reps: 8,
        rir: 5,
        durationSeconds: null,
        distanceMeters: null,
      },
      {
        setIndex: 2,
        setType: "working",
        weight: 60,
        reps: 5,
        rir: 2,
        durationSeconds: null,
        distanceMeters: null,
      },
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
