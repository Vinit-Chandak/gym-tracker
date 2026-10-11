// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { allRange, presetRange } from "@/domain/graph-range";
import { emptyMuscleVolume } from "@/domain/muscle-volume";
import { foodGraph, recoveryGraph, runningGraph, strengthGraph } from "@/domain/progress-graphs";

import type { ProgressData } from "./progress-types";
import { ProgressView } from "./progress-view";

const route = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
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

const TODAY = "2026-10-08";
const MONTH = presetRange("1m", TODAY);

/** Nothing logged, in a month: enough for any one section to be drawn. */
const data: ProgressData = {
  today: TODAY,
  rangeError: null,
  weekError: null,
  preset: "1m",
  month: { month: "2026-10", today: 8, activities: [] },
  overview: { latest: [] },
  strength: { range: MONTH, graph: strengthGraph([], MONTH, TODAY), unit: "kg" },
  exercise: { range: MONTH, options: [], selected: null },
  running: { range: MONTH, graph: runningGraph([], MONTH, TODAY), truncated: false },
  food: {
    range: MONTH,
    graph: foodGraph([], MONTH, TODAY),
    targets: { kcal: null, protein: null },
  },
  body: { range: MONTH, points: [{ date: "2026-10-04", value: 76.8 }], unit: "kg" },
  muscles: { from: "2026-10-05", to: "2026-10-11", volume: emptyMuscleVolume(), totalSets: 0 },
  recovery: { range: MONTH, graph: recoveryGraph([], MONTH, TODAY) },
};

it("draws Body weight on the span every graph shares, its dates and the funnel beside it", () => {
  route.search = "view=body";
  render(<ProgressView data={data} />);
  expect(screen.getByRole("button", { name: "Progress section: Body weight" })).toBeTruthy();
  expect(screen.getByText("9 Sept – 8 Oct 2026")).toBeTruthy();
  expect(screen.getByRole("button", { name: /^Filters/ })).toBeTruthy();
  expect(screen.getByText("76.8")).toBeTruthy();
  // The body map is a section of its own now.
  expect(screen.queryByRole("button", { name: "Previous week" })).toBeNull();
});

it("names Strength's dates as its graph draws them: the exercise's own under All", () => {
  // Lifting since March 2025; the Romanian deadlift only since June 2026.
  const all = allRange("2025-03-03", TODAY);
  const exercise = allRange("2026-06-10", TODAY);
  const drawn: ProgressData = {
    ...data,
    preset: "all",
    strength: { range: all, graph: strengthGraph([], all, TODAY), unit: "kg" },
    exercise: {
      range: exercise,
      options: [
        { id: "rdl", name: "Romanian deadlift", machine: "Across gyms", unit: "kg", group: "legs" },
      ],
      selected: {
        id: "rdl",
        name: "Romanian deadlift",
        machine: "Across gyms",
        unit: "kg",
        modality: "barbell",
        assisted: false,
        sessions: [],
      },
    },
  };
  route.search = "view=strength";
  render(<ProgressView data={drawn} />);
  // No exercise in the URL: the muscle groups' volume, over every lift.
  expect(screen.getByText("1 Mar 2025 – 8 Oct 2026")).toBeTruthy();
  cleanup();
  route.search = "view=strength&series=rdl";
  render(<ProgressView data={drawn} />);
  expect(screen.getByText("8 Jun – 8 Oct 2026")).toBeTruthy();
});

it("draws Muscles on its own week, with no span and no custom dates to choose", () => {
  route.search = "view=muscles";
  render(<ProgressView data={data} />);
  expect(screen.getByRole("button", { name: "Progress section: Muscles" })).toBeTruthy();
  expect(screen.getByText("This week")).toBeTruthy();
  expect(screen.queryByText("9 Sept – 8 Oct 2026")).toBeNull();
  expect(screen.queryByRole("button", { name: /^Filters/ })).toBeNull();
});

it("says a week it could not read only on Muscles, and dates only where a span is drawn", () => {
  const unread = {
    ...data,
    rangeError: "Choose a date range of up to one year, with From before To.",
    weekError: "That week is not a valid date. Showing this week instead.",
  };
  route.search = "view=muscles";
  render(<ProgressView data={unread} />);
  expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
    unread.weekError,
  ]);
  cleanup();
  route.search = "view=body";
  render(<ProgressView data={unread} />);
  expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
    unread.rangeError,
  ]);
  cleanup();
  // Overview draws nothing over dates or weeks (ADR 0045), so it says neither.
  route.search = "";
  render(<ProgressView data={unread} />);
  expect(screen.queryByRole("alert")).toBeNull();
});
