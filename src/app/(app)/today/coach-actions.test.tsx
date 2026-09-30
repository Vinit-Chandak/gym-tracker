// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { CoachPending, CoachWaiting } from "./coach-actions";

const { router, start } = vi.hoisted(() => ({
  router: { refresh: vi.fn() },
  start: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/server/actions/coach", () => ({ requestCoachPlanAction: vi.fn() }));
vi.mock("@/server/actions/coaching-workflow", () => ({ startWaitingCoachJobAction: start }));

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

it("says nothing is planning a session the coach did not reach, and starts it on a tap", async () => {
  vi.useRealTimers();
  start.mockResolvedValue({ ok: true, value: { jobId: "job-1" } });
  render(<CoachWaiting jobId="job-1" attempted={false} hasPlan={false} />);
  expect(screen.getByRole("status").textContent).toBe(
    "The coach has not planned this session yet. Your programme's own targets apply until it does. It tries again at its next nightly run.",
  );
  expect(screen.queryByText(/is planning/)).toBeNull();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Ask the coach to plan it now" }));
  });
  expect(start).toHaveBeenCalledWith("job-1");
  // The action's revalidatePath carries the new render; another refresh repeats its reads.
  expect(router.refresh).not.toHaveBeenCalled();
});

it("says the coach could not finish, and that its earlier plan stands", () => {
  render(<CoachWaiting jobId="job-1" attempted hasPlan />);
  expect(screen.getByRole("status").textContent).toBe(
    "The coach could not finish planning this session. Its earlier plan stands until it does. It tries again at its next nightly run.",
  );
});
