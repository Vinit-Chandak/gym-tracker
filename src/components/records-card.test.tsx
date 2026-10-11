// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ActivityRow } from "@/app/(app)/profile/friends/activity-row";
import { DEFAULT_DISTANCE_UNITS } from "@/lib/format";
import type { ActivityRow as Activity } from "@/server/repositories/shared-stats";

import { ExerciseBestsTiles, PeriodRecordsList, SessionRecordsCard } from "./records-card";

/**
 * The innermost element whose whole text, its spaces read as the default matcher reads them, is
 * `text`: a figure's digits stand in a span of their own (Figures).
 */
const whole = (text: string | RegExp) => (_: string, element: Element | null) => {
  const reads = (node: Element) => {
    if (node.classList.contains("figures")) return false;
    const value = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    return typeof text === "string" ? value === text : text.test(value);
  };
  return element !== null && reads(element) && ![...element.children].some(reads);
};

// Rows in long lists prefetch on touch, through the router (app-link.tsx).
vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch: vi.fn() }) }));

afterEach(cleanup);

const bench = {
  id: "bench",
  name: "Barbell bench press",
  modality: "barbell",
  defaultPrescriptionType: "reps",
} as const;
const pullUp = {
  id: "pull-up",
  name: "Pull-up",
  modality: "bodyweight",
  defaultPrescriptionType: "reps",
} as const;

