// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NavigationFeedback } from "./navigation-feedback";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("shows feedback outside clipped containers, then exposes a retry for a slow request", () => {
  vi.useFakeTimers();
  const { container, unmount } = render(<NavigationFeedback href="/progress?from=2026-09-01" />);
  expect(screen.getByRole("status").parentElement).toBe(document.body);
  expect(container.textContent).toBe("");
  expect(screen.queryByRole("link", { name: "Retry" })).toBeNull();
  act(() => vi.advanceTimersByTime(8000));
  expect(screen.getByRole("link", { name: "Retry" }).getAttribute("href")).toBe(
    "/progress?from=2026-09-01",
  );
  unmount();
  expect(screen.queryByRole("status")).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});
it("explains an offline request immediately and responds when the connection returns", () => {
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  render(<NavigationFeedback href="/gyms" />);
  expect(screen.getByText(/You’re offline/)).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Retry" })).toBeNull();
  online.mockReturnValue(true);
  act(() => window.dispatchEvent(new Event("online")));
  expect(screen.queryByText(/You’re offline/)).toBeNull();
});
