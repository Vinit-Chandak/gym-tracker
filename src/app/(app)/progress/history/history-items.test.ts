import { describe, expect, it } from "vitest";

import { historyClock, newestFirst, recoveryItem, workoutItem } from "./history-items";

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
