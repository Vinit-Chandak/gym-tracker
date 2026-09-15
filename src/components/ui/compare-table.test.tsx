// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { chartSegments } from "./chart";
import { CompareTable, percentLabel } from "./compare-table";

afterEach(cleanup);

const names: [string, string] = ["Vinit", "Phani"];

it("puts the two people across the top and says the difference from the viewer's side", () => {
  render(
    <CompareTable
      names={names}
      rows={[
        {
          key: "volume",
          label: "Total volume",
          a: { value: 6240, text: "6,240 kg" },
          b: { value: 5200, text: "5,200 kg" },
        },
      ]}
    />,
  );
  const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
  expect(headers).toEqual(["Metric", "You", "Phani"]);
  expect(screen.getByText("+20%").className).toContain("text-success");
  // The leading value is the heavier one.
  expect(screen.getByText("6,240 kg").className).toContain("font-semibold");
  expect(screen.getByText("5,200 kg").className).not.toContain("font-semibold");
});

it("reads a dash for the percentage and mutes the side that has nothing", () => {
  render(
    <CompareTable
      names={names}
      rows={[
        {
          key: "records",
          label: "Records set",
          a: { value: 3, text: "3" },
          b: { value: null, text: "0" },
        },
      ]}
    />,
  );
  expect(screen.getByText("—")).toBeTruthy();
  expect(screen.getByText("0").className).toContain("text-ink-muted");
});

it("puts the day, the work and the body-weight ratio under a value", () => {
  render(
    <CompareTable
      names={names}
      rows={[
        {
          key: "top_weight",
          label: "Top weight",
          a: { value: 88, text: "88 kg", sub: ["4 × 12", "8 Sept 2026", "1.18× BW"] },
          b: { value: 85, text: "85 kg", sub: ["1 Sept 2026"] },
        },
      ]}
    />,
  );
  expect(screen.getByText("4 × 12")).toBeTruthy();
  expect(screen.getByText("1.18× BW")).toBeTruthy();
  expect(screen.getByText("+3.5%")).toBeTruthy();
});

it("labels equal and behind without colour, and lets a faster pace lead", () => {
  expect(percentLabel({ leader: null, percent: 0 })).toBe("=");
  expect(percentLabel({ leader: "b", percent: -16.7 })).toBe("−16.7%");
  render(
    <CompareTable
      names={names}
      rows={[
        {
          key: "workouts",
          label: "Workouts",
          a: { value: 5, text: "5" },
          b: { value: 6, text: "6" },
        },
        {
          key: "best_pace",
          label: "Best pace",
          lowerIsBetter: true,
          a: { value: 330, text: "5:30 /km" },
          b: { value: 360, text: "6:00 /km" },
        },
      ]}
    />,
  );
  expect(screen.getByText("−16.7%").className).toContain("text-ink-muted");
  expect(screen.getByText("−8.3%").className).toContain("text-success");
  expect(screen.getByText("5:30 /km").className).toContain("font-semibold");
});

it("bridges a gap only when asked", () => {
  const points = [
    { date: "2026-09-01", value: 80 },
    { date: "2026-09-03", value: null },
    { date: "2026-09-08", value: 82 },
  ];
  expect(chartSegments(points)).toEqual([[{ i: 0, value: 80 }], [{ i: 2, value: 82 }]]);
  expect(chartSegments(points, true)).toEqual([
    [
      { i: 0, value: 80 },
      { i: 2, value: 82 },
    ],
  ]);
});
