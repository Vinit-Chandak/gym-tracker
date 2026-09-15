// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { chartSegments } from "./chart";
import { CompareBar, percentLabel } from "./compare-bars";

afterEach(cleanup);

it("scales both bars to the larger value and says the difference from the viewer's side", () => {
  const { container } = render(
    <CompareBar
      label="Total volume"
      names={["Vinit", "Phani"]}
      a={{ value: 6240, text: "6,240 kg" }}
      b={{ value: 5200, text: "5,200 kg" }}
    />,
  );
  const bars = [...container.querySelectorAll<HTMLElement>("span[style]")];
  expect(bars.map((bar) => bar.style.width)).toEqual(["100%", "83.33333333333334%"]);
  expect(screen.getByText("+20%").className).toContain("text-success");
  expect(screen.getByText("6,240 kg")).toBeTruthy();
});

it("draws no bar and reads a dash when the friend's side is missing", () => {
  const { container } = render(
    <CompareBar
      label="Records set"
      names={["Vinit", "Phani"]}
      a={{ value: 3, text: "3" }}
      b={{ value: null, text: "0" }}
    />,
  );
  const bars = [...container.querySelectorAll<HTMLElement>("span[style]")];
  expect(bars.map((bar) => bar.style.width)).toEqual(["100%", "0%"]);
  expect(screen.getByText("—")).toBeTruthy();
  expect(screen.getByText("0").className).toContain("text-ink-muted");
});

it("puts the day and the body-weight ratio under a value", () => {
  render(
    <CompareBar
      label="Est. 1RM"
      names={["Vinit", "Phani"]}
      a={{ value: 88, text: "88 kg", sub: ["8 Sept 2026", "1.18× body weight"] }}
      b={{ value: 85, text: "85 kg", sub: ["1 Sept 2026"] }}
    />,
  );
  expect(screen.getByText("1.18× body weight")).toBeTruthy();
  expect(screen.getByText("+3.5%")).toBeTruthy();
});

it("labels equal and behind without colour", () => {
  expect(percentLabel({ leader: null, percent: 0 })).toBe("=");
  expect(percentLabel({ leader: "b", percent: -16.7 })).toBe("−16.7%");
  render(
    <CompareBar
      label="Workouts"
      names={["Vinit", "Phani"]}
      a={{ value: 5, text: "5" }}
      b={{ value: 6, text: "6" }}
    />,
  );
  expect(screen.getByText("−16.7%").className).toContain("text-ink-muted");
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
