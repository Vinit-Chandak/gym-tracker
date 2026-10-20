import { expect, it } from "vitest";
import type { ProgrammeOccurrence } from "@/server/repositories/occurrences";
import {
  currentProgrammeWeek,
  selectedProgrammeWeek,
  sessionsInProgrammeWeek,
} from "./programme-weeks";

it("opens the current programme week and clamps before and after its date range", () => {
  expect(currentProgrammeWeek("2026-10-01", 8, "2026-10-18")).toBe(3);
  expect(currentProgrammeWeek("2026-10-01", 8, "2026-09-18")).toBe(1);
  expect(currentProgrammeWeek("2026-10-01", 8, "2027-01-01")).toBe(8);
  expect(selectedProgrammeWeek("0", 3, 8)).toBe(3);
  expect(selectedProgrammeWeek("9", 3, 8)).toBe(3);
  expect(selectedProgrammeWeek("4", 3, 8)).toBe(4);
});

it("shows one week and keeps a rescheduled session in its original programme week", () => {
  const sessions = [
    {
      id: "moved",
      originalWeekIndex: 2,
      originalScheduledOn: "2026-10-08",
      scheduledOn: "2026-10-20",
    },
    {
      id: "next",
      originalWeekIndex: 3,
      originalScheduledOn: "2026-10-15",
      scheduledOn: "2026-10-15",
    },
    {
      id: "legacy",
      originalWeekIndex: null,
      originalScheduledOn: "2026-10-09",
      scheduledOn: "2026-10-21",
    },
  ] as ProgrammeOccurrence[];
  expect(sessionsInProgrammeWeek(sessions, "2026-10-01", 8, 2).map(({ id }) => id)).toEqual([
    "moved",
    "legacy",
  ]);
});
