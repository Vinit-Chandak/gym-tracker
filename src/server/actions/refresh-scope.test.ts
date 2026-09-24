import { beforeEach, expect, it, vi } from "vitest";

/**
 * What each action tells the browser to throw away (ADR 0030). The tabs keep their screens for a
 * minute, so an action that changes what a tab shows must clear that copy; one that only
 * refreshes must not also discard every prefetched loading screen. A set does neither: the
 * browser takes it from the reply (`lib/set-changes.ts`).
 */
const USER = "00000000-0000-4000-8000-000000000001";
const mocks = vi.hoisted(() => ({
  withUser: vi.fn(),
  revalidatePath: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/db/with-user", () => ({ withUser: mocks.withUser }));
vi.mock("@/server/auth", () => ({
  requireUser: async () => ({ id: USER }),
  requireProfiledUser: async () => ({ id: USER }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath, refresh: mocks.refresh }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), unstable_rethrow: vi.fn() }));

import { startRoutineAction } from "./manual-training";
import { refreshScreenAction } from "./refresh";
import { deleteSetAction, logSetAction, setExerciseCompletedAction } from "./sessions";

beforeEach(() => vi.resetAllMocks());

const set = {
  id: "00000000-0000-4000-8000-000000000003",
  setIndex: 1,
  setType: "working" as const,
  weight: 60,
  unit: "kg" as const,
  reps: 5,
  rir: 2,
  rpe: null,
  effortReported: true,
  durationSeconds: null,
  distanceMeters: null,
  completedAt: new Date("2026-09-23T10:00:00Z"),
};

it("saves a set without rendering the workout again or discarding any screen", async () => {
  mocks.withUser.mockResolvedValue(set);
  const result = await logSetAction({
    effortInputVersion: 2,
    workoutExerciseId: "00000000-0000-4000-8000-000000000002",
    setIndex: 1,
    setType: "working",
    weight: 60,
    reps: 5,
    rir: 2,
    durationSeconds: null,
  });
  expect(result).toEqual({
    ok: true,
    set: { ...set, completedAt: "2026-09-23T10:00:00.000Z" },
  });
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

it("does the same when a set is deleted", async () => {
  mocks.withUser.mockResolvedValue(undefined);
  await expect(deleteSetAction("00000000-0000-4000-8000-000000000002", 1)).resolves.toEqual({
    ok: true,
  });
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

it("still re-renders the workout when an exercise changes, keeping prefetched screens", async () => {
  mocks.withUser.mockResolvedValue(undefined);
  await expect(
    setExerciseCompletedAction("00000000-0000-4000-8000-000000000002", true),
  ).resolves.toEqual({ ok: true });
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

it("renders a screen shown from an older copy again, keeping prefetched screens", async () => {
  await refreshScreenAction();
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

it("clears Today and Training once a routine has started a workout", async () => {
  mocks.withUser.mockResolvedValue({ sessionId: "00000000-0000-4000-8000-000000000004" });
  const result = await startRoutineAction(
    "00000000-0000-4000-8000-000000000005",
    "00000000-0000-4000-8000-000000000006",
  );
  expect(result).toMatchObject({ ok: true });
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/today");
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/training");
});

it("leaves the screens alone when a routine could not start", async () => {
  mocks.withUser.mockRejectedValue(new Error("boom"));
  const result = await startRoutineAction(
    "00000000-0000-4000-8000-000000000005",
    "00000000-0000-4000-8000-000000000006",
  );
  expect(result).toMatchObject({ ok: false });
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});
