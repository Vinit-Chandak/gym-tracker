// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import { OccurrenceSettled } from "./occurrence-settled";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";

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
