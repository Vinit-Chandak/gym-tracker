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
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Already logged");
  // Their own session, on a date they recognise — never "does not exist" — and nothing about
  // how many times a session can be logged.
  expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
    "Run ·\u00a0Tue\u00a022\u00a0Sept\u00a02026",
  );
  expect(screen.queryByText(/logged once/)).toBeNull();
  expect(screen.getByRole("link", { name: "See what you logged" }).getAttribute("href")).toBe(
    "/progress/activities/00000000-0000-4000-8000-00000000000a?from=plan",
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
  // Nothing was done about it, so it is not called done.
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Taken off the calendar");
  expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
    "Ride ·\u00a0Tue\u00a022\u00a0Sept\u00a02026",
  );
  expect(screen.getByRole("link", { name: "Log a ride anyway" }).getAttribute("href")).toBe(
    "/today/log/new?sport=cycling",
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
        followedBy: "Hybrid Half Marathon",
      }}
    />,
  );
  // Nothing was done about it, so the screen does not say it was.
  expect(screen.queryByText("Already done")).toBeNull();
  // Ended, not replaced: the block it was may have finished long before the next began.
  expect(screen.getByText("Its programme has ended")).toBeTruthy();
  // How it ended, once; what that means for logging it is the button's to say.
  expect(
    screen.getByText(
      "Strength Maintenance + 2 Runs made way for Hybrid Half Marathon on Mon 6 Jul 2026.",
    ),
  ).toBeTruthy();
  expect(screen.queryByText(/can no longer be logged/)).toBeNull();
  expect(screen.getByRole("link", { name: "Log a run anyway" }).getAttribute("href")).toBe(
    "/today/log/new?sport=running",
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
      closure={{ name: "Hybrid Half Marathon", closedOn: "2026-07-06", followedBy: null }}
    />,
  );
  expect(screen.getByText("Its programme was archived")).toBeTruthy();
  expect(screen.getByText("Hybrid Half Marathon was archived on Mon 6 Jul 2026.")).toBeTruthy();
});

/**
 * Completed before the record was kept, a closed session is settled: it was done, so the screen
 * neither says its programme ended over it nor offers to log it a second time.
 */
it("says a closed session completed before the record was kept is already settled", () => {
  render(
    <OccurrenceSettled
      occurrence={occurrence({
        familyId: "old-block",
        disposition: "legacy_completed",
        resolution: { kind: "legacy_completed" },
        closed: true,
      })}
    />,
  );
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Already done");
  expect(screen.queryByText(/made way/)).toBeNull();
  expect(screen.queryByRole("link", { name: "Log a run anyway" })).toBeNull();
  // Plan is the way back, which the header's back link already is: no button repeats it.
  expect(screen.queryByRole("link", { name: /Go to/ })).toBeNull();
});
