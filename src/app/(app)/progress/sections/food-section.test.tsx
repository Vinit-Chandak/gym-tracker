// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { presetRange } from "@/domain/graph-range";
import { foodGraph, type FoodDayInput } from "@/domain/progress-graphs";

import type { ProgressData } from "../progress-types";
import { FoodSection } from "./food-section";

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
const MONTH = presetRange("1m", TODAY);
const DAYS: FoodDayInput[] = [
  { date: "2026-10-04", kcal: 2700, protein: 120 },
  { date: "2026-10-05", kcal: 2300, protein: 139.6 },
  { date: "2026-10-06", kcal: 2650, protein: 150 },
  { date: "2026-10-07", kcal: 2000, protein: 141 },
];
// Protein at 1.8 g a kilogram of 77.6 kg: 139.68 g, written 140.
const TARGETS: ProgressData["food"]["targets"] = { kcal: 2600, protein: 139.68 };

function draw(measure: "kcal" | "protein", targets = TARGETS) {
  route.search = `food=${measure}`;
  return render(
    <FoodSection
      today={TODAY}
      food={{ range: MONTH, graph: foodGraph(DAYS, MONTH, TODAY), targets }}
    />,
  );
}

/** Each day's bar fill, oldest first, for one measure. */
function barFills(measure: "kcal" | "protein", targets = TARGETS) {
  const { container } = draw(measure, targets);
  return [...container.querySelectorAll(".graph-plot svg path")].map(
    (path) => (path as SVGPathElement).style.fill,
  );
}

it("sets apart the days that reach the protein target, today still the bar in ink", () => {
  // 139.6 g reads 140 against a target that reads 140: reached. Today reached it too.
  expect(barFills("protein")).toEqual([
    "var(--ov-control)",
    "var(--ov-ink-2)",
    "var(--ov-ink-2)",
    "var(--ov-ink)",
  ]);
});

it("sets apart the days that reach the calorie target", () => {
  expect(barFills("kcal")).toEqual([
    "var(--ov-ink-2)",
    "var(--ov-control)",
    "var(--ov-ink-2)",
    "var(--ov-ink)",
  ]);
});

it("sets nothing apart without a target to reach", () => {
  expect(barFills("protein", { kcal: null, protein: null })).toEqual([
    "var(--ov-control)",
    "var(--ov-control)",
    "var(--ov-control)",
    "var(--ov-ink)",
  ]);
});

it("says aloud which days reached the target, in the values a screen reader reads", () => {
  draw("protein");
  fireEvent.click(screen.getByRole("button", { name: /View values/ }));
  const rows = screen.getAllByRole("link").map((row) => row.textContent ?? "");
  // Newest first: today, 6 Oct and 5 Oct reached it; 4 Oct did not.
  expect(rows.map((row) => row.includes(", reached"))).toEqual([true, true, true, false]);
});
