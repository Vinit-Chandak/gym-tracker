// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { PickUpFromToday, StartAdHocButton, StartPlannedButton } from "./plan-actions";

vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("@/server/actions/sessions", () => ({
  completeRestSlotAction: vi.fn(),
  pickUpFromTodayAction: vi.fn(),
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

/**
 * Year review, 12 October 2026: from a zero basis the count never asked the row to wrap, so at
 * 200% text Pick up from today kept its line and "10 sessions behind" was squeezed to a letter
 * a line beside it. The count asks for its own width: whole beside the button, or the button
 * under it, at the end, as a name's button goes (rows.css takes it to the row's width at large
 * text). A wrapped button had stood at the start, under the count, on a 320-pt phone at 100%.
 */
it("keeps the count whole beside Pick up from today, or puts the button under it at the end", () => {
  const missed = Array.from({ length: 10 }, (_, i) => ({
    cycleIndex: 13,
    dayIndex: i + 1,
    name: `Day ${i + 1}`,
  }));
  render(<PickUpFromToday missed={missed} resumeDayName="Upper" />);
  const count = screen.getByText(
    (_, element) => element?.tagName === "P" && element.textContent === "10 sessions behind",
  );
  const row = count.parentElement!;
  expect(row.classList).toContain("pick-up");
  expect(row.classList).toContain("flex-wrap");
  // Its own width, and nothing that sets a basis of zero or of a fixed width beside it.
  expect(count.classList).toContain("flex-auto");
  expect([...count.classList].filter((name) => /^(flex-1|basis-|flex-\[)/.test(name))).toEqual([]);
  const button = screen.getByRole("button", { name: "Pick up from today" });
  expect(row.lastElementChild).toBe(button);
  expect(button.classList).toContain("ml-auto");
  expect(row.classList).not.toContain("justify-between");
});
