// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FoodDayRollover } from "./day-rollover";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  refresh.mockClear();
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
