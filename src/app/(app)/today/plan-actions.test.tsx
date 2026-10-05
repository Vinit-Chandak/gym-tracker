// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { StartAdHocButton, StartPlannedButton } from "./plan-actions";

vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("@/server/actions/sessions", () => ({
  completeRestSlotAction: vi.fn(),
  skipSlotAction: vi.fn(),
}));
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
  const start = screen.getByRole("link", { name: "Start workout: Lower A" });
  expect(start.textContent).toBe("Start workout");
});

it("goes on to the check-in, which is what starts the session", () => {
  render(
    <StartPlannedButton
      gymId="gym-1"
      programDayId="day-1"
      dayIndex={3}
      fromCycleIndex={2}
      label="Start workout"
    />,
  );
  // Nothing is created by the tap: backing out of the check-in leaves no session behind.
  expect(screen.getByRole("link", { name: "Start workout" }).getAttribute("href")).toBe(
    "/workouts/start?gym=gym-1&day=day-1&index=3&cycle=2",
  );
});

it("starts an unplanned session the same way, at the gym alone", () => {
  render(<StartAdHocButton gymId="gym-1" />);
  expect(
    screen.getByRole("link", { name: "Start an unplanned session" }).getAttribute("href"),
  ).toBe("/workouts/start?gym=gym-1");
});

it("holds Start until there is a gym to train at", () => {
  render(
    <StartPlannedButton gymId={null} programDayId="day-1" dayIndex={1} label="Start workout" />,
  );
  expect(
    (screen.getByRole("button", { name: "Start workout" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.queryByRole("link")).toBeNull();
});
