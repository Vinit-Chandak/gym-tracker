// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { RestTimer, startRestTimer } from "./rest-timer";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-26T08:00:00Z"));
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("keeps a usable countdown when storage writes fail", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Full", "QuotaExceededError");
  });
  const view = render(<RestTimer sessionId="storage-limited" />);
  act(() => startRestTimer("storage-limited", 60));
  expect(screen.getByRole("timer").textContent).toContain("1:00");
  act(() => vi.advanceTimersByTime(30_000));
  expect(screen.getByRole("timer").textContent).toContain("0:30");
  view.unmount();
  render(<RestTimer sessionId="storage-limited" />);
  expect(screen.getByRole("timer").textContent).toContain("0:30");
  fireEvent.click(screen.getByRole("button", { name: "+30 s" }));
  expect(screen.getByRole("timer").textContent).toContain("1:00");
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  expect(screen.queryByRole("timer")).toBeNull();
});

it("can stop a persisted timer after access to storage is blocked", () => {
  act(() => startRestTimer("blocked-after-start", 60));
  render(<RestTimer sessionId="blocked-after-start" />);
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
    throw new DOMException("Blocked", "SecurityError");
  });
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  expect(screen.queryByRole("timer")).toBeNull();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.queryByRole("timer")).toBeNull();
});
