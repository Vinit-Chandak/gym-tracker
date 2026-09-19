import { describe, expect, it } from "vitest";

import { parseProgramBlueprint, type ProgramBlueprint } from "./program-blueprint";
import { blueprintV1ToV2, programBlueprintV2Schema } from "./program-blueprint-v2";

const v1 = (overrides: Partial<ProgramBlueprint> = {}): ProgramBlueprint =>
  parseProgramBlueprint({
    blueprintVersion: 1,
    slug: "mixed-block",
    name: "Mixed block",
    weeks: 4,
    days: [
      {
        dayIndex: 1,
        dayOfWeek: 1,
        name: "Lower A",
        includesLifting: true,
        includesRun: false,
        exercises: [],
      },
      {
        dayIndex: 2,
        dayOfWeek: 3,
        name: "Run day",
        includesLifting: false,
        includesRun: true,
        exercises: [],
      },
      {
        dayIndex: 3,
        dayOfWeek: 5,
        name: "Upper A",
        includesLifting: true,
        includesRun: false,
        exercises: [],
      },
    ],
    runs: [
      {
        weekIndex: 1,
        dayOfWeek: 3,
        duration: [25, 35],
        distanceKm: [4, 5],
        rpe: [3, 5],
        paceNote: "Conversational.",
        progressionNote: "Add five minutes next week.",
        stopRule: "Stop if the shin complains.",
        comment: "Easy week.",
      },
      { weekIndex: 2, dayOfWeek: 3, duration: [30, 40], rpe: [3, 5] },
      { weekIndex: 2, dayOfWeek: 6, duration: [40, 50], rpe: [4, 6] },
    ],
    ...overrides,
  });

const context = { startDate: "2026-09-07", schedulingTimeZone: "Asia/Kolkata" };

describe("reading a v1 programme as v2", () => {
  it("keeps the strength cycle and its rest positions untouched", () => {
    const { blueprint } = blueprintV1ToV2(v1(), context);
    expect(blueprint.strengthCycle?.slots.map((slot) => slot.name)).toEqual([
      "Lower A",
      "Run day",
      "Upper A",
    ]);
    // §7: a day with no lifting stays a position in the cycle rather than compressing it.
    expect(blueprint.strengthCycle?.slots[1]?.includesLifting).toBe(false);
    expect(blueprint.strengthCycle?.startDayIndex).toBe(1);
  });

  it("gives each planned weekday one slot lineage and each week its own occurrence", () => {
    const { blueprint, lineageByWeekday } = blueprintV1ToV2(v1(), context);
    expect(lineageByWeekday.size).toBe(2);
    expect(blueprint.enduranceSlots).toHaveLength(2);
    expect(blueprint.occurrences).toHaveLength(3);
    const wednesdays = blueprint.occurrences.filter(
      (occurrence) => occurrence.slotLineageId === lineageByWeekday.get(3),
    );
    expect(wednesdays.map((occurrence) => occurrence.scheduledOn)).toEqual([
      "2026-09-09",
      "2026-09-16",
    ]);
  });

  it("carries each week's own targets and prose into its occurrence", () => {
    const { blueprint } = blueprintV1ToV2(v1(), context);
    const first = blueprint.occurrences[0]!;
    expect(first.prescription?.sessionTargets).toEqual({
      durationMs: [1_500_000, 2_100_000],
      distanceMetres: [4000, 5000],
      effort: [3, 5],
    });
    expect(first.prescription?.running?.symptomStopRule).toBe("Stop if the shin complains.");
    const second = blueprint.occurrences[1]!;
    expect(second.prescription?.sessionTargets.distanceMetres).toBeNull();
  });

  it("keeps the original v1 payload with the conversion", () => {
    const { blueprint } = blueprintV1ToV2(v1(), context);
    expect(blueprint.legacy?.sourceVersion).toBe("blueprint:v1");
    expect(blueprint.legacy?.payload).toEqual(v1());
  });

  it("produces an endurance-only programme with no strength cycle at all", () => {
    const runOnly = v1({
      days: [
        {
          dayIndex: 1,
          dayOfWeek: 3,
          name: "Run day",
          focus: "",
          timeNote: "",
          effortNote: "",
          notes: "",
          includesLifting: false,
          includesRun: true,
          warmupSlug: "",
          exercises: [],
        },
      ],
    });
    const { blueprint } = blueprintV1ToV2(runOnly, context);
    expect(blueprint.strengthCycle).toBeNull();
    expect(blueprint.enduranceSlots).toHaveLength(2);
  });
});

/** AT-STRUCT-10: identity, not sport and weekday, is what has to be unique. */
describe("what v2 accepts", () => {
  const base = () => {
    const { blueprint } = blueprintV1ToV2(v1(), context);
    return blueprint;
  };

  it("accepts two occurrences of one sport on one day", () => {
    const plan = base();
    const first = plan.occurrences[0]!;
    const result = programBlueprintV2Schema.safeParse({
      ...plan,
      occurrences: [first, { ...first, localId: "second-run", orderIndex: 1 }],
    });
    expect(result.success).toBe(true);
  });

  it("refuses two occurrences with one identity", () => {
    const plan = base();
    const first = plan.occurrences[0]!;
    const result = programBlueprintV2Schema.safeParse({
      ...plan,
      occurrences: [first, { ...first, orderIndex: 1 }],
    });
    expect(result.success).toBe(false);
  });

  it("refuses a date that disagrees with its programme week", () => {
    const plan = base();
    const first = plan.occurrences[0]!;
    const result = programBlueprintV2Schema.safeParse({
      ...plan,
      occurrences: [{ ...first, weekIndex: 3 }],
    });
    expect(result.success).toBe(false);
  });

  it("refuses an occurrence belonging to no slot, and weeks beyond the programme", () => {
    const plan = base();
    const first = plan.occurrences[0]!;
    expect(
      programBlueprintV2Schema.safeParse({
        ...plan,
        occurrences: [{ ...first, slotLineageId: crypto.randomUUID() }],
      }).success,
    ).toBe(false);
    expect(
      programBlueprintV2Schema.safeParse({
        ...plan,
        weeks: 1,
        occurrences: [{ ...first, weekIndex: 2, scheduledOn: "2026-09-16" }],
      }).success,
    ).toBe(false);
  });

  it("holds the documented payload bounds", () => {
    const plan = base();
    expect(programBlueprintV2Schema.safeParse({ ...plan, weeks: 53 }).success).toBe(false);
    expect(programBlueprintV2Schema.safeParse({ ...plan, weeks: 52 }).success).toBe(true);
    expect(
      programBlueprintV2Schema.safeParse({
        ...plan,
        strengthCycle: null,
        enduranceSlots: [],
        occurrences: [],
      }).success,
    ).toBe(false);
  });
});
