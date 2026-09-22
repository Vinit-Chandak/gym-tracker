// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

import { Chart } from "./chart";

beforeAll(() => {
  // The chart measures its box after mount; jsdom has no layout to measure.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: (entries: { contentRect: { width: number } }[]) => void) {}
      observe() {
        this.callback([{ contentRect: { width: 320 } }]);
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
