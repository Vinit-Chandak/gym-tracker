// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { RestPill, RestTime, startRestTimer } from "./rest-timer";

beforeEach(() => {
  // jsdom has no <dialog> implementation; the sheet only needs these to exist.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-26T08:00:00Z"));
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** The pill's sheet, with +30 s and Stop. */
function openPill() {
  fireEvent.click(screen.getByRole("button", { name: /Rest/ }));
  return within(screen.getByRole("dialog", { hidden: true }));
}

it("keeps a usable countdown when storage writes fail", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Full", "QuotaExceededError");
  });
  const view = render(<RestTime sessionId="storage-limited" />);
  act(() => startRestTimer("storage-limited", 60));
  expect(screen.getByRole("timer").textContent).toContain("1:00");
  act(() => vi.advanceTimersByTime(30_000));
  expect(screen.getByRole("timer").textContent).toContain("0:30");
  view.unmount();
  render(<RestPill sessionId="storage-limited" />);
  // The pill's name carries its visible time (WCAG 2.5.3).
  expect(screen.getByRole("button", { name: /^Rest, 0:30 left\./ })).toBeTruthy();
  fireEvent.click(openPill().getByRole("button", { name: "+30 s", hidden: true }));
  expect(screen.getAllByText("1:00").length).toBeGreaterThan(0);
  fireEvent.click(openPill().getByRole("button", { name: "Stop", hidden: true }));
  expect(screen.queryByRole("button", { name: /^Rest/ })).toBeNull();
});

it("can stop a persisted timer after access to storage is blocked", () => {
  act(() => startRestTimer("blocked-after-start", 60));
  render(<RestPill sessionId="blocked-after-start" />);
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
    throw new DOMException("Blocked", "SecurityError");
  });
  fireEvent.click(openPill().getByRole("button", { name: "Stop", hidden: true }));
  expect(screen.queryByRole("button", { name: /^Rest/ })).toBeNull();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.queryByRole("button", { name: /^Rest/ })).toBeNull();
});

it("names the strip's time as the time left", () => {
  act(() => startRestTimer("named", 134));
  render(<RestTime sessionId="named" />);
  expect(screen.getByRole("timer", { name: "Rest, 2 minutes 14 seconds left" })).toBeTruthy();
});
