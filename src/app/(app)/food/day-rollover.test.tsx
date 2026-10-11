// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import type { Route } from "next";
import { afterEach, expect, it, vi } from "vitest";
import { FoodDayRollover } from "./day-rollover";

const { refresh, replace } = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, replace }) }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  refresh.mockClear();
  replace.mockClear();
});

it("refreshes at midnight in the account's time zone, leaving normal minutes alone", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-25T18:28:30Z"));
  render(<FoodDayRollover today="2026-09-25" timeZone="Asia/Kolkata" />);
  act(() => vi.advanceTimersByTime(60_000));
  expect(refresh).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(60_000));
  expect(refresh).toHaveBeenCalledOnce();
});

it("waits for connectivity and visibility before updating an old day", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-26T12:00:00Z"));
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  render(<FoodDayRollover today="2026-09-25" timeZone="Asia/Kolkata" />);
  act(() => vi.advanceTimersByTime(60_000));
  expect(refresh).not.toHaveBeenCalled();
  online.mockReturnValue(true);
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  act(() => window.dispatchEvent(new Event("online")));
  expect(refresh).not.toHaveBeenCalled();
  visibility.mockReturnValue("visible");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(refresh).toHaveBeenCalledOnce();
});

it("keeps a meal's page on the day it showed, its address naming that day, past midnight", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-25T18:28:30Z"));
  render(
    <FoodDayRollover
      today="2026-09-25"
      timeZone="Asia/Kolkata"
      keep={"/food/late-night-snack?day=2026-09-25" as Route}
    />,
  );
  act(() => vi.advanceTimersByTime(60_000));
  expect(replace).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(60_000));
  // In place, where the page is: a sheet open on it stays as it is.
  expect(replace).toHaveBeenCalledExactlyOnceWith("/food/late-night-snack?day=2026-09-25", {
    scroll: false,
  });
  expect(refresh).not.toHaveBeenCalled();
});
