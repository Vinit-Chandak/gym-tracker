import { expect, it } from "vitest";

import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { changeFingerprints, diffPrograms } from "@/domain/program-diff";

import { keepFinishedWeeks, repeatedDeclines, type DeclinedChange } from "./coach-proposals";

const base: ProgramBlueprint = {
  blueprintVersion: 1,
  slug: "block",
  name: "Block",
  weeks: 8,
  notes: "",
  days: [
    {
      dayIndex: 1,
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
  runs: [
    {
      weekIndex: 3,
      dayOfWeek: 4,
      duration: [30, 40],
      rpe: [1, 2],
      paceNote: "",
      progressionNote: "",
      stopRule: "",
    },
  ],
};

const shorterRuns = () => {
  const next = structuredClone(base);
  next.runs[0]!.duration = [20, 25];
  return next;
};
const longerBlock = () => ({ ...structuredClone(base), weeks: 10 });

const DECLINED_AT = new Date("2026-09-20T10:00:00Z");
const declinedOf = (plan: ProgramBlueprint): DeclinedChange => ({
  draftId: "d1",
  declinedAt: DECLINED_AT,
  until: new Date("2026-10-04T10:00:00Z"),
  headline: "",
  changes: changeFingerprints(diffPrograms(base, plan)),
});
const before = new Date("2026-09-19T10:00:00Z");
const after = new Date("2026-09-22T10:00:00Z");

it("refuses a declined change that comes back, whichever ask it is filed under from before", () => {
  const diff = diffPrograms(base, shorterRuns());
  const declined = [declinedOf(shorterRuns())];
  expect(repeatedDeclines(diff, declined, new Map())).toHaveLength(1);
  // An ask the decline already answered cannot carry the change back in.
  expect(repeatedDeclines(diff, declined, new Map([["run:3:4", before]]))).toHaveLength(1);
  // Asked for again after saying no: theirs to change their mind about.
  expect(repeatedDeclines(diff, declined, new Map([["run:3:4", after]]))).toEqual([]);
});

it("lets a programme-level change back in when it is asked for again", () => {
  const diff = diffPrograms(base, longerBlock());
  const declined = [declinedOf(longerBlock())];
  expect(repeatedDeclines(diff, declined, new Map())).toHaveLength(1);
  expect(repeatedDeclines(diff, declined, new Map([["program:weeks", after]]))).toEqual([]);
});

it("keeps weeks already trained exactly as they were, and takes the rest from the proposal", () => {
  const week = (weekIndex: number, duration: [number, number]) => ({
    ...structuredClone(base.runs[0]!),
    weekIndex,
    duration,
  });
  const trained = {
    ...structuredClone(base),
    runs: [week(1, [30, 40]), week(2, [30, 40]), week(3, [30, 40])],
  };
  const proposed = {
    ...structuredClone(base),
    runs: [week(1, [10, 15]), week(2, [10, 15]), week(3, [20, 25])],
  };
  const kept = keepFinishedWeeks(proposed, trained, 3);
  expect(kept.runs.map((run) => [run.weekIndex, run.duration])).toEqual([
    [1, [30, 40]],
    [2, [30, 40]],
    [3, [20, 25]],
  ]);
  // In the first week, or with no position to read, nothing is finished.
  expect(keepFinishedWeeks(proposed, trained, 1)).toBe(proposed);
  expect(keepFinishedWeeks(proposed, trained, null)).toBe(proposed);
});
