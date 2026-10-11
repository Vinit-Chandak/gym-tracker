// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { formatIsoWeekdayDay } from "@/lib/format";

import { MealView } from "./meal-view";

const { rollover } = vi.hoisted(() => ({ rollover: vi.fn() }));
vi.mock("../day-rollover", () => ({
  FoodDayRollover: (props: unknown) => {
    rollover(props);
    return null;
  },
}));
vi.mock("@/components/shell/back-link", () => ({ BackLink: () => null }));
vi.mock("@/server/actions/nutrition", () => ({}));
afterEach(() => {
  cleanup();
  rollover.mockClear();
});

const EMPTY = { entries: [], foods: [], savedMeals: [] };

it("keeps today's meal on its day past midnight, and writes the day once it is not today", () => {
  render(
    <MealView timeZone="Asia/Kolkata" today="2026-09-25" meal="late_night_snack" screen={EMPTY} />,
  );
  expect(rollover).toHaveBeenLastCalledWith({
    today: "2026-09-25",
    timeZone: "Asia/Kolkata",
    keep: "/food/late-night-snack?day=2026-09-25",
  });
  // Today's day is said with the title, not written under it.
  const day = formatIsoWeekdayDay("2026-09-25");
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(`Late-night snack, ${day}`);
  expect(document.querySelector(".meta-line")).toBeNull();
  cleanup();

  // The page as it is drawn again after midnight: the same day, no longer today, so written.
  render(
    <MealView
      timeZone="Asia/Kolkata"
      today="2026-09-26"
      date="2026-09-25"
      meal="late_night_snack"
      screen={EMPTY}
    />,
  );
  expect(rollover).toHaveBeenLastCalledWith({
    today: "2026-09-26",
    timeZone: "Asia/Kolkata",
    keep: undefined,
  });
  expect(document.querySelector(".meta-line")?.textContent).toBe(day);
});
