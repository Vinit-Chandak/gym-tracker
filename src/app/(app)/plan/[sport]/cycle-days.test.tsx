// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { Route } from "next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { CycleDays, type CycleDayTile } from "./cycle-days";

let columns = "";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const computed = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
    const style = computed(element);
    return element instanceof HTMLOListElement
      ? ({ ...style, gridTemplateColumns: columns } as CSSStyleDeclaration)
      : style;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const tiles = (next: number, open?: number): CycleDayTile[] =>
  ["Upper", "Easy run", "Lower", "Tempo run", "Full body", "Long run", "Rest"].map((name, i) => ({
    id: `day-${i + 1}`,
    href: `/plan/strength/days/day-${i + 1}` as Route,
    name,
    said: name,
    next: i === next,
    word: i === open ? "In progress" : i === next ? "Next" : null,
    parts: [],
  }));

const tile = (name: string) => screen.getByRole("link", { name }).closest("li")!;

it("keeps the next day across two columns where two are left in its row", () => {
  columns = "200px 200px 200px 200px 200px";
  render(<CycleDays days={tiles(3)} label="The cycle’s days" />);
  expect(tile("Tempo run").className).toContain("cycle-day-next");
  expect(tile("Tempo run").className).not.toContain("cycle-day-next-narrow");
});

it("takes one column for the next day where it falls in a row's last, leaving no hole", () => {
  columns = "200px 200px 200px 200px";
  render(<CycleDays days={tiles(3)} label="The cycle’s days" />);
  expect(tile("Tempo run").className).toContain("cycle-day-next-narrow");
});

it("lets the last day take its row on a phone where it would stand alone", () => {
  columns = "200px 200px";
  // Liam's week: three days after Tempo run, so Rest would leave half its row empty.
  render(<CycleDays days={tiles(3)} label="The cycle’s days" />);
  expect(tile("Rest").className).toContain("cycle-day-alone");
  expect(tile("Long run").className).not.toContain("cycle-day-alone");
  cleanup();
  // Two after the next day pair up: nobody is alone.
  render(<CycleDays days={tiles(4)} label="The cycle’s days" />);
  expect(tile("Rest").className).not.toContain("cycle-day-alone");
});

it("names a day in progress beside it, instead of Next", () => {
  columns = "200px 200px";
  render(<CycleDays days={tiles(0, 0)} label="The cycle’s days" />);
  expect(tile("Upper").textContent).toContain("In progress");
  expect(tile("Upper").textContent).not.toContain("Next");
});

it("draws a rest day's tile with the rest form, out of the accessibility tree", () => {
  columns = "200px 200px";
  const days = tiles(0).map((day) =>
    day.name === "Rest"
      ? { ...day, parts: [{ kind: "rest" as const, state: "todo" as const }] }
      : day,
  );
  render(<CycleDays days={days} label="The cycle’s days" />);
  const restTile = tile("Rest");
  const print = restTile.querySelector(".cycle-day-print")!;
  // The link says the day; the art says nothing more.
  expect(print.getAttribute("aria-hidden")).toBe("true");
  const crescent = print.querySelector("path")!;
  expect(crescent.style.fill).toBe("var(--ov-print-warm-up)");
  expect(crescent.style.stroke).toBe("var(--ov-print-dot)");
});
