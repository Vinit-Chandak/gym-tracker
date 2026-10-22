import { describe, expect, it } from "vitest";
import { endurancePrescriptionSchema } from "./activity-prescription";
import { programBlueprintSchema } from "./program-blueprint";
import { enduranceScheduleIssues, type ProgrammeEnduranceSession } from "./programme-sport";
import {
  enduranceSessionGroups,
  moveEnduranceSession,
  repeatEnduranceSession,
  updateEnduranceSession,
} from "./endurance-series";

function session(dayOffset = 0, minutes = 30): ProgrammeEnduranceSession {
  return {
    lineageId: crypto.randomUUID(),
    name: "Easy run",
    weekIndex: Math.floor(dayOffset / 7) + 1,
    dayOffset,
    scheduledLocalTime: null,
    prescription: endurancePrescriptionSchema.parse({
      prescriptionVersion: 1,
      sport: "running",
      sessionTargets: { durationMs: [minutes * 60_000, minutes * 60_000], effort: [2, 2] },
    }),
  };
}

describe("editing repeated endurance work", () => {
  it("recognizes a four-day repeat across week boundaries without merging identities", () => {
    const seed = session();
    const repeats = repeatEnduranceSession(seed, { everyDays: 4, throughDayOffset: 27 });
    expect(repeats.map((entry) => entry.dayOffset)).toEqual([0, 4, 8, 12, 16, 20, 24]);
    expect(repeats.map((entry) => entry.weekIndex)).toEqual([1, 1, 2, 2, 3, 3, 4]);
    expect(new Set(repeats.map((entry) => entry.lineageId)).size).toBe(7);
    expect(repeats[0]!.lineageId).toBe(seed.lineageId);
    expect(new Set(repeats.map((entry) => entry.seriesId)).size).toBe(1);
    expect(enduranceSessionGroups(repeats)).toMatchObject([
      { indexes: [0, 1, 2, 3, 4, 5, 6], intervalDays: 4, source: "series" },
    ]);
  });

  it("recognizes exact legacy repetitions with unique identities, but keeps progressive weeks distinct", () => {
    const repeated = [0, 7, 14, 21].map((day) => session(day));
    expect(enduranceSessionGroups(repeated)).toMatchObject([
      { indexes: [0, 1, 2, 3], intervalDays: 7, inferred: true },
    ]);
    const progression = repeated.map((entry, index) => ({
      ...session(entry.dayOffset, 30 + index * 5),
      lineageId: repeated[0]!.lineageId,
    }));
    expect(enduranceSessionGroups(progression).map((group) => group.indexes)).toEqual([
      [0],
      [1],
      [2],
      [3],
    ]);
  });

  it("changes future matching work once, preserving the past and an individual progression", () => {
    const repeats = repeatEnduranceSession(session(), { everyDays: 7, throughDayOffset: 27 });
    repeats[2]!.prescription.sessionTargets.durationMs = [2_400_000, 2_400_000];
    const next = updateEnduranceSession(
      repeats,
      1,
      { name: "Recovery run" },
      {
        scope: "future_repeats",
        fromDayOffset: 7,
      },
    );
    expect(next.map((entry) => entry.name)).toEqual([
      "Easy run",
      "Recovery run",
      "Easy run",
      "Recovery run",
    ]);
    expect(next.map((entry) => entry.lineageId)).toEqual(repeats.map((entry) => entry.lineageId));
    expect(next[2]!.prescription.sessionTargets.durationMs).toEqual([2_400_000, 2_400_000]);
    expect(repeats[1]!.name).toBe("Easy run");
  });

  it("editing one occurrence makes an exception without changing later copies", () => {
    const repeats = repeatEnduranceSession(session(), { everyDays: 4, throughDayOffset: 14 });
    const next = updateEnduranceSession(
      repeats,
      1,
      {
        prescription: { ...repeats[1]!.prescription, instructions: "Keep it easy" },
      },
      { scope: "this" },
    );
    expect(next.map((entry) => entry.prescription.instructions)).toEqual([
      null,
      "Keep it easy",
      null,
      null,
    ]);
    expect(enduranceSessionGroups(next).map((group) => group.indexes)).toEqual([[0, 2, 3], [1]]);
  });

  it.each(["this", "future_repeats"] as const)(
    "removes cleared optional pace and zone targets within the %s scope",
    (scope) => {
      const seed = session();
      seed.prescription.sessionTargets.paceSecondsPerKm = [330, 360];
      seed.prescription.sessionTargets.heartRateZones = [2, 3];
      const repeats = repeatEnduranceSession(seed, { everyDays: 7, throughDayOffset: 27 });
      const prescription = structuredClone(repeats[1]!.prescription);
      delete prescription.sessionTargets.paceSecondsPerKm;
      delete prescription.sessionTargets.heartRateZones;
      const next = updateEnduranceSession(repeats, 1, { prescription }, { scope });
      for (const [index, entry] of next.entries()) {
        const cleared = index === 1 || (scope === "future_repeats" && index > 1);
        expect(entry.prescription.sessionTargets.paceSecondsPerKm).toEqual(
          cleared ? undefined : [330, 360],
        );
        expect(entry.prescription.sessionTargets.heartRateZones).toEqual(
          cleared ? undefined : [2, 3],
        );
        expect(entry.prescription.sessionTargets.durationMs).toEqual([1800000, 1800000]);
        expect(entry.lineageId).toBe(repeats[index]!.lineageId);
      }
      expect(repeats[1]!.prescription.sessionTargets.paceSecondsPerKm).toEqual([330, 360]);
    },
  );

  it("a date change updates its week and moves only the selected occurrence", () => {
    const repeats = repeatEnduranceSession(session(), { everyDays: 7, throughDayOffset: 27 });
    const next = updateEnduranceSession(
      repeats,
      1,
      { dayOffset: 15 },
      {
        scope: "future_repeats",
      },
    );
    expect(next.map((entry) => entry.dayOffset)).toEqual([0, 15, 14, 21]);
    expect(next[1]!.weekIndex).toBe(3);
    expect(next[1]!.originalWeekIndex).toBe(2);
    expect(moveEnduranceSession(next[1]!, 22).originalWeekIndex).toBe(2);
    expect(moveEnduranceSession(repeats[0]!, 7).weekIndex).toBe(2);
  });

  it("new repetitions do not inherit the moved seed's original identity week", () => {
    const moved = moveEnduranceSession(session(), 8);
    const repeats = repeatEnduranceSession(moved, { everyDays: 4, throughDayOffset: 20 });
    expect(repeats[0]!.originalWeekIndex).toBe(1);
    expect(repeats.slice(1).every((entry) => entry.originalWeekIndex === undefined)).toBe(true);
    expect(repeats.map((entry) => entry.weekIndex)).toEqual([2, 2, 3, 3]);
  });

  it("does not infer repetition from irregular or same-date matching sessions", () => {
    expect(enduranceSessionGroups([session(0), session(4), session(12)])).toHaveLength(3);
    expect(enduranceSessionGroups([session(0), session(0)])).toHaveLength(2);
  });

  it("finds two weekly repeat roles when their legacy prescriptions are identical", () => {
    const sessions = [0, 3, 7, 10, 14, 17].map((offset) => session(offset));
    expect(enduranceSessionGroups(sessions).map((group) => group.indexes)).toEqual([
      [0, 2, 4],
      [1, 3, 5],
    ]);
  });

  it("keeps authoring series metadata through blueprint parsing and detects invalid scheduled weeks", () => {
    const repeats = repeatEnduranceSession(session(), { everyDays: 7, throughDayOffset: 20 });
    const parsed = programBlueprintSchema.parse({
      blueprintVersion: 1,
      sport: "running",
      slug: "test-series",
      name: "A repeat",
      weeks: 3,
      days: [],
      enduranceSessions: repeats,
    });
    expect(parsed.enduranceSessions![0]!.seriesId).toBe(repeats[0]!.seriesId);
    expect(enduranceScheduleIssues(parsed)).toEqual([]);
    expect(enduranceScheduleIssues({ weeks: 2, enduranceSessions: repeats })).toHaveLength(1);
    expect(
      enduranceScheduleIssues({ weeks: 3, enduranceSessions: [{ ...session(8), weekIndex: 1 }] }),
    ).toEqual(["A session's week must match its scheduled date."]);
  });
});
