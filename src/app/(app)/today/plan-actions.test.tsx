// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { StartPlannedButton } from "./plan-actions";

vi.mock("@/server/actions/sessions", () => ({ startPlannedSessionAction: vi.fn() }));

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
