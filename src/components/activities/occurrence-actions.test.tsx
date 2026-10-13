// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { OccurrenceActions } from "./occurrence-actions";

vi.mock("@/server/actions/occurrences", () => ({
  removeOccurrenceAction: vi.fn(),
  reopenOccurrenceAction: vi.fn(),
  rescheduleOccurrenceAction: vi.fn(),
  skipOccurrenceAction: vi.fn(),
}));
afterEach(cleanup);

const skipped = {
  occurrenceId: "00000000-0000-4000-8000-000000000001",
  skipped: true,
  scheduledOn: "2026-10-01",
  today: "2026-10-12",
  standalone: false,
};

/**
 * Review, 12 October 2026: "Pick up from today" skips every run it passes, and each one's page
 * offers "Put it back". Put back, a run the sequence went past is owed before everything after
 * it, so the programme goes back to it, cycles back for an old one; that is said under the
 * button before it is tapped, not found out on Today after.
 */
it("says before the tap that a run put back sends the programme back to it", () => {
  render(<OccurrenceActions {...skipped} putBackGoesNext />);
  expect(screen.getByRole("button", { name: "Put it back" })).toBeTruthy();
  expect(
    screen.getByText(
      "Putting it back makes it owed again: the programme goes back to it, and Today offers it next. Logging it counts it as done instead.",
    ),
  ).toBeTruthy();
});

it("says a run still ahead of the programme simply stays in it", () => {
  render(<OccurrenceActions {...skipped} />);
  expect(
    screen.getByText("Skipped sessions stay in the programme. Logging one puts it back by itself."),
  ).toBeTruthy();
  expect(screen.queryByText(/Today offers it next/)).toBeNull();
});
