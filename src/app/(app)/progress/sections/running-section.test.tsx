// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { presetRange } from "@/domain/graph-range";
import { runningGraph, type RunInput } from "@/domain/progress-graphs";

import { RunningSection } from "./running-section";

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
const RUNS: RunInput[] = [
  { id: "r1", date: "2026-10-03", environment: "outdoor", metres: 8046.72, seconds: 2400 },
  { id: "r2", date: "2026-10-06", environment: "outdoor", metres: 8046.72, seconds: 2400 },
];

function draw(measure: "distance" | "pace", distanceUnit?: "km" | "mi") {
  route.search = `run=${measure}`;
  return render(
    <RunningSection
      today={TODAY}
      running={{
        range: MONTH,
        graph: runningGraph(RUNS, MONTH, TODAY),
        truncated: false,
        distanceUnit,
      }}
    />,
  );
}

it("totals distance in the athlete's road unit", () => {
  draw("distance", "mi");
  // Two runs of five miles.
  expect(screen.getByText("10")).toBeTruthy();
  expect(screen.getAllByText("mi").length).toBeGreaterThan(0);
});

it("gives pace per mile to a runner who reads miles, per kilometre otherwise", () => {
  draw("pace", "mi");
  // 40 minutes for five miles is 8:00 a mile.
  expect(screen.getAllByText("8:00").length).toBeGreaterThan(0);
  expect(screen.getAllByText("/mi").length).toBeGreaterThan(0);
  cleanup();
  draw("pace");
  // The same runs are 4:58 a kilometre.
  expect(screen.getAllByText("4:58").length).toBeGreaterThan(0);
});
