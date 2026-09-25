import { describe, expect, it } from "vitest";

import type { BlueprintDay, BlueprintRun, ProgramBlueprint } from "./program-blueprint";
import { diffPrograms } from "./program-diff";
import { changeSummaryLine, summariseProgramDiff, weeksLabel } from "./program-change-summary";

const LEG_PRESS = "55555555-5555-4555-8555-555555555555";

function day(input: Partial<BlueprintDay> & { dayIndex: number }): BlueprintDay {
  return {
    dayOfWeek: input.dayIndex,
    name: `Day ${input.dayIndex}`,
    focus: "",
    timeNote: "",
    effortNote: "",
    notes: "",
    includesLifting: true,
    includesRun: false,
    warmupSlug: "",
    exercises: [],
    ...input,
  };
}

function run(weekIndex: number, input: Partial<BlueprintRun> = {}): BlueprintRun {
  return {
    weekIndex,
    dayOfWeek: 4,
    duration: [20 + weekIndex * 5, 25 + weekIndex * 5],
    rpe: [1, 2],
    paceNote: "Conversational",
    progressionNote: "Small time increase",
    stopRule: "Pain rising each km → stop",
    ...input,
  };
}

/** Two easy runs a week for eight weeks, and a leg day, like the programme in the screenshots. */
const base: ProgramBlueprint = {
  blueprintVersion: 1,
  slug: "hybrid",
  name: "8-Week Strength + Aesthetics Hybrid",
  weeks: 8,
  notes: "Priorities: strength, then muscle.",
  days: [
    day({
      dayIndex: 1,
      dayOfWeek: 4,
      name: "Easy Run + Arms",
      includesLifting: false,
      includesRun: true,
    }),
    day({
      dayIndex: 2,
      dayOfWeek: 5,
      name: "Lower B",
      exercises: [
        {
          exerciseSlug: "leg-press-horizontal",
          lineageId: LEG_PRESS,
          sets: 3,
          reps: [10, 12],
          rir: [1, 2],
          rest: [90, 120],
          perSide: false,
        },
      ],
    }),
  ],
  runs: [1, 2, 3, 4, 5, 6, 7, 8].map((week) => run(week)),
};

const copy = (input: ProgramBlueprint): ProgramBlueprint =>
  JSON.parse(JSON.stringify(input)) as ProgramBlueprint;

/** The coach's rewrite: shorter runs from week 3, new instructions, every week restated. */
function shorterRuns(plan: ProgramBlueprint) {
  for (const entry of plan.runs) {
    if (entry.weekIndex < 3) continue;
    entry.duration = [11 + entry.weekIndex, 13 + entry.weekIndex];
    entry.paceNote = "Easy means you can still talk in full sentences.";
    entry.stopRule = "Walk or stop as soon as the shins start to bite.";
    entry.progressionNote = `Week ${entry.weekIndex} note`;
  }
}

describe("weeksLabel", () => {
  it("names one week, a run of weeks, and scattered weeks", () => {
    expect(weeksLabel([3])).toBe("week 3");
    expect(weeksLabel([5, 3, 4])).toBe("weeks 3–5");
    expect(weeksLabel([2, 4, 6])).toBe("weeks 2, 4 and 6");
    expect(weeksLabel([])).toBe("");
  });
});

