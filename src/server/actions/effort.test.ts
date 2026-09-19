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
