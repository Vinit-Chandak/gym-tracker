// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { readExerciseHistoryAction } from "@/server/actions/sessions";

import { ExerciseHistory } from "./exercise-history";

vi.mock("@/server/actions/sessions", () => ({ readExerciseHistoryAction: vi.fn() }));

const EXERCISE = "00000000-0000-4000-8000-000000000001";
const CURRENT = "00000000-0000-4000-8000-000000000002";

function set(weight: number, reps: number) {
  return {
    setIndex: 0,
    setType: "working" as const,
    weight,
    unit: "kg" as const,
    reps,
    rir: 2,
    durationSeconds: null,
    distanceMeters: null,
  };
}

beforeEach(() => vi.mocked(readExerciseHistoryAction).mockReset());
afterEach(cleanup);

function renderHistory() {
  render(
    <ExerciseHistory
      exerciseId={EXERCISE}
      workoutExerciseId={CURRENT}
      loadPortability="global"
      preferredUnit="kg"
      timeZone="Europe/London"
    />,
  );
}

it("lists every earlier session of the exercise, not just the last one", async () => {
  vi.mocked(readExerciseHistoryAction).mockResolvedValue({
    more: false,
    entries: [
      {
        workoutExerciseId: "a",
        workoutSessionId: "s1",
        performedAt: "2026-09-20T09:00:00.000Z",
        gymName: "Home gym",
        equipmentName: null,
        sets: [set(80, 5)],
      },
      {
        workoutExerciseId: "b",
        workoutSessionId: "s2",
        performedAt: "2025-12-02T09:00:00.000Z",
        gymName: "City gym",
        equipmentName: "Rack 2",
        sets: [set(70, 6)],
      },
    ],
  });
  renderHistory();
  expect(screen.getByRole("status").textContent).toContain("Loading");
  expect(await screen.findByText("20 Sept 2026")).toBeTruthy();
  expect(screen.getByText("2 Dec 2025")).toBeTruthy();
  expect(screen.getByText("City gym · Rack 2")).toBeTruthy();
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(readExerciseHistoryAction).toHaveBeenCalledWith(EXERCISE, CURRENT);
});

it("says when there is nothing earlier, and offers a retry when the read fails", async () => {
  vi.mocked(readExerciseHistoryAction).mockRejectedValueOnce(new Error("offline"));
  vi.mocked(readExerciseHistoryAction).mockResolvedValueOnce({ entries: [], more: false });
  renderHistory();
  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
  expect(await screen.findByText("No earlier sessions of this exercise.")).toBeTruthy();
  expect(readExerciseHistoryAction).toHaveBeenCalledTimes(2);
});
