// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import { OccurrenceSettled } from "./occurrence-settled";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn() }) }));

vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
afterEach(cleanup);

const occurrence = (overrides: Partial<ScheduledOccurrence>): ScheduledOccurrence =>
  ({
    id: "00000000-0000-4000-8000-000000000001",
    sport: "running",
    disposition: "pending",
    scheduledOn: "2026-09-22",
    scheduledLocalTime: null,
    orderIndex: 1,
    revisionId: "00000000-0000-4000-8000-000000000002",
    prescription: null,
    familyId: null,
    originalWeekIndex: null,
    originalScheduledOn: null,
    resolution: { kind: "incomplete" },
    closed: false,
    loggable: false,
    ...overrides,
  }) as ScheduledOccurrence;

it("says a logged session was logged, and offers what answered it", () => {
  render(
    <OccurrenceSettled
      occurrence={occurrence({
        resolution: {
          kind: "logged",
          activityId: "00000000-0000-4000-8000-00000000000a",
          outcome: "logged",
          occurredOn: "2026-09-22",
        },
      })}
    />,
  );
  expect(screen.getByText("You have already logged this")).toBeTruthy();
  // Their own session, on a date they recognise — never "does not exist".
  expect(screen.getByText(/The run scheduled for Tue 22 Sept 2026/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "See what you logged" }).getAttribute("href")).toBe(
    "/training/activities/00000000-0000-4000-8000-00000000000a",
  );
});

it("says a cancelled session was cancelled, and still offers the sport", () => {
  render(
    <OccurrenceSettled
      occurrence={occurrence({
        sport: "cycling",
        disposition: "cancelled",
        resolution: { kind: "cancelled" },
      })}
    />,
  );
  expect(screen.getByText("This session was cancelled")).toBeTruthy();
  expect(screen.getByText(/The ride scheduled for Tue 22 Sept 2026/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Log a ride anyway" }).getAttribute("href")).toBe(
    "/training/new?sport=cycling",
  );
});

/**
 * ADR 0054: a session of a programme the athlete has moved on from is not logged by its URL.
 * The log page says how its programme ended, and offers the sport on its own.
 */
it("says a replaced programme's session can no longer be logged, and offers the sport", () => {
  render(
    <OccurrenceSettled
      occurrence={occurrence({ familyId: "old-block", scheduledOn: "2026-06-27", closed: true })}
      closure={{
        name: "Strength Maintenance + 2 Runs",
        closedOn: "2026-07-06",
        replacedBy: "Hybrid Half Marathon",
      }}
    />,
  );
  // Nothing was done about it, so the screen does not say it was.
  expect(screen.queryByText("Already done")).toBeNull();
  expect(screen.getByText("Its programme was replaced")).toBeTruthy();
  expect(
    screen.getByText(
      "Strength Maintenance + 2 Runs was replaced by Hybrid Half Marathon on Mon 6 Jul 2026, so the run scheduled for Sat 27 Jun 2026 can no longer be logged. You can still log a run on its own.",
    ),
  ).toBeTruthy();
  expect(screen.getByRole("link", { name: "Log a run anyway" }).getAttribute("href")).toBe(
    "/training/new?sport=running",
  );
});

it("says when an archived programme's session stopped being loggable", () => {
  render(
    <OccurrenceSettled
      occurrence={occurrence({
        familyId: "old-block",
        disposition: "skipped",
        resolution: { kind: "skipped" },
        closed: true,
      })}
      closure={{ name: "Hybrid Half Marathon", closedOn: "2026-07-06", replacedBy: null }}
    />,
  );
  expect(screen.getByText("Its programme was archived")).toBeTruthy();
  expect(
    screen.getByText(/^Hybrid Half Marathon was archived on Mon 6 Jul 2026, so the run/),
  ).toBeTruthy();
});
