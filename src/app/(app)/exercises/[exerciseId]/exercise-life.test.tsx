// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ExerciseLife, type LatestPerformance } from "./exercise-life";

// Rows in long lists prefetch on touch, through the router (app-link.tsx).
vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch: vi.fn() }) }));

afterEach(cleanup);

const assistedPullUp = {
  id: "assisted-pull-up",
  name: "Assisted pull-up (machine)",
  modality: "machine",
  defaultPrescriptionType: "reps",
  loadPortability: "equipment_specific",
} as const;

/** One session on the machine, a working set per [weight, reps]. */
const performance = (id: string, performedAt: string, sets: [number, number][]) =>
  ({
    id,
    sessionId: `session-${id}`,
    performedAt,
    gymName: "Gym",
    machineName: "Assisted pull-up machine",
    sets: sets.map(([weight, reps], index) => ({
      setIndex: index + 1,
      setType: "working",
      weight,
      unit: "kg",
      reps,
      rir: 2,
      durationSeconds: null,
      distanceMeters: null,
    })),
  }) satisfies LatestPerformance;

const props = (assisted: boolean) => ({
  exercise: assistedPullUp,
  // The graph is Progress's own, tested with it (exercise-graph.test.tsx).
  graph: null,
  life: {
    months: [
      { month: "2026-01", topKg: 40 },
      { month: "2026-09", topKg: 15 },
    ],
    sessions: 12,
    assisted,
  },
  machineName: "Assisted pull-up machine",
  bests: [],
  unit: "kg" as const,
  timeZone: "UTC",
  performances: [
    performance("september", "2026-09-10T08:00:00Z", [
      [20, 8],
      [15, 8],
      [15, 6],
    ]),
  ],
});

it("shows an assisted machine's least help as its best, and leads each session with it", () => {
  render(<ExerciseLife {...props(true)} />);
  const stat = screen.getByText("Least assistance").closest("div")!;
  // The unit is a word apart from its figure, never "15kg".
  expect(stat.textContent).toBe("Least assistance15 kg");
  // The session's lightest help, not the 20 kg it started with, said as help rather than load.
  expect(screen.getByText("15 kg assistance × 8")).toBeTruthy();
  expect(
    screen.getByText("20 kg assistance × 8, 15 kg assistance × 8, 15 kg assistance × 6"),
  ).toBeTruthy();
  expect(screen.queryByText("Top weight")).toBeNull();
});

it("shows any other machine's heaviest", () => {
  render(<ExerciseLife {...props(false)} />);
  expect(screen.getByText("Top weight").closest("div")!.textContent).toBe("Top weight40 kg");
  expect(screen.getByText("20 kg × 8")).toBeTruthy();
});

it("says a bodyweight set with nothing added as the body, never as 0 kg", () => {
  render(
    <ExerciseLife
      {...props(false)}
      exercise={{
        modality: "bodyweight",
        defaultPrescriptionType: "reps",
        loadPortability: "global",
      }}
      machineName={null}
      performances={[
        { ...performance("october", "2026-10-09T08:00:00Z", [[0, 8]]), machineName: null },
        {
          ...performance("september", "2026-09-10T08:00:00Z", [
            [0, 8],
            [10, 5],
          ]),
          machineName: null,
        },
      ]}
    />,
  );
  // October's one set leads its row and is its line.
  expect(screen.getAllByText("Bodyweight × 8")).toHaveLength(2);
  expect(screen.queryByText(/(^|[^\d])0 kg/)).toBeNull();
  // Anything added is still the load it was, and the heavier set leads.
  expect(screen.getByText("10 kg × 5")).toBeTruthy();
  expect(screen.getByText("Bodyweight × 8, 10 kg × 5")).toBeTruthy();
});
