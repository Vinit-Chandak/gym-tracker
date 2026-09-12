// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { CoachPending } from "./coach-actions";

const { router } = vi.hoisted(() => ({ router: { refresh: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/server/actions/coach", () => ({ requestCoachPlanAction: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-11T09:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  router.refresh.mockClear();
});

it("pauses reads in the background or offline and refreshes on return", () => {
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  render(
    <CoachPending startedAt={new Date().toISOString()} startedAtLabel="09:00" gymName="Test gym" />,
  );
  act(() => vi.advanceTimersByTime(60_000));
  expect(router.refresh).not.toHaveBeenCalled();
  visibility.mockReturnValue("visible");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(router.refresh).toHaveBeenCalledTimes(1);
  online.mockReturnValue(false);
  act(() => vi.advanceTimersByTime(60_000));
  expect(router.refresh).toHaveBeenCalledTimes(1);
  online.mockReturnValue(true);
  act(() => window.dispatchEvent(new Event("online")));
  expect(router.refresh).toHaveBeenCalledTimes(2);
});

it("refreshes after the server timeout even when it expires in the background, then stops", () => {
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  const { unmount } = render(
    <CoachPending startedAt={new Date().toISOString()} startedAtLabel="09:00" gymName="Test gym" />,
  );
  act(() => vi.advanceTimersByTime(16 * 60_000));
  expect(router.refresh).not.toHaveBeenCalled();
  visibility.mockReturnValue("visible");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(router.refresh).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(60_000));
  expect(router.refresh).toHaveBeenCalledTimes(1);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
