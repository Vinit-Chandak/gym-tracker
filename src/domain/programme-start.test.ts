import { describe, expect, it } from "vitest";

import { endurancePrescriptionSchema } from "./activity-prescription";
import { addDays } from "./program-calendar";
import { programBlueprintSchema, type ProgramBlueprint } from "./program-blueprint";
import { plannedRaceDate, startOn, suggestedStart } from "./programme-start";

const run = (sessionType: string) =>
  endurancePrescriptionSchema.parse({
    prescriptionVersion: 1,
    sport: "running",
    sessionTargets: { distanceMetres: [5000, 6000] },
    running: { sessionType },
  });

/** Two weeks from Monday 26 October 2026: Tue, Thu, Sun, then Tue and the race on Friday. */
function plan(withRace: boolean, extra: Partial<ProgramBlueprint> = {}): ProgramBlueprint {
  const days = withRace ? [1, 3, 6, 8, 11] : [1, 3, 6, 8, 10, 13];
  return programBlueprintSchema.parse({
    blueprintVersion: 1,
    sport: "running",
    slug: "half",
    name: "Half marathon",
    weeks: 2,
    days: [],
    runs: [],
    startsOn: "2026-10-26",
    enduranceSessions: days.map((day, index) => ({
      lineageId: crypto.randomUUID(),
      name: `Run ${index + 1}`,
      weekIndex: Math.floor(day / 7) + 1,
      dayOffset: day,
      prescription: run(withRace && index === days.length - 1 ? "race" : "easy"),
    })),
    ...extra,
  });
}

describe("where a dated programme starts", () => {
  it("finds the race a plan ends with, dated from its start", () => {
    expect(plannedRaceDate(plan(true))).toBe("2026-11-06");
    expect(plannedRaceDate(plan(false))).toBeNull();
    expect(plannedRaceDate(plan(true, { startsOn: undefined }))).toBeNull();
  });

  it("offers the coach's start while it is still to come", () => {
    expect(suggestedStart(plan(true), "2026-10-24")).toBe("2026-10-26");
    expect(suggestedStart(plan(false), "2026-10-26")).toBe("2026-10-26");
  });

  it("offers today for a race plan once its start has gone, which keeps its dates", () => {
    expect(suggestedStart(plan(true), "2026-10-28")).toBe("2026-10-28");
  });

  it("offers any other plan the next day on its own weekday, so its runs keep their days", () => {
    // Planned from a Monday and opened on a Wednesday: the Monday after.
    expect(suggestedStart(plan(false), "2026-10-28")).toBe("2026-11-02");
    expect(suggestedStart(plan(false), "2026-11-02")).toBe("2026-11-02");
    expect(suggestedStart(plan(false, { startsOn: undefined }), "2026-10-28")).toBe("2026-10-28");
  });

  it("keeps the race on race day however late the plan starts, leaving out what has gone", () => {
    const block = plan(true);
    const late = startOn(block, "2026-10-29");
    expect(late.startDate).toBe("2026-10-26");
    expect(late.leftOut).toBe(1);
    expect(late.raceDate).toBe("2026-11-06");
    const dates = late.blueprint.enduranceSessions!.map((session) =>
      addDays(late.startDate, session.dayOffset),
    );
    expect(dates).toEqual(["2026-10-29", "2026-11-01", "2026-11-03", "2026-11-06"]);
  });

  it("starts a race plan on its own start when an earlier day is chosen", () => {
    const block = plan(true);
    const early = startOn(block, "2026-10-24");
    expect(early).toMatchObject({ startDate: "2026-10-26", leftOut: 0 });
    expect(early.blueprint).toBe(block);
  });

  it("moves any other plan with the day chosen, as it always has", () => {
    const block = plan(false);
    expect(startOn(block, "2026-10-28")).toEqual({
      startDate: "2026-10-28",
      blueprint: block,
      leftOut: 0,
      raceDate: null,
    });
  });
});
