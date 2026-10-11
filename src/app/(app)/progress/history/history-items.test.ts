import { describe, expect, it } from "vitest";

import {
  enduranceItem,
  historyClock,
  newestFirst,
  recoveryItem,
  runItem,
  workoutItem,
} from "./history-items";

type Workout = Parameters<typeof workoutItem>[0];
type Reading = Parameters<typeof recoveryItem>[0];

const lift = (id: string, startedAt: string, occurredOn: string | null = null): Workout => ({
  id,
  startedAt: new Date(startedAt),
  occurredOn,
  gymId: "gym",
  gymName: "Test gym",
  dayName: null,
  sleepHours: null,
  setCount: 3,
  exercises: [],
});

/** An older account's daily reading: a bare date, no instant. */
const reading = (id: string, date: string): Reading => ({
  id,
  userId: "user",
  date,
  sleepHours: 7,
  sleepQuality: null,
  energy: null,
  fatigue: null,
  soreness: null,
  notes: null,
  createdAt: new Date(`${date}T12:00:00Z`),
  updatedAt: new Date(`${date}T12:00:00Z`),
});

describe("History's order", () => {
  it("keeps each day's entries together west of UTC, whatever their instants read", () => {
    const clock = historyClock("America/New_York");
    const items = [
      // 07:00 on Sunday 11 October in New York.
      workoutItem(lift("morning", "2026-10-11T11:00:00Z"), clock),
      // 21:00 on Saturday 10 October: already the 11th in UTC.
      workoutItem(lift("evening", "2026-10-11T01:00:00Z"), clock),
      recoveryItem(reading("sunday", "2026-10-11")),
      recoveryItem(reading("saturday", "2026-10-10")),
    ].sort(newestFirst);
    expect(items.map((item) => [item.day, item.id])).toEqual([
      ["2026-10-11", "morning"],
      ["2026-10-11", "sunday"],
      ["2026-10-10", "evening"],
      ["2026-10-10", "saturday"],
    ]);
  });

  it("lists a workout under the day it was recorded on, not its day in today's zone", () => {
    // Recorded on the 30th in UTC; in Kolkata today the same instant is the 1st.
    const item = workoutItem(
      lift("moved", "2026-09-30T21:30:00Z", "2026-09-30"),
      historyClock("Asia/Kolkata"),
    );
    expect(item.day).toBe("2026-09-30");
    // A session older than the parents has no recorded day, and is dated in today's zone.
    expect(
      workoutItem(lift("legacy", "2026-09-30T21:30:00Z"), historyClock("Asia/Kolkata")).day,
    ).toBe("2026-10-01");
  });
});

describe("a run in History", () => {
  const run = {
    id: "run-1",
    startedAt: new Date("2026-09-12T07:00:00Z"),
    occurredOn: "2026-09-12",
    environment: "outdoor",
    durationSeconds: 1800,
    distanceMeters: 5000,
    averagePaceSecondsPerKm: 360,
    effort: { value: 3, confirmed: true },
    surface: null,
    title: null,
    notes: null,
    gymId: null,
    occurrenceId: null,
    programRunId: null,
  } as unknown as Parameters<typeof runItem>[0];

  it("reads in kilometres by default", () => {
    const item = runItem(run, historyClock("UTC"));
    // Named as its page names it, where it was run beside the time, as a workout's gym is.
    expect(item.title).toBe("Run ·\u00a05\u00a0km");
    expect(item.subtitle).toBe("07:00 ·\u00a0Outdoor");
    expect(item.meta).toBe("30:00 · 6:00/km");
  });

  it("reads in the athlete's own unit for the sport", () => {
    const item = runItem(
      run,
      historyClock("UTC", { running: { distanceUnit: "mi", poolUnit: "yd" } }),
    );
    expect(item.title).toBe("Run ·\u00a03.11\u00a0mi");
    expect(item.meta).toBe("30:00 · 9:39/mi");
  });
});

describe("a ride in History", () => {
  const ride = {
    id: "ride-1",
    sport: "cycling",
    startedAt: new Date("2026-10-11T08:48:00Z"),
    occurredOn: "2026-10-11",
    durationMs: 3_092_000,
    distanceMetres: null,
    effortValue: 2,
    effortStatus: "reported",
    title: null,
    occurrenceId: null,
    performedRevisionId: null,
    environment: "indoor",
  } as const;

  it("is a ride wherever it is named, with where it happened beside its time", () => {
    // One ride read "Ride" here, "Indoor ride" on its day and "Cycling" on its own page.
    const item = enduranceItem(ride, historyClock("UTC"));
    expect(item.title).toBe("Ride");
    expect(item.subtitle).toBe("08:48 ·\u00a0Indoor");
    expect(enduranceItem({ ...ride, title: "Spin class" }, historyClock("UTC")).title).toBe(
      "Spin class",
    );
  });
});

describe("sleep in History", () => {
  it("says a night's sleep as every other time is said, not in decimal hours", () => {
    const clock = historyClock("UTC");
    // Sofia's 6.25 h read "Sleep 6.25 h" beside workouts of "1 h 3 min".
    expect(
      workoutItem({ ...lift("night", "2026-10-11T08:00:00Z"), sleepHours: 6.25 }, clock).recovery,
    ).toBe("Sleep 6 h 15 min");
    expect(recoveryItem({ ...reading("whole", "2026-10-10"), sleepHours: 8 }).subtitle).toBe(
      "Sleep 8 h",
    );
    expect(workoutItem(lift("none", "2026-10-11T08:00:00Z"), clock).recovery).toBe("");
  });
});
