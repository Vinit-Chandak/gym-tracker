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

/** Each bar's fill, left to right. */
const barFills = (container: HTMLElement) =>
  [...container.querySelectorAll(".graph-plot svg path")].map(
    (path) => (path as SVGPathElement).style.fill,
  );

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
  // An empty bucket has no bar.
  expect(barFills(container)).toEqual(["var(--ov-control)", "var(--ov-ink)"]);
  fireEvent.keyDown(screen.getByRole("group", { name: /Body weight/ }), { key: "Home" });
  expect(barFills(container)).toEqual(["var(--ov-ink)", "var(--ov-control)"]);
});

it("sets the bars that reach the rule apart in ink 2, never as the one being read", () => {
  const { container } = draw({
    mark: "bar",
    placement: "bucket",
    range: { preset: null, from: "2026-09-08", to: "2026-09-11", bucket: "day" },
    data: [
      { date: "2026-09-08", value: 150, reached: true },
      { date: "2026-09-09", value: 120 },
      { date: "2026-09-10", value: 145, reached: true },
      { date: "2026-09-11", value: 141, reached: true },
    ],
    rule: { value: 140, label: "140" },
  });
  // The latest reached it too, and is the one in ink.
  expect(barFills(container)).toEqual([
    "var(--ov-ink-2)",
    "var(--ov-control)",
    "var(--ov-ink-2)",
    "var(--ov-ink)",
  ]);
  // Reading another hands the ink to it; the latest goes back to ink 2, a grey bar stays grey.
  const plot = screen.getByRole("group", { name: /Body weight/ });
  fireEvent.keyDown(plot, { key: "Home" });
  expect(barFills(container)).toEqual([
    "var(--ov-ink)",
    "var(--ov-control)",
    "var(--ov-ink-2)",
    "var(--ov-ink-2)",
  ]);
  fireEvent.keyDown(plot, { key: "ArrowRight" });
  expect(barFills(container)).toEqual([
    "var(--ov-ink-2)",
    "var(--ov-ink)",
    "var(--ov-ink-2)",
    "var(--ov-ink-2)",
  ]);
});

/** A head to head: your line and Alex's on the same days, each with its own record. */
const pair = (): Partial<GraphProps> => ({
  name: "Best estimated 1RM, You and Alex",
  data: [
    { date: "2026-09-10", value: 100 },
    { date: "2026-09-12", value: null },
    { date: "2026-10-01", value: 105 },
  ],
  against: {
    names: ["You", "Alex"],
    data: [
      { date: "2026-09-10", value: null },
      { date: "2026-09-12", value: 95 },
      { date: "2026-10-01", value: 97.5 },
    ],
  },
  summary: {
    label: "Latest",
    figure: "105",
    unit: "kg",
    context: "Thu 1 Oct",
    against: { figure: "97.5", unit: "kg", context: "Thu 1 Oct" },
  },
  describe: (index) => ({
    label: ["Thu 10 Sept", "Sat 12 Sept", "Thu 1 Oct"][index]!,
    ...(index === 1
      ? { figure: null, context: "No session" }
      : {
          figure: index === 0 ? "100" : "105",
          unit: "kg",
          href: `/workouts/w${index}` as GraphProps["summary"]["href"],
          action: "Open workout",
        }),
    against:
      index === 0
        ? { figure: null, context: "No session" }
        : {
            figure: index === 1 ? "95" : "97.5",
            unit: "kg",
            href: `/u/alex/activities/s${index}` as GraphProps["summary"]["href"],
            action: "Open session",
          },
  }),
});

it("reads a head to head: each line's figure under its name, the second line in grey under the first", () => {
  const { container } = draw(pair());
  expect(readout().getByText("You")).toBeTruthy();
  expect(readout().getByText("Alex")).toBeTruthy();
  expect(readout().getByText("105")).toBeTruthy();
  expect(readout().getByText("97.5")).toBeTruthy();
  const strokes = [...container.querySelectorAll(".graph-plot svg path")].map((path) =>
    path.getAttribute("stroke"),
  );
  expect(strokes).toEqual(["var(--ov-series-2)", "var(--ov-ink)"]);
});

it("reads a day only one of them trained, and opens that one's record", () => {
  draw(pair());
  const plot = screen.getByRole("group", { name: /Best estimated 1RM/ });
  fireEvent.keyDown(plot, { key: "Home" });
  fireEvent.keyDown(plot, { key: "ArrowRight" });
  expect(screen.getByText("Sat 12 Sept")).toBeTruthy();
  expect(screen.getByText("No session")).toBeTruthy();
  expect(screen.queryByRole("link", { name: /Open workout/ })).toBeNull();
  expect(screen.getByRole("link", { name: /Alex.*Open session/ }).getAttribute("href")).toBe(
    "/u/alex/activities/s1",
  );
  fireEvent.keyDown(plot, { key: "Enter" });
  expect(router.push).toHaveBeenCalledWith("/u/alex/activities/s1");
});

it("lists a head to head's values newest first, a column each, each opening its own record", () => {
  draw(pair());
  fireEvent.click(screen.getByRole("button", { name: /View values/ }));
  const links = screen.getAllByRole("link");
  expect(links.map((link) => link.getAttribute("href"))).toEqual([
    "/workouts/w2",
    "/u/alex/activities/s2",
    "/u/alex/activities/s1",
    "/workouts/w0",
  ]);
  expect(links[1]!.textContent).toContain("Alex");
});
