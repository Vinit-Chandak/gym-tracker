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

/** Owner, 28 October 2026: the week is one card, each fact said once. */
it("folds the days gone by into one closed row saying what became of them", () => {
  const { container } = show(WEEK);
  expect(container.querySelectorAll("details")).toHaveLength(1);
  const gone = container.querySelector("details")!;
  const summary = gone.querySelector("summary")!;
  expect(gone.open).toBe(false);
  expect(read(summary)).toBe("Mon 19, 1 done · 1 missed");

  // Opened, it shows the day's rows: the lifting day opens its day's page, the run its own,
  // each saying once what became of it.
  fireEvent.click(summary);
  expect(gone.open).toBe(true);
  const rows = within(gone);
  const upper = rows.getByRole("link", { name: /Upper A/ });
  expect(upper.getAttribute("href")).toBe("/plan/strength/days/day-1");
  expect(read(upper)).toBe("Upper ADone");
  const run = rows.getByRole("link", { name: /Easy run/ });
  expect(run.getAttribute("href")).toBe("/plan/sessions/session-2");
  expect(read(run)).toBe("Easy runMissed");
});

it("keeps today and the days to come open, today's lifting day pointing to Today", () => {
  show(WEEK);
  const today = screen.getByRole("link", { name: /^Lower A/ });
  expect(today.getAttribute("href")).toBe("/today");
  expect(today.closest("details")).toBeNull();
  const later = screen.getByRole("link", { name: /^Upper B/ });
  expect(later.getAttribute("href")).toBe("/plan/strength/days/day-4");
  expect(later.closest("details")).toBeNull();
  // Each day is heard by its date, in the app's notation.
  expect(screen.getByRole("heading", { level: 3, name: /^Wed\s21\sOct$/ })).toBeTruthy();
});

/** Owner, 21 and 28 October 2026: a tab's root opens on its subject, in two tones. */
it("opens on the week, its dates its second tone and its steps at its end", () => {
  show(WEEK);
  expect(screen.getByRole("heading", { level: 1, name: "Plan, This week" })).toBeTruthy();
  expect(screen.queryByText("Plan", { exact: true })).toBeNull();
  expect(read(document.querySelector(".page-root-meta")!)).toBe("19 – 25 Oct");
  expect(
    screen.getByRole("navigation", { name: "Weeks" }).closest(".page-root-action"),
  ).not.toBeNull();
  // Starting a programme stands with the programmes, at the end of their heading.
  const add = screen.getByRole("link", { name: "New programme" });
  expect(add.getAttribute("href")).toBe("/plan/new");
  expect(add.closest(".heading-row")?.textContent).toContain("Programmes");
  // Another week says how far it is from this one; its dates say which it is.
  cleanup();
  show(WEEK, "2026-10-26");
  expect(screen.getByRole("heading", { level: 1, name: "Plan, Next week" })).toBeTruthy();
  expect(read(document.querySelector(".page-root-meta")!)).toBe("26 Oct – 1 Nov");
  cleanup();
  show(WEEK, "2026-09-28");
  expect(screen.getByRole("heading", { level: 1, name: "Plan, 3 weeks ago" })).toBeTruthy();
});

it("marks today with the one dark disc, leaves out empty days and says a state only once", () => {
  const { container } = show(WEEK);
  // The week's calendar is its date column: today's day is the one disc in it.
  const discs = container.querySelectorAll(".plan-date-today");
  expect(discs).toHaveLength(1);
  expect(discs[0]!.closest("#plan-day-2026-10-20")).not.toBeNull();
  // Today's session says nothing more: the disc says today.
  expect(read(screen.getByRole("link", { name: /^Lower A/ }))).toBe("Lower A");
  // A day with nothing planned is left out.
  expect(container.querySelector("#plan-day-2026-10-22")).toBeNull();
  // Each session has its sport's sign, once.
  expect(screen.getByRole("link", { name: /^Lower A/ }).querySelectorAll("svg")).toHaveLength(1);
});

it("steps to the weeks either side, each named from today", () => {
  show(WEEK);
  const weeks = within(screen.getByRole("navigation", { name: "Weeks" }));
  expect(weeks.getByRole("link", { name: "Last week" }).getAttribute("href")).toBe(
    "/plan?week=2026-10-12",
  );
  expect(weeks.getByRole("link", { name: "Next week" }).getAttribute("href")).toBe(
    "/plan?week=2026-10-26",
  );
});

it("lists each programme with how it runs, where it has got to and what waits on it", () => {
  render(
    <PlanView
      cards={[
        CARD,
        {
          ...CARD,
          programme: { id: "run", sport: "running", name: "Hybrid Half Marathon" },
          waiting: [{ id: "draft", status: "ready", headline: null }],
          pattern: "Progressive",
          position: "Week 5 of 12",
        },
      ]}
      sessions={WEEK}
      monday={MONDAY}
      today={TODAY}
    />,
  );
  const strength = screen.getByRole("link", { name: /^8-Week Strength/ });
  expect(strength.getAttribute("href")).toBe("/plan/strength");
  expect(read(strength)).toContain("Every week · Week 3 of 8");
  expect(within(strength).getByRole("img", { name: "Strength" })).toBeTruthy();
  const run = screen.getByRole("link", { name: /^Hybrid Half Marathon/ });
  expect(read(run)).toContain("Changes to review");
  // Never a bar on Plan: where it has got to is said in its words, and drawn on its page.
  expect(document.querySelector('[role="img"][aria-label*="sessions done"]')).toBeNull();
  // Past programmes ends the list.
  expect(screen.getByRole("link", { name: "Past programmes" }).getAttribute("href")).toBe(
    "/plan/past",
  );
});

it("shows a week gone by whole, each day saying what became of its sessions", () => {
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
  // Opened on purpose, a past week is read whole: nothing in it is folded.
  expect(container.querySelectorAll("details")).toHaveLength(0);
  expect(read(screen.getByRole("link", { name: /^Upper A/ }))).toBe("Upper ASkipped");
  expect(read(screen.getByRole("link", { name: /^Long run/ }))).toBe("Long runMissed");
  expect(container.querySelectorAll(".plan-day")).toHaveLength(3);
});
