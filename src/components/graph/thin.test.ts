import { describe, expect, it } from "vitest";

import { addDays } from "@/domain/program-calendar";

import { pairLines, thinRecords } from "./thin";

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

describe("two lines on one axis", () => {
  const month = {
    preset: "1m" as const,
    from: "2026-09-08",
    to: "2026-10-07",
    bucket: "day" as const,
  };

  it("puts both on the days either trained, null where one did not, the better of a day standing", () => {
    const pair = pairLines(
      [
        { date: "2026-09-10", value: 80, id: "a1" },
        { date: "2026-09-20", value: 82, id: "a2" },
      ],
      [
        { date: "2026-09-12", value: 70, id: "b1" },
        { date: "2026-09-20", value: 71, id: "b2" },
        { date: "2026-09-20", value: 72, id: "b3" },
      ],
      month,
    );
    expect(pair.bucket).toBeNull();
    expect(pair.points[0]).toEqual([
      { date: "2026-09-10", value: 80 },
      { date: "2026-09-12", value: null },
      { date: "2026-09-20", value: 82 },
    ]);
    expect(pair.points[1].map((point) => point.value)).toEqual([null, 70, 72]);
    expect(pair.groups[2]!.picks.map((pick) => pick?.id)).toEqual(["a2", "b3"]);
  });

  it("groups both by the same week or month past the limit, each line's best in the middle", () => {
    const many = (value: (i: number) => number) => records(200, value).map((r, i) => ({ ...r, i }));
    const pair = pairLines(
      many((i) => 100 + (i % 10)),
      many(() => 90).slice(0, 20),
      range,
    );
    expect(pair.bucket).toBe("month");
    expect(pair.points[0]).toHaveLength(pair.points[1].length);
    expect(pair.points[0].map((point) => point.date)).toEqual(
      pair.points[1].map((point) => point.date),
    );
    // January 2024: eleven records each; the first line's best of them, the second's 90.
    expect(pair.groups[0]).toMatchObject({ start: "2024-01-01", end: "2024-01-31" });
    expect(pair.groups[0]!.picks[0]!.value).toBe(109);
    expect(pair.points[0][0]).toEqual({ date: "2024-01-16", value: 109 });
    expect(pair.points[1][0]!.value).toBe(90);
    // Past the second line's twenty records, it has nothing to say.
    expect(pair.points[1].at(-1)!.value).toBeNull();
  });
});