it("says each record in the reader's unit, with what it was before", () => {
  render(
    <SessionRecordsCard
      unit="lb"
      records={[
        { exerciseId: "bench", metric: "e1rm", value: 88, previous: 85, exercise: bench },
        { exerciseId: "pull-up", metric: "most_reps", value: 12, previous: 11, exercise: pullUp },
      ]}
    />,
  );
  expect(screen.getByRole("heading", { name: "2 records" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Barbell bench press" }).getAttribute("href")).toBe(
    "/exercises/bench",
  );
  // The metric and what it was under the exercise, the new figure trailing.
  const rows = screen.getAllByRole("listitem").map((row) => row.textContent?.replace(/\s+/g, " "));
  expect(rows).toEqual([
    "Barbell bench press Est. 1RM · was 187.4 lb 194 lb",
    "Pull-up Most reps · was 11 reps 12 reps",
  ]);
});

it("renders nothing at all when a session set no records", () => {
  const { container } = render(<SessionRecordsCard unit="kg" records={[]} />);
  expect(container.innerHTML).toBe("");
});

it("tiles the bests with their dates, labelled for the movement", () => {
  render(
    <ExerciseBestsTiles
      unit="kg"
      exercise={pullUp}
      bests={[
        { metric: "most_reps", value: 12, occurredOn: "2026-09-08", work: null },
        { metric: "top_weight", value: 10, occurredOn: "2025-08-30", work: { sets: 3, reps: 8 } },
      ]}
      currentYear="2026"
    />,
  );
  expect(screen.getByText("Added load")).toBeTruthy();
  // The figure in Jost and its unit in Atkinson, read as one.
  expect(
    screen.getByText(
      (_, element) => element?.tagName === "SPAN" && element.textContent === "10\u00a0kg",
    ),
  ).toBeTruthy();
  expect(document.querySelector(".figures")?.textContent).toBe("12");
  // Each number named: "3 × 8" read as three sets of eight, which it need not have been. A day
  // in another year names it; one in this year does not.
  expect(screen.getByText(/^8 reps · 3 sets · Sat\s30\sAug\s2025$/)).toBeTruthy();
  expect(screen.getByText(/^Tue\s8\sSept$/)).toBeTruthy();
});

it("lists period records with the metric and day under the name", () => {
  render(
    <PeriodRecordsList
      unit="kg"
      records={[{ exercise: bench, metric: "e1rm", value: 81.7, occurredOn: "2026-09-08" }]}
      currentYear="2026"
    />,
  );
  expect(screen.getByText("Barbell bench press")).toBeTruthy();
  // "Est. 1RM · 15 Sept 2026" on a profile beside the exercise page's "Thu 8 Oct": the same
  // day as the exercise page writes it, with no year inside this one (ADR 0044).
  expect(screen.getByText(/^Est\. 1RM ·\sTue\s8\sSept$/)).toBeTruthy();
  // The value at the row's end, its figure in Jost.
  const value = screen.getByText("Barbell bench press").closest("li")!.lastElementChild!;
  expect(value.textContent).toBe("81.7\u00a0kg");
  expect(value.querySelector(".figures")?.textContent).toBe("81.7");
});

const row = (over: Partial<Activity>): Activity => ({
  id: "1",
  person: { id: "p", username: "phani03", displayName: null },
  sport: "workout",
  title: "Upper A",
  occurredOn: "2026-09-14",
  startedAt: new Date("2026-09-14T13:00:00Z"),
  durationSeconds: 3600,
  workingSets: 18,
  volumeKg: 6240,
  distanceMeters: null,
  paceSecondsPerKm: null,
  records: 2,
  ...over,
});

it("reads a workout row and a run row the way the plan writes them", () => {
  render(
    <ActivityRow
      row={row({})}
      unit="kg"
      distanceUnits={DEFAULT_DISTANCE_UNITS}
      today="2026-09-15"
    />,
  );
  // The shared row's own id: a raw activity id would name a private record (AT-PRIV-04).
  expect(screen.getByRole("link").getAttribute("href")).toBe("/u/phani03/activities/1");
  expect(screen.getByText(whole("Upper A · 18 sets · 6,240 kg · 2 records"))).toBeTruthy();
  expect(screen.getByText("Yesterday")).toBeTruthy();
  cleanup();
  // Bodyweight sets and holds moved no load, and say so by saying none: never "· 0 kg".
  render(
    <ActivityRow
      row={row({ title: "Workout", workingSets: 3, volumeKg: 0, records: 0 })}
      unit="kg"
      distanceUnits={DEFAULT_DISTANCE_UNITS}
      today="2026-09-15"
    />,
  );
  expect(screen.getByText(whole("Workout · 3 sets"))).toBeTruthy();
  cleanup();
  render(
    <ActivityRow
      row={row({
        sport: "run",
        title: "Run",
        durationSeconds: 1690,
        distanceMeters: 5200,
        paceSecondsPerKm: 325,
        records: 0,
        occurredOn: "2026-09-15",
      })}
      unit="kg"
      distanceUnits={DEFAULT_DISTANCE_UNITS}
      today="2026-09-15"
    />,
  );
  expect(screen.getByText(whole("Run · 5.2 km · 28:10 · 5:25 /km"))).toBeTruthy();
  expect(screen.getByText("Today")).toBeTruthy();
  cleanup();

  /**
   * AT-PRIV-02: a shared ride says it happened and how long it took, and no more.
   *
   * No pace, because indoors, outdoors and assisted are not comparable and a bare number
   * would be read as though they were. An unknown distance is simply absent rather than zero.
   */
  render(
    <ActivityRow
      row={row({
        sport: "cycle",
        title: "Ride",
        durationSeconds: 1800,
        distanceMeters: 18200,
        paceSecondsPerKm: null,
        workingSets: 0,
        volumeKg: 0,
        records: 0,
        occurredOn: "2026-09-15",
      })}
      unit="kg"
      distanceUnits={DEFAULT_DISTANCE_UNITS}
      today="2026-09-15"
    />,
  );
  expect(screen.getByText(whole("Ride · 18.2 km · 30:00"))).toBeTruthy();
  cleanup();

  render(
    <ActivityRow
      row={row({
        sport: "swim",
        title: "Swim",
        durationSeconds: 1500,
        distanceMeters: null,
        paceSecondsPerKm: null,
        workingSets: 0,
        volumeKg: 0,
        records: 0,
        occurredOn: "2026-09-15",
      })}
      unit="kg"
      distanceUnits={DEFAULT_DISTANCE_UNITS}
      today="2026-09-15"
    />,
  );
  expect(screen.getByText(whole("Swim · 25:00"))).toBeTruthy();
});

it("reads distances in the reader's own units, and a friend's tomorrow as today", () => {
  const units = { run: "mi", cycle: "km", swim: "yd" } as const;
  render(
    <ActivityRow
      row={row({
        sport: "run",
        title: "Run",
        durationSeconds: 1690,
        distanceMeters: 5200,
        paceSecondsPerKm: 325,
        records: 0,
        // A friend ahead of the reader's time zone is already on the 16th.
        occurredOn: "2026-09-16",
      })}
      unit="kg"
      distanceUnits={units}
      today="2026-09-15"
    />,
  );
  expect(screen.getByText(whole("Run · 3.23 mi · 28:10 · 8:43 /mi"))).toBeTruthy();
  expect(screen.getByText("Today")).toBeTruthy();
  cleanup();
  render(
    <ActivityRow
      row={row({
        sport: "swim",
        title: "Swim",
        durationSeconds: 1500,
        distanceMeters: 1371.6,
        workingSets: 0,
        volumeKg: 0,
        records: 0,
      })}
      unit="kg"
      distanceUnits={units}
      today="2026-09-15"
    />,
  );
  expect(screen.getByText(whole("Swim · 1,500 yd · 25:00"))).toBeTruthy();
});
