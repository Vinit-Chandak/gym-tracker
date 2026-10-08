// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import type { HistoryItem } from "../history/history-list";
import type { ProgressData } from "../progress-types";
import { OverviewSection } from "./overview-section";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/progress",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/ui/app-link", () => ({
  default: ({
    prefetch: _prefetch,
    ...props
  }: ComponentProps<"a"> & { prefetch?: boolean | "intent" }) => <a {...props} />,
}));
afterEach(cleanup);

const TODAY = "2026-10-08";

/** October on the 8th: a lift and a run on the 1st, a lift on the 2nd, runs on the 6th and 7th. */
const MONTH: ProgressData["month"] = {
  month: "2026-10",
  today: 8,
  activities: [
    {
      sport: "strength",
      occurredOn: "2026-10-01",
      durationMs: 62 * 60_000,
      distanceMetres: null,
      environment: null,
    },
    {
      sport: "running",
      occurredOn: "2026-10-01",
      durationMs: 1_350_000,
      distanceMetres: 3000,
      environment: "outdoor",
    },
    {
      sport: "strength",
      occurredOn: "2026-10-02",
      durationMs: 71 * 60_000,
      distanceMetres: null,
      environment: null,
    },
    {
      sport: "running",
      occurredOn: "2026-10-06",
      durationMs: 1_390_000,
      distanceMetres: 3100,
      environment: "treadmill",
    },
    {
      sport: "running",
      occurredOn: "2026-10-07",
      durationMs: 1_420_000,
      distanceMetres: 3100,
      environment: "outdoor",
    },
  ],
};

const entry = (id: string, kind: HistoryItem["kind"], day: string, title: string): HistoryItem => ({
  id,
  kind,
  date: `${day}T12:00:00.000Z`,
  day,
  title,
  subtitle: "18:30 · Anytime Fitness",
  meta: kind === "workout" ? "16 sets" : "23:40 · 7:38/km",
  gymId: null,
  exercises: [],
  href: kind === "workout" ? `/workouts/${id}` : `/training/activities/${id}`,
});

it("keys the month with each sport's count, distance and time", () => {
  render(<OverviewSection today={TODAY} month={MONTH} overview={{ latest: [] }} />);
  const key = within(screen.getByRole("region", { name: "Sessions in October" }));
  const [lifting, runs] = key.getAllByRole("listitem");
  // 62 + 71 minutes of lifting; 9.2 km run in 69 minutes. No span, and no training totals.
  expect(lifting?.textContent).toBe("2Lifting2 h 13 min");
  expect(runs?.textContent).toBe("3Runs9.2 km1 h 9 min");
  expect(screen.queryByText("Training totals")).toBeNull();
  // Nothing logged at all: no list under the month, which already says so.
  expect(screen.queryByRole("heading", { name: /History/ })).toBeNull();
});

it("lists History's latest ten under the month, naming the month it runs back into", () => {
  render(
    <OverviewSection
      today={TODAY}
      month={MONTH}
      overview={{
        latest: [
          entry("r2", "run", "2026-10-07", "Outdoor · 3.1 km"),
          entry("w2", "workout", "2026-10-02", "Lower B"),
          entry("w1", "workout", "2026-09-30", "Upper A"),
          entry("r1", "run", "2026-09-29", "Outdoor · 2.8 km"),
        ],
      }}
    />,
  );
  const latest = within(screen.getByRole("region", { name: /^History/ }));
  // Every entry, its pages and its filters are one tap on.
  expect(latest.getByRole("link", { name: "All history" }).getAttribute("href")).toBe(
    "/progress/history",
  );
  // Each entry under its day; the days the calendar above holds stand under no month of their own,
  // and September is named once, over its first day.
  expect(latest.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
    "Wed 7 Oct",
    "Fri 2 Oct",
    "September",
    "Wed 30 Sept",
    "Tue 29 Sept",
  ]);
  const lift = latest.getByRole("link", { name: /Lower B/ });
  expect(lift.getAttribute("href")).toBe("/workouts/w2");
  expect(lift.textContent).toContain("16 sets");
  expect(latest.getAllByRole("img", { name: "Run" })).toHaveLength(2);
});
