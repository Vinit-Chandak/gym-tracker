// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

import { Chart, labelIndices, niceTicks } from "./chart";

// The chart measures its box after mount; jsdom has no layout, so the observer reports a
// width of its own and the plot is drawn as it would be on a phone.
const PLOT_WIDTH = 480;
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(
        private readonly notify: (entries: { contentRect: { width: number } }[]) => void,
      ) {}
      observe() {
        this.notify([{ contentRect: { width: PLOT_WIDTH } }]);
      }
      disconnect() {}
    },
  );
});

it("draws readings after switching from an empty metric without remounting", () => {
  const view = render(
    <Chart
      title="Sleep"
      unit="hours"
      series={[{ name: "Check-in", color: "red", points: [{ date: "2026-09-22", value: null }] }]}
    />,
  );
  expect(screen.queryByRole("img")).toBeNull();
  view.rerender(
    <Chart
      title="Energy"
      unit="1–5"
      series={[{ name: "Check-in", color: "red", points: [{ date: "2026-09-22", value: 4 }] }]}
    />,
  );
  expect(screen.getByRole("img", { name: /Energy, 1 observations/ })).toBeTruthy();
  view.rerender(<Chart title="Energy" unit="1–5" series={[]} />);
  expect(screen.queryByRole("img")).toBeNull();
  view.rerender(
    <Chart
      title="Energy"
      unit="1–5"
      series={[{ name: "Check-in", color: "red", points: [{ date: "2026-09-22", value: 5 }] }]}
    />,
  );
  expect(screen.getByRole("img", { name: /Energy, 1 observations/ })).toBeTruthy();
});
afterEach(cleanup);

it("keeps recovery ratings on the 1–5 scale and labels a single date once", () => {
  render(
    <Chart
      title="Energy"
      unit="1–5"
      valueRange={{ min: 1, max: 5 }}
      series={[{ name: "Check-in", color: "red", points: [{ date: "2026-09-22", value: 4 }] }]}
    />,
  );
  const svg = screen.getByRole("img");
  expect([...svg.querySelectorAll("text")].map((node) => node.textContent)).toEqual([
    "1",
    "2",
    "3",
    "4",
    "5",
    "22/9",
  ]);
});

it("puts the same numbers in a table a screen reader can read, newest first", () => {
  render(
    <Chart
      title="Est. 1RM"
      unit="kg"
      bridgeGaps
      series={[
        {
          name: "Vinit",
          color: "var(--color-series-1)",
          points: [
            { date: "2026-09-01", value: 80 },
            { date: "2026-09-03", value: null },
            { date: "2026-09-08", value: 82 },
          ],
        },
        {
          name: "Phani",
          color: "var(--color-series-2)",
          points: [
            { date: "2026-09-01", value: null },
            { date: "2026-09-03", value: 70 },
            { date: "2026-09-08", value: 72 },
          ],
        },
      ]}
    />,
  );
  expect(screen.getByText("View values").closest("summary")!.textContent).toBe(
    "View values for Est. 1RM",
  );
  expect(screen.getByRole("table", { name: "Est. 1RM by date, newest first" })).toBeTruthy();
  expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
    "Date",
    "Vinit",
    "Phani",
  ]);
  expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual([
    "8 Sept 2026",
    "3 Sept 2026",
    "1 Sept 2026",
  ]);
  // A day one person did not train reads as a dash in their column, never as a zero.
  expect(screen.getAllByRole("cell").map((c) => c.textContent)).toEqual([
    "82",
    "72",
    "—",
    "70",
    "80",
    "—",
  ]);
});

it("runs the axis past the tallest mark, so nothing floats above the top line", () => {
  // Twelve working sets used to sit above an axis that stopped at ten.
  expect(niceTicks(0, 12, 4, true)).toEqual([0, 5, 10, 15]);
  expect(niceTicks(0, 6, 4, true)).toEqual([0, 2, 4, 6]);
  expect(niceTicks(82.5, 92.5, 4)).toEqual([82.5, 85, 87.5, 90, 92.5]);
  for (const [min, max] of [
    [0, 38],
    [0, 1],
    [3, 3.4],
    [-4, 9],
  ] as const)
    expect(niceTicks(min, max, 4).at(-1)!).toBeGreaterThanOrEqual(max);
});

it("labels as many dates as fit, and always the last one", () => {
  // Thirteen weekly columns across a phone-width plot.
  expect(labelIndices([0, 30, 60, 90, 120, 150, 180], 44)).toEqual([0, 2, 4, 6]);
  // The final label wins a collision: the one before it is dropped, never the end of the axis.
  expect(labelIndices([0, 50, 60], 44)).toEqual([0, 2]);
  expect(labelIndices([0], 44)).toEqual([0]);
  expect(labelIndices([], 44)).toEqual([]);
});

it("says which observation is still in progress wherever its numbers are read", () => {
  render(
    <Chart
      title="Sessions"
      unit="sessions"
      kind="bar"
      series={[
        {
          name: "Runs",
          color: "var(--color-series-2)",
          points: [
            { date: "2026-09-07", value: 5 },
            { date: "2026-09-14", value: 6 },
            { date: "2026-09-21", value: 1, partial: true },
          ],
        },
      ]}
    />,
  );
  expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual([
    "21 Sept 2026 · so far",
    "14 Sept 2026",
    "7 Sept 2026",
  ]);
  expect(screen.getByRole("img", { name: /still in progress/ })).toBeTruthy();
});

it("keeps every column inside the plot, first and last included", () => {
  const { container } = render(
    <Chart
      title="Working sets"
      unit="sets"
      kind="bar"
      series={[
        {
          name: "Sets",
          color: "var(--color-series-1)",
          points: ["2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27"].map((date, i) => ({
            date,
            value: 8 + i,
          })),
        },
      ]}
    />,
  );
  // PAD.left and PAD.right from the component: the gutter the y-axis labels sit in, and
  // the right-hand margin. A point scale put half of the first column over the former and
  // half of the last over the latter.
  const [left, right] = [40, PLOT_WIDTH - 12];
  const bars = [...container.querySelectorAll("rect")];
  expect(bars).toHaveLength(4);
  for (const bar of bars) {
    const x = Number(bar.getAttribute("x"));
    expect(x).toBeGreaterThanOrEqual(left);
    expect(x + Number(bar.getAttribute("width"))).toBeLessThanOrEqual(right);
  }
});
