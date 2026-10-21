// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import type { WeekSession } from "@/domain/plan-week";

import { PlanView, programmeWeeks, type PlanCard } from "./plan-view";

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
  const today = screen.getByRole("link", { name: /^Lower A/ });
  expect(today.getAttribute("href")).toBe("/today");
  expect(today.closest("details")).toBeNull();
  const later = screen.getByRole("link", { name: /^Upper B/ });
  expect(later.getAttribute("href")).toBe("/plan/strength/days/day-4");
  expect(later.closest("details")).toBeNull();
  expect(screen.getByText("Wed 21 Oct")).toBeTruthy();
});

/** Owner, 21 October 2026: a tab's root opens on its subject, never the tab's name. */
it("opens on the week, its dates under it and New programme at its end", () => {
  show(WEEK);
  expect(screen.getByRole("heading", { level: 1, name: "Plan, This week" })).toBeTruthy();
  expect(screen.queryByText("Plan", { exact: true })).toBeNull();
  expect(read(document.querySelector(".page-root-meta")!)).toBe("19 to 25 October");
  expect(
    screen.getByRole("link", { name: "New programme" }).closest(".page-root-action"),
  ).not.toBeNull();
  // Another week says how far it is from this one; its dates say which it is.
  cleanup();
  show(WEEK, "2026-10-26");
  expect(screen.getByRole("heading", { level: 1, name: "Plan, Next week" })).toBeTruthy();
  expect(read(document.querySelector(".page-root-meta")!)).toBe("26 October to 1 November");
  cleanup();
  show(WEEK, "2026-09-28");
  expect(screen.getByRole("heading", { level: 1, name: "Plan, 3 weeks ago" })).toBeTruthy();
});

it("draws the week as seven day papers, each leading to its day", () => {
  const { container } = show(WEEK);
  const papers = within(screen.getByRole("group", { name: "The week, day by day" }));
  // Each paper is named by its day, held whole ("19 October"), and what it holds.
  const day = (weekday: string, date: string, holds: string) =>
    `${weekday} ${date.replace(" ", "\u00a0")}${holds}`;
  // Monday holds two sessions: its paper leads to its day's entry under the week.
  const monday = papers.getByRole("link", {
    name: day("Monday", "19 October", ": Upper A, done; Easy run, missed"),
  });
  expect(monday.getAttribute("href")).toBe("#plan-day-2026-10-19");
  expect(container.querySelector("#plan-day-2026-10-19")).not.toBeNull();
  // Today's one session is Today's; it is ringed, as the month rings today.
  const today = papers.getByRole("link", {
    name: day("Tuesday", "20 October", ", today: Lower A, to do"),
  });
  expect(today.getAttribute("href")).toBe("/today");
  expect(today.className).toContain("month-day-today");
  expect(
    papers
      .getByRole("link", { name: day("Wednesday", "21 October", ": Upper B, to do") })
      .getAttribute("href"),
  ).toBe("/plan/strength/days/day-4");
  // A day with nothing in it is a paler sheet, and nothing to open.
  const thursday = papers.getByRole("img", {
    name: day("Thursday", "22 October", ": nothing planned"),
  });
  expect(thursday.className).toContain("month-day-rest");
  expect(container.querySelectorAll(".plan-papers .month-day")).toHaveLength(7);
  // Each session is its sport's mark in its state: two on Monday, one on each other day.
  expect(monday.querySelectorAll("svg")).toHaveLength(2);
});

it("steps to the weeks either side under the week, each named from today", () => {
  show(WEEK);
  const weeks = within(screen.getByRole("navigation", { name: "Weeks" }));
  expect(weeks.getByRole("link", { name: "Last week" }).getAttribute("href")).toBe(
    "/plan?week=2026-10-12",
  );
  expect(weeks.getByRole("link", { name: "Next week" }).getAttribute("href")).toBe(
    "/plan?week=2026-10-26",
  );
});

it("draws a programme's weeks as segments in its sport's pigment, only where it counts weeks", () => {
  const { container } = show(WEEK);
  const weeks = container.querySelector(".plan-programme-weeks")!;
  expect(weeks.getAttribute("data-sport")).toBe("strength");
  expect(weeks.getAttribute("aria-hidden")).toBe("true");
  // Week 3 of 8: two done, the third under way, five to come.
  expect([...weeks.children].map((segment) => segment.getAttribute("data-state"))).toEqual([
    "done",
    "done",
    "now",
    null,
    null,
    null,
    null,
    null,
  ]);
  expect(programmeWeeks("Cycle 5 of 14")).toEqual({ current: 5, total: 14 });
  expect(programmeWeeks("Day 12 of 40")).toBeNull();
  expect(programmeWeeks("Starts Mon 26 Oct")).toBeNull();
  expect(programmeWeeks(null)).toBeNull();
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
