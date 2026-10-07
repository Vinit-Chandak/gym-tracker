import { describe, expect, it } from "vitest";

import { addDays } from "@/domain/program-calendar";

import { thinRecords } from "./thin";

const range = {
  preset: "all" as const,
  from: "2024-01-01",
  to: "2026-10-07",
  bucket: "month" as const,
};

/** One record every third day from 1 Jan 2024, values from `value`. */
const records = (count: number, value: (i: number) => number) =>
  Array.from({ length: count }, (_, i) => ({
    date: addDays("2024-01-01", i * 3),
    value: value(i),
  }));

describe("a line a phone can read", () => {
  it("keeps every record its own point up to the limit", () => {
    const few = records(10, (i) => i);
    const line = thinRecords(few, range, { reduce: "max" });
    expect(line.bucket).toBeNull();
    expect(line.points).toEqual(few);
    expect(line.groups[3]).toEqual({
      start: few[3]!.date,
      end: few[3]!.date,
      indices: [3],
      pick: 3,
    });
  });

  it("draws a group's best record past it, which still names the record", () => {
    const many = records(300, (i) => (i % 2 === 0 ? 100 + i : 50));
    const line = thinRecords(many, range, { reduce: "max" });
    // Nearly three years of weeks is too many: months.
    expect(line.bucket).toBe("month");
    expect(line.points.length).toBeLessThanOrEqual(34);
    const january = line.groups[0]!;
    expect(january.start).toBe("2024-01-01");
    expect(january.indices).toHaveLength(11);
    expect(line.points[0]).toEqual({ date: many[january.pick!]!.date, value: 110 });
  });

  it("averages a group by weight where a record counts for more, in the middle of its days", () => {
    const runs = [
      ...records(70, () => 360),
      { date: "2026-10-01", value: 300 },
      { date: "2026-10-02", value: 400 },
    ];
    const weights = [...runs.map(() => 1).slice(0, 70), 3, 1];
    const line = thinRecords(runs, range, { reduce: "mean", weights });
    const october = line.points.at(-1)!;
    expect(october.value).toBe(325);
    // October 2026 so far: its middle inside the range, not past today.
    expect(october.date).toBe("2026-10-04");
    expect(line.groups.at(-1)!.pick).toBeNull();
  });
});
