// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
 * 200% text Pick up from today kept its line and the count was squeezed to a letter a line
 * beside it. The count asks for its own width: whole beside the button, or the button under it,
 * at the end, as a name's button goes (rows.css takes it to the row's width at large text). A
 * wrapped button had stood at the start, under the count, on a 320-pt phone at 100%. The count
 * is "10 missed" (ADR 0058, Words), one quiet row with its way out.
 */
it("keeps the count whole beside Pick up from today, or puts the button under it at the end", () => {
  const missed = Array.from({ length: 10 }, (_, i) => ({
    cycleIndex: 13,
    dayIndex: i + 1,
    name: `Day ${i + 1}`,
  }));
  render(<PickUpFromToday missed={missed} resumeDayName="Upper" />);
  const count = screen.getByText(
    (_, element) => element?.tagName === "P" && element.textContent === "10 missed",
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
  // Tonal, never filled: the row stays quiet over the day's first card, and the button still
  // reads as one rather than as words beside the count (owner, 24 October 2026).
  expect(button.classList).toContain("bg-surface-control");
  expect(button.classList).not.toContain("bg-ink");
});

/**
 * Before anything is skipped, the sheet says where the programme carries on from and that the
 * missed days stay as skipped, once; which days they are is folded under it, with their count.
 */
it("says where it carries on from and what becomes of the missed days, and folds their list", () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const missed = Array.from({ length: 8 }, (_, i) => ({
    cycleIndex: 13,
    dayIndex: i + 1,
    name: `Day ${i + 1}`,
  }));
  render(<PickUpFromToday missed={missed} resumeDayName="Upper" />);
  fireEvent.click(screen.getByRole("button", { name: "Pick up from today" }));
  const sheet = within(screen.getByRole("dialog"));
  expect(
    sheet.getByText(
      (_, element) =>
        element?.tagName === "P" &&
        element.textContent ===
          "Your programme carries on from Upper. The missed sessions stay in it as skipped.",
    ),
  ).toBeTruthy();
  const fold = sheet.getByText("Missed sessions").closest("details")!;
  expect(fold.open).toBe(false);
  expect(fold.querySelector("summary")?.textContent).toContain("8");
  expect(within(fold).getByText("and 2 more")).toBeTruthy();
  expect(sheet.getByRole("button", { name: "Skip 8 sessions and pick up" })).toBeTruthy();
});
