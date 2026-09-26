// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { StartPlannedButton } from "./plan-actions";
import { startPlannedSessionAction } from "@/server/actions/sessions";

vi.mock("@/server/actions/sessions", () => ({ startPlannedSessionAction: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));

afterEach(cleanup);

it("names the day without dropping the words the button shows", () => {
  render(
    <StartPlannedButton
      gymId="gym-1"
      programDayId="day-1"
      dayIndex={1}
      label="Start workout"
      dayName="Lower A"
    />,
  );
  // Someone reading the screen says "Start workout"; a name of "Start Lower A" answers to
  // neither that nor the day, so the visible words have to be part of it.
  const button = screen.getByRole("button", { name: "Start workout: Lower A" });
  expect(button.textContent).toBe("Start workout");
});

it("leaves the button's own label alone when there is no day to name", () => {
  render(
    <StartPlannedButton gymId="gym-1" programDayId="day-1" dayIndex={1} label="Start workout" />,
  );
  expect(screen.getByRole("button", { name: "Start workout" })).toBeTruthy();
});

it("keeps the start button usable after a lost connection and permits a retry", async () => {
  const start = vi.mocked(startPlannedSessionAction);
  start.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  start.mockResolvedValueOnce(undefined as never);
  render(
    <StartPlannedButton gymId="gym-1" programDayId="day-1" dayIndex={1} label="Start workout" />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Start workout" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/check your connection/i);
  fireEvent.click(await screen.findByRole("button", { name: "Start workout" }));
  await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});
