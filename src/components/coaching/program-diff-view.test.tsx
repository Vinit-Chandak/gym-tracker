// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { summariseProgramDiff } from "@/domain/program-change-summary";
import { diffPrograms } from "@/domain/program-diff";

import { ProgramDiffView } from "./program-diff-view";

afterEach(cleanup);

const LINEAGE = {
  curl: "22222222-2222-4222-8222-222222222222",
  press: "33333333-3333-4333-8333-333333333333",
};
const NAMES = {
  "barbell-curl": "Barbell curl",
  "cable-curl": "Cable curl",
  "cable-crunch": "Cable crunch",
  "overhead-press": "Overhead press",
};

const base: ProgramBlueprint = {
  blueprintVersion: 1,
  slug: "block",
  name: "Block",
  weeks: 6,
  notes: "",
  runs: [],
  days: [
    {
      dayIndex: 1,
      dayOfWeek: 1,
      name: "Upper",
      focus: "",
      timeNote: "",
      effortNote: "",
      notes: "",
      includesLifting: true,
      includesRun: false,
      warmupSlug: "",
      exercises: [
        {
          exerciseSlug: "barbell-curl",
          lineageId: LINEAGE.curl,
          sets: 2,
          reps: [8, 12],
          rir: [1, 2],
          rest: [90, 90],
        },
        {
          exerciseSlug: "overhead-press",
          lineageId: LINEAGE.press,
          sets: 3,
          reps: [5, 8],
          rir: [1, 2],
          rest: [180, 180],
        },
      ],
    },
    {
      dayIndex: 2,
      dayOfWeek: 4,
      name: "Lower",
      focus: "",
      timeNote: "",
      effortNote: "",
      notes: "",
      includesLifting: true,
      includesRun: false,
      warmupSlug: "",
      exercises: [],
    },
  ],
};

it("shows only the changed day, with a word beside every colour", () => {
  const next = structuredClone(base);
  next.days[0]!.exercises[0]!.exerciseSlug = "cable-curl";
  next.days[0]!.exercises[1]!.sets = 4;
  next.days[0]!.exercises.push({
    exerciseSlug: "cable-crunch",
    sets: 3,
    reps: [10, 15],
    rir: [1, 2],
    rest: [60, 90],
  });
  render(
    <ProgramDiffView summary={summariseProgramDiff(diffPrograms(base, next))} names={NAMES} />,
  );

  // The unchanged day is not printed at all, and neither is a muscle-count line.
  expect(screen.getByText("Upper")).toBeTruthy();
  expect(screen.queryByText("Lower")).toBeNull();
  expect(screen.queryByText(/Biceps \d/)).toBeNull();

  // Each operation names itself. Colour is never the only carrier.
  expect(screen.getByText("Replaced")).toBeTruthy();
  expect(screen.getByText("Added")).toBeTruthy();
  expect(screen.getByText("Changed")).toBeTruthy();
  expect(screen.getByText("Barbell curl")).toBeTruthy();
  expect(screen.getByText("Cable curl")).toBeTruthy();
  expect(screen.getByText("Cable crunch")).toBeTruthy();
  expect(screen.getByText("Sets:")).toBeTruthy();
});

it("says the programme is unchanged rather than printing it again", () => {
  render(
    <ProgramDiffView
      summary={summariseProgramDiff(diffPrograms(base, structuredClone(base)))}
      names={NAMES}
      emptyReason="Everything is progressing; nothing needs to change."
    />,
  );
  expect(screen.getByText("No programme changes")).toBeTruthy();
  expect(screen.getByText(/nothing needs to change/)).toBeTruthy();
  expect(screen.queryByText("Upper")).toBeNull();
  expect(screen.queryByText("Overhead press")).toBeNull();
});

it("links a cross-day move from both ends and names the reason beside it", () => {
  const next = structuredClone(base);
  const [moved] = next.days[0]!.exercises.splice(1, 1);
  next.days[1]!.exercises.push(moved!);
  const diff = diffPrograms(base, next);
  render(
    <ProgramDiffView
      summary={summariseProgramDiff(diff)}
      names={NAMES}
      reasons={{ [`slot:${LINEAGE.press}`]: "You asked for a shorter upper day." }}
    />,
  );
  expect(screen.getByText("Moved to another day")).toBeTruthy();
  expect(screen.getByText("Moved here")).toBeTruthy();
  expect(screen.getByText("Now on Lower")).toBeTruthy();
  expect(screen.getByText("Was on Upper")).toBeTruthy();
  const reasons = screen.getAllByText("You asked for a shorter upper day.");
  expect(reasons).toHaveLength(2);
  // The reason belongs to its operation, inside the same row. As a sibling list item it
  // collected the ruled list's own divider and an indent that lined up with nothing.
  for (const reason of reasons) {
    const row = reason.closest("li");
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain("Overhead press");
    expect(reason.tagName).not.toBe("LI");
  }
});

it("names a fallback exercise rather than its slug, and prints prose once", () => {
  const next = structuredClone(base);
  next.days[0]!.exercises[1]!.fallbacks = [{ exerciseSlug: "barbell-curl", rank: 1 }];
  next.days[0]!.exercises[1]!.notes = "Seated if the rack is taken.";
  render(
    <ProgramDiffView summary={summariseProgramDiff(diffPrograms(base, next))} names={NAMES} />,
  );
  expect(screen.getByText("Barbell curl")).toBeTruthy();
  expect(screen.queryByText(/barbell-curl/)).toBeNull();
  expect(screen.getByText("Seated if the rack is taken.")).toBeTruthy();
});

it("folds a run's weeks into one entry and leaves the finished weeks out", () => {
  const withRuns: ProgramBlueprint = {
    ...structuredClone(base),
    days: [
      ...structuredClone(base).days,
      {
        dayIndex: 3,
        dayOfWeek: 4,
        name: "Easy run",
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
    runs: [1, 2, 3, 4, 5, 6].map((weekIndex) => ({
      weekIndex,
      dayOfWeek: 4,
      duration: [25 + weekIndex, 30 + weekIndex] as [number, number],
      rpe: [1, 2] as [number, number],
      paceNote: "Conversational",
      progressionNote: "",
      stopRule: "",
    })),
  };
  const next = structuredClone(withRuns);
  for (const run of next.runs) {
    run.duration = [12 + run.weekIndex, 14 + run.weekIndex];
    run.paceNote = "Walk whenever the breathing tightens.";
  }
  render(
    <ProgramDiffView
      summary={summariseProgramDiff(diffPrograms(withRuns, next), { fromWeek: 3 })}
      names={NAMES}
    />,
  );
  expect(screen.getByText("Runs · weeks 3–6")).toBeTruthy();
  expect(screen.queryByText(/week 1/)).toBeNull();
  expect(screen.getAllByText(/Minutes:/)).toHaveLength(1);
  expect(screen.getByText("15–17 in week 3, building to 18–20 by week 6")).toBeTruthy();
  // The rewritten instructions are there, once, folded.
  expect(screen.getAllByText("Walk whenever the breathing tightens.")).toHaveLength(1);
});
