import { expect, it } from "vitest";

import { finishSummary, type FinishWorkout } from "./summary";

const SQUAT = "00000000-0000-4000-8000-000000000001";
const PRESS = "00000000-0000-4000-8000-000000000002";
const USER = "00000000-0000-4000-8000-00000000000a";
const started = new Date("2026-09-30T06:00:00Z");

const set = (weight: number, reps: number, setType: "working" | "warmup" = "working") => ({
  setType,
  weight,
  unit: "kg" as const,
  reps,
  durationSeconds: null,
  distanceMeters: null,
});

const slot = (
  exerciseId: string,
  name: string,
  userId: string | null,
  sets: ReturnType<typeof set>[],
) => ({
  exerciseId,
  exercise: {
    name,
    userId,
    modality: "barbell" as const,
    loadPortability: "global" as const,
    defaultPrescriptionType: "reps" as const,
    primaryMuscles: ["quads" as const],
    secondaryMuscles: [],
  },
  sets,
});

const workout: FinishWorkout = {
  id: "session",
  startedAt: started,
  completedAt: null,
  day: { name: "Lower A" },
  exercises: [
    slot(SQUAT, "Back squat", null, [set(40, 10, "warmup"), set(100, 5), set(105, 5)]),
    // Someone's own movement counts towards the volume and is never a record.
    slot(PRESS, "My press", USER, [set(50, 8)]),
  ],
};

it("counts what finishing now would record: working sets, volume, time and records", () => {
  // The press is someone's own movement: it has bests on file and is still never a record.
  const previous = new Map([
    [SQUAT, { top_weight: 100 }],
    [PRESS, { top_weight: 10 }],
  ]);
  const summary = finishSummary(workout, new Date(started.getTime() + 50 * 60_000), previous);
  // Warm-ups are not working sets and add no volume.
  expect(summary.workingSets).toBe(3);
  expect(summary.volumeKg).toBe(100 * 5 + 105 * 5 + 50 * 8);
  expect(summary.durationSeconds).toBe(50 * 60);
  // A heavier top weight than any earlier session is a record, named for the reader.
  expect(summary.records).toEqual([
    {
      exerciseId: SQUAT,
      exerciseName: "Back squat",
      label: "Top weight",
      metric: "top_weight",
      value: 105,
    },
  ]);
});

it("announces nothing for a movement with no earlier session", () => {
  const summary = finishSummary(workout, new Date(), new Map());
  expect(summary.records).toEqual([]);
});
