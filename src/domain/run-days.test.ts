import { describe, expect, it } from "vitest";

import { endurancePrescriptionSchema } from "./activity-prescription";
import { addDays } from "./program-calendar";
import { programBlueprintSchema, type ProgramBlueprint } from "./program-blueprint";
import { moveRunDays, planRunDays } from "./run-days";

const run = (sessionType: string) =>
  endurancePrescriptionSchema.parse({
    prescriptionVersion: 1,
    sport: "running",
    sessionTargets: { distanceMetres: [5000, 6000] },
    running: { sessionType },
  });

/**
 * Two weeks from Monday 26 October 2026, as a coach left to choose the days wrote them: a
 * quality run on Tuesday, easy on Thursday and Saturday, the long run on Sunday; then a race on
 * the second Friday.
 */
function plan(): ProgramBlueprint {
  const sessions: [number, string][] = [
    [1, "tempo"],
    [3, "easy"],
    [5, "easy"],
    [6, "long"],
    [8, "intervals"],
    [10, "easy"],
    [11, "race"],
  ];
  return programBlueprintSchema.parse({
    blueprintVersion: 1,
    sport: "running",
    slug: "half",
    name: "Half marathon",
    weeks: 2,
    days: [],
    runs: [],
    startsOn: "2026-10-26",
    enduranceSessions: sessions.map(([day, type]) => ({
      lineageId: crypto.randomUUID(),
      name: type,
      weekIndex: Math.floor(day / 7) + 1,
      dayOffset: day,
      prescription: run(type),
    })),
  });
}

const dated = (blueprint: ProgramBlueprint) =>
  blueprint.enduranceSessions!.map((session) => [
    session.name,
    addDays(blueprint.startsOn!, session.dayOffset),
  ]);

describe("a dated plan's run days, moved at once", () => {
  it("says which days the plan runs on and what each mostly holds, the race aside", () => {
    expect(planRunDays(plan())).toEqual([
      { day: 2, sessions: 2, holds: "hard" },
      { day: 4, sessions: 2, holds: "easy" },
      { day: 6, sessions: 1, holds: "easy" },
      { day: 7, sessions: 1, holds: "long" },
    ]);
  });

  it("moves every week's sessions to the day given, and keeps the race on race day", () => {
    const { blueprint, moved, stayed, backToBack } = moveRunDays(plan(), { 2: 1, 4: 3, 6: 5 });
    expect(dated(blueprint)).toEqual([
      ["tempo", "2026-10-26"],
      ["easy", "2026-10-28"],
      ["easy", "2026-10-30"],
      ["long", "2026-11-01"],
      ["intervals", "2026-11-02"],
      ["easy", "2026-11-04"],
      ["race", "2026-11-06"],
    ]);
    expect(moved).toBe(5);
    expect(stayed).toBe(0);
    // The long run on Sunday and the intervals on Monday are back to back now.
    expect(backToBack).toBe(1);
    expect(
      blueprint.enduranceSessions!.every((s) => s.weekIndex === Math.floor(s.dayOffset / 7) + 1),
    ).toBe(true);
  });

  it("keeps a session where its new day is the race's or after it, or before the start", () => {
    // Thursday to Friday: the second week's Friday is race day, so that easy run stays.
    const { blueprint, moved, stayed } = moveRunDays(plan(), { 4: 5 });
    expect(dated(blueprint)).toContainEqual(["easy", "2026-11-05"]);
    expect(dated(blueprint)).toContainEqual(["easy", "2026-10-30"]);
    expect([moved, stayed]).toEqual([1, 1]);
  });

  it("leaves a plan unchanged when nothing moves", () => {
    const block = plan();
    expect(moveRunDays(block, { 2: 2 })).toMatchObject({ blueprint: block, moved: 0 });
    expect(planRunDays({ ...block, startsOn: undefined })).toEqual([]);
  });
});
