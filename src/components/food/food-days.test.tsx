// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { useMeasure } from "@/components/ui/use-width";
import { readFoodMonthAction } from "@/server/actions/nutrition";

import { FoodCalendarButton, FoodWeekStrip } from "./food-days";

vi.mock("@/components/ui/app-link", () => ({
  default: ({ prefetch: _prefetch, ...props }: ComponentProps<"a"> & { prefetch?: string }) => (
    <a {...props} />
  ),
}));
vi.mock("@/server/actions/nutrition", () => ({ readFoodMonthAction: vi.fn() }));
vi.mock("@/components/ui/use-width", () => ({
  useMeasure: vi.fn(() => ({ width: 350, height: 90, root: 16 })),
}));

const showModal = HTMLDialogElement.prototype.showModal;
const close = HTMLDialogElement.prototype.close;
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});
afterAll(() => {
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = close;
});
beforeEach(() => {
  vi.mocked(useMeasure).mockReturnValue({ width: 350, height: 90, root: 16 });
  vi.mocked(readFoodMonthAction).mockReset();
  vi.mocked(readFoodMonthAction).mockResolvedValue([{ date: "2026-08-14", kcal: 2512.4 }]);
});

it.each([
  { mode: "week", width: 350, left: -330, right: 20, offset: -350 },
  { mode: "week", width: 350, left: 370, right: 720, offset: 350 },
  { mode: "week", width: 350, left: 20, right: 370, offset: 0 },
  { mode: "day", width: 280, left: -65, right: -20, offset: -85 },
  { mode: "day", width: 280, left: 300, right: 345, offset: 45 },
  { mode: "day", width: 280, left: 20, right: 65, offset: 0 },
])(
  "reveals the selected $mode ($offset px) horizontally without moving a scrolled page",
  ({ mode, width, left, right, offset }) => {
    vi.mocked(useMeasure).mockReturnValue({ width, height: 90, root: 16 });
    const scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    const movePage = vi.fn(() => {
      Reflect.set(window, "scrollY", 0);
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: movePage,
    });
    vi.stubGlobal("scrollY", 198);
    const measured: HTMLElement[] = [];
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this.matches(".food-strip")) return new DOMRect(20, -100, width, 90);
        measured.push(this);
        return new DOMRect(left, -100, right - left, 90);
      });
    try {
      render(<FoodWeekStrip {...PROPS} />);
      const strip = document.querySelector(".food-strip-scroller")!;
      const selected = screen.getByRole("link", { current: "page" }).closest("li")!;
      expect(measured).toEqual([mode === "day" ? selected : selected.parentElement]);
      expect(strip.scrollLeft).toBe(offset);
      expect(window.scrollY).toBe(198);
      expect(movePage).not.toHaveBeenCalled();
    } finally {
      rect.mockRestore();
      vi.unstubAllGlobals();
      if (scrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollIntoView);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
      }
    }
  },
);
it.each([
  { change: "a narrower viewport", width: 280, root: 32 },
  { change: "larger text", width: 350, root: 40 },
])("keeps an earlier day visible after $change within the scrolling layout", ({ width, root }) => {
  let frameWidth = 350;
  let selectedLeft = 250;
  let selectedWidth = 100;
  vi.mocked(useMeasure).mockReturnValue({ width: frameWidth, height: 90, root: 32 });
  const rect = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      if (this.matches(".food-strip")) return new DOMRect(20, -100, frameWidth, 90);
      return new DOMRect(selectedLeft, -100, selectedWidth, 90);
    });
  vi.stubGlobal("scrollY", 198);
  try {
    const { rerender } = render(<FoodWeekStrip {...PROPS} date="2026-08-20" />);
    const strip = document.querySelector(".food-strip-scroller")!;
    expect(strip.scrollLeft).toBe(0);
    frameWidth = width;
    selectedLeft = width === 280 ? 250 : 280;
    selectedWidth = root === 40 ? 125 : 100;
    vi.mocked(useMeasure).mockReturnValue({ width, height: 90, root });
    rerender(<FoodWeekStrip {...PROPS} date="2026-08-20" />);
    expect(strip.scrollLeft).toBe(selectedLeft + selectedWidth - (20 + frameWidth));
    expect(window.scrollY).toBe(198);
  } finally {
    rect.mockRestore();
    vi.unstubAllGlobals();
  }
});
afterEach(cleanup);

// Sunday 27 September 2026, just after midnight, with Saturday still to finish.
const TODAY = "2026-09-27";
const PROPS = {
  today: TODAY,
  date: "2026-09-26",
  // The strip's days: what its eight weeks hold, back to 3 August.
  days: [
    { date: "2026-08-20", kcal: 2600 },
    { date: "2026-09-25", kcal: 2980 },
    { date: "2026-09-26", kcal: 1113 },
  ],
  from: "2026-08-03",
  targetKcal: 2700,
  base: "/food" as const,
};

