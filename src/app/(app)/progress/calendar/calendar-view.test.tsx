// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { CalendarView } from "./calendar-view";

vi.mock("@/components/shell/back-link", () => ({ BackLink: () => null }));
vi.mock("@/components/ui/app-link", () => ({
  default: ({ prefetch: _prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a {...props} />
  ),
}));

const scrolled = vi.fn<(this: Element) => void>();
beforeEach(() => {
  scrolled.mockReset();
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    scrolled.call(this);
  };
  window.scrollTo = vi.fn() as typeof window.scrollTo;
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    height: 118,
  } as DOMRect);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const view = (
  <CalendarView
    months={["2025-10", "2025-11", "2025-12", "2026-01", "2026-09", "2026-10"]}
    today="2026-10-11"
    activities={[]}
    truncated={false}
  />
);

it("opens on this month, under the header that stays, and keeps that header's height clear", () => {
  render(view);
  // This month, not the page's end: where it is short the browser stops at the end anyway.
  expect(scrolled.mock.instances.map((month) => (month as Element).id)).toContain("month-2026-10");
  expect(new Set(scrolled.mock.instances.map((month) => (month as Element).id)).size).toBe(1);
  expect(window.scrollTo).not.toHaveBeenCalled();
  // What is scrolled into view stands under the header (progress.css reads this).
  expect(document.documentElement.style.getPropertyValue("--calendar-head")).toBe("118px");
});

it("names last year's months with their year, and this year's without", () => {
  render(view);
  const names = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
  expect(names).toEqual([
    "October 2025",
    "November 2025",
    "December 2025",
    "January",
    "September",
    "October",
  ]);
});

it("leaves the page where Back left it", () => {
  Object.defineProperty(window, "scrollY", { value: 640, configurable: true });
  render(view);
  expect(scrolled).not.toHaveBeenCalled();
});
