// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { readFoodMonthAction } from "@/server/actions/nutrition";

import { FoodCalendarButton, FoodWeekStrip } from "./food-days";

vi.mock("@/components/ui/app-link", () => ({
  default: ({ prefetch: _prefetch, ...props }: ComponentProps<"a"> & { prefetch?: string }) => (
    <a {...props} />
  ),
}));
vi.mock("@/server/actions/nutrition", () => ({ readFoodMonthAction: vi.fn() }));

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
  vi.mocked(readFoodMonthAction).mockReset();
  vi.mocked(readFoodMonthAction).mockResolvedValue([{ date: "2026-08-14", kcal: 2512.4 }]);
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
  expect(calendar.getByRole("link", { name: "Friday 25 September, over the goal" })).toBeTruthy();
  expect(calendar.getByRole("link", { current: "page" }).getAttribute("aria-label")).toBe(
    "Saturday 26 September, food logged",
  );
  expect(
    calendar.getByRole("link", { name: "Sunday 27 September, today" }).getAttribute("href"),
  ).toBe("/food");
  // A day still to come is on the calendar but cannot be opened.
  expect(calendar.queryByRole("link", { name: /28 September/ })).toBeNull();
  expect(calendar.getByText("28")).toBeTruthy();
  expect(calendar.getByRole("button", { name: "Next month" })).toHaveProperty("disabled", true);
});

it("reads a month the strip does not hold when it is turned to, and only once", async () => {
  const calendar = opened();
  fireEvent.click(calendar.getByRole("button", { name: "Previous month" }));
  expect(calendar.getByText("August 2026")).toBeTruthy();
  expect(await calendar.findByRole("link", { name: "Friday 14 August, goal met" })).toBeTruthy();
  // The strip reaches back into August, but not to its start, so August is read whole.
  expect(readFoodMonthAction).toHaveBeenCalledWith("2026-08");
  expect(calendar.getByRole("link", { name: "Thursday 20 August" })).toBeTruthy();

  fireEvent.click(calendar.getByRole("button", { name: "Next month" }));
  fireEvent.click(calendar.getByRole("button", { name: "Previous month" }));
  await waitFor(() => expect(readFoodMonthAction).toHaveBeenCalledOnce());
});

it("opens a day and closes, with Today there while another day is on screen", () => {
  const calendar = opened();
  const thursday = calendar.getByRole("link", { name: "Thursday 24 September" });
  expect(thursday.getAttribute("href")).toBe("/food?day=2026-09-24");
  expect(calendar.getByRole("link", { name: "Today" }).getAttribute("href")).toBe("/food");
  fireEvent.click(thursday);
  expect(sheet().open).toBe(false);

  cleanup();
  render(<FoodCalendarButton {...PROPS} date={TODAY} />);
  fireEvent.click(screen.getByRole("button", { name: "September, calendar" }));
  expect(inSheet().queryByRole("link", { name: "Today" })).toBeNull();
});

it("strips back through whole weeks that end on today, the newest first", () => {
  render(<FoodWeekStrip {...PROPS} />);
  const weeks = within(screen.getByRole("navigation", { name: "Days" })).getAllByRole("list");
  expect(weeks).toHaveLength(8);
  expect(
    within(weeks[0]!)
      .getAllByRole("link")
      .map((link) => link.getAttribute("aria-label")),
  ).toEqual([
    "Monday 21 September",
    "Tuesday 22 September",
    "Wednesday 23 September",
    "Thursday 24 September",
    "Friday 25 September, over the goal",
    "Saturday 26 September, food logged",
    "Sunday 27 September, today",
  ]);
  expect(
    within(weeks[5]!).getByRole("link", { name: "Thursday 20 August, goal met" }),
  ).toBeTruthy();
});
