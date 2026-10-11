import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/server/auth", () => ({
  requireUser: async () => ({ id: "00000000-0000-4000-8000-000000000001" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { logSetAction } from "./sessions";

beforeEach(() => vi.resetAllMocks());

it("rejects an old workout screen's possibly auto-filled effort before writing", async () => {
  const result = await logSetAction({
    workoutExerciseId: "00000000-0000-4000-8000-000000000002",
    setIndex: 1,
    setType: "working",
    weight: 60,
    reps: 5,
    rir: 2,
    durationSeconds: null,
  });
  expect(result).toEqual({ ok: false, error: expect.stringMatching(/Reload the workout page/) });
  expect(mocks.getDb).not.toHaveBeenCalled();
});

it("requires actual RIR even from a current screen", async () => {
  const result = await logSetAction({
    effortInputVersion: 2,
    workoutExerciseId: "00000000-0000-4000-8000-000000000002",
    setIndex: 1,
    setType: "working",
    weight: 60,
    reps: 5,
    rir: null,
    durationSeconds: null,
  });
  expect(result).toEqual({ ok: false, error: expect.stringMatching(/Enter RIR/) });
  expect(mocks.getDb).not.toHaveBeenCalled();
});

it("refuses an effort off its scale in the app's own words, never the validator's", async () => {
  const set = {
    effortInputVersion: 2,
    workoutExerciseId: "00000000-0000-4000-8000-000000000002",
    setIndex: 1,
    weight: null,
    reps: null,
    rir: null,
    durationSeconds: 45,
  };
  // A plank's RPE of 0, typed: as a working set, and as a warm-up, where effort is optional.
  for (const setType of ["working", "warmup"] as const)
    expect(await logSetAction({ ...set, setType, rpe: 0 })).toEqual({
      ok: false,
      error: "Enter effort from 1 (very easy) to 10 (maximal).",
    });
  expect(await logSetAction({ ...set, setType: "working", rpe: 7, durationSeconds: -5 })).toEqual({
    ok: false,
    error: "Enter seconds from 0 to 36000.",
  });
  expect(mocks.getDb).not.toHaveBeenCalled();
});
