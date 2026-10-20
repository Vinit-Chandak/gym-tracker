// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { CoachPending, CoachRequestPanel, CoachWaiting } from "./coach-actions";

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

it("says in one line what applies while the coach has not reached it, and starts it on a tap", async () => {
  vi.useRealTimers();
  start.mockResolvedValue({ ok: true, value: { jobId: "job-1" } });
  render(<CoachWaiting jobId="job-1" attempted={false} hasPlan={false} />);
  // What stands, and nothing of how or when the coach runs (DESIGN.md, Coach note).
  expect(screen.getByRole("status").textContent).toBe("Not prepared yet: programme targets apply.");
  expect(screen.queryByText(/Preparing for/)).toBeNull();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Prepare now" }));
  });
  expect(start).toHaveBeenCalledWith("job-1");
  // The action's revalidatePath carries the new render; another refresh repeats its reads.
  expect(router.refresh).not.toHaveBeenCalled();
});

it("says the coach could not finish, and that what it prepared earlier applies", () => {
  render(<CoachWaiting jobId="job-1" attempted hasPlan />);
  expect(screen.getByRole("status").textContent).toBe(
    "Preparation failed: the earlier preparation applies.",
  );
  cleanup();
  render(<CoachWaiting jobId="job-1" attempted hasPlan={false} />);
  expect(screen.getByRole("status").textContent).toBe(
    "Preparation failed: programme targets apply.",
  );
});

it("counts the requests left, and keeps what they are shared with a tap away", () => {
  vi.useRealTimers();
  render(
    <CoachRequestPanel
      gyms={[{ id: "g1", name: "Anytime Fitness", isDefault: true }]}
      requestsLeft={3}
      onDone={vi.fn()}
      onBack={vi.fn()}
      workflow
    />,
  );
  expect(screen.getByText("3 requests left today")).toBeTruthy();
  expect(screen.getByLabelText(/^Note for the coach/)).toBeTruthy();
  // No paragraph on how daily preparation works; the reset and the sharing are behind the ⓘ.
  expect(screen.queryByText(/automatic/)).toBeNull();
  expect(screen.queryByText(/Shared with new programmes/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "About requests" }));
  expect(
    screen.getByText("Shared with new programmes. They reset at midnight in your time zone."),
  ).toBeTruthy();
});

it("says where and since when the coach is preparing, and nothing about refreshing", () => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  render(
    <CoachPending
      startedAt={new Date().toISOString()}
      startedAtLabel="04:00"
      gymName="Anytime Fitness"
    />,
  );
  expect(screen.getByRole("status").textContent).toBe(
    "Preparing for Anytime Fitness ·\u00a0since 04:00",
  );
});
