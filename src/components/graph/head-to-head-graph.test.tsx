// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Route } from "next";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import type { GraphRange } from "@/domain/graph-range";

import { HeadToHeadGraph, type HeadToHeadData } from "./head-to-head-graph";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/u/phani/compare/bench",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/server/actions/graph-range", () => ({ chooseGraphRangeAction: vi.fn() }));
vi.mock("@/components/ui/app-link", () => ({
  default: ({ prefetch: _prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a {...props} />
  ),
}));

afterEach(cleanup);

const RANGE: GraphRange = { preset: "1m", from: "2026-09-08", to: "2026-10-07", bucket: "day" };

const data = (lines: HeadToHeadData["lines"]): HeadToHeadData => ({
  range: RANGE,
  today: "2026-10-07",
  metric: "e1rm",
  label: "Est. 1RM",
  unit: "kg",
  names: ["Vinit", "Phani"],
  lines,
});

const readout = () =>
  within(screen.getByText("Best estimated 1RM").closest(".graph-readout") as HTMLElement);

it("sums up each person's best in the span, and the day it was set, under their names", () => {
  render(
    <HeadToHeadGraph
      data={data([
        [
          { date: "2026-09-10", value: 100, href: "/workouts/a" as Route },
          { date: "2026-10-01", value: 102.5, href: "/workouts/b" as Route },
        ],
        [{ date: "2026-09-12", value: 110, href: "/u/phani/activities/c" as Route }],
      ])}
    />,
  );
  expect(readout().getByText("Vinit")).toBeTruthy();
  expect(readout().getByText("102.5")).toBeTruthy();
  expect(readout().getByText("Thu 1 Oct")).toBeTruthy();
  expect(readout().getByText("Phani")).toBeTruthy();
  expect(readout().getByText("110")).toBeTruthy();
  expect(readout().getByText("Sat 12 Sept")).toBeTruthy();
});

it("reads a day by both people, opening your workout; one who did not train has no session", () => {
  render(
    <HeadToHeadGraph
      data={data([
        [{ date: "2026-10-01", value: 102.5, href: "/workouts/b" as Route }],
        [{ date: "2026-09-12", value: 110, href: "/u/phani/activities/c" as Route }],
      ])}
    />,
  );
  fireEvent.keyDown(screen.getByRole("group", { name: /Best estimated 1RM/ }), { key: "End" });
  expect(screen.getByText("Thu 1 Oct")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Vinit.*Open workout/ }).getAttribute("href")).toBe(
    "/workouts/b",
  );
  expect(screen.getByText("No session")).toBeTruthy();
});

it("says so when neither trained it in the span", () => {
  render(<HeadToHeadGraph data={data([[], []])} />);
  expect(screen.getByText("Neither of you did this in this range.")).toBeTruthy();
  expect(readout().getAllByText("No sessions")).toHaveLength(2);
});
