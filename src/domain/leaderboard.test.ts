import { describe, expect, it } from "vitest";

import { activityValue, boardMetricsForExercise, perKgBase, rank, topWithYou } from "./leaderboard";

const rows = [
  { key: "vinit", value: 12 },
  { key: "phani", value: 15 },
  { key: "sam", value: null },
  { key: "alex", value: 12 },
  { key: "jo", value: 3 },
];

describe("rank", () => {
  it("orders best first, shares a rank on a tie and skips what the tie took", () => {
    expect(rank(rows).map((row) => [row.key, row.rank])).toEqual([
      ["phani", 1],
      ["vinit", 2],
      ["alex", 2],
      ["jo", 4],
      ["sam", null],
    ]);
  });

  it("keeps the order given among ties and in the no-data tail", () => {
    const board = rank([
      { key: "b", value: null },
      { key: "a", value: null },
      { key: "d", value: 5 },
      { key: "c", value: 5 },
    ]);
    expect(board.map((row) => row.key)).toEqual(["d", "c", "b", "a"]);
    expect(board.map((row) => row.rank)).toEqual([1, 1, null, null]);
  });

  it("ranks a zero, since a person who trained and set no records is not absent", () => {
    expect(
      rank([
        { key: "a", value: 0 },
        { key: "b", value: null },
      ]),
    ).toEqual([
      { key: "a", value: 0, rank: 1 },
      { key: "b", value: null, rank: null },
    ]);
  });

  it("turns the order around for a metric that improves downwards", () => {
    expect(
      rank(
        [
          { key: "slow", value: 340 },
          { key: "fast", value: 300 },
        ],
        true,
      ).map((r) => r.key),
    ).toEqual(["fast", "slow"]);
  });

  it("is empty for nobody", () => {
    expect(rank([])).toEqual([]);
  });
});

describe("topWithYou", () => {
  const board = rank(rows);

  it("is the top when you are in it", () => {
    expect(topWithYou(board, "vinit", 3).map((r) => r.key)).toEqual(["phani", "vinit", "alex"]);
  });

  it("adds your row after the top when you are outside it, ranked or not", () => {
    expect(topWithYou(board, "jo", 3).map((r) => r.key)).toEqual(["phani", "vinit", "alex", "jo"]);
    expect(topWithYou(board, "sam", 3).map((r) => [r.key, r.rank])).toEqual([
      ["phani", 1],
      ["vinit", 2],
      ["alex", 2],
      ["sam", null],
    ]);
  });

  it("is just the top when you are not on the board at all", () => {
    expect(topWithYou(board, "nobody", 2).map((r) => r.key)).toEqual(["phani", "vinit"]);
  });
});

describe("activityValue", () => {
  it("reads each metric off a period's totals", () => {
    const totals = {
      sessions: 4,
      durationSeconds: 3600,
      volumeKg: 6240,
      workingSets: 60,
      activeDays: 3,
      records: 2,
    };
    expect(activityValue(totals, "workouts")).toBe(4);
    expect(activityValue(totals, "workout_time")).toBe(3600);
    expect(activityValue(totals, "volume")).toBe(6240);
    expect(activityValue(totals, "working_sets")).toBe(60);
    expect(activityValue(totals, "active_days")).toBe(3);
    expect(activityValue(totals, "records")).toBe(2);
  });
});

describe("boardMetricsForExercise", () => {
  const bench = { modality: "barbell", defaultPrescriptionType: "reps" } as const;
  const plank = { modality: "bodyweight", defaultPrescriptionType: "duration" } as const;

  it("is the movement's own metrics, primary first, without body weight", () => {
    expect(boardMetricsForExercise(bench, false)).toEqual([
      "e1rm",
      "top_weight",
      "best_set_volume",
      "most_reps",
    ]);
  });

  it("adds a per-kg variant for each load the movement is measured by", () => {
    expect(boardMetricsForExercise(bench, true)).toEqual([
      "e1rm",
      "top_weight",
      "best_set_volume",
      "most_reps",
      "e1rm_per_kg",
      "top_weight_per_kg",
    ]);
    expect(boardMetricsForExercise(plank, true)).toEqual([
      "longest_hold",
      "top_weight",
      "top_weight_per_kg",
    ]);
  });

  it("names the load a per-kg metric divides", () => {
    expect(perKgBase("e1rm_per_kg")).toBe("e1rm");
    expect(perKgBase("top_weight_per_kg")).toBe("top_weight");
    expect(perKgBase("most_reps")).toBeNull();
  });
});
