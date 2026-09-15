// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

import { Chart } from "./chart";

beforeAll(() => {
  // The chart measures its box after mount; jsdom has no layout to measure.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(cleanup);

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
