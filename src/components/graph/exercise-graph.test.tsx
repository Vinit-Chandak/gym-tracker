// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import type { GraphRange } from "@/domain/graph-range";
import { exerciseSessions, type ExerciseSetRow } from "@/domain/progress-graphs";

import { ExerciseGraph, type ExerciseGraphData } from "./exercise-graph";

const route = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/progress",
  useSearchParams: () => new URLSearchParams(route.search),
}));
vi.mock("@/server/actions/graph-range", () => ({ chooseGraphRangeAction: vi.fn() }));
vi.mock("@/components/ui/app-link", () => ({
  default: ({ prefetch: _prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a {...props} />
  ),
}));

afterEach(() => {
  cleanup();
  route.search = "";
});

const TODAY = "2026-10-07";
const RANGE: GraphRange = { preset: "3m", from: "2026-07-06", to: TODAY, bucket: "week" };

/** Three sets a workout, all at one setting: [day, kg, reps]. */
const rows = (workouts: [string, number, number][]): ExerciseSetRow[] =>
  workouts.flatMap(([date, weight, reps]) =>
    [0, 1, 2].map(() => ({
      sessionId: date,
      date,
      weight,
      reps,
      durationSeconds: null,
      distanceMeters: null,
    })),
  );

function draw(assisted: boolean, workouts: [string, number, number][]) {
  const data: ExerciseGraphData = {
    range: RANGE,
    options: [],
    selected: {
      id: "series",
      name: "Assisted pull-up (machine)",
      machine: "Assisted pull-up machine · Anytime Fitness",
      unit: "kg",
      modality: "machine",
      assisted,
      sessions: exerciseSessions(rows(workouts), "machine", "kg", { assisted }),
    },
  };
  return render(<ExerciseGraph data={data} today={TODAY} origin="history" length="m" />);
}

/** Each workout's point down the plot, oldest first: a smaller number stands higher. */
const heights = (container: HTMLElement) =>
  [...container.querySelectorAll(".graph-plot svg circle")]
    .map((circle) => ({
      x: Number(circle.getAttribute("cx")),
      y: Number(circle.getAttribute("cy")),
    }))
    .sort((a, b) => a.x - b.x)
    .map((point) => point.y);

it("draws an assisted machine's least help as its best, higher as the help comes down", () => {
  // 40 kg of help in September, 25 kg in October: the athlete got stronger.
  const { container } = draw(true, [
    ["2026-09-01", 40, 8],
    ["2026-10-01", 25, 8],
  ]);
  const readout = within(container.querySelector(".graph-readout") as HTMLElement);
  expect(readout.getByText("Least assistance")).toBeTruthy();
  expect(readout.getByText("25")).toBeTruthy();
  // Weight and reps to choose between, the weight named for what it is; help is not volume.
  const measures = screen.getByRole("radiogroup", { name: "Measure" });
  expect(
    within(measures)
      .getAllByRole("radio")
      .map((radio) => radio.getAttribute("aria-label")),
  ).toEqual(["Least assistance", "Max reps"]);
  const [september, october] = heights(container);
  expect(october!).toBeLessThan(september!);
});

it("keeps the heaviest as the best where the weight is load", () => {
  const { container } = draw(false, [
    ["2026-09-01", 40, 8],
    ["2026-10-01", 25, 8],
  ]);
  const readout = within(container.querySelector(".graph-readout") as HTMLElement);
  expect(readout.getByText("Heaviest set")).toBeTruthy();
  expect(readout.getByText("40")).toBeTruthy();
  const [september, october] = heights(container);
  expect(september!).toBeLessThan(october!);
});

it("counts reps on whole lines", () => {
  route.search = "measure=maxReps";
  const { container } = draw(false, [
    ["2026-08-03", 50, 6],
    ["2026-08-24", 50, 8],
    ["2026-09-14", 50, 10],
    ["2026-10-05", 50, 12],
  ]);
  expect(
    within(container.querySelector(".graph-readout") as HTMLElement).getByText(
      "Most reps in a set",
    ),
  ).toBeTruthy();
  const scale = [...container.querySelectorAll(".graph-plot svg text")]
    .map((text) => text.textContent ?? "")
    .filter((label) => /^\d+(\.\d+)?$/.test(label));
  expect(scale.length).toBeGreaterThan(0);
  expect(scale.every((label) => Number.isInteger(Number(label)))).toBe(true);
});
