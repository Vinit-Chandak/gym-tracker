import { describe, expect, it } from "vitest";

import { endurancePrescriptionSchema } from "./activity-prescription";
import { programBlueprintSchema, type ProgramBlueprint } from "./program-blueprint";
import { runningIntakeSchema } from "./running-intake";
import { runningProgrammeIssues } from "./running-programme-checks";

const easy = (sessionType: string | null = "easy") =>
  endurancePrescriptionSchema.parse({
    prescriptionVersion: 1,
    sport: "running",
    sessionTargets: { distanceMetres: [8000, 9000] },
    running: sessionType ? { sessionType } : null,
  });

const intervals = endurancePrescriptionSchema.parse({
  prescriptionVersion: 1,
  sport: "running",
  running: { sessionType: "intervals" },
  nodes: [
    {
      kind: "repeat",
      id: "reps",
      repetitions: 6,
      steps: [
        {
          kind: "step",
          id: "rep",
          phase: "work",
          action: "run",
          target: { kind: "distance", metres: [800, 800] },
        },
      ],
    },
  ],
});

/** Sessions by day offset from a Monday start: Tue, Thu, Sun of each week. */
function plan(
  sessions: { day: number; name: string; prescription: unknown }[],
  extra: Partial<ProgramBlueprint> = {},
): ProgramBlueprint {
  return programBlueprintSchema.parse({
    blueprintVersion: 1,
    sport: "running",
    slug: "test-block",
    name: "Test block",
    weeks: 2,
    days: [],
    runs: [],
    enduranceSessions: sessions.map((session) => ({
      lineageId: crypto.randomUUID(),
      name: session.name,
      weekIndex: Math.floor(session.day / 7) + 1,
      dayOffset: session.day,
      prescription: session.prescription,
    })),
    ...extra,
  });
}

const goal = (patch: Record<string, unknown> = {}) => runningIntakeSchema.parse(patch);
const none = { goal: null, runsPerWeek: null, runDays: [] };

describe("a coach's running programme, checked against the athlete's answers", () => {
  it("passes a typed, structured week inside what was confirmed", () => {
    const block = plan(
      [
        { day: 1, name: "Intervals", prescription: intervals },
        { day: 3, name: "Easy run", prescription: easy() },
        { day: 6, name: "Long run", prescription: easy("long") },
      ],
      { startsOn: "2026-11-02" },
    );
    expect(
      runningProgrammeIssues(block, { goal: null, runsPerWeek: 3, runDays: [2, 4, 7] }),
    ).toEqual([]);
  });

  it("names every untyped session and every quality session without steps", () => {
    const block = plan([
      { day: 1, name: "Run", prescription: easy(null) },
      { day: 3, name: "Tempo", prescription: easy("tempo") },
    ]);
    expect(runningProgrammeIssues(block, none)).toEqual([
      'Give "Run" (week 1) its running.sessionType.',
      'Write "Tempo" (week 1) as steps: a tempo session has a warm-up, its work and a cool-down.',
    ]);
  });

  it("refuses more runs in a week than the athlete confirmed, and days they did not offer", () => {
    const block = plan(
      [
        { day: 0, name: "Easy", prescription: easy() },
        { day: 1, name: "Easy", prescription: easy() },
        { day: 2, name: "Easy", prescription: easy() },
      ],
      { startsOn: "2026-11-02" },
    );
    const issues = runningProgrammeIssues(block, { goal: null, runsPerWeek: 2, runDays: [1, 2] });
    expect(issues).toEqual([
      "Week 1 has 3 runs; the athlete confirmed 2 a week.",
      '"Easy" (week 1) falls on a day the athlete did not offer.',
    ]);
  });

  it("asks for startsOn when days or a race have to be counted from it", () => {
    const block = plan([{ day: 0, name: "Easy", prescription: easy() }]);
    expect(
      runningProgrammeIssues(block, {
        goal: goal({ goal: "race", raceDistance: "10k", raceDate: "2026-11-15" }),
        runsPerWeek: null,
        runDays: [1],
      }),
    ).toEqual([
      "Set startsOn: the athlete confirmed run days, which are counted from it.",
      "Set startsOn so the programme ends with the race on 2026-11-15.",
    ]);
  });

  it("wants the race on its date and nothing after it", () => {
    const race = endurancePrescriptionSchema.parse({
      prescriptionVersion: 1,
      sport: "running",
      sessionTargets: { distanceMetres: [10_000, 10_000] },
      running: { sessionType: "race" },
    });
    const answers = {
      goal: goal({ goal: "race", raceDistance: "10k", raceDate: "2026-11-15" }),
      runsPerWeek: null,
      runDays: [],
    };
    const onTime = plan(
      [
        { day: 1, name: "Easy", prescription: easy() },
        { day: 13, name: "10K race", prescription: race },
      ],
      { startsOn: "2026-11-02" },
    );
    expect(runningProgrammeIssues(onTime, answers)).toEqual([]);
    const late = plan(
      [
        { day: 6, name: "10K race", prescription: race },
        { day: 15, name: "Easy", prescription: easy() },
      ],
      { startsOn: "2026-11-02", weeks: 3 },
    );
    expect(runningProgrammeIssues(late, answers)).toEqual([
      "End the programme with a session of sessionType race on 2026-11-15.",
      '"Easy" (week 3) is after the race on 2026-11-15.',
    ]);
  });
});
