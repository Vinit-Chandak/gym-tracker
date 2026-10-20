// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { SPLIT_GROUPS } from "@/domain/muscle-split";

import { RadarChart } from "./radar-chart";
import { radarLayout } from "./radar-plot";

afterEach(cleanup);

const one = {
  name: "Alice",
  color: "var(--color-series-1)",
  values: [0.4, 0.2, 0.1, 0.1, 0.1, 0.1],
};
const two = { name: "Bob", color: "var(--color-series-2)", values: [0.1, 0.1, 0.1, 0.1, 0.1, 0.5] };

it("draws one polygon per series inside a scaling box, with the values in a table", () => {
  const { container } = render(
    <RadarChart title="Muscle split" axes={SPLIT_GROUPS} series={[one]} />,
  );
  const svg = container.querySelector("svg")!;
  // A viewBox and a fluid width: the same drawing at 320px and on a tablet.
  expect(svg.getAttribute("viewBox")).toBe("0 0 320 320");
  expect(svg.getAttribute("class")).toContain("w-full");
  // Four rings plus one shape, filled, with no markers at its corners.
  expect(container.querySelectorAll("polygon")).toHaveLength(5);
  expect(container.querySelectorAll("circle")).toHaveLength(0);
  expect(container.querySelectorAll("polygon")[4]!.getAttribute("fill-opacity")).toBe("0.28");
  for (const axis of SPLIT_GROUPS) expect(screen.getAllByText(axis).length).toBeGreaterThan(0);
  // One series needs no legend: the caption names it.
  expect(container.querySelector("ul")).toBeNull();
  expect(screen.getByRole("table")).toBeTruthy();
  expect(screen.getByText("40%")).toBeTruthy();
});

it("reads as a table to a screen reader: named disclosure, caption, row and column headers", () => {
  render(<RadarChart title="Muscle split" axes={SPLIT_GROUPS} series={[one]} />);
  expect(screen.getByText("View values").closest("summary")!.textContent).toBe(
    "View values for Muscle split, 6",
  );
  expect(screen.getByRole("table", { name: "Muscle split by axis" })).toBeTruthy();
  expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Group", "Alice"]);
  expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual([...SPLIT_GROUPS]);
});

it("keeps every axis label inside the box", () => {
  const { container } = render(
    <RadarChart title="Muscle split" axes={SPLIT_GROUPS} series={[one]} />,
  );
  for (const text of container.querySelectorAll("text")) {
    const x = Number(text.getAttribute("x"));
    const anchor = text.getAttribute("text-anchor");
    // Twelve-pixel text, about 6.5px a letter: "Shoulders" is the longest at ~58px.
    const width = (text.textContent?.length ?? 0) * 6.5;
    const left = anchor === "end" ? x - width : anchor === "middle" ? x - width / 2 : x;
    expect(left).toBeGreaterThanOrEqual(0);
    expect(left + width).toBeLessThanOrEqual(320);
  }
});

it("adds a legend and a second column once there are two shapes", () => {
  const { container } = render(
    <RadarChart title="Muscle split" axes={SPLIT_GROUPS} series={[one, two]} />,
  );
  expect(container.querySelectorAll("polygon")).toHaveLength(6);
  // Named twice each: once in the legend, once over their column of values.
  expect(screen.getAllByText("Alice")).toHaveLength(2);
  expect(screen.getAllByText("Bob")).toHaveLength(2);
  expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
    "Group",
    "Alice",
    "Bob",
  ]);
});

it("draws its labels at 12 px on a small phone, larger with larger text, with room kept", () => {
  // A 288-px box (a 320-pt phone): 12 px on screen is 13.3 units of the 320-unit drawing.
  const phone = radarLayout(288, 16, SPLIT_GROUPS);
  expect(phone.fontSize * (288 / 320)).toBeCloseTo(12);
  expect(phone).toMatchObject({ radius: 96, keyed: false });
  // At 200% text the labels double. "Shoulders" sits under the shape, where its width costs
  // nothing, so the shape keeps most of its size: it once shrank to a third, a dot.
  const large = radarLayout(288, 32, SPLIT_GROUPS);
  expect(large.fontSize * (288 / 320)).toBeCloseTo(24);
  expect(large.keyed).toBe(false);
  expect(large.radius).toBeGreaterThanOrEqual(80);
  // A 320-pt phone at 200% leaves the card about 250 px: still labelled, still two thirds.
  expect(radarLayout(250, 32, SPLIT_GROUPS)).toMatchObject({ keyed: false });
  expect(radarLayout(250, 32, SPLIT_GROUPS).radius).toBeGreaterThanOrEqual(64);
});

it("numbers the spokes and lists the names under the drawing when even so they would crowd it", () => {
  // 300% text in a 200-px box: the side labels alone would leave a shape a fraction its size.
  const huge = radarLayout(200, 48, SPLIT_GROUPS);
  expect(huge.keyed).toBe(true);
  expect(huge.radius).toBe(96);
});

it("keeps every label of a drawing at large text inside the box and its overhang", () => {
  for (const [width, root] of [
    [288, 32],
    [250, 32],
    [320, 24],
  ] as const) {
    const { fontSize, radius, keyed } = radarLayout(width, root, SPLIT_GROUPS);
    expect(keyed).toBe(false);
    SPLIT_GROUPS.forEach((axis, i) => {
      const angle = -Math.PI / 2 + (i / SPLIT_GROUPS.length) * 2 * Math.PI;
      const x = 160 + (radius + 16) * Math.cos(angle);
      const across = 0.55 * fontSize * axis.length;
      const [left, right] =
        Math.abs(Math.cos(angle)) < 0.01
          ? [x - across / 2, x + across / 2]
          : x > 160
            ? [x, x + across]
            : [x - across, x];
      expect(left).toBeGreaterThanOrEqual(-20.01);
      expect(right).toBeLessThanOrEqual(340.01);
    });
  }
});

it("lays two shapes on the theme's wash, thinner in dark, and one on its own", () => {
  const { container } = render(
    <RadarChart title="Muscle split" axes={SPLIT_GROUPS} series={[one, two]} />,
  );
  const shapes = [...container.querySelectorAll("polygon")].slice(4);
  for (const shape of shapes) {
    expect(shape.getAttribute("fill-opacity")).toBeNull();
    expect(shape.getAttribute("style")).toContain("var(--ov-series-wash");
  }
  expect(shapes.map((shape) => shape.getAttribute("stroke"))).toEqual([
    "var(--color-series-1)",
    "var(--color-series-2)",
  ]);
});

it("draws both shapes and both columns when two people share a name", () => {
  const errors: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => errors.push(args);
  try {
    const { container } = render(
      <RadarChart
        title="Muscle split"
        axes={SPLIT_GROUPS}
        series={[one, { ...two, name: "Alice" }]}
      />,
    );
    expect(container.querySelectorAll("polygon")).toHaveLength(6);
    expect(screen.getAllByRole("cell")).toHaveLength(SPLIT_GROUPS.length * 2);
    // No duplicate keys for React to warn about, and so nothing dropped on a re-render.
    expect(errors).toEqual([]);
  } finally {
    console.error = original;
  }
});
