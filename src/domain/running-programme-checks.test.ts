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

  it("counts a week's runs by the dates they fall on, not the weekIndex they were given", () => {
    const block = plan(
      [
        { day: 1, name: "Easy", prescription: easy() },
        { day: 3, name: "Easy", prescription: easy() },
        { day: 5, name: "Easy", prescription: easy() },
      ],
      { startsOn: "2026-11-02" },
    );
    // A mistyped weekIndex does not hide the third run of the week from the count.
    block.enduranceSessions![2]!.weekIndex = 2;
    expect(runningProgrammeIssues(block, { goal: null, runsPerWeek: 2, runDays: [] })).toEqual([
      "Week 1 has 3 runs; the athlete confirmed 2 a week.",
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
    // A race on its date is never on a day the athlete did not offer: it is a date they gave.
    expect(runningProgrammeIssues(onTime, { ...answers, runDays: [2, 4] })).toEqual([]);
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

  /** ADR 0063: the athlete reads a session's time beside it, and has a limit on some days. */
  describe("time", () => {
    const EASY: [number, number] = [450, 530];
    const timed = (low: number, high: number, extra: Record<string, unknown> = {}) =>
      endurancePrescriptionSchema.parse({
        prescriptionVersion: 1,
        sport: "running",
        sessionTargets: { durationMs: [low * 60_000, high * 60_000], paceSecondsPerKm: EASY },
        running: { sessionType: "easy" },
        ...extra,
      });
    // The draft that asked for this: "30–35 min", its steps 24–28 min, six strides with walks,
    // and a cool-down, which add up to 32–39 min.
    const strides = timed(30, 35, {
      nodes: [
        {
          kind: "step",
          id: "easy",
          phase: "work",
          action: "run",
          target: { kind: "duration", ms: [24 * 60_000, 28 * 60_000] },
        },
        {
          kind: "repeat",
          id: "strides",
          repetitions: 6,
          steps: [
            {
              kind: "step",
              id: "stride",
              phase: "work",
              action: "run",
              target: { kind: "duration", ms: [15_000, 20_000] },
            },
            {
              kind: "step",
              id: "walk",
              phase: "recovery",
              action: "walk",
              target: { kind: "duration", ms: [48_000, 60_000] },
            },
          ],
        },
        {
          kind: "step",
          id: "cool",
          phase: "cooldown",
          action: "run",
          target: { kind: "duration", ms: [2 * 60_000, 3 * 60_000] },
        },
      ],
    });
    const long = endurancePrescriptionSchema.parse({
      prescriptionVersion: 1,
      sport: "running",
      sessionTargets: { distanceMetres: [14_000, 15_000], paceSecondsPerKm: EASY },
      running: { sessionType: "long" },
    });

    it("refuses a session whose steps do not add up to the time it says", () => {
      const block = plan([{ day: 1, name: "Easy run + strides", prescription: strides }], {
        startsOn: "2026-10-26",
      });
      expect(runningProgrammeIssues(block, none)).toEqual([
        '"Easy run + strides" (week 1) says 30–35 min, but its steps add up to 32–39 min: make them agree.',
      ]);
      const agreed = plan(
        [
          {
            day: 1,
            name: "Easy run + strides",
            prescription: {
              ...strides,
              sessionTargets: { ...strides.sessionTargets, durationMs: [32 * 60_000, 39 * 60_000] },
            },
          },
        ],
        { startsOn: "2026-10-26" },
      );
      expect(runningProgrammeIssues(agreed, none)).toEqual([]);
    });

    it("holds every run to its day's limit, at the slow end of its pace", () => {
      const block = plan(
        [
          { day: 1, name: "Easy run", prescription: timed(35, 45) },
          { day: 3, name: "Easy run", prescription: timed(30, 40) },
          // Fifteen kilometres at 8:50 /km: 2 h 13 min on a Sunday with no limit.
          { day: 6, name: "Long run", prescription: long },
        ],
        { startsOn: "2026-10-26" },
      );
      const answers = {
        ...none,
        goal: goal({
          timeLimits: [
            { day: 2, minutes: 40 },
            { day: 4, minutes: 40 },
          ],
        }),
      };
      expect(runningProgrammeIssues(block, answers)).toEqual([
        '"Easy run" (week 1) takes up to 45 min; the athlete has 40 min on Tuesday.',
      ]);
      expect(
        runningProgrammeIssues(
          plan([{ day: 1, name: "Easy run", prescription: timed(30, 40) }]),
          answers,
        ),
      ).toEqual(["Set startsOn: the athlete's time limits are by weekday, counted from it."]);
    });

    it("reads an older intake's minutes as every run's but the long run's", () => {
      const block = plan(
        [
          { day: 1, name: "Easy run", prescription: timed(40, 45) },
          { day: 6, name: "Long run", prescription: long },
        ],
        { startsOn: "2026-10-26" },
      );
      expect(runningProgrammeIssues(block, { ...none, minutesPerRun: 40 })).toEqual([
        '"Easy run" (week 1) takes up to 45 min; the athlete has 40 min for a run.',
      ]);
      expect(
        runningProgrammeIssues(block, {
          ...none,
          goal: goal({ longRunMinutes: 120 }),
          minutesPerRun: 45,
        }),
      ).toEqual([
        '"Long run" (week 1) takes up to 133 min; the athlete has 120 min for the long run.',
      ]);
    });
  });
});