describe("runs, folded into one entry per run day", () => {
  it("says a progression once, from the first week still to come", () => {
    const next = copy(base);
    shorterRuns(next);
    const summary = summariseProgramDiff(diffPrograms(base, next), { fromWeek: 3 });

    expect(summary.days).toHaveLength(1);
    const runs = summary.days[0]!.runs!;
    expect(runs.weeks).toEqual([3, 8]);
    expect(runs.ids).toHaveLength(6);
    expect(runs.lines).toEqual([
      {
        field: "duration",
        label: "Minutes",
        from: "35–40",
        to: "14–16 in week 3, building to 19–21 by week 8",
      },
    ]);
    // One pace and one stop rule, not six copies of each; the weekly notes are named, not listed.
    expect(runs.notes).toEqual([
      {
        field: "paceNote",
        label: "Pace",
        from: null,
        to: "Easy means you can still talk in full sentences.",
      },
      { field: "progressionNote", label: "Progression", from: null, to: "New note each week" },
      {
        field: "stopRule",
        label: "Stop rule",
        from: null,
        to: "Walk or stop as soon as the shins start to bite.",
      },
    ]);
  });

  it("leaves out the weeks already trained", () => {
    const next = copy(base);
    // A change that only touches finished weeks is no change to anything still ahead.
    next.runs[0]!.rpe = [2, 3];
    next.runs[1]!.rpe = [2, 3];
    const summary = summariseProgramDiff(diffPrograms(base, next), { fromWeek: 3 });
    expect(summary.empty).toBe(true);
    expect(summariseProgramDiff(diffPrograms(base, next)).empty).toBe(false);
  });

  it("says the same change in every week once, with no week list", () => {
    const next = copy(base);
    for (const entry of next.runs) entry.rpe = [2, 2];
    const runs = summariseProgramDiff(diffPrograms(base, next), { fromWeek: 1 }).days[0]!.runs!;
    expect(runs.lines).toEqual([{ field: "rpe", label: "Effort", from: "1–2", to: "2" }]);
  });

  it("names the weeks when only some of them change", () => {
    const next = copy(base);
    next.runs[4]!.distanceKm = [3, 3];
    next.runs[5]!.distanceKm = [3, 3];
    next.runs[6]!.duration = [60, 60];
    const runs = summariseProgramDiff(diffPrograms(base, next), { fromWeek: 1 }).days[0]!.runs!;
    expect(runs.lines).toEqual([
      { field: "duration", label: "Minutes", from: "55–60", to: "60 (week 7)" },
      { field: "distanceKm", label: "Distance", from: "—", to: "3 km (weeks 5–6)" },
    ]);
  });

  it("counts runs by the day they fall on in the list row", () => {
    const next = copy(base);
    shorterRuns(next);
    const summary = summariseProgramDiff(diffPrograms(base, next), { fromWeek: 3 });
    expect(changeSummaryLine(summary)).toBe("Changes runs on 1 day");
  });
});

describe("what the athlete does not need to review", () => {
  it("does not print the coach's programme description, but says it changed", () => {
    const next = copy(base);
    next.notes = "Priorities: strength, then muscle. Weighted hyperextensions are allowed.";
    const summary = summariseProgramDiff(diffPrograms(base, next));
    expect(summary.program).toEqual([]);
    expect(summary.empty).toBe(true);
    expect(summary.descriptionChanged).toBe(true);
    expect(changeSummaryLine(summary)).toBe("Programme description updated");
  });

  it("keeps a change to the programme's length", () => {
    const next = copy(base);
    next.weeks = 10;
    next.runs.push(run(9), run(10));
    const summary = summariseProgramDiff(diffPrograms(base, next), { fromWeek: 3 });
    expect(summary.program.map((field) => field.field)).toEqual(["weeks"]);
    expect(summary.days[0]!.runs!.lines).toEqual([
      {
        field: "added",
        label: "Runs added",
        from: null,
        to: "weeks 9–10 · 65–70 min · effort 1–2",
      },
    ]);
  });

  it("keeps a lifting change as it is: one row for the slot, per cycle", () => {
    const next = copy(base);
    const slot = next.days[1]!.exercises[0]!;
    slot.fallbacks = [{ exerciseSlug: "leg-press-45", rank: 1 }];
    const summary = summariseProgramDiff(diffPrograms(base, next), { fromWeek: 3 });
    expect(summary.days).toHaveLength(1);
    expect(summary.days[0]!.runs).toBeNull();
    expect(summary.days[0]!.operations.map((operation) => operation.kind)).toEqual(["retargeted"]);
    expect(changeSummaryLine(summary)).toBe("Changes 1 exercise");
  });
});
