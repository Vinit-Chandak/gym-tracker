// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { DEFAULT_DISTANCE_UNITS } from "@/lib/format";
import type { SharedActivityDetail } from "@/server/repositories/shared-stats";

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

/** The value under one entry's label. */
function entry(label: string): string | null | undefined {
  return screen.getByText(label).nextElementSibling?.textContent;
}

it("says a friend's distance with its unit, in the reader's own", () => {
  render(
    <ActivitySummary activity={activity({})} unit="kg" distanceUnits={DEFAULT_DISTANCE_UNITS} />,
  );
  expect(entry("Distance")).toBe("5.2 km");
  expect(entry("Average pace")).toBe("5:25 /km");
  cleanup();
  render(
    <ActivitySummary
      activity={activity({})}
      unit="kg"
      distanceUnits={{ ...DEFAULT_DISTANCE_UNITS, run: "mi" }}
    />,
  );
  expect(entry("Distance")).toBe("3.23 mi");
  expect(entry("Average pace")).toBe("8:43 /mi");
});

it("says a ride in road units and a swim in pool units", () => {
  render(
    <ActivitySummary
      activity={activity({ sport: "cycle", title: "Ride", distanceMeters: 18200 })}
      unit="kg"
      distanceUnits={DEFAULT_DISTANCE_UNITS}
    />,
  );
  expect(entry("Distance")).toBe("18.2 km");
  cleanup();
  render(
    <ActivitySummary
      activity={activity({ sport: "swim", title: "Swim", distanceMeters: 1500 })}
      unit="kg"
      distanceUnits={DEFAULT_DISTANCE_UNITS}
    />,
  );
  expect(entry("Distance")).toBe("1,500 m");
});
