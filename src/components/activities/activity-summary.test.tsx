// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { DEFAULT_DISTANCE_UNITS } from "@/lib/format";
import type {
  SharedActivityDetail,
  SharedSessionExercise,
} from "@/server/repositories/shared-stats";

import { ActivitySummary } from "./activity-summary";

afterEach(cleanup);

const activity = (over: Partial<SharedActivityDetail>): SharedActivityDetail => ({
  id: "shared-1",
  sport: "run",
  title: "Run",
  occurredOn: "2026-09-15",
  durationSeconds: 1690,
  workingSets: 0,
  volumeKg: 0,
  distanceMeters: 5200,
  paceSecondsPerKm: 325,
  ...over,
});

const movement = (over: Partial<SharedSessionExercise>): SharedSessionExercise => ({
  id: "bench",
  name: "Barbell bench press",
  modality: "barbell",
  defaultPrescriptionType: "reps",
  comparable: true,
  workingSets: 4,
  topWeightKg: 110,
  topWeightReps: 3,
  mostReps: 8,
  longestDurationSeconds: null,
  longestDistanceMeters: null,
  ...over,
});

/** The figure and unit under one stat's label, as they read. */
function stat(label: string): string | undefined {
  const figure = screen.getByText(label, { selector: "dt" }).nextElementSibling;
  return figure
    ? [...figure.children].map((part) => part.textContent?.trim()).join(" ")
    : undefined;
}

it("says a friend's distance with its unit, in the reader's own", () => {
  render(
    <ActivitySummary
      activity={activity({})}
      name="Kenji"
      unit="kg"
      length="m"
      distanceUnits={DEFAULT_DISTANCE_UNITS}
    />,
  );
  expect(stat("Distance")).toBe("5.2 km");
  expect(stat("Time")).toBe("28:10");
  expect(stat("Pace")).toBe("5:25 /km");
  cleanup();
  render(
    <ActivitySummary
      activity={activity({})}
      name="Kenji"
      unit="kg"
      length="m"
      distanceUnits={{ ...DEFAULT_DISTANCE_UNITS, run: "mi" }}
    />,
  );
  expect(stat("Distance")).toBe("3.23 mi");
  expect(stat("Pace")).toBe("8:43 /mi");
});

it("says a ride in road units and a swim in pool units", () => {
  render(
    <ActivitySummary
      activity={activity({ sport: "cycle", title: "Ride", distanceMeters: 18200 })}
      name="Kenji"
      unit="kg"
      length="m"
      distanceUnits={DEFAULT_DISTANCE_UNITS}
    />,
  );
  expect(stat("Distance")).toBe("18.2 km");
  // No pace for a ride: it would pass for a comparable number.
  expect(screen.queryByText("Pace")).toBeNull();
  cleanup();
  render(
    <ActivitySummary
      activity={activity({ sport: "swim", title: "Swim", distanceMeters: 1500 })}
      name="Kenji"
      unit="kg"
      length="m"
      distanceUnits={DEFAULT_DISTANCE_UNITS}
    />,
  );
  expect(stat("Distance")).toBe("1,500 m");
});

it("words a workout as its owner's record does, and lists what it was made of", () => {
  render(
    <ActivitySummary
      activity={activity({
        sport: "workout",
        title: "Bench volume",
        durationSeconds: 3572,
        workingSets: 16,
        volumeKg: 4667.5,
        distanceMeters: null,
        paceSecondsPerKm: null,
      })}
      exercises={[
        movement({}),
        movement({
          id: "press",
          name: "Chest press (machine)",
          modality: "machine",
          comparable: false,
          workingSets: 3,
          topWeightKg: 50,
        }),
        movement({
          id: "pull-up",
          name: "Pull-up",
          modality: "bodyweight",
          workingSets: 3,
          topWeightKg: 0,
          topWeightReps: 14,
          mostReps: 14,
        }),
        movement({
          id: "plank",
          name: "Plank",
          modality: "bodyweight",
          defaultPrescriptionType: "duration",
          workingSets: 3,
          topWeightKg: null,
          topWeightReps: null,
          mostReps: null,
          longestDurationSeconds: 72,
        }),
      ]}
      name="Kenji"
      unit="lb"
      length="m"
      distanceUnits={DEFAULT_DISTANCE_UNITS}
    />,
  );
  // "60 min", "Sets", "Volume": the finished workout's words, not "59:32" and "Working sets".
  expect(stat("Time")).toBe("60 min");
  expect(stat("Sets")).toBe("16");
  expect(stat("Volume")).toBe("10,290 lb");
  // Each figure on one line with its unit and reps: "110 kg × 3" never breaks.
  const lines = screen
    .getAllByRole("listitem")
    .map((row) => row.textContent?.replaceAll("\u00a0", " "));
  expect(lines).toEqual([
    "Barbell bench press 4 sets · Top weight 242.5 lb × 3",
    // A machine's load is its own: its sets alone.
    "Chest press (machine) 3 sets",
    "Pull-up 3 sets · Most reps 14",
    "Plank 3 sets · Longest hold 1:12",
  ]);
  // Three sets were of a movement Kenji created, which has no shared row.
  expect(
    screen.getByText("3 more sets in exercises Kenji created, which are not shared."),
  ).toBeTruthy();
});

it("says so when none of a workout's movements is shared", () => {
  render(
    <ActivitySummary
      activity={activity({ sport: "workout", title: "Workout", workingSets: 1, volumeKg: 0 })}
      name="Kenji"
      unit="kg"
      length="m"
      distanceUnits={DEFAULT_DISTANCE_UNITS}
    />,
  );
  expect(screen.queryByRole("list")).toBeNull();
  expect(screen.getByText("1 set in exercises Kenji created, which are not shared.")).toBeTruthy();
});

it("says a friend's workout volume whole, in the reader's unit", () => {
  const workout = activity({
    sport: "workout",
    title: "Bench volume",
    workingSets: 14,
    volumeKg: 7742.4,
    distanceMeters: null,
    paceSecondsPerKm: null,
  });
  render(
    <ActivitySummary
      activity={workout}
      name="Kenji"
      unit="lb"
      length="m"
      distanceUnits={DEFAULT_DISTANCE_UNITS}
    />,
  );
  // 17,069.3 lb is the conversion's tenth, not the training's: Progress says 17,069 lb.
  expect(stat("Volume")).toBe("17,069 lb");
  expect(stat("Sets")).toBe("14");
});