const sheet = () => document.querySelector("dialog")!;
const inSheet = () => within(sheet());
const opened = () => {
  render(<FoodCalendarButton {...PROPS} />);
  fireEvent.click(screen.getByRole("button", { name: "September, calendar" }));
  return inSheet();
};

it("opens on the month of the day on screen, marked from the strip without asking again", () => {
  const calendar = opened();
  expect(calendar.getByText("September 2026")).toBeTruthy();
  expect(readFoodMonthAction).not.toHaveBeenCalled();
  expect(
    calendar.getByRole("link", { name: "Friday\u00a025\u00a0September, over the goal" }),
  ).toBeTruthy();
  expect(calendar.getByRole("link", { current: "page" }).getAttribute("aria-label")).toBe(
    "Saturday\u00a026\u00a0September, food logged",
  );
  expect(
    calendar
      .getByRole("link", { name: "Sunday\u00a027\u00a0September, today" })
      .getAttribute("href"),
  ).toBe("/food");
  // A day still to come is on the calendar but cannot be opened.
  expect(calendar.queryByRole("link", { name: /28\u00a0September/ })).toBeNull();
  expect(calendar.getByText("28")).toBeTruthy();
  expect(calendar.getByRole("button", { name: "Next month" })).toHaveProperty("disabled", true);
});

it("reads a month the strip does not hold when it is turned to, and only once", async () => {
  const calendar = opened();
  fireEvent.click(calendar.getByRole("button", { name: "Previous month" }));
  expect(calendar.getByText("August 2026")).toBeTruthy();
  expect(
    await calendar.findByRole("link", { name: "Friday\u00a014\u00a0August, goal met" }),
  ).toBeTruthy();
  // The strip reaches back into August, but not to its start, so August is read whole.
  expect(readFoodMonthAction).toHaveBeenCalledWith("2026-08");
  expect(calendar.getByRole("link", { name: "Thursday\u00a020\u00a0August" })).toBeTruthy();

  fireEvent.click(calendar.getByRole("button", { name: "Next month" }));
  fireEvent.click(calendar.getByRole("button", { name: "Previous month" }));
  await waitFor(() => expect(readFoodMonthAction).toHaveBeenCalledOnce());
});

it("opens a day and closes, with Today there while another day is on screen", () => {
  const calendar = opened();
  const thursday = calendar.getByRole("link", { name: "Thursday\u00a024\u00a0September" });
  expect(thursday.getAttribute("href")).toBe("/food?day=2026-09-24");
  expect(calendar.getByRole("link", { name: "Today" }).getAttribute("href")).toBe("/food");
  fireEvent.click(thursday);
  expect(sheet().open).toBe(false);

  cleanup();
  render(<FoodCalendarButton {...PROPS} date={TODAY} />);
  fireEvent.click(screen.getByRole("button", { name: "September, calendar" }));
  expect(inSheet().queryByRole("link", { name: "Today" })).toBeNull();
});

it("says when a month's food marks could not load and retries without changing months", async () => {
  vi.mocked(readFoodMonthAction).mockRejectedValueOnce(new Error("Offline"));
  const calendar = opened();
  fireEvent.click(calendar.getByRole("button", { name: "Previous month" }));
  expect(await calendar.findByRole("alert")).toHaveProperty(
    "textContent",
    "Could not load this month's food. Check your connection.",
  );
  expect(calendar.getByRole("list", { name: /August\s2026/ }).getAttribute("aria-busy")).toBe(
    "false",
  );
  fireEvent.click(calendar.getByRole("button", { name: "Try again" }));
  expect(
    await calendar.findByRole("link", { name: "Friday\u00a014\u00a0August, goal met" }),
  ).toBeTruthy();
  expect(calendar.queryByRole("alert")).toBeNull();
  expect(readFoodMonthAction).toHaveBeenCalledTimes(2);
});

it("strips back through whole weeks that end on today, in the order they are read", () => {
  render(<FoodWeekStrip {...PROPS} />);
  const weeks = within(screen.getByRole("navigation", { name: "Days" })).getAllByRole("list");
  // Oldest first, left to right as drawn, so a screen reader and Tab do not run backwards: this
  // week, where the strip rests, is the last.
  expect(weeks).toHaveLength(8);
  expect(weeks[0]!.getAttribute("aria-label")).toBe("3\u00a0Aug – 9\u00a0Aug\u00a02026");
  expect(
    within(weeks[7]!)
      .getAllByRole("link")
      .map((link) => link.getAttribute("aria-label")),
  ).toEqual([
    "Monday\u00a021\u00a0September",
    "Tuesday\u00a022\u00a0September",
    "Wednesday\u00a023\u00a0September",
    "Thursday\u00a024\u00a0September",
    "Friday\u00a025\u00a0September, over the goal",
    "Saturday\u00a026\u00a0September, food logged",
    "Sunday\u00a027\u00a0September, today",
  ]);
  expect(
    within(weeks[2]!).getByRole("link", { name: "Thursday\u00a020\u00a0August, goal met" }),
  ).toBeTruthy();
});
