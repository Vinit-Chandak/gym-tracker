// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import type { GraphRange } from "@/domain/graph-range";

import { Graph, type GraphProps } from "./graph";
import { GraphRangeProvider } from "./graph-range-context";

const route = vi.hoisted(() => ({ search: "" }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const action = vi.hoisted(() => ({ chooseGraphRangeAction: vi.fn(async () => {}) }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/progress",
  useSearchParams: () => new URLSearchParams(route.search),
}));
vi.mock("@/server/actions/graph-range", () => action);
vi.mock("@/components/ui/app-link", () => ({
  default: ({ prefetch: _prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a {...props} />
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  route.search = "";
});

const RANGE: GraphRange = { preset: "1m", from: "2026-09-08", to: "2026-10-07", bucket: "day" };

const props = (overrides: Partial<GraphProps> = {}): GraphProps => ({
  name: "Body weight",
  mark: "line",
  placement: "record",
  range: RANGE,
  data: [
    { date: "2026-09-10", value: 76 },
    { date: "2026-09-20", value: 76.5 },
    { date: "2026-10-01", value: 75.2 },
  ],
  summary: { label: "Latest", figure: "75.2", unit: "kg", context: "−0.8 since Thu 10 Sept" },
  describe: (index) => ({
    label: ["Thu 10 Sept", "Sun 20 Sept", "Thu 1 Oct"][index]!,
    figure: ["76", "76.5", "75.2"][index]!,
    unit: "kg",
    href: `/workouts/w${index}` as GraphProps["summary"]["href"],
    action: "Open workout",
  }),
  empty: "No readings in this range.",
  ...overrides,
});

const readout = () => within(screen.getByText("Latest").closest(".graph-readout") as HTMLElement);

function draw(overrides: Partial<GraphProps> = {}, preset: GraphRange["preset"] = "1m") {
  return render(
    <GraphRangeProvider preset={preset}>
      <Graph {...props(overrides)} />
    </GraphRangeProvider>,
  );
}

it("opens on its summary, the figure and its unit and one line of context", () => {
  draw();
  expect(readout().getByText("75.2")).toBeTruthy();
  expect(readout().getByText(/kg/)).toBeTruthy();
  expect(readout().getByText("−0.8 since Thu 10 Sept")).toBeTruthy();
  expect(screen.queryByRole("link", { name: /Open workout/ })).toBeNull();
});

it("reads the mark under a finger and leads to its record; tapping it again lets it go", () => {
  const { container } = draw();
  const svg = container.querySelector("svg")!;
  const tap = (clientX: number) => {
    fireEvent.pointerDown(svg, { clientX, clientY: 50, pointerType: "touch" });
    fireEvent.pointerUp(svg, { clientX, clientY: 50, pointerType: "touch" });
  };
  // As far right as the plot goes: the last reading is the nearest.
  tap(9999);
  expect(screen.getByText("Thu 1 Oct")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Open workout/ }).getAttribute("href")).toBe(
    "/workouts/w2",
  );
  // The same mark again: back to the summary.
  tap(9999);
  expect(screen.getByText("Latest")).toBeTruthy();
});

it("leaves the summary alone when a finger on the plot scrolls the page", () => {
  const { container } = draw();
  const svg = container.querySelector("svg")!;
  fireEvent.pointerDown(svg, { clientX: 200, clientY: 50, pointerType: "touch" });
  fireEvent.pointerMove(svg, { clientX: 203, clientY: 140, pointerType: "touch" });
  fireEvent.pointerCancel(svg, { pointerType: "touch" });
  expect(screen.getByText("Latest")).toBeTruthy();
  // A drag sideways reads the marks it passes.
  fireEvent.pointerDown(svg, { clientX: 0, clientY: 50, pointerType: "touch" });
  fireEvent.pointerMove(svg, { clientX: 9999, clientY: 52, pointerType: "touch" });
  expect(screen.getByText("Thu 1 Oct")).toBeTruthy();
});

it("steps through the marks with the arrow keys, opens one with Enter, and lets go with Escape", () => {
  draw();
  const plot = screen.getByRole("group", { name: /Body weight/ });
  fireEvent.keyDown(plot, { key: "ArrowRight" });
  expect(screen.getByText("Thu 10 Sept")).toBeTruthy();
  fireEvent.keyDown(plot, { key: "End" });
  expect(screen.getByText("Thu 1 Oct")).toBeTruthy();
  fireEvent.keyDown(plot, { key: "ArrowLeft" });
  expect(screen.getByText("Sun 20 Sept")).toBeTruthy();
  fireEvent.keyDown(plot, { key: "Enter" });
  expect(router.push).toHaveBeenCalledWith("/workouts/w1");
  fireEvent.keyDown(plot, { key: "Escape" });
  expect(screen.getByText("Latest")).toBeTruthy();
});

it("lists every value newest first behind one row, each opening its record", () => {
  draw();
  fireEvent.click(screen.getByRole("button", { name: /View values/ }));
  const links = screen.getAllByRole("link");
  expect(links.map((link) => link.textContent)).toEqual([
    expect.stringContaining("Thu 1 Oct"),
    expect.stringContaining("Sun 20 Sept"),
    expect.stringContaining("Thu 10 Sept"),
  ]);
  expect(links[0]!.getAttribute("href")).toBe("/workouts/w2");
});

it("offers the five spans, the chosen one checked, and remembers the one chosen", async () => {
  draw();
  const spans = within(screen.getByRole("radiogroup", { name: "Span" }));
  expect(spans.getAllByRole("radio").map((radio) => radio.getAttribute("aria-label"))).toEqual([
    "1 month",
    "3 months",
    "6 months",
    "12 months",
    "All time",
  ]);
  expect((spans.getByRole("radio", { name: "1 month" }) as HTMLInputElement).checked).toBe(true);
  await act(async () => fireEvent.click(spans.getByRole("radio", { name: "3 months" })));
  expect(action.chooseGraphRangeAction).toHaveBeenCalledWith("3m");
  // Nothing in the URL to clear.
  expect(router.replace).not.toHaveBeenCalled();
});

it("drops dates chosen by hand when a span is chosen, none checked while they hold", async () => {
  route.search = "view=body&from=2026-01-01&to=2026-02-01";
  draw({}, null);
  const spans = within(screen.getByRole("radiogroup", { name: "Span" }));
  expect(spans.getAllByRole("radio").some((radio) => (radio as HTMLInputElement).checked)).toBe(
    false,
  );
  await act(async () => fireEvent.click(spans.getByRole("radio", { name: "All time" })));
  expect(action.chooseGraphRangeAction).toHaveBeenCalledWith("all");
  expect(router.replace).toHaveBeenCalledWith("/progress?view=body", { scroll: false });
});

it("says so in the plot when the range holds nothing, keeping its spans", () => {
  draw({ data: [{ date: "2026-09-10", value: null }], summary: { label: "Latest", figure: null } });
  expect(screen.getByText("No readings in this range.")).toBeTruthy();
  expect(screen.getByRole("radiogroup", { name: "Span" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /View values/ })).toBeNull();
});

it("draws bars in grey, the latest in ink, and the one being read in ink instead", () => {
  const { container } = draw({
    mark: "bar",
    placement: "bucket",
    range: { preset: null, from: "2026-09-08", to: "2026-09-10", bucket: "day" },
    data: [
      { date: "2026-09-08", value: 3 },
      { date: "2026-09-09", value: null },
      { date: "2026-09-10", value: 5 },
    ],
  });
  const fills = () =>
    [...container.querySelectorAll(".graph-plot svg path")].map(
      (path) => (path as SVGPathElement).style.fill,
    );
  // An empty bucket has no bar.
  expect(fills()).toEqual(["var(--ov-control)", "var(--ov-ink)"]);
  fireEvent.keyDown(screen.getByRole("group", { name: /Body weight/ }), { key: "Home" });
  expect(fills()).toEqual(["var(--ov-ink)", "var(--ov-control)"]);
});
