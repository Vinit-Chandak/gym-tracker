// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import type { Route } from "next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { DayRollover } from "./day-rollover";

const route = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn(), pathname: "/today" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: route.refresh, replace: route.replace }),
  usePathname: () => route.pathname,
}));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  route.refresh.mockClear();
  route.replace.mockClear();
  route.pathname = "/today";
});

it("refreshes at midnight in the account's time zone, leaving normal minutes alone", () => {
  // 23:58:30 in Kolkata.
  vi.setSystemTime(new Date("2026-09-25T18:28:30Z"));
  render(<DayRollover today="2026-09-25" timeZone="Asia/Kolkata" />);
  act(() => vi.advanceTimersByTime(60_000));
  expect(route.refresh).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(60_000));
  expect(route.refresh).toHaveBeenCalledOnce();
});

it("brings an app reopened the next morning onto the new day as soon as it is shown", () => {
  vi.setSystemTime(new Date("2026-10-10T20:00:00-04:00"));
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const { rerender } = render(<DayRollover today="2026-10-10" timeZone="America/New_York" />);
  visibility.mockReturnValue("hidden");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  // Overnight the page sits in memory; its timers do not run while the phone sleeps.
  vi.setSystemTime(new Date("2026-10-11T07:00:00-04:00"));
  visibility.mockReturnValue("visible");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(route.refresh).toHaveBeenCalledOnce();

  // The refreshed shell says what day it now is, and nothing more is asked.
  rerender(<DayRollover today="2026-10-11" timeZone="America/New_York" />);
  act(() => vi.advanceTimersByTime(10 * 60_000));
  expect(route.refresh).toHaveBeenCalledOnce();
});

it("waits for connectivity and visibility before updating an old day", () => {
  vi.setSystemTime(new Date("2026-09-26T12:00:00Z"));
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  render(<DayRollover today="2026-09-25" timeZone="Asia/Kolkata" />);
  act(() => vi.advanceTimersByTime(60_000));
  expect(route.refresh).not.toHaveBeenCalled();
  online.mockReturnValue(true);
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  act(() => window.dispatchEvent(new Event("online")));
  expect(route.refresh).not.toHaveBeenCalled();
  visibility.mockReturnValue("visible");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(route.refresh).toHaveBeenCalledOnce();
});

it("asks again only every few minutes while the server still says yesterday", () => {
  // The device's clock is past midnight; the server's, a minute behind, is not yet.
  vi.setSystemTime(new Date("2026-09-25T18:30:30Z"));
  render(<DayRollover today="2026-09-25" timeZone="Asia/Kolkata" />);
  expect(route.refresh).toHaveBeenCalledOnce();
  act(() => vi.advanceTimersByTime(4 * 60_000));
  expect(route.refresh).toHaveBeenCalledOnce();
  act(() => vi.advanceTimersByTime(60_000));
  expect(route.refresh).toHaveBeenCalledTimes(2);
});

it("leaves a workout's own screens alone, and catches up once the athlete leaves", () => {
  vi.setSystemTime(new Date("2026-09-26T12:00:00Z"));
  route.pathname = "/workouts/abc";
  const { rerender } = render(<DayRollover today="2026-09-25" timeZone="Asia/Kolkata" />);
  act(() => vi.advanceTimersByTime(5 * 60_000));
  expect(route.refresh).not.toHaveBeenCalled();
  route.pathname = "/today";
  rerender(<DayRollover today="2026-09-25" timeZone="Asia/Kolkata" />);
  expect(route.refresh).toHaveBeenCalledOnce();
});

it("keeps a meal's page on the day it showed, its address naming that day, past midnight", () => {
  vi.setSystemTime(new Date("2026-09-25T18:28:30Z"));
  route.pathname = "/food/late-night-snack";
  render(
    <>
      {/* The shell's own check, which the meal's page takes over while it is up. */}
      <DayRollover today="2026-09-25" timeZone="Asia/Kolkata" />
      <DayRollover
        today="2026-09-25"
        timeZone="Asia/Kolkata"
        keep={"/food/late-night-snack?day=2026-09-25" as Route}
      />
    </>,
  );
  act(() => vi.advanceTimersByTime(60_000));
  expect(route.replace).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(60_000));
  // In place, where the page is: a sheet open on it stays as it is.
  expect(route.replace).toHaveBeenCalledWith("/food/late-night-snack?day=2026-09-25", {
    scroll: false,
  });
  expect(route.refresh).not.toHaveBeenCalled();
});
