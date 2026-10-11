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
  today: "2026-10-11",
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
  expect(stat.textContent).toBe("Least assistance15 kg");
  // The session's lightest help, and of it the most reps, not the 20 kg it started with; read
  // as the help it is, as the workout reads it.
  expect(screen.getByText("15 kg assistance × 8")).toBeTruthy();
  expect(screen.queryByText("Top weight")).toBeNull();
});

it("shows any other machine's heaviest", () => {
  render(<ExerciseLife {...props(false)} />);
  expect(screen.getByText("Top weight").closest("div")!.textContent).toBe("Top weight40 kg");
  expect(screen.getByText("20 kg × 8")).toBeTruthy();
});

it("says what its figures and its latest sessions are read on, and lists other machines apart", () => {
  const lat = { ...assistedPullUp, name: "Lat pulldown" };
  render(
    <ExerciseLife
      {...props(false)}
      exercise={lat}
      machineName="Lat pulldown"
      performances={[
        // 42.5 kg twice: the row leads with the better of the two.
        performance("17-sept", "2026-09-17T08:00:00Z", [
          [40, 13],
          [42.5, 10],
          [42.5, 11],
        ]),
      ]}
      elsewhere={[
        { ...performance("7-oct", "2026-10-07T08:00:00Z", [[17.5, 12]]), machineName: null },
      ]}
    />,
  );
  // The figures are every session's on the machine chosen over the graph, and say so.
  expect(screen.getByRole("heading", { name: "All time on Lat pulldown" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Latest on Lat pulldown" })).toBeTruthy();
  expect(screen.getByText("42.5 kg × 11")).toBeTruthy();
  // Another machine's session is in view, never as this machine's.
  expect(screen.getByRole("heading", { name: "Latest on other machines" })).toBeTruthy();
  // The machine is kept whole, its dot with it, if the line wraps.
  expect(screen.getByText("· Unrecorded machine").previousSibling?.textContent).toBe(" ");
  expect(screen.getByText("· Unrecorded machine").parentElement?.textContent).toBe(
    "Wed 7\u00a0Oct ·\u00a0Unrecorded machine",
  );
});

it("names a machine called after its kind once", () => {
  const smithBench = { ...assistedPullUp, modality: "smith_machine" } as const;
  render(<ExerciseLife {...props(false)} exercise={smithBench} machineName="Smith machine" />);
  expect(screen.getAllByText("Smith machine")).toHaveLength(1);
});

it("reads a free-weight lift's records as all time, across gyms", () => {
  render(
    <ExerciseLife
      {...props(false)}
      exercise={{ ...assistedPullUp, modality: "barbell", loadPortability: "global" }}
      machineName={null}
    />,
  );
  expect(screen.getByRole("heading", { name: "All time, across gyms" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Latest" })).toBeTruthy();
});

it("names the year of a session in another year, and not of one this year", () => {
  render(
    <ExerciseLife
      {...props(false)}
      performances={[
        performance("this-year", "2026-09-10T08:00:00Z", [[20, 8]]),
        performance("last-year", "2025-10-13T08:00:00Z", [[17.5, 8]]),
      ]}
    />,
  );
  expect(screen.getByText("Thu 10 Sept")).toBeTruthy();
  // 13 October is a Tuesday this year: last year's Monday says which year it was.
  expect(screen.getByText("Mon 13 Oct 2025")).toBeTruthy();
});

it("says a bodyweight set as the body, not as nothing lifted", () => {
  render(
    <ExerciseLife
      {...props(false)}
      exercise={{ ...assistedPullUp, modality: "bodyweight", loadPortability: "global" }}
      machineName={null}
      performances={[
        performance("dips", "2026-09-10T08:00:00Z", [
          [0, 14],
          [0, 12],
        ]),
      ]}
    />,
  );
  expect(screen.getByText("Bodyweight × 14")).toBeTruthy();
  expect(screen.queryByText(/0 kg/)).toBeNull();
});
