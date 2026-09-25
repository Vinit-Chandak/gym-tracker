// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ActivityRow } from "@/app/(app)/profile/friends/activity-row";
import type { ActivityRow as Activity } from "@/server/repositories/shared-stats";

import { ExerciseBestsTiles, PeriodRecordsList, SessionRecordsCard } from "./records-card";

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
  expect(screen.getByText(/Est\. 1RM/).textContent).toContain("194 lb (was 187.4 lb)");
  expect(screen.getByText(/Most reps/).textContent).toContain("12 reps (was 11 reps)");
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
        { metric: "top_weight", value: 10, occurredOn: "2026-08-30", work: { sets: 3, reps: 8 } },
      ]}
    />,
  );
  expect(screen.getByText("Added load")).toBeTruthy();
  expect(screen.getByText("10 kg")).toBeTruthy();
  expect(screen.getByText("3 × 8 · 30 Aug 2026")).toBeTruthy();
  expect(screen.getByText("8 Sept 2026")).toBeTruthy();
});

it("lists period records with the metric and day under the name", () => {
  render(
    <PeriodRecordsList
      unit="kg"
      records={[{ exercise: bench, metric: "e1rm", value: 81.7, occurredOn: "2026-09-08" }]}
    />,
  );
  expect(screen.getByText("Barbell bench press")).toBeTruthy();
  expect(screen.getByText("Est. 1RM · 8 Sept 2026")).toBeTruthy();
  expect(screen.getByText("81.7 kg")).toBeTruthy();
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
  render(<ActivityRow row={row({})} unit="kg" today="2026-09-15" />);
  // The shared row's own id: a raw activity id would name a private record (AT-PRIV-04).
  expect(screen.getByRole("link").getAttribute("href")).toBe("/u/phani03/activities/1");
  expect(screen.getByText("Upper A · 18 sets · 6,240 kg · 2 records")).toBeTruthy();
  expect(screen.getByText("Yesterday")).toBeTruthy();
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
      today="2026-09-15"
    />,
  );
  expect(screen.getByText("Run · 5.2 km · 28:10 · 5:25 /km")).toBeTruthy();
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
      today="2026-09-15"
    />,
  );
  expect(screen.getByText("Ride · 18.2 km · 30:00")).toBeTruthy();
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
      today="2026-09-15"
    />,
  );
  expect(screen.getByText("Swim · 25:00")).toBeTruthy();
});
