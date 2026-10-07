import { bucketEnd, bucketStart, type Bucket, type GraphRange } from "@/domain/graph-range";
import { addDays, daysBetween } from "@/domain/program-calendar";

import type { GraphDatum } from "./graph";

/** Records past which a line is drawn a point per week or month: about one per 5 pt of width. */
export const RECORDS_PER_LINE = 60;

/** One point of a thinned line: the records it stands for, and the one it shows, if one. */
export type RecordGroup = {
  start: string;
  end: string;
  /** Indices of the records it stands for, oldest first. */
  indices: number[];
  /** The record whose value it shows (the best), or null for an average of them all. */
  pick: number | null;
};

export type Thinned = {
  /** The bucket the records were grouped by, or null when every record is its own point. */
  bucket: Bucket | null;
  points: GraphDatum[];
  groups: RecordGroup[];
};

/**
 * A line a phone can still read (ADR 0042). Up to about sixty records, each is its own point;
 * past that, a line of hundreds of points is a band of ink, so the records are grouped by week,
 * or by month when there are too many weeks, and each group drawn as one point: its best record
 * (which still opens), or the average of them all, weighted where a record counts for more (a
 * run for its kilometres). The summary over the plot is still taken over every record.
 */
export function thinRecords(
  records: readonly GraphDatum[],
  range: GraphRange,
  {
    reduce,
    weights,
    limit = RECORDS_PER_LINE,
  }: {
    reduce: "max" | "min" | "mean";
    /** What each record counts for in a mean; one each when left out. */
    weights?: readonly number[];
    limit?: number;
  },
): Thinned {
  const known = records.filter((record) => record.value !== null).length;
  if (known <= limit)
    return {
      bucket: null,
      points: [...records],
      groups: records.map((record, index) => ({
        start: record.date,
        end: record.date,
        indices: [index],
        pick: index,
      })),
    };
  const bucket: Bucket = daysBetween(range.from, range.to) / 7 <= limit ? "week" : "month";
  const groups: RecordGroup[] = [];
  records.forEach((record, index) => {
    if (record.value === null) return;
    const start = bucketStart(record.date, bucket);
    const last = groups.at(-1);
    if (last?.start === start) last.indices.push(index);
    else groups.push({ start, end: bucketEnd(start, bucket), indices: [index], pick: null });
  });
  const points = groups.map((group) => {
    if (reduce === "mean") {
      let sum = 0;
      let weight = 0;
      for (const index of group.indices) {
        const w = weights?.[index] ?? 1;
        sum += records[index]!.value! * w;
        weight += w;
      }
      // An average stands in the middle of the days it covers, inside the range.
      const end = group.end < range.to ? group.end : range.to;
      const start = group.start > range.from ? group.start : range.from;
      return {
        date: addDays(start, Math.floor(daysBetween(start, end) / 2)),
        value: weight > 0 ? sum / weight : null,
      };
    }
    const pick = group.indices.reduce((best, index) =>
      reduce === "max"
        ? records[index]!.value! > records[best]!.value!
          ? index
          : best
        : records[index]!.value! < records[best]!.value!
          ? index
          : best,
    );
    group.pick = pick;
    return { date: records[pick]!.date, value: records[pick]!.value };
  });
  return { bucket, points, groups };
}

/** One mark of a pair of lines: its days, and each line's record there, or null. */
export type PairGroup<T> = {
  start: string;
  end: string;
  /** The first line's record and the second's: the best of its group's, when grouped. */
  picks: [T | null, T | null];
};

export type Paired<T> = {
  /** The bucket both lines were grouped by, or null when every day is its own mark. */
  bucket: Bucket | null;
  /** The first line's marks and the second's, on the same days, null where a line has none. */
  points: [GraphDatum[], GraphDatum[]];
  groups: PairGroup<T>[];
};

/**
 * Two lines on one axis, a head to head (ADR 0042): the days either line has a record on,
 * oldest first, each line holding null where it has none, which the graph runs straight across.
 * Past about sixty days, both lines are grouped by the same week or month, each line's best in
 * it standing in the middle of its days, so the two still share their marks. A line has one
 * record a day; given two, the better stands.
 */
export function pairLines<T extends { date: string; value: number }>(
  first: readonly T[],
  second: readonly T[],
  range: GraphRange,
  limit = RECORDS_PER_LINE,
): Paired<T> {
  const days = new Set([...first, ...second].map((record) => record.date));
  const bucket: Bucket | null =
    days.size <= limit ? null : daysBetween(range.from, range.to) / 7 <= limit ? "week" : "month";
  const groups = new Map<string, PairGroup<T>>();
  [first, second].forEach((line, side) => {
    for (const record of line) {
      const start = bucket ? bucketStart(record.date, bucket) : record.date;
      const group = groups.get(start) ?? {
        start,
        end: bucket ? bucketEnd(start, bucket) : start,
        picks: [null, null],
      };
      const held = group.picks[side];
      if (!held || record.value > held.value) group.picks[side] = record;
      groups.set(start, group);
    }
  });
  const ordered = [...groups.values()].sort((a, b) => (a.start < b.start ? -1 : 1));
  // A group's mark stands in the middle of the days it covers, inside the range.
  const dateOf = (group: PairGroup<T>) => {
    if (!bucket) return group.start;
    const end = group.end < range.to ? group.end : range.to;
    const start = group.start > range.from ? group.start : range.from;
    return addDays(start, Math.floor(daysBetween(start, end) / 2));
  };
  const line = (side: 0 | 1) =>
    ordered.map((group) => ({ date: dateOf(group), value: group.picks[side]?.value ?? null }));
  return { bucket, points: [line(0), line(1)], groups: ordered };
}
