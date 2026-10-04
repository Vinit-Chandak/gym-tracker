// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

import { Art } from "./art";

vi.mock("@/components/ui/app-link", () => ({
  default: ({ prefetch: _prefetch, ...props }: ComponentProps<"a"> & { prefetch?: string }) => (
    <a {...props} />
  ),
}));

beforeAll(() => {
  // jsdom has no layout; the print falls back to the size it is told and stays there.
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

it("names a print by what it shows, and paints it with the palette's tokens", () => {
  const { container } = render(
    <Art
      kind="print"
      label="Today’s print: the run’s track, then four arm exercises"
      parts={[
        { kind: "run", minutes: 30 },
        { kind: "strength", columns: [{ sets: 3, done: 1 }] },
      ]}
    />,
  );
  expect(screen.getByRole("img", { name: /the run’s track/ })).toBeTruthy();
  const fills = [...container.querySelectorAll("rect, path")].map(
    (node) => (node as SVGElement).style.fill,
  );
  expect(fills).toContain("var(--ov-print-strength)");
  expect(fills).toContain("var(--ov-print-strength-todo)");
  expect(fills).toContain("var(--ov-print-run-todo)");
  // no colour is written into the drawing itself: the paper and its ink come from CSS
  expect(container.innerHTML).not.toMatch(/#[0-9a-f]{6}/i);
});

it("keeps an unnamed mark out of the accessibility tree, and names it when asked", () => {
  const { rerender, container } = render(<Art kind="mark" sport="run" />);
  expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  rerender(<Art kind="mark" sport="swim" state="skipped" label="Swim, skipped" />);
  expect(screen.getByRole("img", { name: "Swim, skipped" })).toBeTruthy();
});

it("cuts a mark on the ground out of the ground, and a print's out of the paper", () => {
  const { container, rerender } = render(<Art kind="mark" sport="run" />);
  const strokes = () =>
    [...container.querySelectorAll("path")].map((node) => (node as SVGElement).style.stroke);
  expect(strokes()).toContain("var(--ov-ground)");
  rerender(<Art kind="mark" sport="run" surface="paper" />);
  expect(strokes()).toContain("var(--ov-paper)");
});

it("fills the bowl meal by meal and heaps it only past the target", () => {
  const { container, rerender } = render(
    <Art kind="bowl" meals={[{ kcal: 445 }, { kcal: 647.5 }]} target={2300} label="The bowl" />,
  );
  expect(screen.getByRole("img", { name: "The bowl" })).toBeTruthy();
  expect(container.querySelectorAll("clipPath")).toHaveLength(1);
  rerender(<Art kind="bowl" meals={[{ kcal: 2536 }]} target={2300} label="The bowl" />);
  expect(container.querySelectorAll("clipPath")).toHaveLength(2);
});

it("draws a month: past days named and opened, today ringed, days to come blank", () => {
  render(
    <Art
      kind="month"
      month="2026-09"
      today={29}
      days={{
        25: [
          { sport: "run", said: "run 5 km" },
          { sport: "swim", said: "swim 1,500 m" },
          { sport: "strength", said: "lifting 60 min" },
        ],
      }}
      links={{ 25: "/progress" }}
    />,
  );
  const month = screen.getByRole("group", { name: "September 2026" });
  const day = within(month).getByRole("link", {
    name: "Fri 25 Sept: run 5 km, swim 1,500 m, lifting 60 min",
  });
  expect(day.getAttribute("href")).toBe("/progress");
  expect(
    within(month).getByRole("img", { name: "Tue 29 Sept, today: nothing logged" }),
  ).toBeTruthy();
  // 1 to 29 September are named; the 30th is still to come
  expect(within(month).queryByRole("img", { name: /30 Sept/ })).toBeNull();
  expect(within(month).getAllByRole("img")).toHaveLength(28);
});

it("adds each date in its corner on the calendar page", () => {
  const { container } = render(<Art kind="month" month="2026-08" days={{}} dates today={null} />);
  expect(container.textContent).toContain("31");
});
