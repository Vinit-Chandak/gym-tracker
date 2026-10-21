// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import type { WeekSession } from "@/domain/plan-week";

import { PlanView, type PlanCard } from "./plan-view";

vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));

afterEach(cleanup);

const MONDAY = "2026-10-19";
const TODAY = "2026-10-20";

const CARD: PlanCard = {
  programme: { id: "programme", sport: "strength", name: "8-Week Strength + Aesthetics Hybrid" },
  waiting: [],
  pattern: "Every week",
  position: "Week 3 of 8",
  finished: false,
};

const session = (
  key: string,
  date: string,
  sport: WeekSession["sport"],
  title: string | null,
  status: WeekSession["status"],
): WeekSession => ({
  key,
  date,
  sport,
  title,
  status,
  occurrenceId: sport === "strength" ? null : `session-${key}`,
  dayId: sport === "strength" ? `day-${key}` : null,
});

/** The week of a Tuesday: Monday lifted and missed its run; today lifts; Wednesday lifts. */
const WEEK = [
  session("1", MONDAY, "strength", "Upper A", "done"),
  session("2", MONDAY, "running", "Easy run", "missed"),
  session("3", TODAY, "strength", "Lower A", "today"),
  session("4", "2026-10-21", "strength", "Upper B", "planned"),
];

const show = (sessions: WeekSession[], monday = MONDAY) =>
  render(<PlanView cards={[CARD]} sessions={sessions} monday={monday} today={TODAY} />);

/** What a row says, as read: no-break spaces as spaces. */
const read = (element: Element) => element.textContent!.replace(/\u00a0/g, " ");

it("folds a day gone by to one closed row naming the day and what became of it", () => {
  const { container } = show(WEEK);
  expect(container.querySelectorAll("details")).toHaveLength(1);
  const gone = container.querySelector("details")!;
  const summary = gone.querySelector("summary")!;
  expect(gone.open).toBe(false);
  expect(read(summary)).toBe("Mon 19 Oct, 1 done · 1 missed");

  // Opened, it shows the day's rows: the lifting day opens its day's page, the run its own.
  fireEvent.click(summary);
  expect(gone.open).toBe(true);
  const rows = within(gone);
  expect(rows.getByRole("link", { name: /Upper A/ }).getAttribute("href")).toBe(
    "/plan/strength/days/day-1",
  );
  expect(rows.getByRole("link", { name: /Easy run/ }).getAttribute("href")).toBe(
    "/plan/sessions/session-2",
  );
});

it("keeps today and the days to come open, today's lifting day pointing to Today", () => {
  show(WEEK);
  const today = screen.getByRole("link", { name: /Lower A/ });
  expect(today.getAttribute("href")).toBe("/today");
  expect(today.closest("details")).toBeNull();
  const later = screen.getByRole("link", { name: /Upper B/ });
  expect(later.getAttribute("href")).toBe("/plan/strength/days/day-4");
  expect(later.closest("details")).toBeNull();
  expect(screen.getByText("Wed 21 Oct")).toBeTruthy();
});

it("folds every day of a week gone by, counting what was done, skipped and missed", () => {
  const { container } = show(
    [
      session("1", "2026-10-13", "strength", "Lower A", "done"),
      session("2", "2026-10-13", "running", "Easy run", "done"),
      session("3", "2026-10-15", "strength", "Upper A", "skipped"),
      session("4", "2026-10-15", "running", "Tempo run", "done"),
      session("5", "2026-10-17", "running", "Long run", "missed"),
    ],
    "2026-10-12",
  );
  expect([...container.querySelectorAll("summary")].map(read)).toEqual([
    "Tue 13 Oct, 2 done",
    "Thu 15 Oct, 1 done · 1 skipped",
    "Sat 17 Oct, 1 missed",
  ]);
  expect([...container.querySelectorAll("details")].every((day) => !day.open)).toBe(true);
});
